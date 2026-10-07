-- Reconcile schema drift between prisma/schema.prisma and the migration history.
--
-- Five models (OrganizerPlan, EventPromotion, EventAnalyticsSnapshot, Notification, CheckIn)
-- and five indexes (Event_status_idx, Match_eventId_status_idx, Player_teamId_idx,
-- Player_eventId_idx, PlayerStat_matchId_idx) were created in production outside the
-- migration history, so a database rebuilt from migrations lacked them. The composite foreign
-- keys added by the V3 competition migrations also used names Prisma does not expect, and two
-- updatedAt columns kept a database default that the datamodel does not declare.
--
-- Every statement is idempotent. On production, where these objects already exist, the tables,
-- indexes and foreign keys are skipped and only the constraint renames and the two DROP DEFAULT
-- statements change anything; on a freshly migrated database it creates the missing objects.
-- Nothing here drops or rewrites data.

-- Tables
CREATE TABLE IF NOT EXISTS "OrganizerPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "maxEvents" INTEGER NOT NULL DEFAULT 2,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventPromotion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPromotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "shareClicks" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "EventAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'manual',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerPlan_userId_key" ON "OrganizerPlan"("userId");

CREATE INDEX IF NOT EXISTS "EventPromotion_eventId_active_idx" ON "EventPromotion"("eventId", "active");

CREATE INDEX IF NOT EXISTS "EventAnalyticsSnapshot_eventId_date_idx" ON "EventAnalyticsSnapshot"("eventId", "date");

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

CREATE INDEX IF NOT EXISTS "CheckIn_eventId_idx" ON "CheckIn"("eventId");

CREATE UNIQUE INDEX IF NOT EXISTS "CheckIn_eventId_teamId_playerId_key" ON "CheckIn"("eventId", "teamId", "playerId");

CREATE INDEX IF NOT EXISTS "Event_status_idx" ON "Event"("status");

CREATE INDEX IF NOT EXISTS "Match_eventId_status_idx" ON "Match"("eventId", "status");

CREATE INDEX IF NOT EXISTS "Player_teamId_idx" ON "Player"("teamId");

CREATE INDEX IF NOT EXISTS "Player_eventId_idx" ON "Player"("eventId");

CREATE INDEX IF NOT EXISTS "PlayerStat_matchId_idx" ON "PlayerStat"("matchId");

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizerPlan_userId_fkey' AND conrelid = '"OrganizerPlan"'::regclass) THEN
    ALTER TABLE "OrganizerPlan" ADD CONSTRAINT "OrganizerPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventPromotion_eventId_fkey' AND conrelid = '"EventPromotion"'::regclass) THEN
    ALTER TABLE "EventPromotion" ADD CONSTRAINT "EventPromotion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventAnalyticsSnapshot_eventId_fkey' AND conrelid = '"EventAnalyticsSnapshot"'::regclass) THEN
    ALTER TABLE "EventAnalyticsSnapshot" ADD CONSTRAINT "EventAnalyticsSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey' AND conrelid = '"Notification"'::regclass) THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheckIn_eventId_fkey' AND conrelid = '"CheckIn"'::regclass) THEN
    ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheckIn_teamId_fkey' AND conrelid = '"CheckIn"'::regclass) THEN
    ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CheckIn_playerId_fkey' AND conrelid = '"CheckIn"'::regclass) THEN
    ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Foreign key names expected by Prisma
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionActionItem_matchId_fkey' AND conrelid = '"CompetitionActionItem"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionActionItem_eventId_matchId_fkey' AND conrelid = '"CompetitionActionItem"'::regclass) THEN
    ALTER TABLE "CompetitionActionItem" RENAME CONSTRAINT "CompetitionActionItem_matchId_fkey" TO "CompetitionActionItem_eventId_matchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionActionItem_teamId_fkey' AND conrelid = '"CompetitionActionItem"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionActionItem_eventId_teamId_fkey' AND conrelid = '"CompetitionActionItem"'::regclass) THEN
    ALTER TABLE "CompetitionActionItem" RENAME CONSTRAINT "CompetitionActionItem_teamId_fkey" TO "CompetitionActionItem_eventId_teamId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionAuditLog_matchId_fkey' AND conrelid = '"CompetitionAuditLog"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionAuditLog_eventId_matchId_fkey' AND conrelid = '"CompetitionAuditLog"'::regclass) THEN
    ALTER TABLE "CompetitionAuditLog" RENAME CONSTRAINT "CompetitionAuditLog_matchId_fkey" TO "CompetitionAuditLog_eventId_matchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroup_phaseId_fkey' AND conrelid = '"CompetitionGroup"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroup_eventId_phaseId_fkey' AND conrelid = '"CompetitionGroup"'::regclass) THEN
    ALTER TABLE "CompetitionGroup" RENAME CONSTRAINT "CompetitionGroup_phaseId_fkey" TO "CompetitionGroup_eventId_phaseId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroupMember_groupId_fkey' AND conrelid = '"CompetitionGroupMember"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroupMember_eventId_groupId_fkey' AND conrelid = '"CompetitionGroupMember"'::regclass) THEN
    ALTER TABLE "CompetitionGroupMember" RENAME CONSTRAINT "CompetitionGroupMember_groupId_fkey" TO "CompetitionGroupMember_eventId_groupId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroupMember_teamId_fkey' AND conrelid = '"CompetitionGroupMember"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionGroupMember_eventId_teamId_fkey' AND conrelid = '"CompetitionGroupMember"'::regclass) THEN
    ALTER TABLE "CompetitionGroupMember" RENAME CONSTRAINT "CompetitionGroupMember_teamId_fkey" TO "CompetitionGroupMember_eventId_teamId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionIncident_matchId_fkey' AND conrelid = '"CompetitionIncident"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitionIncident_eventId_matchId_fkey' AND conrelid = '"CompetitionIncident"'::regclass) THEN
    ALTER TABLE "CompetitionIncident" RENAME CONSTRAINT "CompetitionIncident_matchId_fkey" TO "CompetitionIncident_eventId_matchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_groupId_fkey' AND conrelid = '"Match"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_eventId_groupId_fkey' AND conrelid = '"Match"'::regclass) THEN
    ALTER TABLE "Match" RENAME CONSTRAINT "Match_groupId_fkey" TO "Match_eventId_groupId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_phaseId_fkey' AND conrelid = '"Match"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Match_eventId_phaseId_fkey' AND conrelid = '"Match"'::regclass) THEN
    ALTER TABLE "Match" RENAME CONSTRAINT "Match_phaseId_fkey" TO "Match_eventId_phaseId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchDependency_sourceMatchId_fkey' AND conrelid = '"MatchDependency"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchDependency_eventId_sourceMatchId_fkey' AND conrelid = '"MatchDependency"'::regclass) THEN
    ALTER TABLE "MatchDependency" RENAME CONSTRAINT "MatchDependency_sourceMatchId_fkey" TO "MatchDependency_eventId_sourceMatchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchDependency_targetMatchId_fkey' AND conrelid = '"MatchDependency"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchDependency_eventId_targetMatchId_fkey' AND conrelid = '"MatchDependency"'::regclass) THEN
    ALTER TABLE "MatchDependency" RENAME CONSTRAINT "MatchDependency_targetMatchId_fkey" TO "MatchDependency_eventId_targetMatchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchReadiness_matchId_fkey' AND conrelid = '"MatchReadiness"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchReadiness_eventId_matchId_fkey' AND conrelid = '"MatchReadiness"'::regclass) THEN
    ALTER TABLE "MatchReadiness" RENAME CONSTRAINT "MatchReadiness_matchId_fkey" TO "MatchReadiness_eventId_matchId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchReadiness_teamId_fkey' AND conrelid = '"MatchReadiness"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchReadiness_eventId_teamId_fkey' AND conrelid = '"MatchReadiness"'::regclass) THEN
    ALTER TABLE "MatchReadiness" RENAME CONSTRAINT "MatchReadiness_teamId_fkey" TO "MatchReadiness_eventId_teamId_fkey";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchResultRevision_matchId_fkey' AND conrelid = '"MatchResultRevision"'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchResultRevision_eventId_matchId_fkey' AND conrelid = '"MatchResultRevision"'::regclass) THEN
    ALTER TABLE "MatchResultRevision" RENAME CONSTRAINT "MatchResultRevision_matchId_fkey" TO "MatchResultRevision_eventId_matchId_fkey";
  END IF;
END
$$;

-- Defaults not declared in the datamodel
ALTER TABLE "EventVisualAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "RateLimitBucket" ALTER COLUMN "updatedAt" DROP DEFAULT;
