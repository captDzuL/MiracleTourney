-- CreateTable
CREATE TABLE "EventVisualAsset" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "url" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "focalX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "focalY" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "workflowRunId" TEXT,
    "sourceUrl" TEXT,
    "rightsAttestedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVisualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventVisualAsset_eventId_createdAt_idx" ON "EventVisualAsset"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventVisualAsset_eventId_source_createdAt_idx" ON "EventVisualAsset"("eventId", "source", "createdAt");

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "activeVisualAssetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_activeVisualAssetId_key" ON "Event"("activeVisualAssetId");

-- AddForeignKey
ALTER TABLE "EventVisualAsset" ADD CONSTRAINT "EventVisualAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVisualAsset" ADD CONSTRAINT "EventVisualAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_activeVisualAssetId_fkey" FOREIGN KEY ("activeVisualAssetId") REFERENCES "EventVisualAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy organizer artwork as an approved revision.
-- Dimensions, MIME, provenance, and rights attestation stay null: legacy rows
-- have no measured metadata and no organizer rights attestation to claim.
INSERT INTO "EventVisualAsset" (
  "id", "eventId", "source", "status", "url", "focalX", "focalY",
  "approvedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(e."id" || ':' || e."gameImageUrl"),
  e."id",
  'organizer_upload',
  'approved',
  e."gameImageUrl",
  0.5,
  0.5,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Event" e
WHERE e."gameImageUrl" IS NOT NULL
  AND e."activeVisualAssetId" IS NULL;

UPDATE "Event" e
SET "activeVisualAssetId" = 'legacy_' || md5(e."id" || ':' || e."gameImageUrl")
WHERE e."gameImageUrl" IS NOT NULL
  AND e."activeVisualAssetId" IS NULL;
