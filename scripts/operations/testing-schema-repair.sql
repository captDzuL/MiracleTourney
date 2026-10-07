-- Targeted Delicate testing catalog reconciliation. Exact baseline and backup guards are mandatory.
-- Derived from the canonical LF SQL chain; only missing schema objects and canonical new-column backfill are included.

-- Canonical source: 20260905010000_v3_event_lifecycle
-- CreateTable
CREATE TABLE "OrganizerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "contactChannel" TEXT NOT NULL,
    "contactValue" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerProfile_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Structured timestamps stay nullable so existing rows remain valid while the
-- legacy registrationWindow and startsAt display strings are still in use.
ALTER TABLE "Event"
    ADD COLUMN "registrationOpensAt" TIMESTAMP(3),
    ADD COLUMN "registrationClosesAt" TIMESTAMP(3),
    ADD COLUMN "eventStartsAt" TIMESTAMP(3),
    ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    ADD COLUMN "venueAddress" TEXT,
    ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "publishedAt" TIMESTAMP(3),
    ADD COLUMN "previewRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EventPreviewToken" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPreviewToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerProfile_userId_key" ON "OrganizerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPreviewToken_tokenHash_key" ON "EventPreviewToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EventPreviewToken_eventId_revokedAt_expiresAt_idx" ON "EventPreviewToken"("eventId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizerProfile" ADD CONSTRAINT "OrganizerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPreviewToken" ADD CONSTRAINT "EventPreviewToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPreviewToken" ADD CONSTRAINT "EventPreviewToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Canonical source: 20260905011000_v3_event_draft_idempotency
-- AlterTable
-- Nullable so existing drafts remain valid; each successful autosave records
-- the client-generated mutation UUID that advanced draftRevision.
ALTER TABLE "Event"
    ADD COLUMN "lastDraftMutationId" TEXT;

-- Canonical source: 20260905012000_v3_format_config
-- Additive V3 format configuration. The legacy Event.format string remains
-- required during rollout so existing events and rollback paths stay valid.
ALTER TABLE "Event" ADD COLUMN "formatConfig" JSONB;

-- Canonical source: 20260908020000_platform_profile_and_forced_password
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PlatformProfile" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "displayName" TEXT NOT NULL DEFAULT 'Miracle',
  "contactChannel" TEXT NOT NULL,
  "contactValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformProfile_pkey" PRIMARY KEY ("id")
);

-- Canonical source: 20260909010000_published_event_revision_v3
ALTER TABLE "Event" ADD COLUMN "publishedRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "EventEditRevision" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "status" TEXT NOT NULL,
  "basePublishedRevision" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "lastMutationId" TEXT,
  "lastMutationPayload" JSONB,
  "payload" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  "discardReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventEditRevision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EventPreviewToken" ADD COLUMN "revisionId" TEXT;

CREATE TABLE "EventSlugRedirect" (
  "id" TEXT NOT NULL,
  "oldSlug" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventSlugRedirect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventEditRevision_eventId_status_idx" ON "EventEditRevision"("eventId", "status");
CREATE UNIQUE INDEX "EventEditRevision_one_active_draft_per_event" ON "EventEditRevision"("eventId") WHERE "status" = 'Draft';
CREATE INDEX "EventPreviewToken_revisionId_revokedAt_expiresAt_idx" ON "EventPreviewToken"("revisionId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "EventSlugRedirect_oldSlug_key" ON "EventSlugRedirect"("oldSlug");
CREATE INDEX "EventSlugRedirect_eventId_idx" ON "EventSlugRedirect"("eventId");

ALTER TABLE "EventEditRevision" ADD CONSTRAINT "EventEditRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventEditRevision" ADD CONSTRAINT "EventEditRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventPreviewToken" ADD CONSTRAINT "EventPreviewToken_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EventEditRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSlugRedirect" ADD CONSTRAINT "EventSlugRedirect_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canonical source: 20260910150000_add_captain_game_identity
ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "captainIgn" TEXT,
  ADD COLUMN IF NOT EXISTS "captainUid" TEXT,
  ADD COLUMN IF NOT EXISTS "captainIsPlayer" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Team_eventId_captainUid_idx"
  ON "Team"("eventId", "captainUid");

-- Canonical source: 20260912000000_competition_operations_v3_foundation
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
ALTER TABLE "MatchResultRevision" ADD CONSTRAINT "MatchResultRevision_eventId_winnerTeamId_fkey" FOREIGN KEY ("eventId", "winnerTeamId") REFERENCES "Team"("eventId", "id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
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


-- Existing enforce_match_result_revision function is verified equivalent to canonical LF definition.

CREATE TRIGGER "MatchResultRevision_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "MatchResultRevision"
FOR EACH ROW EXECUTE FUNCTION "enforce_match_result_revision"();

-- Canonical source: 202609120001_competition_operation_versions
-- Independent CAS version for competition writes and an explicit public pointer.
ALTER TABLE "Event"
  ADD COLUMN "competitionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publishedScheduleVersion" INTEGER;

-- Canonical source: 20260912010000_v3_completion_certificates
-- Add completion snapshots and expand certificates without replacing legacy rows.
CREATE TABLE "TournamentCompletion" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "format" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "completedByUserId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reopenedByUserId" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentCompletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PodiumPlacement" (
  "id" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceMatchId" TEXT,
  "sourceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PodiumPlacement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventAward" (
  "id" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "candidateSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AwardDecision" (
  "id" TEXT NOT NULL,
  "awardId" TEXT NOT NULL,
  "recipientKind" TEXT NOT NULL DEFAULT 'player',
  "recipientId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "reason" TEXT,
  "decidedByUserId" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AwardDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompletionAuditEntry" (
  "id" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletionAuditEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Certificate"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'champion',
  ADD COLUMN "recipientKind" TEXT NOT NULL DEFAULT 'team',
  ADD COLUMN "recipientId" TEXT,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "templateVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN "assetManifest" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "verificationCode" TEXT,
  ADD COLUMN "publishedUrl" TEXT,
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "supersededByVersion" INTEGER;

UPDATE "Certificate"
SET
  "recipientId" = "teamId",
  "recipientName" = COALESCE(
    (SELECT "Team"."name" FROM "Team" WHERE "Team"."id" = "Certificate"."teamId"),
    "teamId"
  ),
  "verificationCode" = "id",
  "publishedUrl" = NULLIF("imageUrl", ''),
  "generatedAt" = CASE WHEN "imageUrl" <> '' THEN "createdAt" ELSE NULL END,
  "publishedAt" = CASE WHEN "status" = 'ready' AND "imageUrl" <> '' THEN "createdAt" ELSE NULL END;

ALTER TABLE "Certificate"
  ALTER COLUMN "recipientId" SET NOT NULL,
  ALTER COLUMN "recipientName" SET NOT NULL,
  ALTER COLUMN "verificationCode" SET NOT NULL;

DROP INDEX IF EXISTS "Certificate_eventId_key";

CREATE UNIQUE INDEX "TournamentCompletion_eventId_key" ON "TournamentCompletion"("eventId");
CREATE UNIQUE INDEX "PodiumPlacement_completionId_rank_key" ON "PodiumPlacement"("completionId", "rank");
CREATE INDEX "PodiumPlacement_teamId_idx" ON "PodiumPlacement"("teamId");
CREATE UNIQUE INDEX "EventAward_completionId_type_key" ON "EventAward"("completionId", "type");
CREATE UNIQUE INDEX "AwardDecision_awardId_key" ON "AwardDecision"("awardId");
CREATE INDEX "CompletionAuditEntry_completionId_createdAt_idx" ON "CompletionAuditEntry"("completionId", "createdAt");
CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON "Certificate"("verificationCode");
CREATE UNIQUE INDEX "Certificate_eventId_type_recipientKind_recipientId_version_key"
  ON "Certificate"("eventId", "type", "recipientKind", "recipientId", "version");
CREATE INDEX "Certificate_eventId_type_status_idx" ON "Certificate"("eventId", "type", "status");

ALTER TABLE "TournamentCompletion" ADD CONSTRAINT "TournamentCompletion_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PodiumPlacement" ADD CONSTRAINT "PodiumPlacement_completionId_fkey"
  FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAward" ADD CONSTRAINT "EventAward_completionId_fkey"
  FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AwardDecision" ADD CONSTRAINT "AwardDecision_awardId_fkey"
  FOREIGN KEY ("awardId") REFERENCES "EventAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionAuditEntry" ADD CONSTRAINT "CompletionAuditEntry_completionId_fkey"
  FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canonical source: 20260912030000_announcement_urgency
CREATE TYPE "AnnouncementUrgency" AS ENUM ('info', 'important', 'urgent');
ALTER TABLE "EventAnnouncement"
  ADD COLUMN "urgency" "AnnouncementUrgency" NOT NULL DEFAULT 'info';

-- Canonical source: 20260912040000_match_actual_timing
ALTER TABLE "Match" ADD COLUMN "actualStartedAt" TIMESTAMP(3),
                    ADD COLUMN "actualEndedAt" TIMESTAMP(3);

-- Canonical source: 20260912180000_certificate_studio_claims
-- Durable certificate generation claims. Nullable keys preserve migrated legacy rows.
ALTER TABLE "EventVisualAsset" ADD COLUMN "byteSize" INTEGER;

ALTER TABLE "Certificate"
  ADD COLUMN "generationAttemptId" TEXT,
  ADD COLUMN "generationClaimedAt" TIMESTAMP(3),
  ADD COLUMN "generationIdempotencyKey" TEXT,
  ADD COLUMN "generationFingerprint" TEXT,
  ADD COLUMN "generationActorUserId" TEXT;

CREATE UNIQUE INDEX "Certificate_eventId_type_generationIdempotencyKey_key"
  ON "Certificate"("eventId", "type", "generationIdempotencyKey");

ALTER TABLE "TournamentCompletion"
  ADD COLUMN "certificateRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CertificatePublication" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "completionVersion" INTEGER NOT NULL,
  "certificateIds" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificatePublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CertificatePublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CertificatePublication_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CertificatePublication_eventId_version_key" ON "CertificatePublication"("eventId", "version");
CREATE UNIQUE INDEX "CertificatePublication_eventId_idempotencyKey_key" ON "CertificatePublication"("eventId", "idempotencyKey");
CREATE INDEX "CertificatePublication_completionId_publishedAt_idx" ON "CertificatePublication"("completionId", "publishedAt");

-- Canonical source: 20260912191000_certificate_snapshot_mutations
ALTER TABLE "EventVisualAsset"
  ADD COLUMN "storageProvider" TEXT,
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "contentSha256" TEXT,
  ADD COLUMN "purpose" TEXT;

ALTER TABLE "Certificate"
  ADD COLUMN "completionId" TEXT,
  ADD COLUMN "completionVersion" INTEGER;

CREATE INDEX "Certificate_completionId_completionVersion_idx"
  ON "Certificate"("completionId", "completionVersion");

ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_completionId_fkey"
  FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CertificateGenerationMutation" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "result" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateGenerationMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CertificateGenerationMutation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CertificateGenerationMutation_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CertificateGenerationMutation_certificateId_key" ON "CertificateGenerationMutation"("certificateId");
CREATE UNIQUE INDEX "CertificateGenerationMutation_eventId_idempotencyKey_key" ON "CertificateGenerationMutation"("eventId", "idempotencyKey");
CREATE INDEX "CertificateGenerationMutation_eventId_type_status_idx" ON "CertificateGenerationMutation"("eventId", "type", "status");

-- Canonical source: 20260912205500_certificate_mutation_leases
-- Lease state is additive so existing terminal mutation history remains valid.
ALTER TABLE "CertificateGenerationMutation"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseOwnerId" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- Canonical source: 20260912233000_certificate_render_manifest
ALTER TABLE "Certificate"
  ADD COLUMN "renderManifest" JSONB;

-- Canonical source: 20260913010000_completion_transaction_adapter
-- Durable receipts are nullable so existing immutable audit history is untouched.
ALTER TABLE "CompletionAuditEntry"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "result" JSONB;

CREATE UNIQUE INDEX "CompletionAuditEntry_completionId_idempotencyKey_key"
  ON "CompletionAuditEntry"("completionId", "idempotencyKey");

-- Canonical source: 20260914090000_add_event_payment_settings
-- Event-owned payment settings are additive; legacy PaymentSettings remains the fallback.
CREATE TABLE "EventPaymentSettings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "qrisImageUrl" TEXT,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPaymentSettings_eventId_key" ON "EventPaymentSettings"("eventId");
CREATE INDEX "EventPaymentSettings_status_publishedAt_idx" ON "EventPaymentSettings"("status", "publishedAt");
CREATE INDEX "EventPaymentSettings_updatedById_idx" ON "EventPaymentSettings"("updatedById");

ALTER TABLE "EventPaymentSettings"
  ADD CONSTRAINT "EventPaymentSettings_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPaymentSettings"
  ADD CONSTRAINT "EventPaymentSettings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Canonical source: 20260921000000_add_user_session_version
-- Existing reset rows are retained as explicitly identifiable legacy_raw rows.
-- The application accepts them only during the documented bounded transition,
-- with the original 30-minute validity and one-time-use checks.
-- If deployment is rolled back after digest-only writers have issued tokens,
-- those digest rows are intentionally not readable as raw tokens; invalidate
-- them and issue a fresh reset request rather than weakening the fallback.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PasswordResetToken"
  ADD COLUMN IF NOT EXISTS "tokenFormat" TEXT NOT NULL DEFAULT 'legacy_raw';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PasswordResetToken"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create PasswordResetToken_userId_key: duplicate PasswordResetToken.userId rows exist; resolve duplicate reset-token rows before applying this migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"
  ON "PasswordResetToken"("userId");

-- Canonical source: 20260924000000_add_rate_limit_buckets
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitBucket_key_key"
  ON "RateLimitBucket"("key");

CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx"
  ON "RateLimitBucket"("resetAt");

-- Canonical source: 20261004000000_event_bracket_appearance
CREATE TABLE "EventBracketAppearance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "backgroundUrl" TEXT,
    "positionX" INTEGER NOT NULL DEFAULT 50,
    "positionY" INTEGER NOT NULL DEFAULT 50,
    "overlay" INTEGER NOT NULL DEFAULT 35,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventBracketAppearance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventBracketAppearance_eventId_key" ON "EventBracketAppearance"("eventId");
ALTER TABLE "EventBracketAppearance" ADD CONSTRAINT "EventBracketAppearance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
