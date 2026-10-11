-- A player who leaves and later comes back keeps the same Player row (so their
-- statistics stay continuous). rosterGaps records the closed absences; removedAt
-- stays the start of the current one.

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "rosterGaps" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "RosterChangeRequest" ADD COLUMN IF NOT EXISTS "returnPlayerId" TEXT;

ALTER TABLE "RosterChangeRequest" ADD COLUMN IF NOT EXISTS "inPlayerId" TEXT;
