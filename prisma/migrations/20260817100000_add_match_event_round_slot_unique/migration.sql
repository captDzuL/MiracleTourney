-- AddUniqueConstraint (idempotent: skip if index already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'Match_eventId_round_slot_key'
  ) THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_round_slot_key" UNIQUE ("eventId", "round", "slot");
  END IF;
END $$;
