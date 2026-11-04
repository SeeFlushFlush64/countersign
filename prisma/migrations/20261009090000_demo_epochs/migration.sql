-- Phase F: demo epochs. The public demo starts fresh by creating a new epoch
-- and seeding it, never by deleting anything: every agreement belongs to an
-- epoch, pages show only the current one, and earlier epochs (with their
-- append-only audit history) stay in the database untouched.
--
-- Additive only. Existing agreements become epoch 1, the current epoch, with
-- no limits; Document."epochId" is added with a default, so no existing row
-- is rewritten and no row trigger fires.
--
-- Wrapped in an explicit transaction: Prisma does not apply a migration
-- atomically by itself.
BEGIN;

-- CreateEnum
CREATE TYPE "DemoEpochStatus" AS ENUM ('PREPARING', 'CURRENT', 'RETIRED', 'ABANDONED');

-- CreateTable
CREATE TABLE "DemoEpoch" (
    "id" SERIAL NOT NULL,
    "status" "DemoEpochStatus" NOT NULL,
    "currentMarker" BOOLEAN,
    "preparingMarker" BOOLEAN,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "agreementLimit" INTEGER,
    "agreementCount" INTEGER NOT NULL DEFAULT 0,
    "linkLimit" INTEGER,
    "linkCount" INTEGER NOT NULL DEFAULT 0,
    "requireExampleDomains" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DemoEpoch_pkey" PRIMARY KEY ("id")
);

-- At most one current and one preparing epoch: each carries a marker that is
-- unique (NULLs are not), the pattern SigningLink."activeDocumentId" uses.
CREATE UNIQUE INDEX "DemoEpoch_currentMarker_key" ON "DemoEpoch"("currentMarker");
CREATE UNIQUE INDEX "DemoEpoch_preparingMarker_key" ON "DemoEpoch"("preparingMarker");

-- The epoch state machine, in the row itself.
ALTER TABLE "DemoEpoch" ADD CONSTRAINT "DemoEpoch_markers" CHECK (
  ("currentMarker" IS NULL OR "currentMarker") AND
  ("preparingMarker" IS NULL OR "preparingMarker") AND
  (("status" = 'CURRENT') = ("currentMarker" IS NOT NULL)) AND
  (("status" = 'PREPARING') = ("preparingMarker" IS NOT NULL))
);
ALTER TABLE "DemoEpoch" ADD CONSTRAINT "DemoEpoch_lifecycle" CHECK (
  CASE "status"
    WHEN 'PREPARING' THEN "leaseExpiresAt" IS NOT NULL AND "activatedAt" IS NULL AND "endedAt" IS NULL
    WHEN 'CURRENT' THEN "activatedAt" IS NOT NULL AND "endedAt" IS NULL
    WHEN 'RETIRED' THEN "activatedAt" IS NOT NULL AND "endedAt" IS NOT NULL
    WHEN 'ABANDONED' THEN "activatedAt" IS NULL AND "endedAt" IS NOT NULL
  END
);
ALTER TABLE "DemoEpoch" ADD CONSTRAINT "DemoEpoch_limits" CHECK (
  ("agreementLimit" IS NULL OR "agreementLimit" > 0) AND
  ("linkLimit" IS NULL OR "linkLimit" > 0) AND
  "agreementCount" >= 0 AND "linkCount" >= 0 AND
  ("agreementLimit" IS NULL OR "agreementCount" <= "agreementLimit") AND
  ("linkLimit" IS NULL OR "linkCount" <= "linkLimit")
);

-- Timestamps here are TIMESTAMP (no time zone) holding UTC, as Prisma writes
-- them; the database's own clock is converted explicitly, so the stored time
-- does not depend on the server's time zone setting.
CREATE FUNCTION "countersign_utc_now"() RETURNS timestamp(3)
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'UTC')::timestamp(3)
$$;

-- Everything that exists today is epoch 1: current, not a demo epoch, no
-- limits. Its counts are what it already holds.
INSERT INTO "DemoEpoch" ("id", "status", "currentMarker", "createdAt", "activatedAt", "agreementCount", "linkCount")
VALUES (1, 'CURRENT', true, "countersign_utc_now"(), "countersign_utc_now"(),
        (SELECT count(*) FROM "Document"), (SELECT count(*) FROM "SigningLink"));
SELECT setval(pg_get_serial_sequence('"DemoEpoch"', 'id'), 1);

-- New agreements join the current epoch unless the caller (the demo reset,
-- seeding a preparing epoch) names one.
CREATE FUNCTION "countersign_current_epoch"() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT "id" FROM "DemoEpoch" WHERE "currentMarker"
$$;

-- AddColumn: a stable default is evaluated once, so existing rows read epoch
-- 1 without being rewritten.
ALTER TABLE "Document" ADD COLUMN "epochId" INTEGER NOT NULL DEFAULT "countersign_current_epoch"();

-- CreateIndex
CREATE INDEX "Document_epochId_idx" ON "Document"("epochId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "DemoEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reserved example domains (RFC 2606 / RFC 6761): example.com, example.net,
-- example.org and their subdomains, and anything under .example, .test,
-- .invalid or .localhost. Mirrored by isReservedExampleEmail in
-- src/lib/demo/example-domains.ts (a test keeps the two in agreement).
CREATE FUNCTION "countersign_is_example_email"(email text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(split_part(email, '@', 2)) ~ '^([a-z0-9-]+\.)*example\.(com|net|org)$'
      OR lower(split_part(email, '@', 2)) ~ '^([a-z0-9-]+\.)+(example|test|invalid|localhost)$'
$$;

-- The epoch boundary and the demo limits, enforced for every writer. Errors
-- carry a stable "countersign:" token the application maps to a message.
--
-- A new agreement must join a current or preparing epoch, within its
-- agreement limit, and (in a demo epoch) name a counterparty at a reserved
-- example domain. Locking the epoch row serializes concurrent creates, so
-- the limit holds under concurrency.
CREATE FUNCTION "countersign_document_epoch_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  epoch "DemoEpoch"%ROWTYPE;
BEGIN
  SELECT * INTO epoch FROM "DemoEpoch" WHERE "id" = NEW."epochId" FOR UPDATE;
  IF epoch."status" IS DISTINCT FROM 'CURRENT' AND epoch."status" IS DISTINCT FROM 'PREPARING' THEN
    RAISE EXCEPTION 'countersign:demo_epoch_closed (epoch %)', NEW."epochId" USING ERRCODE = 'CSE01';
  END IF;
  IF epoch."agreementLimit" IS NOT NULL AND epoch."agreementCount" >= epoch."agreementLimit" THEN
    RAISE EXCEPTION 'countersign:demo_agreement_limit (epoch %, limit %)', epoch."id", epoch."agreementLimit"
      USING ERRCODE = 'CSL01';
  END IF;
  IF epoch."requireExampleDomains" AND NOT "countersign_is_example_email"(NEW."counterpartyEmail") THEN
    RAISE EXCEPTION 'countersign:demo_example_domain' USING ERRCODE = 'CSD01';
  END IF;
  UPDATE "DemoEpoch"
     SET "agreementCount" = "agreementCount" + 1,
         "lastActivityAt" = CASE WHEN "status" = 'CURRENT' THEN "countersign_utc_now"() ELSE "lastActivityAt" END
   WHERE "id" = NEW."epochId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_epoch_insert"
  BEFORE INSERT ON "Document"
  FOR EACH ROW
  EXECUTE FUNCTION "countersign_document_epoch_insert"();

-- An agreement never changes epoch, and an agreement in a retired or
-- abandoned epoch never changes at all. A change in the current epoch marks
-- it as used (the lazy reset only replaces an epoch that has been used and
-- then left idle).
CREATE FUNCTION "countersign_document_epoch_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  epoch_status "DemoEpochStatus";
BEGIN
  IF NEW."epochId" IS DISTINCT FROM OLD."epochId" THEN
    RAISE EXCEPTION 'countersign:demo_epoch_immutable' USING ERRCODE = 'CSE02';
  END IF;
  SELECT "status" INTO epoch_status FROM "DemoEpoch" WHERE "id" = OLD."epochId" FOR UPDATE;
  IF epoch_status IS DISTINCT FROM 'CURRENT' AND epoch_status IS DISTINCT FROM 'PREPARING' THEN
    RAISE EXCEPTION 'countersign:demo_epoch_closed (epoch %)', OLD."epochId" USING ERRCODE = 'CSE01';
  END IF;
  IF epoch_status = 'CURRENT' THEN
    UPDATE "DemoEpoch" SET "lastActivityAt" = "countersign_utc_now"() WHERE "id" = OLD."epochId";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_epoch_update"
  BEFORE UPDATE ON "Document"
  FOR EACH ROW
  EXECUTE FUNCTION "countersign_document_epoch_update"();

-- A signing link (issued at send or reissue) counts against its epoch's link
-- limit, and cannot be issued for an agreement in a closed epoch.
CREATE FUNCTION "countersign_signing_link_epoch_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  epoch "DemoEpoch"%ROWTYPE;
BEGIN
  SELECT e.* INTO epoch
    FROM "DemoEpoch" e JOIN "Document" d ON d."epochId" = e."id"
   WHERE d."id" = NEW."documentId"
     FOR UPDATE OF e;
  IF epoch."status" IS DISTINCT FROM 'CURRENT' AND epoch."status" IS DISTINCT FROM 'PREPARING' THEN
    RAISE EXCEPTION 'countersign:demo_epoch_closed (epoch %)', epoch."id" USING ERRCODE = 'CSE01';
  END IF;
  IF epoch."linkLimit" IS NOT NULL AND epoch."linkCount" >= epoch."linkLimit" THEN
    RAISE EXCEPTION 'countersign:demo_link_limit (epoch %, limit %)', epoch."id", epoch."linkLimit"
      USING ERRCODE = 'CSL02';
  END IF;
  UPDATE "DemoEpoch"
     SET "linkCount" = "linkCount" + 1,
         "lastActivityAt" = CASE WHEN "status" = 'CURRENT' THEN "countersign_utc_now"() ELSE "lastActivityAt" END
   WHERE "id" = epoch."id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SigningLink_epoch_insert"
  BEFORE INSERT ON "SigningLink"
  FOR EACH ROW
  EXECUTE FUNCTION "countersign_signing_link_epoch_insert"();

COMMIT;
