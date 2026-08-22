-- Add audit fields to PlayerStat (promoted from manual/add_player_stat_audit_fields.sql)
ALTER TABLE "PlayerStat"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUpdatedBy" TEXT;
