-- Event-owned payment settings are additive; legacy PaymentSettings remains the fallback.
CREATE TABLE "EventPaymentSettings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "qrisImageUrl" TEXT,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPaymentSettings_eventId_key" ON "EventPaymentSettings"("eventId");
CREATE INDEX "EventPaymentSettings_status_publishedAt_idx" ON "EventPaymentSettings"("status", "publishedAt");
CREATE INDEX "EventPaymentSettings_updatedById_idx" ON "EventPaymentSettings"("updatedById");

ALTER TABLE "EventPaymentSettings"
  ADD CONSTRAINT "EventPaymentSettings_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPaymentSettings"
  ADD CONSTRAINT "EventPaymentSettings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
