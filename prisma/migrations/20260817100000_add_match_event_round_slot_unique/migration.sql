-- AddUniqueConstraint (idempotent: skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_eventId_round_slot_key'
  ) THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_round_slot_key" UNIQUE ("eventId", "round", "slot");
  END IF;
END $$;
