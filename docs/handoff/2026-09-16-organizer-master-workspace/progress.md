# Progress Handoff — Organizer Master Workspace

Snapshot date: 2026-09-16 Asia/Jakarta
Branch: feature/ui/release/1.0
Product implementation anchor: a3624c60186fefa2f6e5474cf423e1af7a7639d8
Release decision at this point: BLOCKED. No READY claim is permitted.

## Release-readiness continuation — 2026-09-21

- Assigned isolated worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`.
- Working branch: `codex/organizer-release-readiness`.
- Source/product HEAD before the evidence-doc commit: `79e62cddc77beae4913529d471b493c6e56335b3`.
- Evidence-doc commit: `7cdb39df8810045ebdddf8384a55d9f147608fb9` (`docs: finalize organizer release readiness evidence`); this docs SHA is intentionally separate from the source/product SHA.
- Release target: `feature/ui/release/1.0`; no PR was created.
- Tasks 1–11 have credential-independent implementation/static evidence and task review artifacts. Their guarded shared-Neon/browser, preview, CI-final-SHA, Vercel, Neon recovery, and deployed-RUM gates remain incomplete as recorded in the new release verification report.
- Task 12 created `2026-09-14-release-1.0-verification.md` only after fresh evidence was available. The report is explicitly `BLOCKED`; no production deployment, migration, restore, flag activation, force-push, or PR was performed.
- The ignored `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md` ledger was updated with the final-review fix-wave facts below; it remains an orchestrator-owned evidence record.

### Task 12 blockers

1. Authorized `.env.test` with guarded Delicate/preview `DATABASE_URL` and `DIRECT_URL` is absent, so shared-Neon E2E, reset/completion/certificate persistence, manipulated-ID runtime checks, 64-team live query/pressure checks, and migration/shadow-database review cannot run.
2. No authorized Vercel project/session, known-good preview deployment ID, preview URL, Runtime Logs export, deployment-failure notification proof, saved-view/PIC access proof, or deployed Speed Insights/RUM sample is available.
3. No final-SHA GitHub Actions run URL/result or fresh whole-branch Sol/high verdict is available.
4. Neon snapshot/PITR/retention/RPO/RTO/PIC/switchover details and a fresh non-production restore rehearsal with integrity queries are unavailable.
5. Repository/code owner action is required for the two local full-suite failures recorded in the verification report, followed by a complete-suite rerun on the resulting HEAD; focused tests do not resolve that gate.
6. Local pressure is also RED: `/id/login` p95 `4197ms`, max `4199ms`, failures `0`, exit `1`; the `<3000ms` contract remains unchanged.

The release decision remains `BLOCKED` until every required security, recovery,
CI, preview, monitoring, performance, review, and evidence gate is green.

## Final-review fix wave — 2026-09-24

- Base reviewed: `b97b9e80aa92806e23cfb93752f2cf4c630cbe09` on the isolated
  `codex/organizer-release-readiness` branch. No push, PR, deployment,
  migration, reset, seed, or production operation was performed.
- Whole-branch review P2 remediation is bounded and complete in the working
  tree: the process-local limiter is now a shared Prisma CAS bucket with
  digest-only keys, bounded deny-only local tracking, and fail-closed errors;
  session/reset rollout accepts version-zero legacy sessions safely and writes
  digest-form reset tokens with an explicit bounded legacy window; the
  registration contract fixture now mocks the new async limiter seam.
- The authoritative pre-fix local matrix remains: Prisma valid; TypeScript
  exit 0; ESLint 0 errors/56 warnings; unit 207 passed/2 skipped files and
  2,433 passed/6 intentional skips; smoke 24/24; pressure p95 2,370/414/52
  ms with zero failures; audit clean; and build 46/46.
- Terminal gates are CLOSED, not blockers: legacy 4/4; split visual V3 24/24
  plus V2 9/9 with zero skips/retries/flakes; and warmed quick-load HTTP 200
  with p97.5 2,945/2,069/1,582 ms and zero errors.
- Fresh bounded verification is captured in the ignored
  `whole-branch-final-fix-report.md`: generate/validate, nonincremental
  TypeScript, actual ESLint, complete Vitest plus the affected-file repair,
  DB-free smoke, pressure, audit, build, diff check, and status. The fresh
  pressure environment reproduced a local `/id/login` p95 concern twice
  (4,387 ms and 3,783 ms, zero request failures) without threshold changes;
  this is retained as a concern, not promoted to a release blocker.
- Fresh scoped 5.6-Sol/high re-review is **PENDING**; no approval is claimed.
  Overall release status remains **BLOCKED** by the local pressure RED
  (`/id/login` p95 `4197ms`, max `4199ms`, failures `0`, exit `1`) plus
  final-SHA GitHub CI; credentialed Vercel preview/logs/RUM/rollback/PIC;
  Neon recovery console/restore rehearsal/migration integration; and the
  live 64-team query/p95.

## Final bounded migration-safety correction — 2026-09-24

- Base: `44a3068a7e7296c1da50a6fcd5b4e08241bb1860` on the isolated
  `codex/organizer-release-readiness` worktree.
- The password-reset migration now checks duplicate `PasswordResetToken.userId`
  rows in a PostgreSQL `DO` block, raises an actionable exception before the
  unique index, and never deletes, deduplicates, updates, inserts, truncates,
  or merges legacy rows. The static contract TDD RED preceded the guard and
  GREEN is 2/2.
- Focused DB-free verification passed: migration contract 1 file/2 tests,
  TypeScript, Prisma validate with dummy URLs, changed-file ESLint, and
  `git diff --check`. Sandbox-only engine/esbuild failures occurred before
  collection and were resolved by identical elevated checks.
- Final supplied fix-wave Vitest evidence is 209 passed / 2 skipped files and
  2,445 passed / 6 skipped tests, exit 0; no full-suite rerun was performed in
  this correction. Final supplied pressure remains RED at `/id/login` p95
  `4197ms`, max `4199ms`, failures `0`, exit 1; the `<3000ms` contract and
  failure semantics were not changed.
- No pressure, E2E, reset, seed, migration application, deployment, push, or
  PR was run. Release remains **BLOCKED** on final-SHA CI, authorized
  Vercel/preview/log/RUM/PIC evidence, Neon recovery/restore/migration
  integration, live 64-team query/p95/load evidence, and fresh scoped
  Sol/high review, plus the local pressure RED above.

### Password-reset duplicate guard operator procedure

The six skipped final-suite tests are intentional: one guarded migration-DB
integration and five opt-in installed-browser renderer tests. If the migration
guard raises, freeze password-reset issuance and obtain explicit
release/security/data-owner approval. Run this exact read-only diagnostic:

```sql
SELECT "userId", COUNT(*) AS "duplicateCount"
FROM "PasswordResetToken"
GROUP BY "userId"
HAVING COUNT(*) > 1
ORDER BY "duplicateCount" DESC, "userId";
```

Wait through the exact 30-minute effective TTL for every affected row. Effective
expiry is the earlier of `expiresAt` and `createdAt + INTERVAL '30 minutes'`.
In one explicit owner-approved transaction, delete only affected duplicate-user
rows where `usedAt IS NOT NULL` or effective expiry is at/before
`CURRENT_TIMESTAMP`; review `RETURNING`, roll back if needed, and never silently
deduplicate:

```sql
BEGIN;
WITH duplicate_users AS (
  SELECT "userId"
  FROM "PasswordResetToken"
  GROUP BY "userId"
  HAVING COUNT(*) > 1
)
DELETE FROM "PasswordResetToken" AS t
USING duplicate_users AS d
WHERE t."userId" = d."userId"
  AND (
    t."usedAt" IS NOT NULL
    OR LEAST(t."expiresAt", t."createdAt" + INTERVAL '30 minutes') <= CURRENT_TIMESTAMP
  )
RETURNING t."id", t."userId", t."tokenFormat", t."createdAt", t."expiresAt", t."usedAt";
-- Review RETURNING rows; ROLLBACK on disagreement, otherwise COMMIT.
COMMIT;
```

Re-run the exact diagnostic and require zero rows before applying the migration;
stop for owner direction if any duplicate remains. A digest rollback
invalidates digest-only rows and requires a fresh reset request; never interpret
a digest as a raw token or weaken the legacy fallback.

## Historical handoff details — 2026-09-16 (non-operative)

The Task ledger, stale Tasks 9–12 status, and the next-action instructions
below are preserved from the 2026-09-16 handoff for audit history only. They
are not the current release state and must not be followed as operating
instructions. The current state is the 2026-09-21 release-readiness
continuation above, the verification report, and the Task 12 report. In
particular, the old `E:\dev\MiracleTourney-gitnative` worktree paths and
prohibited “protected report remains untouched” wording are historical; all
current work is restricted to the isolated worktree named above, and the
evidence report is now committed.

## Task ledger (historical, non-operative)

| Status | Task | Stable commit/evidence | Review state |
| --- | --- | --- | --- |
| [x] | 1. Shell contract, navigation, locale parity, rollback flag | a48d581 plus 041c82e; focused 21 tests; full 1,766 passed / 6 skipped | Review clean |
| [x] | 2. Compact read model and shared master shell | f2f74cb plus 9ef3f8d; focused 56 tests; full 1,796 passed / 6 skipped | Review clean |
| [x] | 3. Command Center, canonical admin entry, focused Overview | 8da3b01 plus 905999c; affected 234 tests; full 1,848 passed / 6 skipped; browser checks passed | Review approved |
| [x] | 4. Event-scoped QRIS/payment settings | 868a62a plus 90d2e07; focused 25 tests in fix verification; full 1,860 passed / 6 skipped | Review approved |
| [x] | 5. Event-local registration readers/actions and legacy adapters | 13b8f00, 8cdccc7, f7b05fb, 7122cf1; focused 272 tests and contract 155 tests; full 1,896 passed / 6 skipped | Review approved |
| [x] | 6. Registration queue, XLSX/CSV import, payment review, QRIS, participants | 3c25255, 6feef6b, 135802f; focused 88 tests; browser 60/60; full 1,945 passed / 6 skipped | Review approved |
| [x] | 7. Competition, schedule, Match Control | 45f550b plus 465192f and 19c8710; focused 94 tests; browser 120/120; E2E 10/10 master-off and 10/10 master-on in configured Edge run | Review approved |
| [~] | 8. Match results and player statistics | 2a7a70e, e911551, 4a50518, a3624c6; focused 322 tests; browser 110/110; master-on E2E 23/23; master-off run stopped after 13 passed with Ctrl+C | Implemented, independent review pending; final committed-HEAD full suite pending |
| [ ] | 9. Completion and Certificate Studio integration | No Task 9 commit yet | Not started |
| [ ] | 10. Announcements, Settings, Certificate Studio compaction | No Task 10 commit yet | Not started |
| [ ] | 11. Locale/a11y/responsive/rollback E2E and visual parity | No Task 11 commit yet; current Chromium project mismatch remains | Not started |
| [ ] | 12. Release gates, CI, preview, and release report | No Task 12 evidence; protected report remains untracked | Not started |

## Task 8 exact state

Implemented and committed:

- Result, statistics, and history views are URL-backed.
- BO1/BO3/BO5 scores follow authoritative MatchGame order.
- Player scores accept 0.0–10.0 with one decimal or null.
- Canonical aggregate fields are goal, assist, passing, and defense.
- Legacy goals/assists are reader fallback only; aliases are never summed and blocks/tackles are not remapped.
- Captain submissions remain pending until organizer approval.
- Organizer direct save, approval, rejection, event/match/submission CAS, serializable rollback, audit receipt, idempotency, and guarded authorization use the existing boundaries.
- ID/EN and event-timezone display fixes are committed.

Verification already observed:

- Focused Vitest: 5 files, 322 tests passed.
- Component/browser matrix: 110/110 passed, including ID/EN and required viewport/keyboard/overflow checks.
- Corrected master-on full E2E: 23/23 passed.
- Corrected legacy repeated checks: 9/9 passed.
- Latest full unit result before the final two timezone tests: 179 files passed / 2 skipped; 2,020 tests passed / 6 skipped.
- Typecheck, scoped lint, Prisma validate, and diff-check passed. Four pre-existing repository warnings are documented.
- Master-off full E2E was intentionally terminated for handoff after 13 tests passed and no failure was observed. Exit code 1 is from Ctrl+C, not a product assertion. It is incomplete and must be rerun to completion.
- Independent Task 8 review has not happened.

Task 8 cannot be marked complete until:

1. The guarded master-off E2E reaches a normal terminal result and its count is recorded.
2. The focused and full unit/static checks run on the final committed HEAD.
3. An independent gpt-6-astra/high task review returns spec and quality approval, or a bounded fix/re-review loop closes every finding.

## Release blockers and limitations

- Tasks 9, 10, and 11 are not implemented.
- Task 12 release gates, GitHub Actions, preview verification, migration review, and final report are not complete.
- Current playwright.config.ts has no named chromium project. The approved command using --project=chromium therefore needs a configuration correction or an equivalent run with the configured project, and the correction must be recorded rather than hidden.
- The protected untracked 2026-09-14-release-1.0-verification.md must remain untouched until fresh release evidence exists.
- No production schema migration, deployment, or production flag activation has occurred.
- Browser component harnesses use deterministic fixtures; they do not replace authenticated database-backed E2E.
- Unit transaction injection is not a proof of every real PostgreSQL interleaving; guarded E2E and final CI remain required.
- The branch is not READY for deployment.

## Next actions in order

1. Work only from E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full.
2. Run the Task 8 focused command on HEAD a3624c6.
3. Re-run the guarded master-off player-stat/Match Day E2E to a normal exit; record the configured project name and result. Use .env.test and preflight.
4. Run a fresh committed-HEAD full unit/static pass.
5. Dispatch the independent Task 8 reviewer on gpt-6-astra with high reasoning. Use the existing task brief/report/review package and no parallel implementer.
6. Fix and re-review Task 8 findings, up to three rounds, then append the clean completion line to the SDD ledger.
7. Dispatch fresh gpt-5.6-luna/max implementers and reviewers for Tasks 9 and 10. Use gpt-6-astra/high for complex Certificate Studio decisions.
8. Dispatch Task 11 E2E/visual work after routes are complete; resolve the Playwright project mismatch systematically without increasing timeouts to mask failures.
9. Execute Task 12 release gates and preview/CI checks. Update the protected release report only after all required evidence exists; state BLOCKED if any gate remains incomplete.
