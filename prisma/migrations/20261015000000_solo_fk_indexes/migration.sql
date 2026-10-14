-- Deleting a user sets these links to null (ON DELETE SET NULL), and Postgres finds the rows to change by scanning
-- the whole table unless the column has an index. The tables are small today; the indexes keep that cheap later.
-- Additive and safe to run twice.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "SoloRegistration_approvedById_idx" ON "SoloRegistration"("approvedById");
CREATE INDEX IF NOT EXISTS "SoloDraw_createdById_idx" ON "SoloDraw"("createdById");
CREATE INDEX IF NOT EXISTS "SoloDraw_lockedById_idx" ON "SoloDraw"("lockedById");
