-- Migration: add source and lastUpdatedBy audit fields to PlayerStat
-- Apply to production DB before deploying code that uses these fields.
-- Both columns are nullable — existing rows are unaffected.

ALTER TABLE "PlayerStat"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUpdatedBy" TEXT;
