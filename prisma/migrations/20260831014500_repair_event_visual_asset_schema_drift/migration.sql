-- Repair production schema drift for the event visual asset migration.
-- This migration is intentionally idempotent: production may have some,
-- all, or none of the original objects even though Prisma history says the
-- original migration already ran.

CREATE TABLE IF NOT EXISTS "EventVisualAsset" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventVisualAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "activeVisualAssetId" TEXT;

CREATE INDEX IF NOT EXISTS "EventVisualAsset_eventId_createdAt_idx"
  ON "EventVisualAsset"("eventId", "createdAt");

CREATE INDEX IF NOT EXISTS "EventVisualAsset_eventId_source_createdAt_idx"
  ON "EventVisualAsset"("eventId", "source", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Event_activeVisualAssetId_key"
  ON "Event"("activeVisualAssetId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'EventVisualAsset_eventId_fkey'
  ) THEN
    ALTER TABLE "EventVisualAsset"
      ADD CONSTRAINT "EventVisualAsset_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'EventVisualAsset_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "EventVisualAsset"
      ADD CONSTRAINT "EventVisualAsset_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Event_activeVisualAssetId_fkey'
  ) THEN
    ALTER TABLE "Event"
      ADD CONSTRAINT "Event_activeVisualAssetId_fkey"
      FOREIGN KEY ("activeVisualAssetId") REFERENCES "EventVisualAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Recreate the original legacy artwork backfill safely. Existing repaired rows
-- are preserved and duplicate ids are ignored.
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
ON CONFLICT ("id") DO NOTHING;

UPDATE "Event" e
SET "activeVisualAssetId" = 'legacy_' || md5(e."id" || ':' || e."gameImageUrl")
WHERE e."gameImageUrl" IS NOT NULL
  AND e."activeVisualAssetId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "EventVisualAsset" eva
    WHERE eva."id" = 'legacy_' || md5(e."id" || ':' || e."gameImageUrl")
  );
