-- Existing reset rows are retained as explicitly identifiable legacy_raw rows.
-- The application accepts them only during the documented bounded transition,
-- with the original 30-minute validity and one-time-use checks.
-- If deployment is rolled back after digest-only writers have issued tokens,
-- those digest rows are intentionally not readable as raw tokens; invalidate
-- them and issue a fresh reset request rather than weakening the fallback.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PasswordResetToken"
  ADD COLUMN IF NOT EXISTS "tokenFormat" TEXT NOT NULL DEFAULT 'legacy_raw';

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"
  ON "PasswordResetToken"("userId");
