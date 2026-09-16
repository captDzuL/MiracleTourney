# Miracle V3 Organizer Master Workspace Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Menyelesaikan Organizer Master Workspace sampai seluruh route, test, review, CI, preview, dan release gate faktual sehingga kandidat dapat dinilai READY atau BLOCKED tanpa klaim yang tidak dibuktikan.

**Architecture:** Satu composition flag organizer_master_shell_v3 memilih shell V3 tanpa mengganti otorisasi atau engine turnamen. Shell membaca ringkasan event kecil; setiap route membaca domainnya sendiri melalui reader/action authoritative yang sudah ada. Organizer, admin, dan platform_admin memakai route event canonical yang sama, sementara setiap write tetap memeriksa actor, ownership, event identity, status, version, dan idempotency di server.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Prisma/PostgreSQL, Tailwind/CSS Miracle V3 tokens, Montserrat, Vitest, Playwright, ExcelJS, csv-parse, Vercel Blob, pnpm.

## Global Constraints

- [ ] Semua pekerjaan kode dilakukan hanya di E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full pada branch feature/ui/release/1.0.
- [ ] File untracked 2026-09-14-release-1.0-verification.md tidak boleh diubah, di-stage, dihapus, atau di-commit sampai Task 12 memiliki evidence baru.
- [ ] Sumber komposisi adalah .superpowers/brainstorm/1049-1789394661/content/organizer-master-shell-v3.html dan mockup V3 Match Day, result/statistics, completion, serta certificate yang sudah ada.
- [ ] Gunakan TDD: tulis behavior test yang gagal, buktikan RED, implementasikan perubahan minimum, buktikan GREEN, lalu lint/typecheck/diff-check.
- [ ] Jangan menyalin prototype sebagai iframe/monolit dan jangan menduplikasi tournament engine, result engine, import parser, Completion service, atau certificate generator.
- [ ] Semua copy yang dirender route V3 harus berasal dari messages/id.json atau messages/en.json. /id harus Indonesia sepenuhnya dan /en harus Inggris sepenuhnya.
- [ ] organizer_master_shell_v3 default false dan hanya aktif pada FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=true. Flag lama tetap independen.
- [ ] Tidak ada production deploy, production migration, atau production feature-flag activation.
- [ ] Gunakan .env.test untuk reset/seed/E2E. Preflight harus menolak production Neon host. Jangan mencetak secret, PII, proof URL, QRIS URL, credential, atau certificate token.
- [ ] Gunakan commit kecil per task, jangan membawa .claude/, Playwright trace/report/screenshot sementara, atau folder previews.
- [ ] Dokumen handoff ini adalah artefak koordinasi; release report protected tetap dikelola hanya pada Task 12.

## Recovery context

Worktree HEAD saat rencana ini dibuat adalah a3624c60186fefa2f6e5474cf423e1af7a7639d8. Task 1–7 sudah selesai dan review-approved. Task 8 sudah implemented/committed tetapi belum review-complete. Read docs/handoff/2026-09-16-organizer-master-workspace/snapshot.md dan progress.md sebelum menjalankan task.

## File and interface map

- Shell contract: src/lib/organizer/workspace-types.ts — OrganizerEventSection, OrganizerWorkspaceLifecycle, OrganizerWorkspacePublication, OrganizerWorkspaceRole, OrganizerWorkspaceBlocker, OrganizerWorkspaceSummary.
- Navigation: src/lib/organizer/workspace-navigation.ts — buildOrganizerEventNavigation(locale, eventId, summary, pathname).
- Shell reader: src/lib/organizer/workspace-read.ts — readOrganizerWorkspaceSummary(eventId, actor).
- Feature flags: src/lib/feature-flags.ts — isFeatureEnabled(flag), exact string true.
- Registration payment: src/lib/registration/event-payment-settings.ts — getPublishedPaymentSettingsForEvent, saveEventPaymentSettingsDraft, publishEventPaymentSettings.
- Registration workspace: src/lib/registration/organizer-workspace-read.ts and src/lib/actions/registration-v3-actions.ts.
- Player-stat parser: src/lib/player-stats/form.ts — parsePlayerStatForm, validatePlayerStatPayload, resolvePlayerScoreGameNumbers, getPlayerStatNumericValue.
- Player-stat actions: src/lib/actions/player-stats-v3-actions.ts — saveEventPlayerStatsAction, approveEventPlayerStatsAction, rejectEventPlayerStatsAction.
- Match result UI: src/components/v3/organizer/matches/MatchResultStatisticsWorkspace.tsx, MatchGameScoreForm.tsx, PlayerStatisticsForm.tsx, StatSubmissionReview.tsx.
- Completion: src/lib/completion, src/components/v3/completion, and src/app/[locale]/organizer/events/[eventId]/completion.
- Certificate: src/lib/certificate, src/components/v3/certificates/CertificateStudio.tsx, and src/app/[locale]/organizer/events/[eventId]/certificates.
- SDD recovery ledger: .superpowers/sdd/2026-09-14-organizer-master-workspace/progress.md.

## Historical completed tasks

The following are context, not work to repeat:

- [x] Task 1 — shell contract, navigation, locale parity, and rollback flag. Commits a48d581 and 041c82e; review clean; focused 21 tests and full 1,766 passed / 6 skipped.
- [x] Task 2 — compact read model, shared shell, mobile drawer, contextual guide, and flag-off composition. Commits f2f74cb and 9ef3f8d; review clean; focused 56 tests and full 1,796 passed / 6 skipped.
- [x] Task 3 — event-first Command Center, canonical admin entry, focused Overview, draft editor localization, lifecycle CTAs. Commits 8da3b01 and 905999c; review approved; affected 234 tests and full 1,848 passed / 6 skipped.
- [x] Task 4 — EventPaymentSettings and event-first QRIS reader. Commits 868a62a and 90d2e07; review approved; full 1,860 passed / 6 skipped.
- [x] Task 5 — event-local registration readers/actions and legacy adapters. Commits 13b8f00 through 7122cf1; review approved; focused 272 tests and full 1,896 passed / 6 skipped.
- [x] Task 6 — queue, XLSX/CSV import, payment review, QRIS, participants, pagination, selection retention. Commits 3c25255, 6feef6b, 135802f; review approved; focused 88 tests, browser 60/60, full 1,945 passed / 6 skipped.
- [x] Task 7 — format-aware Competition, Schedule, Match Control, tiebreak routing, and browser matrix. Commits 45f550b, 465192f, and 19c8710; review approved; focused 94 tests, browser 120/120, configured Edge E2E 10/10 off and 10/10 on.
- [~] Task 8 — result/statistics workspace is implemented in commits 2a7a70e, e911551, 4a50518, a3624c6. Focused 322 tests, browser 110/110, master-on E2E 23/23, corrected repeated checks 9/9. Master-off run was stopped after 13 passed by Ctrl+C; review and final committed-HEAD full run remain.

## Task 8 closeout: verify and review the committed implementation

**Files:**

- Verify: src/app/[locale]/organizer/events/[eventId]/matches/[matchId]/page.tsx
- Verify: src/components/v3/organizer/matches/MatchResultStatisticsWorkspace.tsx
- Verify: src/components/v3/organizer/matches/MatchGameScoreForm.tsx
- Verify: src/components/v3/organizer/matches/PlayerStatisticsForm.tsx
- Verify: src/components/v3/organizer/matches/StatSubmissionReview.tsx
- Verify: src/components/v3/organizer/matches/match-result-statistics.test.tsx
- Verify: src/lib/actions/player-stats-v3-actions.ts
- Verify: src/lib/actions/player-stats-v3-actions.test.ts
- Verify: src/lib/player-stats/form.ts and form.test.ts
- Verify: src/lib/platform/repository.ts and repository.test.ts
- Verify: tests/e2e/admin-player-stats.spec.ts and tests/e2e/v3-matchday.spec.ts
- Update only when a review finding requires it: the same files above and the SDD report/ledger.

**Interfaces:**

- Preserve parsePlayerStatForm, validatePlayerStatPayload, resolvePlayerScoreGameNumbers, and getPlayerStatNumericValue.
- Preserve saveEventPlayerStatsAction, approveEventPlayerStatsAction, and rejectEventPlayerStatsAction.
- Preserve existing authoritative result actions, MatchGame ordering, correction guard, readiness, deadline, delay, and audit boundaries.

- [ ] Step 1: Confirm the starting state and protected file before any test.

      Set-Location E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full
      git status --short --branch
      git rev-parse HEAD
      git diff --check

      Expected: HEAD is a3624c6 or a later Task 8 fix commit; only 2026-09-14-release-1.0-verification.md is protected/untracked; no product change is unstaged.

- [ ] Step 2: Run the required focused committed-HEAD suite.

      pnpm exec vitest run src/components/v3/organizer/matches/match-result-statistics.test.tsx src/lib/actions/player-stats-v3-actions.test.ts src/lib/player-stats/form.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts

      Expected: result/statistics route, score parser, canonical fields, legacy fallback, authorization, CAS, rollback, and action contracts pass. Record exact file/test count and duration in task-8-report.md.

- [ ] Step 3: Reproduce the incomplete master-off E2E with guarded test data and no arbitrary sleeps.

      pnpm test:e2e:preflight
      pnpm test:e2e:prepare
      pnpm exec playwright test tests/e2e/admin-player-stats.spec.ts tests/e2e/v3-matchday.spec.ts --project=chromium --fail-on-flaky-tests

      Expected: the test reaches a normal terminal result. The current config has only an unnamed project, so first record the project-selection failure if it occurs; then run the equivalent guarded command with the configured project after resolving the configuration in Task 11. Do not report a different project run as the literal chromium command passing. Record master-off flag state, event namespace, idempotency key strategy, result count, and any trace path without secrets.

- [ ] Step 4: Run final static/unit evidence on the committed HEAD after the E2E result is recorded.

      pnpm test
      pnpm lint
      pnpm exec eslint . --quiet
      pnpm exec prisma validate
      git diff --check

      Expected: all commands exit 0; pre-existing warnings are listed separately; no new warnings or protected-file changes are introduced.

- [ ] Step 5: Generate the Task 8 review package using the task base 465192fa8527b6463bccaee1ff0f27443292a9b7 and current HEAD. Dispatch one independent gpt-6-astra reviewer with reasoning high. The reviewer must assess score bounds/one-decimal/null, BO1/BO3/BO5 ordering, canonical-only stats, pending approval, stale/competing review no-partial-write behavior, event timezone, ID/EN, keyboard/44px/overflow, flag-off behavior, and preservation of legacy callers.

- [ ] Step 6: For each confirmed finding, resume the original Task 8 implementer for fix round 1–3, rerun the named covering tests, append evidence to task-8-report.md, generate a scoped diff package, and dispatch a scoped re-review. Never apply a product-code fix from the orchestrator context. Stop as BLOCKED if a load-bearing finding remains after the third round; otherwise append Task 8 complete only after the reviewer returns clean.

- [ ] Step 7: Commit only any reviewed Task 8 fixes with a message describing the behavior, then update the SDD ledger and progress.md with exact counts. Do not touch the protected release report.

## Task 9: Integrate Completion and Premium Certificate Studio

**Files:**

- Modify: src/lib/completion/workspace.ts
- Modify: src/lib/completion/workspace.test.ts
- Modify: src/components/v3/completion/CompletionWorkspace.tsx
- Modify: src/components/v3/completion/completion.test.tsx
- Modify: src/app/[locale]/organizer/events/[eventId]/completion/page.tsx
- Modify: src/app/[locale]/organizer/events/[eventId]/completion/page.test.tsx
- Modify: src/lib/certificate/studio-repository.ts
- Modify: src/lib/certificate/studio-repository.test.ts
- Modify: src/lib/certificate/service.ts
- Modify: src/lib/certificate/service.test.ts
- Modify: src/components/v3/certificates/CertificateStudio.tsx
- Modify: src/components/v3/certificates/certificate-studio.test.tsx
- Modify: src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx

**Interfaces:**

- Consume existing completion readiness/podium/awards/complete/publication services.
- Consume existing seven-recipient certificate contract, generation, asset placement, versioning, and safe publication services.
- Produce canonical locale-aware links between Completion and Certificate Studio without adding a second route family.

- [ ] Step 1: Add failing tests that Completion renders for every lifecycle and shows readiness blockers, while complete/final-publish actions remain locked until the authoritative readiness service is ready. Add ID/EN assertions for MVP Tournament, Top Scorer, Top Defender, Top Assist, and certificate links.
- [ ] Step 2: Run the required focused suite and record the expected RED failures.

      pnpm exec vitest run src/lib/completion/workspace.test.ts src/components/v3/completion/completion.test.tsx src/app/[locale]/organizer/events/[eventId]/completion/page.test.tsx src/lib/certificate/studio-repository.test.ts src/lib/certificate/service.test.ts src/components/v3/certificates/certificate-studio.test.tsx

- [ ] Step 3: Replace hard-coded /organizer and legacy-match-day destinations with locale-aware canonical event links. Keep awards as explicit organizer decisions; changing leaderboard data must not mutate an award or certificate automatically.
- [ ] Step 4: Wire Completion readiness, podium, four individual awards, certificate readiness, generation, and publication to existing authoritative boundaries. Preserve version/idempotency/error semantics and all seven recipient types.
- [ ] Step 5: Run the focused suite GREEN, then run the exact completion/certificate E2E command.

      pnpm exec playwright test tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts --project=chromium --fail-on-flaky-tests

      Expected: if the named project is unavailable, retain the configuration evidence and use the configured project only after Task 11 resolves the mismatch.

- [ ] Step 6: Dispatch a fresh gpt-5.6-luna/max reviewer. Use gpt-6-astra/high for any Certificate Studio interaction/layout decision. Fix and re-review confirmed findings within three rounds.
- [ ] Step 7: Commit reviewed work:

      git add src/lib/completion src/components/v3/completion src/app/[locale]/organizer/events/[eventId]/completion src/lib/certificate src/components/v3/certificates src/app/[locale]/organizer/events/[eventId]/certificates
      git commit -m "feat(organizer): integrate completion and certificates"

## Task 10: Add Announcements, Settings, and compact Certificate Studio

**Files:**

- Create: src/app/[locale]/organizer/events/[eventId]/announcements/page.tsx
- Create: src/app/[locale]/organizer/events/[eventId]/announcements/page.test.tsx
- Create: src/app/[locale]/organizer/events/[eventId]/settings/page.tsx
- Create: src/app/[locale]/organizer/events/[eventId]/settings/page.test.tsx
- Create: src/components/v3/organizer/OrganizerAnnouncements.tsx
- Create: src/components/v3/organizer/OrganizerSettings.tsx
- Modify: src/components/v3/certificates/CertificateStudio.tsx
- Modify: src/components/v3/certificates/certificate-studio.test.tsx

**Interfaces:**

- Announcements must use existing authoritative actions and audit trail.
- Settings must link to the existing event editor and publication/organizer-contact boundaries without duplicating wizard fields.
- Certificate Studio must preserve readiness, errors, version, publication status, seven recipients, generation, and safe publication.

- [ ] Step 1: Add failing route/component tests for localized announcements and settings, actor/event authorization, canonical navigation, and no duplicate setup wizard fields.
- [ ] Step 2: Implement the two shell modules with Miracle V3 tokens, Montserrat, bounded content, localized empty/error/success states, and real links/actions.
- [ ] Step 3: Compact Certificate Studio so recipient selection remains visible, desktop preview is sticky, asset/placement panels are collapsible, primary actions are reachable, and no repeated event banner is rendered.
- [ ] Step 4: Add geometry tests for 1440x900 and 390px. Assert no nested document overflow, usable preview, visible readiness/error/version/publication state, and keyboard reachability of the primary generation action.
- [ ] Step 5: Run the focused suite.

      pnpm exec vitest run src/app/[locale]/organizer/events/[eventId]/announcements/page.test.tsx src/app/[locale]/organizer/events/[eventId]/settings/page.test.tsx src/components/v3/certificates/certificate-studio.test.tsx

      Expected: all new route/component tests pass; no legacy operation or certificate service regression.
- [ ] Step 6: Dispatch a fresh gpt-5.6-luna/max reviewer. Use gpt-6-astra/high for complex certificate layout judgment. Fix and re-review confirmed findings within three rounds.
- [ ] Step 7: Commit reviewed work:

      git add src/app/[locale]/organizer/events/[eventId]/announcements src/app/[locale]/organizer/events/[eventId]/settings src/components/v3/organizer/OrganizerAnnouncements.tsx src/components/v3/organizer/OrganizerSettings.tsx src/components/v3/certificates/CertificateStudio.tsx src/components/v3/certificates/certificate-studio.test.tsx
      git commit -m "feat(organizer): finish workspace utilities and studio layout"

## Task 11: Verify locale, accessibility, responsive parity, and rollback

**Files:**

- Create: tests/e2e/v3-organizer-master-workspace.spec.ts
- Create: tests/e2e/v3-organizer-registration-operations.spec.ts
- Create: tests/e2e/v3-organizer-visual.spec.ts
- Create: tests/e2e/v3-organizer-visual.spec.ts-snapshots/
- Modify: tests/e2e/v3-organizer-lifecycle.spec.ts
- Modify: tests/e2e/admin-event-management.spec.ts
- Modify: playwright.config.ts
- Modify: scripts/e2e-ci.mjs

- [ ] Step 1: Seed isolated draft, registration, drawing, ongoing, and finished events plus Single Elimination, Double Elimination, Round Robin/League, and Group + Playoffs. Use unique test namespaces and .env.test only.
- [ ] Step 2: Add E2E coverage for login, event selection, registration queue, CSV/XLSX preview/commit, payment approval/rejection, QRIS publish, drawing/schedule, Match Control, score entry, statistic review, Completion, seven certificate recipients, and publication.
- [ ] Step 3: Add admin access to the same event workspace and organizer denial for an event owned by another organizer. Assert flag-off rollback and independent capability-flag behavior.
- [ ] Step 4: Assert ID/EN nav, headings, actions, dialogs, validation, and feedback. Reject mixed-language interface copy and raw replacement characters.
- [ ] Step 5: Assert keyboard/focus/Escape/reduced-motion, aria-sort, dialog landmarks, upload keyboard path, and 44px targets.
- [ ] Step 6: Capture production-route baselines at 360, 390, 768, 1024, and 1440. Assert scrollWidth <= clientWidth; only table/bracket inner containers may scroll.
- [ ] Step 7: Resolve the current unnamed-project versus --project=chromium mismatch in playwright.config.ts and scripts/e2e-ci.mjs without masking product failures or increasing timeouts. Keep a named, reproducible CI profile and use --fail-on-flaky-tests.
- [ ] Step 8: Run the approved focused commands.

      pnpm test:e2e:prepare
      pnpm exec playwright test tests/e2e/v3-organizer-master-workspace.spec.ts tests/e2e/v3-organizer-registration-operations.spec.ts tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/admin-event-management.spec.ts tests/e2e/admin-player-stats.spec.ts tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts --project=chromium --fail-on-flaky-tests
      pnpm exec playwright test tests/e2e/v3-organizer-visual.spec.ts --project=chromium --fail-on-flaky-tests

      Expected: all journeys/locales/roles/viewports pass with no flaky retries and no skipped required dashboard/performance evidence.
- [ ] Step 9: Dispatch a fresh gpt-5.6-luna/max E2E reviewer; use gpt-6-astra/high for visual and accessibility judgment. Fix and re-review within three rounds.
- [ ] Step 10: Commit reviewed E2E/config changes:

      git add tests/e2e/v3-organizer-master-workspace.spec.ts tests/e2e/v3-organizer-registration-operations.spec.ts tests/e2e/v3-organizer-visual.spec.ts tests/e2e/v3-organizer-visual.spec.ts-snapshots tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/admin-event-management.spec.ts playwright.config.ts scripts/e2e-ci.mjs
      git commit -m "test(organizer): cover master workspace end to end"

## Task 12: Run release gates and prepare factual Release 1.0 report

**Files:**

- Inspect only: prisma/schema.prisma and EventPaymentSettings migration history.
- Modify only after all evidence: docs/superpowers/plans/2026-09-14-organizer-master-workspace.md checkbox state.
- Modify only after all evidence and never before: 2026-09-14-release-1.0-verification.md.

- [ ] Step 1: Review EventPaymentSettings deploy order, constraints, indexes, foreign keys, published-event fallback, and rollback owner. Run prisma migrate status only against Delicate/preview; never execute a production migration.
- [ ] Step 2: Check CI secret presence without printing values. Confirm preview and production database variables are not swapped, JWT_SECRET production is not a placeholder, and E2E preflight rejects a production Neon host.
- [ ] Step 3: Run the final local gates from a clean test database.

      pnpm install --frozen-lockfile
      pnpm exec prisma validate
      pnpm lint
      pnpm exec eslint . --quiet
      pnpm test
      pnpm test:e2e:smoke
      pnpm test:pressure:smoke
      pnpm test:e2e:preflight
      pnpm test:e2e:prepare
      pnpm test:e2e:ci
      pnpm audit --audit-level moderate
      pnpm build
      git diff --check

      Expected: every command exits 0; E2E CI uses --fail-on-flaky-tests; skipped required performance/dashboard checks are not counted as pass.
- [ ] Step 4: Dispatch the final whole-branch gpt-6-astra/high reviewer using a package from the merge-base bd9d389211a70fe54a464b3bec87acf9f628b7 to HEAD. Include deferred minors and parked findings from the SDD ledger. Resolve confirmed P0/P1/P2 findings with one coordinated fix dispatch and one scoped re-review.
- [ ] Step 5: Push normally without force only after code, tests, and documentation evidence are complete and the worktree has no unintended changes. Wait for all GitHub Actions jobs to pass. Rerun only after a code change or documented infrastructure failure.
- [ ] Step 6: Verify the non-production preview for organizer/admin shared shell, registration import/payment/QRIS, all four competition formats, score/statistics, Completion, certificates, ID/EN, mobile/desktop, and flag-off rollback. Dashboard/performance smoke must have a real result rather than skipped.
- [ ] Step 7: Update the protected release report with commit final, merge map, command/count/duration, CI URL, migration/flag status, pre-deployment checklist, preview evidence, and factual READY or BLOCKED decision. If any gate remains incomplete, write BLOCKED and name the evidence; do not imply deployment readiness.
- [ ] Step 8: Commit the final release report and plan checkbox state separately:

      git add 2026-09-14-release-1.0-verification.md docs/superpowers/plans/2026-09-14-organizer-master-workspace.md
      git commit -m "docs(release): verify organizer master workspace"

## Agent routing and review discipline

- Orchestrator is the current parent task using gpt-5.6-sol/high.
- Normal implementers and scoped reviewers use gpt-5.6-luna/max.
- Complex UI, Certificate Studio, visual, or architecture decisions use gpt-6-astra/high.
- Dispatch one fresh implementer per task, then one independent reviewer. Do not run implementation agents in parallel.
- A fix round is one implementer response, its covering test evidence, one scoped review, and one ledger entry. Maximum three normal rounds.
- Review packages must include the exact task brief, implementer report, and base-to-head diff. A clean implementer self-review never replaces an independent review.
- Do not make product fixes in the orchestrator context; resume the implementer for rounds 1–3.
- Record commits, tests, review verdicts, limitations, and blockers in the SDD ledger after each gate.
- Use only factual READY/BLOCKED language. An incomplete test, pending review, skipped required check, or unresolved CI/preview result is BLOCKED.

## Commit discipline

Every completed task has a focused commit plus any separately reviewed fix commits. Before each commit:

    git status --short
    git diff --check
    git diff --stat

Do not stage the protected release report during Tasks 8–11. The handoff documentation may be committed independently with:

    git add docs/handoff/2026-09-16-organizer-master-workspace/plan.md docs/handoff/2026-09-16-organizer-master-workspace/snapshot.md docs/handoff/2026-09-16-organizer-master-workspace/prd.md docs/handoff/2026-09-16-organizer-master-workspace/progress.md
    git commit -m "docs(handoff): capture organizer workspace continuation state"
