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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PasswordResetToken"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create PasswordResetToken_userId_key: duplicate PasswordResetToken.userId rows exist; resolve duplicate reset-token rows before applying this migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key"
  ON "PasswordResetToken"("userId");
