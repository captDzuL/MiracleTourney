ALTER TABLE "Event" ADD COLUMN "registrationFeeRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "registrationFeeAmount" INTEGER;

CREATE TABLE "TeamRegistrationRequest" (
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

CREATE TABLE "PaymentSettings" (
  "id" TEXT NOT NULL,
  "qrisImageUrl" TEXT,
  "instructions" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamRegistrationRequest_teamId_key" ON "TeamRegistrationRequest"("teamId");
CREATE INDEX "TeamRegistrationRequest_status_idx" ON "TeamRegistrationRequest"("status");
CREATE INDEX "TeamRegistrationRequest_eventId_idx" ON "TeamRegistrationRequest"("eventId");
CREATE INDEX "TeamRegistrationRequest_captainId_idx" ON "TeamRegistrationRequest"("captainId");
CREATE UNIQUE INDEX "TeamRegistrationRequest_eventId_captainId_active_key"
  ON "TeamRegistrationRequest"("eventId", "captainId")
  WHERE "status" IN ('pending_payment', 'pending_review', 'approved');
CREATE UNIQUE INDEX "TeamRegistrationRequest_eventId_teamName_reserved_key"
  ON "TeamRegistrationRequest"("eventId", "teamName")
  WHERE "status" IN ('pending_payment', 'pending_review');
CREATE UNIQUE INDEX "TeamRegistrationRequest_eventId_teamTag_reserved_key"
  ON "TeamRegistrationRequest"("eventId", "teamTag")
  WHERE "status" IN ('pending_payment', 'pending_review');

ALTER TABLE "TeamRegistrationRequest" ADD CONSTRAINT "TeamRegistrationRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamRegistrationRequest" ADD CONSTRAINT "TeamRegistrationRequest_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamRegistrationRequest" ADD CONSTRAINT "TeamRegistrationRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamRegistrationRequest" ADD CONSTRAINT "TeamRegistrationRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;