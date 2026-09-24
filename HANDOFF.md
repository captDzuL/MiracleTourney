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

Focused DB-free checks passed: migration contract 2/2, TypeScript, Prisma validate with dummy URLs, changed-file ESLint, and diff check. The final fix-wave suite evidence is 209 passed / 2 skipped files and 2,445 passed / 6 skipped tests, exit 0; the six skips are intentional (one guarded migration-DB integration and five opt-in installed-browser renderer tests), and the suite was not rerun for this correction. Final pressure is an exact local RED record: 80 requests at concurrency 20 against `/id/login`, p95 4,197 ms, max 4,199 ms, failures 0, exit 1; later scenarios stopped and no retry occurred. No pressure/full-suite/E2E, database migration, reset, seed, deployment, push, or PR was run.

Remaining blockers include the local pressure RED above plus final-SHA CI; authorized preview/Vercel logs, RUM, rollback and PIC evidence; Neon restore/recovery and migration integration; live 64-team query/p95/load evidence; and fresh scoped Sol/high review.

Human-gated procedure if the guard raises: pause password-reset issuance and obtain a named release/security/data owner. Run these separate commands on the authorized Delicate/preview database; never silently deduplicate or issue an immediate commit. First run this read-only diagnostic:

```sql
SELECT "userId", COUNT(*) AS "duplicateCount"
FROM "PasswordResetToken"
GROUP BY "userId"
HAVING COUNT(*) > 1
ORDER BY "duplicateCount" DESC, "userId";
```

Wait until the maximum per-row effective expiry has passed: `MAX(LEAST("createdAt" + INTERVAL '30 minutes', "expiresAt"))`. Then begin the transaction, lock candidates, and delete only affected duplicate-user rows where `usedAt IS NOT NULL` or effective expiry is at/before `CURRENT_TIMESTAMP`:

```sql
BEGIN;
WITH duplicate_users AS (
  SELECT "userId"
  FROM "PasswordResetToken"
  GROUP BY "userId"
  HAVING COUNT(*) > 1
)
SELECT t."id", t."userId", t."createdAt", t."expiresAt", t."usedAt"
FROM "PasswordResetToken" AS t
JOIN duplicate_users AS d ON d."userId" = t."userId"
WHERE t."usedAt" IS NOT NULL
   OR LEAST(t."expiresAt", t."createdAt" + INTERVAL '30 minutes') <= CURRENT_TIMESTAMP
FOR UPDATE;

WITH duplicate_users AS (
  SELECT "userId"
  FROM "PasswordResetToken"
  GROUP BY "userId"
  HAVING COUNT(*) > 1
)
DELETE FROM "PasswordResetToken" AS t
USING duplicate_users AS d
WHERE t."userId" = d."userId"
  AND (t."usedAt" IS NOT NULL OR LEAST(t."expiresAt", t."createdAt" + INTERVAL '30 minutes') <= CURRENT_TIMESTAMP)
RETURNING t."id", t."userId", t."tokenFormat", t."createdAt", t."expiresAt", t."usedAt";
```

Stop with the transaction open for named-owner review. Only after explicit approval run this separate command in the same session:

```sql
COMMIT;
```

If approval is denied or review is incomplete, run this separate command instead:

```sql
ROLLBACK;
```

After a committed cleanup, re-run the exact diagnostic and require zero rows; only then apply the migration. Never apply the unique index with duplicates remaining.

For digest rollback after issuance, pause password-reset issuance. In one transaction lock active SHA-256 rows and mark only those rows used:

```sql
BEGIN;
SELECT "id", "userId", "createdAt", "expiresAt", "usedAt"
FROM "PasswordResetToken"
WHERE "tokenFormat" = 'sha256' AND "usedAt" IS NULL
FOR UPDATE;

UPDATE "PasswordResetToken"
SET "usedAt" = CURRENT_TIMESTAMP
WHERE "tokenFormat" = 'sha256' AND "usedAt" IS NULL
RETURNING "id", "userId", "tokenFormat", "createdAt", "expiresAt", "usedAt";
```

Stop with the transaction open for named-owner review. Only after explicit approval run separate `COMMIT;`; otherwise run separate `ROLLBACK;`. After commit, confirm zero active SHA-256 rows:

```sql
SELECT COUNT(*) AS "activeSha256Count"
FROM "PasswordResetToken"
WHERE "tokenFormat" = 'sha256' AND "usedAt" IS NULL;
```

Only after that zero-row confirmation perform the application rollback; users must request a fresh reset. Never interpret a digest as a raw token or weaken the fallback.
