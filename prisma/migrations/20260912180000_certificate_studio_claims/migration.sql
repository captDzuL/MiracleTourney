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
