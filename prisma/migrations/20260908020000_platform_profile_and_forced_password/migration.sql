ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PlatformProfile" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "displayName" TEXT NOT NULL DEFAULT 'Miracle',
  "contactChannel" TEXT NOT NULL,
  "contactValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformProfile_pkey" PRIMARY KEY ("id")
);