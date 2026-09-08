BEGIN;

-- Guard: preflight/apply must clear all legacy admin rows before schema hardening.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'admin') THEN
    RAISE EXCEPTION 'Tenant ownership migration blocked: no admin roles remain requirement not met. Run preflight apply with explicit legacyAdminUserIds first.';
  END IF;
END $$;

-- Guard: every owned event must reference an organizer/platform admin role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Event" e
    JOIN "User" u ON u."id" = e."organizerUserId"
    WHERE e."organizerUserId" IS NOT NULL
      AND u."role" NOT IN ('organizer', 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Tenant ownership migration blocked: some events are owned by non-organizer roles. Run preflight and repair ownership first.';
  END IF;
END $$;

-- Guard: every event must have explicit organizer ownership before enforcing NOT NULL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Event" WHERE "organizerUserId" IS NULL) THEN
    RAISE EXCEPTION 'Tenant ownership migration blocked: Event.organizerUserId contains NULL. Apply explicit orphan mappings first.';
  END IF;
END $$;

-- Keep query performance stable for owner-scoped event filters.
CREATE INDEX IF NOT EXISTS "Event_organizerUserId_idx" ON "Event"("organizerUserId");

-- Enforce required owner and RESTRICT deletes for tenant safety.
ALTER TABLE "Event" ALTER COLUMN "organizerUserId" SET NOT NULL;

ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_organizerUserId_fkey";
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_organizerUserId_fkey"
  FOREIGN KEY ("organizerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
