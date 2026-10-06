-- Phase D, part 2: the delivery outbox and artifact-only PDF storage.
-- New enums, a new table, indexes, constraints and a trigger, plus a
-- backfill of draft previews into DocumentArtifact. No existing row is
-- modified and no column is dropped: Document."pdfData"/"pdfUrl" stay in
-- place, unused from now on.
--
-- Wrapped in an explicit transaction: Prisma does not apply a migration
-- atomically by itself.
BEGIN;

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('SIGNING_REQUEST', 'SIGNING_LINK_REISSUED', 'COUNTERSIGN_REQUEST', 'AGREEMENT_EXECUTED', 'AGREEMENT_VOIDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('DEMO_OUTBOX');

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "signingLinkId" TEXT,
    "linkCiphertext" TEXT,
    "appPath" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "DeliveryChannel",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundMessage_documentId_idx" ON "OutboundMessage"("documentId");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_signingLinkId_idx" ON "OutboundMessage"("signingLinkId");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_signingLinkId_fkey" FOREIGN KEY ("signingLinkId") REFERENCES "SigningLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The delivery state machine, in the row itself: each status carries exactly
-- the timestamps and details it implies.
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_delivery_state" CHECK (
  ("status" = 'PENDING'
     AND "attempts" = 0 AND "lastAttemptAt" IS NULL AND "leaseExpiresAt" IS NULL
     AND "deliveredAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'SENDING'
     AND "attempts" > 0 AND "lastAttemptAt" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL
     AND "deliveredAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'DELIVERED'
     AND "attempts" > 0 AND "channel" IS NOT NULL AND "leaseExpiresAt" IS NULL
     AND "deliveredAt" IS NOT NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'FAILED'
     AND "attempts" > 0 AND "lastError" IS NOT NULL AND "leaseExpiresAt" IS NULL
     AND "deliveredAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'CANCELLED'
     AND "lastError" IS NOT NULL AND "leaseExpiresAt" IS NULL
     AND "deliveredAt" IS NULL AND "cancelledAt" IS NOT NULL)
);

-- A signing link is only ever stored as AES-256-GCM ciphertext
-- ("v1.<key id>.<iv>.<ciphertext>.<tag>"), bound to the link it belongs to.
-- A raw token (43 base64url characters, no dots) can never match.
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_link_is_ciphertext" CHECK (
  "linkCiphertext" IS NULL
  OR ("signingLinkId" IS NOT NULL
      AND "linkCiphertext" ~ '^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
);

-- Bytes exist only on READY artifacts, and a stored hash is always the hash
-- of the stored bytes. (READY already requires both: signing_core.)
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_bytes_only_when_ready" CHECK (
  "status" = 'READY' OR ("pdfData" IS NULL AND "sha256" IS NULL)
);

ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_sha256_matches_bytes" CHECK (
  "pdfData" IS NULL OR "sha256" = encode(sha256("pdfData"), 'hex')
);

-- A READY artifact is final: its bytes, hash, kind and agreement can never
-- change, and it can never be deleted. (A CHECK sees only the new row, so
-- this is a trigger.)
CREATE FUNCTION "countersign_reject_ready_artifact_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DocumentArtifact % (%) is READY and immutable: % is not allowed', OLD."id", OLD."kind", TG_OP;
END;
$$;

CREATE TRIGGER "DocumentArtifact_ready_immutable"
  BEFORE UPDATE OR DELETE ON "DocumentArtifact"
  FOR EACH ROW
  WHEN (OLD."status" = 'READY')
  EXECUTE FUNCTION "countersign_reject_ready_artifact_change"();

-- Backfill: draft previews move from Document."pdfData" into PREVIEW
-- artifacts with their hash. An unsent agreement without a stored preview
-- gets a PENDING one, generated when it is next opened. (Sent agreements
-- already have FROZEN/EXECUTED artifacts: signing_core.)
INSERT INTO "DocumentArtifact" ("id", "documentId", "kind", "status", "pdfData", "sha256", "updatedAt")
  SELECT 'legacy_preview_' || d."id", d."id", 'PREVIEW', 'READY', d."pdfData",
         encode(sha256(d."pdfData"), 'hex'), CURRENT_TIMESTAMP
  FROM "Document" d
  WHERE d."sentAt" IS NULL AND d."pdfData" IS NOT NULL;

INSERT INTO "DocumentArtifact" ("id", "documentId", "kind", "status", "updatedAt")
  SELECT 'legacy_preview_' || d."id", d."id", 'PREVIEW', 'PENDING', CURRENT_TIMESTAMP
  FROM "Document" d
  WHERE d."sentAt" IS NULL AND d."pdfData" IS NULL;

COMMIT;
