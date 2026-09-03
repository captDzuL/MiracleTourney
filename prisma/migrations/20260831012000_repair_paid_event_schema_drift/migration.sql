-- Repair production schema drift where Prisma migration history is ahead of
-- the physical Event table schema. Keep this migration idempotent so it is
-- safe to apply even when some or all fields already exist.

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "registrationFeeRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "registrationFeeAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "registrationFeeLabel" TEXT;
