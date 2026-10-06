-- Phase D, part 1: a new artifact kind for draft previews.
--
-- Postgres does not allow a new enum value to be used in the transaction that
-- adds it, so it is committed on its own, before the transactional
-- 20261008090100_delivery_storage migration that backfills PREVIEW artifacts.
-- IF NOT EXISTS makes this safe to re-run if a later step has to be retried.

ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'PREVIEW';
