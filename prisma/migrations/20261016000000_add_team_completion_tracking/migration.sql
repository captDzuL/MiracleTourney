-- Tracks teams that still miss a captain contact or a full roster, and teams an organizer suspended for it.
-- Additive only: four nullable columns and one index. Safe to apply before the code that uses them.
ALTER TABLE "Team" ADD COLUMN "completionDeadlineAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN "completionNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN "suspendedFromEventId" TEXT;

CREATE INDEX "Team_suspendedFromEventId_idx" ON "Team"("suspendedFromEventId");
