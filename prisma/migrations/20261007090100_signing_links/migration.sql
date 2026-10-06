-- Phase C, part 2: signing-link lifecycle, voiding, and a trustworthy,
-- append-only audit log. New enums, a new table, new nullable columns,
-- indexes, constraints and triggers. No existing row is modified and no
-- column is dropped.
--
-- One statement pair is not purely additive: the Phase B CHECK
-- "Document_status_matches_timestamps" enumerates every allowed status, so
-- it must be dropped and re-created with a VOIDED branch (Postgres cannot
-- extend a CHECK in place). Both happen inside this transaction, the new
-- definition is a strict superset of the old one, and every existing row is
-- re-validated against it before COMMIT.
--
-- Wrapped in an explicit transaction: Prisma does not apply a migration
-- atomically by itself.
BEGIN;

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'COUNTERPARTY_LINK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LinkRevocationReason" AS ENUM ('SUPERSEDED', 'VOIDED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "StatusEvent" ADD COLUMN     "actorType" "ActorType",
ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "signingLinkId" TEXT;

-- CreateTable
CREATE TABLE "SigningLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstViewedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "LinkRevocationReason",
    "activeDocumentId" TEXT,
    "replacedById" TEXT,

    CONSTRAINT "SigningLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SigningLink_tokenHash_key" ON "SigningLink"("tokenHash");

-- CreateIndex: at most one active (unrevoked) link per agreement.
CREATE UNIQUE INDEX "SigningLink_activeDocumentId_key" ON "SigningLink"("activeDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "SigningLink_replacedById_key" ON "SigningLink"("replacedById");

-- CreateIndex
CREATE INDEX "SigningLink_documentId_idx" ON "SigningLink"("documentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_activeDocumentId_fkey" FOREIGN KEY ("activeDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "Signer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "SigningLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_signingLinkId_fkey" FOREIGN KEY ("signingLinkId") REFERENCES "SigningLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The status stays the single authoritative lifecycle state; VOIDED is a
-- terminal status of its own. The Phase B branches are unchanged; VOIDED
-- keeps whatever had happened before the void (sent or not, counterparty
-- signed or not) but can never carry a countersignature or completion.
ALTER TABLE "Document" DROP CONSTRAINT "Document_status_matches_timestamps";
ALTER TABLE "Document" ADD CONSTRAINT "Document_status_matches_timestamps" CHECK (
  ("status" = 'DRAFT'
     AND "sentAt" IS NULL AND "counterpartySignedAt" IS NULL
     AND "countersignedAt" IS NULL AND "completedAt" IS NULL)
  OR ("status" = 'SENT'
     AND "sentAt" IS NOT NULL AND "counterpartySignedAt" IS NULL
     AND "countersignedAt" IS NULL AND "completedAt" IS NULL)
  OR ("status" = 'PARTIALLY_SIGNED'
     AND "sentAt" IS NOT NULL AND "counterpartySignedAt" IS NOT NULL
     AND "countersignedAt" IS NULL AND "completedAt" IS NULL)
  OR ("status" = 'FULLY_EXECUTED'
     AND "sentAt" IS NOT NULL AND "counterpartySignedAt" IS NOT NULL
     AND "countersignedAt" IS NOT NULL AND "completedAt" IS NOT NULL)
  OR ("status" = 'VOIDED'
     AND ("counterpartySignedAt" IS NULL OR "sentAt" IS NOT NULL)
     AND "countersignedAt" IS NULL AND "completedAt" IS NULL)
);

-- Void metadata exists exactly when the status is VOIDED, with a real reason.
ALTER TABLE "Document" ADD CONSTRAINT "Document_void_consistency" CHECK (
  ("status" <> 'VOIDED' AND "voidedAt" IS NULL AND "voidReason" IS NULL AND "voidedById" IS NULL)
  OR ("status" = 'VOIDED' AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL
      AND "voidReason" IS NOT NULL AND char_length(btrim("voidReason")) BETWEEN 1 AND 500)
);

-- Nothing can be signed after a void.
ALTER TABLE "Document" ADD CONSTRAINT "Document_no_signature_after_void" CHECK (
  "voidedAt" IS NULL OR "counterpartySignedAt" IS NULL OR "counterpartySignedAt" <= "voidedAt"
);

-- A link is active exactly when it is unrevoked; an active link carries its
-- agreement in activeDocumentId (unique above), a revoked one never does.
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_active_matches_revocation" CHECK (
  ("revokedAt" IS NULL AND "revokedReason" IS NULL AND "activeDocumentId" = "documentId")
  OR ("revokedAt" IS NOT NULL AND "revokedReason" IS NOT NULL AND "activeDocumentId" IS NULL)
);

ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_expires_after_issue" CHECK (
  "expiresAt" > "createdAt"
);

-- Only a SHA-256 hex digest can be stored, never a raw token.
ALTER TABLE "SigningLink" ADD CONSTRAINT "SigningLink_token_is_hash" CHECK (
  "tokenHash" ~ '^[0-9a-f]{64}$'
);

-- Every new audit event names its actor in a verifiable way. NOT VALID:
-- events written before actor types existed are exempt; every insert from
-- now on is checked.
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_actor_context" CHECK (
  "actorType" IS NOT NULL
  AND ("actorType" <> 'USER' OR "actorUserId" IS NOT NULL)
  AND ("actorType" <> 'COUNTERPARTY_LINK' OR "signingLinkId" IS NOT NULL)
) NOT VALID;

-- The audit log is append-only.
CREATE FUNCTION "countersign_reject_audit_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'StatusEvent is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "StatusEvent_append_only"
  BEFORE UPDATE OR DELETE ON "StatusEvent"
  FOR EACH ROW EXECUTE FUNCTION "countersign_reject_audit_change"();

-- Terminal states are final: an executed or voided agreement can never move
-- to another status. (A CHECK constraint sees only the new row, so this is a
-- trigger.)
CREATE FUNCTION "countersign_reject_terminal_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Agreement status % is terminal and cannot change to %', OLD."status", NEW."status";
END;
$$;

CREATE TRIGGER "Document_terminal_status"
  BEFORE UPDATE OF "status" ON "Document"
  FOR EACH ROW
  WHEN (OLD."status" IN ('FULLY_EXECUTED', 'VOIDED') AND NEW."status" IS DISTINCT FROM OLD."status")
  EXECUTE FUNCTION "countersign_reject_terminal_change"();

COMMIT;
