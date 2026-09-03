-- Certificate generation status tracking.
-- Every statement is idempotent: this file is applied manually via the Neon SQL Editor
-- (so preview deploys, which skip `prisma migrate deploy`, have the columns) and then
-- re-executed as a no-op by `prisma migrate deploy` on the production build.

ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Certificate" ALTER COLUMN "imageUrl" SET DEFAULT '';
