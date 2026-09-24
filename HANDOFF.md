# Handoff Release 1.0

Status release: **BLOCKED**

Anchor implementasi produk: `a3624c6`.

Task 8 sudah diimplementasikan, tetapi belum selesai ditinjau secara independen. Task 9–12 belum selesai.

Jangan mengubah, men-stage, atau commit `2026-09-14-release-1.0-verification.md` sebelum tersedia bukti segar untuk Task 12.

## Mulai di sini

Gunakan isolated worktree `E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full`, lalu baca dokumen dalam urutan berikut:

1. [Snapshot workspace](docs/handoff/2026-09-16-organizer-master-workspace/snapshot.md)
2. [PRD](docs/handoff/2026-09-16-organizer-master-workspace/prd.md)
3. [Progress](docs/handoff/2026-09-16-organizer-master-workspace/progress.md)
4. [Plan](docs/handoff/2026-09-16-organizer-master-workspace/plan.md)

## Current final bounded correction — 2026-09-24

The current isolated worktree is `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative` on `codex/organizer-release-readiness`, with release status **BLOCKED**. Attribution is explicit: `44a3068` is the bounded security implementation; `76f6264` is the migration/docs correction; this follow-up only strengthens the static contract and operator documentation. The migration correction adds a fail-closed duplicate-`PasswordResetToken.userId` `DO` guard before the unique index and performs no legacy-row mutation. The static contract proves guard ordering and rejects delete/dedupe/update/insert behavior.

Focused DB-free checks passed: migration contract 2/2, TypeScript, Prisma validate with dummy URLs, changed-file ESLint, and diff check. The final fix-wave suite evidence is 209 passed / 2 skipped files and 2,445 passed / 6 skipped tests, exit 0; the six skips are intentional (one guarded migration-DB integration and five opt-in installed-browser renderer tests), and the suite was not rerun for this correction. Final pressure remains a recorded local RED at `/id/login` p95 4,197 ms, max 4,199 ms, failures 0, exit 1, with the `<3,000 ms` threshold unchanged. No pressure/full-suite/E2E, database migration, reset, seed, deployment, push, or PR was run.

Remaining blockers include the local pressure RED above plus final-SHA CI; authorized preview/Vercel logs, RUM, rollback and PIC evidence; Neon restore/recovery and migration integration; live 64-team query/p95/load evidence; and fresh scoped Sol/high review.

Operator procedure if the guard raises: freeze password-reset issuance and obtain release/security/data-owner approval. Run this read-only diagnostic on the authorized Delicate/preview database:

```sql
SELECT "userId", COUNT(*) AS "duplicateCount"
FROM "PasswordResetToken"
GROUP BY "userId"
HAVING COUNT(*) > 1
ORDER BY "duplicateCount" DESC, "userId";
```

Wait through the exact 30-minute effective TTL for every affected row; effective expiry is the earlier of `expiresAt` and `createdAt + INTERVAL '30 minutes'`, so no valid row is deleted. In one owner-approved explicit transaction, delete only affected duplicate-user rows where `usedAt IS NOT NULL` or effective expiry is at/before `CURRENT_TIMESTAMP`, with `RETURNING` review; never silently dedupe:

```sql
BEGIN;
WITH duplicate_users AS (
  SELECT "userId" FROM "PasswordResetToken" GROUP BY "userId" HAVING COUNT(*) > 1
)
DELETE FROM "PasswordResetToken" AS t USING duplicate_users AS d
WHERE t."userId" = d."userId"
  AND (t."usedAt" IS NOT NULL OR LEAST(t."expiresAt", t."createdAt" + INTERVAL '30 minutes') <= CURRENT_TIMESTAMP)
RETURNING t."id", t."userId", t."tokenFormat", t."createdAt", t."expiresAt", t."usedAt";
COMMIT;
```

Re-run the diagnostic and require zero rows before applying the migration. On digest rollback, invalidate digest-only rows and issue a fresh reset request; never interpret a digest as a raw token or weaken the fallback.
