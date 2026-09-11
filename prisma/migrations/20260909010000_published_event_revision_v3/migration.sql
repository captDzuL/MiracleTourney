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
