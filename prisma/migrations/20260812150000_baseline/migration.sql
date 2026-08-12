-- Baseline for the existing Neon schema before multi-organizer ownership.
-- This migration is marked as already applied on the current Neon database.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "public"."Certificate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "gameImageUrl" TEXT,
    "gameId" TEXT NOT NULL,
    "gameModeId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "participantCap" INTEGER NOT NULL,
    "registrationWindow" TEXT NOT NULL,
    "startsAt" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accentColor" TEXT,
    "characterArtUrl" TEXT,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."EventRoundConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "EventRoundConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."EventStream" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EventStream_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Match" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "slot" INTEGER,
    "round" INTEGER,
    "winnerTeamId" TEXT,
    "scheduledLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."MatchGame" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    CONSTRAINT "MatchGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Player" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "jerseyNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PlayerStat" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "gameSlug" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    CONSTRAINT "PlayerStat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."StatSubmission" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionNote" TEXT,
    "stats" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    CONSTRAINT "StatSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "captainId" TEXT,
    "name" TEXT NOT NULL,
    "logoText" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "captainName" TEXT,
    "captainContact" TEXT,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tempPassword" TEXT,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Certificate_eventId_key" ON "public"."Certificate"("eventId" ASC);
CREATE UNIQUE INDEX "Event_slug_key" ON "public"."Event"("slug" ASC);
CREATE UNIQUE INDEX "EventRoundConfig_eventId_roundLabel_key" ON "public"."EventRoundConfig"("eventId" ASC, "roundLabel" ASC);
CREATE UNIQUE INDEX "EventStream_eventId_key" ON "public"."EventStream"("eventId" ASC);
CREATE UNIQUE INDEX "MatchGame_matchId_gameNumber_key" ON "public"."MatchGame"("matchId" ASC, "gameNumber" ASC);
CREATE UNIQUE INDEX "PlayerStat_matchId_playerId_key" ON "public"."PlayerStat"("matchId" ASC, "playerId" ASC);
CREATE UNIQUE INDEX "StatSubmission_matchId_teamId_key" ON "public"."StatSubmission"("matchId" ASC, "teamId" ASC);
CREATE UNIQUE INDEX "Team_eventId_name_key" ON "public"."Team"("eventId" ASC, "name" ASC);
CREATE UNIQUE INDEX "Team_eventId_tag_key" ON "public"."Team"("eventId" ASC, "tag" ASC);
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

ALTER TABLE "public"."Certificate" ADD CONSTRAINT "Certificate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Certificate" ADD CONSTRAINT "Certificate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."EventRoundConfig" ADD CONSTRAINT "EventRoundConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."EventStream" ADD CONSTRAINT "EventStream_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."MatchGame" ADD CONSTRAINT "MatchGame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Player" ADD CONSTRAINT "Player_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."PlayerStat" ADD CONSTRAINT "PlayerStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."PlayerStat" ADD CONSTRAINT "PlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StatSubmission" ADD CONSTRAINT "StatSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StatSubmission" ADD CONSTRAINT "StatSubmission_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
