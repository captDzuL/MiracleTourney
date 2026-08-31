-- Repair production schema drift for the paid-registration feature.
-- Intentionally idempotent: production may have none, some, or all objects
-- from the original 20260824000000_paid_event_registration migration.
-- This migration is schema-only and does not insert or modify payment records.

CREATE TABLE IF NOT EXISTS "TeamRegistrationRequest" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "teamId" TEXT,
  "teamName" TEXT NOT NULL,
  "teamTag" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_payment',
  "proofImageUrl" TEXT,
  "rejectReason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamRegistrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentSettings" (
  "id" TEXT NOT NULL,
  "qrisImageUrl" TEXT,
  "instructions" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamRegistrationRequest_teamId_key"
  ON "TeamRegistrationRequest"("teamId");
CREATE INDEX IF NOT EXISTS "TeamRegistrationRequest_status_idx"
  ON "TeamRegistrationRequest"("status");
CREATE INDEX IF NOT EXISTS "TeamRegistrationRequest_eventId_idx"
  ON "TeamRegistrationRequest"("eventId");
CREATE INDEX IF NOT EXISTS "TeamRegistrationRequest_captainId_idx"
  ON "TeamRegistrationRequest"("captainId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRegistrationRequest_eventId_captainId_active_key"
  ON "TeamRegistrationRequest"("eventId", "captainId")
  WHERE "status" IN ('pending_payment', 'pending_review', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRegistrationRequest_eventId_teamName_reserved_key"
  ON "TeamRegistrationRequest"("eventId", "teamName")
  WHERE "status" IN ('pending_payment', 'pending_review');
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRegistrationRequest_eventId_teamTag_reserved_key"
  ON "TeamRegistrationRequest"("eventId", "teamTag")
  WHERE "status" IN ('pending_payment', 'pending_review');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TeamRegistrationRequest_eventId_fkey'
  ) THEN
    ALTER TABLE "TeamRegistrationRequest"
      ADD CONSTRAINT "TeamRegistrationRequest_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TeamRegistrationRequest_captainId_fkey'
  ) THEN
    ALTER TABLE "TeamRegistrationRequest"
      ADD CONSTRAINT "TeamRegistrationRequest_captainId_fkey"
      FOREIGN KEY ("captainId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TeamRegistrationRequest_teamId_fkey'
  ) THEN
    ALTER TABLE "TeamRegistrationRequest"
      ADD CONSTRAINT "TeamRegistrationRequest_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TeamRegistrationRequest_approvedById_fkey'
  ) THEN
    ALTER TABLE "TeamRegistrationRequest"
      ADD CONSTRAINT "TeamRegistrationRequest_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
