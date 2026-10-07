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
