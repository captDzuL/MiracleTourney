ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "organizerUserId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "organizerName" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "organizerVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "prizePoolLabel" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "registrationFeeLabel" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "registrationUrl" TEXT;

UPDATE "User" SET "role" = 'platform_admin' WHERE "role" = 'admin';

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_organizerUserId_fkey"
  FOREIGN KEY ("organizerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
