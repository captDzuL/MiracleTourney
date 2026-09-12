CREATE TYPE "CompetitionPhaseStatus" AS ENUM ('draft', 'active', 'completed');
CREATE TYPE "MatchScheduleStatus" AS ENUM ('estimated', 'confirmed', 'locked', 'delayed', 'live', 'completed', 'postponed');
CREATE TYPE "MatchReadinessStatus" AS ENUM ('pending', 'checked_in', 'ready', 'not_ready');
CREATE TYPE "ReadinessActor" AS ENUM ('organizer', 'captain');
CREATE TYPE "CompetitionActionPriority" AS ENUM ('critical', 'urgent', 'attention_soon');
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'published');
CREATE TYPE "ScheduleRevisionStatus" AS ENUM ('draft', 'published');
CREATE TYPE "MatchDependencyOutcome" AS ENUM ('winner', 'loser');
CREATE TYPE "MatchDependencySlot" AS ENUM ('home', 'away');

ALTER TABLE "Match"
  ADD COLUMN "phaseId" TEXT,
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "scheduledEndsAt" TIMESTAMP(3),
  ADD COLUMN "scheduleRoom" TEXT,
  ADD COLUMN "scheduleStatus" "MatchScheduleStatus" NOT NULL DEFAULT 'estimated',
  ADD COLUMN "scheduleVersion" INTEGER,
  ADD COLUMN "scheduleMetadata" JSONB,
  ADD COLUMN "resultVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resultSnapshot" JSONB,
  ADD COLUMN "resultConfirmedAt" TIMESTAMP(3);

CREATE TABLE "CompetitionPhase" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "CompetitionPhaseStatus" NOT NULL DEFAULT 'draft',
  "configuration" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionPhase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionGroup" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionGroupMember" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "seed" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchDependency" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sourceMatchId" TEXT NOT NULL,
  "targetMatchId" TEXT NOT NULL,
  "outcome" "MatchDependencyOutcome" NOT NULL,
  "targetSlot" "MatchDependencySlot" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchReadiness" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" "MatchReadinessStatus" NOT NULL DEFAULT 'pending',
  "actor" "ReadinessActor" NOT NULL DEFAULT 'organizer',
  "actorUserId" TEXT,
  "checkedInAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchReadiness_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchResultRevision" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "homeScore" INTEGER NOT NULL,
  "awayScore" INTEGER NOT NULL,
  "winnerTeamId" TEXT,
  "scoreSnapshot" JSONB NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchResultRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionActionItem" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT,
  "teamId" TEXT,
  "conditionKey" TEXT NOT NULL,
  "priority" "CompetitionActionPriority" NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionActionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionIncident" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT,
  "reportedById" TEXT,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "details" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionAuditLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "payload" JSONB,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleRevision" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ScheduleRevisionStatus" NOT NULL DEFAULT 'draft',
  "snapshot" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdById" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventAnnouncement" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdById" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionPhase_eventId_sequence_key" ON "CompetitionPhase"("eventId", "sequence");
CREATE INDEX "CompetitionPhase_eventId_status_idx" ON "CompetitionPhase"("eventId", "status");
CREATE UNIQUE INDEX "CompetitionGroup_phaseId_sequence_key" ON "CompetitionGroup"("phaseId", "sequence");
CREATE INDEX "CompetitionGroup_eventId_sequence_idx" ON "CompetitionGroup"("eventId", "sequence");
CREATE UNIQUE INDEX "CompetitionGroupMember_groupId_teamId_key" ON "CompetitionGroupMember"("groupId", "teamId");
CREATE INDEX "CompetitionGroupMember_teamId_idx" ON "CompetitionGroupMember"("teamId");
CREATE UNIQUE INDEX "MatchDependency_targetMatchId_targetSlot_key" ON "MatchDependency"("targetMatchId", "targetSlot");
CREATE INDEX "MatchDependency_eventId_idx" ON "MatchDependency"("eventId");
CREATE INDEX "MatchDependency_sourceMatchId_idx" ON "MatchDependency"("sourceMatchId");
CREATE UNIQUE INDEX "MatchReadiness_matchId_teamId_key" ON "MatchReadiness"("matchId", "teamId");
CREATE INDEX "MatchReadiness_eventId_status_idx" ON "MatchReadiness"("eventId", "status");
CREATE INDEX "MatchReadiness_teamId_idx" ON "MatchReadiness"("teamId");
CREATE UNIQUE INDEX "MatchResultRevision_matchId_version_key" ON "MatchResultRevision"("matchId", "version");
CREATE UNIQUE INDEX "MatchResultRevision_matchId_idempotencyKey_key" ON "MatchResultRevision"("matchId", "idempotencyKey");
CREATE INDEX "MatchResultRevision_eventId_createdAt_idx" ON "MatchResultRevision"("eventId", "createdAt");
CREATE UNIQUE INDEX "CompetitionActionItem_eventId_conditionKey_key" ON "CompetitionActionItem"("eventId", "conditionKey");
CREATE INDEX "CompetitionActionItem_eventId_priority_resolvedAt_idx" ON "CompetitionActionItem"("eventId", "priority", "resolvedAt");
CREATE INDEX "CompetitionActionItem_matchId_idx" ON "CompetitionActionItem"("matchId");
CREATE INDEX "CompetitionActionItem_teamId_idx" ON "CompetitionActionItem"("teamId");
CREATE INDEX "CompetitionIncident_eventId_resolvedAt_idx" ON "CompetitionIncident"("eventId", "resolvedAt");
CREATE INDEX "CompetitionIncident_matchId_idx" ON "CompetitionIncident"("matchId");
CREATE INDEX "CompetitionAuditLog_eventId_createdAt_idx" ON "CompetitionAuditLog"("eventId", "createdAt");
CREATE INDEX "CompetitionAuditLog_matchId_createdAt_idx" ON "CompetitionAuditLog"("matchId", "createdAt");
CREATE INDEX "CompetitionAuditLog_eventId_idempotencyKey_idx" ON "CompetitionAuditLog"("eventId", "idempotencyKey");
CREATE UNIQUE INDEX "ScheduleRevision_eventId_version_key" ON "ScheduleRevision"("eventId", "version");
CREATE UNIQUE INDEX "ScheduleRevision_eventId_idempotencyKey_key" ON "ScheduleRevision"("eventId", "idempotencyKey");
CREATE INDEX "ScheduleRevision_eventId_status_createdAt_idx" ON "ScheduleRevision"("eventId", "status", "createdAt");
CREATE INDEX "EventAnnouncement_eventId_status_publishedAt_idx" ON "EventAnnouncement"("eventId", "status", "publishedAt");
CREATE INDEX "Match_eventId_scheduleStatus_scheduledAt_idx" ON "Match"("eventId", "scheduleStatus", "scheduledAt");
CREATE INDEX "Match_phaseId_idx" ON "Match"("phaseId");
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

CREATE UNIQUE INDEX "Team_eventId_id_key" ON "Team"("eventId", "id");
CREATE UNIQUE INDEX "Match_eventId_id_key" ON "Match"("eventId", "id");
CREATE UNIQUE INDEX "CompetitionPhase_eventId_id_key" ON "CompetitionPhase"("eventId", "id");
CREATE UNIQUE INDEX "CompetitionGroup_eventId_id_key" ON "CompetitionGroup"("eventId", "id");

ALTER TABLE "Match" ADD CONSTRAINT "Match_phaseId_fkey" FOREIGN KEY ("eventId", "phaseId") REFERENCES "CompetitionPhase"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("eventId", "groupId") REFERENCES "CompetitionGroup"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionPhase" ADD CONSTRAINT "CompetitionPhase_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionGroup" ADD CONSTRAINT "CompetitionGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionGroup" ADD CONSTRAINT "CompetitionGroup_phaseId_fkey" FOREIGN KEY ("eventId", "phaseId") REFERENCES "CompetitionPhase"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionGroupMember" ADD CONSTRAINT "CompetitionGroupMember_groupId_fkey" FOREIGN KEY ("eventId", "groupId") REFERENCES "CompetitionGroup"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionGroupMember" ADD CONSTRAINT "CompetitionGroupMember_teamId_fkey" FOREIGN KEY ("eventId", "teamId") REFERENCES "Team"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchDependency" ADD CONSTRAINT "MatchDependency_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchDependency" ADD CONSTRAINT "MatchDependency_sourceMatchId_fkey" FOREIGN KEY ("eventId", "sourceMatchId") REFERENCES "Match"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchDependency" ADD CONSTRAINT "MatchDependency_targetMatchId_fkey" FOREIGN KEY ("eventId", "targetMatchId") REFERENCES "Match"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchReadiness" ADD CONSTRAINT "MatchReadiness_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchReadiness" ADD CONSTRAINT "MatchReadiness_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchReadiness" ADD CONSTRAINT "MatchReadiness_teamId_fkey" FOREIGN KEY ("eventId", "teamId") REFERENCES "Team"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchReadiness" ADD CONSTRAINT "MatchReadiness_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchResultRevision" ADD CONSTRAINT "MatchResultRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchResultRevision" ADD CONSTRAINT "MatchResultRevision_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchResultRevision" ADD CONSTRAINT "MatchResultRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchResultRevision" ADD CONSTRAINT "MatchResultRevision_eventId_winnerTeamId_fkey" FOREIGN KEY ("eventId", "winnerTeamId") REFERENCES "Team"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionActionItem" ADD CONSTRAINT "CompetitionActionItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionActionItem" ADD CONSTRAINT "CompetitionActionItem_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionActionItem" ADD CONSTRAINT "CompetitionActionItem_teamId_fkey" FOREIGN KEY ("eventId", "teamId") REFERENCES "Team"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionIncident" ADD CONSTRAINT "CompetitionIncident_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionIncident" ADD CONSTRAINT "CompetitionIncident_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionIncident" ADD CONSTRAINT "CompetitionIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitionAuditLog" ADD CONSTRAINT "CompetitionAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionAuditLog" ADD CONSTRAINT "CompetitionAuditLog_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionAuditLog" ADD CONSTRAINT "CompetitionAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAnnouncement" ADD CONSTRAINT "EventAnnouncement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAnnouncement" ADD CONSTRAINT "EventAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAnnouncement" ADD CONSTRAINT "EventAnnouncement_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE FUNCTION "enforce_match_result_revision"() RETURNS TRIGGER AS $$
DECLARE
  expected_version INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1
       OR NOT EXISTS (SELECT 1 FROM "Match" WHERE "id" = OLD."matchId") THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Match result revisions are append-only';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Match result revisions are append-only';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW."matchId"));
  SELECT COALESCE(MAX("version"), 0) + 1
    INTO expected_version
    FROM "MatchResultRevision"
   WHERE "matchId" = NEW."matchId";

  IF NEW."version" <> expected_version THEN
    RAISE EXCEPTION 'Match result revision version must be sequential';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MatchResultRevision_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "MatchResultRevision"
FOR EACH ROW EXECUTE FUNCTION "enforce_match_result_revision"();
