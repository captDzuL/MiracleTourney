-- Limited roster changes during the group stage.
-- Event.rosterChangeLimit = 0 keeps today's behaviour (roster locked once the drawing is published).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RosterChangeKind') THEN
    CREATE TYPE "RosterChangeKind" AS ENUM ('swap', 'add', 'remove');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RosterChangeStatus') THEN
    CREATE TYPE "RosterChangeStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END
$$;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "rosterChangeLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "RosterChangeRequest" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "kind" "RosterChangeKind" NOT NULL,
  "outPlayerId" TEXT,
  "outgoing" JSONB,
  "incoming" JSONB,
  "status" "RosterChangeStatus" NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "decisionNote" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RosterChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RosterChangeRequest_eventId_status_idx"
  ON "RosterChangeRequest"("eventId", "status");

CREATE INDEX IF NOT EXISTS "RosterChangeRequest_teamId_status_idx"
  ON "RosterChangeRequest"("teamId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RosterChangeRequest_eventId_fkey' AND conrelid = '"RosterChangeRequest"'::regclass) THEN
    ALTER TABLE "RosterChangeRequest" ADD CONSTRAINT "RosterChangeRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RosterChangeRequest_teamId_fkey' AND conrelid = '"RosterChangeRequest"'::regclass) THEN
    ALTER TABLE "RosterChangeRequest" ADD CONSTRAINT "RosterChangeRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
