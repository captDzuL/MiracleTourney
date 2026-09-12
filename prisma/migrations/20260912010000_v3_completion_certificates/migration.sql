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
