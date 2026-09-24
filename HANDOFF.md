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

The current isolated worktree is `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative` on `codex/organizer-release-readiness`, with release status **BLOCKED**. The migration correction at `44a3068a7e7296c1da50a6fcd5b4e08241bb1860` adds a fail-closed duplicate-`PasswordResetToken.userId` `DO` guard before the unique index and performs no legacy-row mutation. The static contract proves guard ordering and rejects delete/dedupe/update/insert behavior.

Focused DB-free checks passed: migration contract 2/2, TypeScript, Prisma validate with dummy URLs, changed-file ESLint, and diff check. The final fix-wave suite evidence is 209 passed / 2 skipped files and 2,445 passed / 6 skipped tests, exit 0; it was not rerun for this correction. Final pressure remains a recorded RED at `/id/login` p95 4,197 ms, max 4,199 ms, failures 0, exit 1, with the `<3,000 ms` threshold unchanged. No pressure/full-suite/E2E, database migration, reset, seed, deployment, push, or PR was run.

Remaining blockers are external: final-SHA CI; authorized preview/Vercel logs, RUM, rollback and PIC evidence; Neon restore/recovery and migration integration; live 64-team query/p95/load evidence; and fresh scoped Sol/high review.
