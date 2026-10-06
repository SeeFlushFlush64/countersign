-- Phase C, part 1: new enum values.
--
-- Postgres does not allow a new enum value to be used in the transaction that
-- adds it, so these are committed on their own, before the transactional
-- 20261007090100_signing_links migration that uses them (in CHECK
-- constraints). IF NOT EXISTS makes this safe to re-run if a later step has
-- to be retried.

-- A terminal agreement state: voided by the company before execution.
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- Audit event types for the signing-link lifecycle.
ALTER TYPE "StatusEventType" ADD VALUE IF NOT EXISTS 'LINK_REISSUED';
ALTER TYPE "StatusEventType" ADD VALUE IF NOT EXISTS 'VOIDED';
