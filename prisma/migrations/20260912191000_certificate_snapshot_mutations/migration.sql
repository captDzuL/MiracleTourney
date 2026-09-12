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
