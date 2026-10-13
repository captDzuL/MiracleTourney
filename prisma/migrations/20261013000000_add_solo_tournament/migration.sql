-- Solo tournaments: individual players, a per-position slot queue, and the random draw.
-- Additive only. Every existing event keeps entryMode = 'team'. Safe to run twice.


ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "activeSoloDrawId" TEXT;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "entryMode" TEXT NOT NULL DEFAULT 'team';

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE TABLE IF NOT EXISTS "PlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SoloRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ign" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "uidKey" TEXT NOT NULL,
    "primaryPosition" TEXT NOT NULL,
    "secondaryPosition" TEXT,
    "slotGroup" TEXT NOT NULL,
    "willingCaptain" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "proofImageUrl" TEXT,
    "rejectReason" TEXT,
    "slotHeldAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoloRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SoloDraw" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "seed" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "unplacedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoloDraw_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SoloDrawAssignment" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "teamIndex" INTEGER,
    "role" TEXT NOT NULL,
    "assignedPosition" TEXT,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoloDrawAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

CREATE INDEX IF NOT EXISTS "SoloRegistration_eventId_slotGroup_status_createdAt_idx" ON "SoloRegistration"("eventId", "slotGroup", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "SoloRegistration_userId_idx" ON "SoloRegistration"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloRegistration_eventId_userId_key" ON "SoloRegistration"("eventId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloRegistration_eventId_uidKey_key" ON "SoloRegistration"("eventId", "uidKey");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloRegistration_eventId_id_key" ON "SoloRegistration"("eventId", "id");

CREATE INDEX IF NOT EXISTS "SoloDraw_eventId_status_idx" ON "SoloDraw"("eventId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloDraw_eventId_version_key" ON "SoloDraw"("eventId", "version");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloDraw_eventId_id_key" ON "SoloDraw"("eventId", "id");

CREATE INDEX IF NOT EXISTS "SoloDrawAssignment_drawId_teamIndex_idx" ON "SoloDrawAssignment"("drawId", "teamIndex");

CREATE INDEX IF NOT EXISTS "SoloDrawAssignment_registrationId_idx" ON "SoloDrawAssignment"("registrationId");

CREATE UNIQUE INDEX IF NOT EXISTS "SoloDrawAssignment_drawId_registrationId_key" ON "SoloDrawAssignment"("drawId", "registrationId");

CREATE UNIQUE INDEX IF NOT EXISTS "Event_activeSoloDrawId_key" ON "Event"("activeSoloDrawId");

CREATE INDEX IF NOT EXISTS "Player_userId_idx" ON "Player"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Event_activeSoloDrawId_fkey' AND conrelid = '"Event"'::regclass) THEN
    ALTER TABLE "Event" ADD CONSTRAINT "Event_activeSoloDrawId_fkey" FOREIGN KEY ("activeSoloDrawId") REFERENCES "SoloDraw"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Player_userId_fkey' AND conrelid = '"Player"'::regclass) THEN
    ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlayerProfile_userId_fkey' AND conrelid = '"PlayerProfile"'::regclass) THEN
    ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloRegistration_eventId_fkey' AND conrelid = '"SoloRegistration"'::regclass) THEN
    ALTER TABLE "SoloRegistration" ADD CONSTRAINT "SoloRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloRegistration_userId_fkey' AND conrelid = '"SoloRegistration"'::regclass) THEN
    ALTER TABLE "SoloRegistration" ADD CONSTRAINT "SoloRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloRegistration_approvedById_fkey' AND conrelid = '"SoloRegistration"'::regclass) THEN
    ALTER TABLE "SoloRegistration" ADD CONSTRAINT "SoloRegistration_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloDraw_eventId_fkey' AND conrelid = '"SoloDraw"'::regclass) THEN
    ALTER TABLE "SoloDraw" ADD CONSTRAINT "SoloDraw_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloDraw_createdById_fkey' AND conrelid = '"SoloDraw"'::regclass) THEN
    ALTER TABLE "SoloDraw" ADD CONSTRAINT "SoloDraw_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloDraw_lockedById_fkey' AND conrelid = '"SoloDraw"'::regclass) THEN
    ALTER TABLE "SoloDraw" ADD CONSTRAINT "SoloDraw_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloDrawAssignment_eventId_drawId_fkey' AND conrelid = '"SoloDrawAssignment"'::regclass) THEN
    ALTER TABLE "SoloDrawAssignment" ADD CONSTRAINT "SoloDrawAssignment_eventId_drawId_fkey" FOREIGN KEY ("eventId", "drawId") REFERENCES "SoloDraw"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SoloDrawAssignment_eventId_registrationId_fkey' AND conrelid = '"SoloDrawAssignment"'::regclass) THEN
    ALTER TABLE "SoloDrawAssignment" ADD CONSTRAINT "SoloDrawAssignment_eventId_registrationId_fkey" FOREIGN KEY ("eventId", "registrationId") REFERENCES "SoloRegistration"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
