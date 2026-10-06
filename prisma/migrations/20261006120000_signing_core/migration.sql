-- Phase B: trustworthy signing core. Additive only: new enums, columns, a new
-- table, indexes and constraints. No existing column, value or row is
-- dropped or rewritten except to backfill the new columns.
--
-- Wrapped in an explicit transaction because Prisma does not run a migration
-- atomically: without this, a failing statement (e.g. a CHECK constraint that
-- existing rows violate) would leave the earlier statements applied.
BEGIN;

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('FROZEN', 'EXECUTED');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSignatory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "counterpartySignedAt" TIMESTAMP(3),
ADD COLUMN     "countersignedAt" TIMESTAMP(3),
ADD COLUMN     "countersignerId" TEXT,
ADD COLUMN     "frozenSha256" TEXT;

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "status" "ArtifactStatus" NOT NULL,
    "pdfData" BYTEA,
    "sha256" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentArtifact_documentId_kind_key" ON "DocumentArtifact"("documentId", "kind");

-- CreateIndex
CREATE INDEX "Document_countersignerId_idx" ON "Document"("countersignerId");

-- CreateIndex: exactly one signer per party role per agreement.
CREATE UNIQUE INDEX "Signer_documentId_partyRole_key" ON "Signer"("documentId", "partyRole");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_countersignerId_fkey" FOREIGN KEY ("countersignerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: signing timestamps move onto the agreement row.
UPDATE "Document" d SET "counterpartySignedAt" = s."signedAt"
  FROM "Signer" s
  WHERE s."documentId" = d."id" AND s."partyRole" = 'COUNTERPARTY';

UPDATE "Document" d SET "countersignedAt" = s."signedAt"
  FROM "Signer" s
  WHERE s."documentId" = d."id" AND s."partyRole" = 'COMPANY';

-- Backfill: an existing agreement's countersigner defaults to the login
-- account of the person who sent it, if there is one. Nobody is made a
-- signatory here; that is an explicit decision (see the seed).
UPDATE "Document" d SET "countersignerId" = u."id"
  FROM "User" u
  WHERE u."senderId" = d."senderId";

-- Backfill: agreements sent before artifacts existed get their stored PDF
-- recorded as an artifact with its hash. Awaiting-signature agreements get a
-- FROZEN artifact (so they can still be signed against a hash); executed ones
-- keep their stored PDF as the EXECUTED artifact.
INSERT INTO "DocumentArtifact" ("id", "documentId", "kind", "status", "pdfData", "sha256", "updatedAt")
  SELECT 'legacy_frozen_' || d."id", d."id", 'FROZEN', 'READY', d."pdfData",
         encode(sha256(d."pdfData"), 'hex'), CURRENT_TIMESTAMP
  FROM "Document" d
  WHERE d."status" IN ('SENT', 'PARTIALLY_SIGNED') AND d."pdfData" IS NOT NULL;

INSERT INTO "DocumentArtifact" ("id", "documentId", "kind", "status", "pdfData", "sha256", "updatedAt")
  SELECT 'legacy_executed_' || d."id", d."id", 'EXECUTED', 'READY', d."pdfData",
         encode(sha256(d."pdfData"), 'hex'), CURRENT_TIMESTAMP
  FROM "Document" d
  WHERE d."status" = 'FULLY_EXECUTED' AND d."pdfData" IS NOT NULL;

UPDATE "Document" d SET "frozenSha256" = a."sha256"
  FROM "DocumentArtifact" a
  WHERE a."documentId" = d."id" AND a."kind" = 'FROZEN';

-- The core invariant, enforced by the database itself: the company
-- countersignature can only exist after the counterparty's signature.
ALTER TABLE "Document" ADD CONSTRAINT "Document_countersign_after_counterparty" CHECK (
  "countersignedAt" IS NULL
  OR ("counterpartySignedAt" IS NOT NULL AND "countersignedAt" >= "counterpartySignedAt")
);

-- The status can never drift from the signing timestamps.
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
);

-- A READY artifact always has its bytes and their hash.
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_ready_has_bytes" CHECK (
  "status" <> 'READY' OR ("pdfData" IS NOT NULL AND "sha256" IS NOT NULL)
);

COMMIT;
