ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "captainIgn" TEXT,
  ADD COLUMN IF NOT EXISTS "captainUid" TEXT,
  ADD COLUMN IF NOT EXISTS "captainIsPlayer" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Team_eventId_captainUid_idx"
  ON "Team"("eventId", "captainUid");
