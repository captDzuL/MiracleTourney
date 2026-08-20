-- AddUniqueConstraint
ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_round_slot_key" UNIQUE ("eventId", "round", "slot");
