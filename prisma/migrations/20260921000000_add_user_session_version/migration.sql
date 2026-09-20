-- Existing reset rows contain raw tokens and are invalidated before enforcing one active row per user.
DELETE FROM "PasswordResetToken";

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"
  ON "PasswordResetToken"("userId");
