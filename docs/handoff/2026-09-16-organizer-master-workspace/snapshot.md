# Snapshot Handoff — Organizer Master Workspace

Tanggal snapshot: 2026-09-16, Asia/Jakarta
Status kandidat: BLOCKED untuk release/deploy; implementasi Organizer Master Workspace sudah sampai Task 8, tetapi verifikasi dan review belum selesai.

## Release-readiness snapshot — 2026-09-21

This continuation supersedes the stale “Task 8 in progress” status below for
release coordination while preserving the historical handoff details.

- Isolated worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`.
- Branch: `codex/organizer-release-readiness`.
- Source/product SHA before evidence-doc commit: `79e62cddc77beae4913529d471b493c6e56335b3`.
- Release target: `feature/ui/release/1.0`; no PR, push, deploy, migration, restore, or production flag activation was performed.
- Verification report: [`2026-09-14-release-1.0-verification.md`](../../../2026-09-14-release-1.0-verification.md).
- Task 12 report: `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/task-12-report.md` (ignored SDD artifact; no ledger edit was made).
- Current decision: `BLOCKED`.

### Required external evidence still absent

The report and progress handoff are authoritative for the exact blockers:
guarded `.env.test`/Neon Delicate or preview access; live shared-Neon E2E and
performance results; Delicate/preview migration diff and restore rehearsal;
final-SHA GitHub Actions result; Vercel preview URL/deployment ID and Runtime
Logs scan; saved-view/PIC/notification access; deployed Speed Insights/RUM;
Neon snapshot/PITR/retention/RPO/RTO/PIC/switchover/integrity-query evidence;
and a fresh whole-branch Sol/high review with no P0/P1/P2.

## Repo dan worktree

- Repository root: E:\dev\MiracleTourney-gitnative
- Worktree yang wajib dipakai: E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full
- Branch: feature/ui/release/1.0
- Product implementation anchor sebelum commit dokumentasi handoff: a3624c60186fefa2f6e5474cf423e1af7a7639d8
- Live branch HEAD harus selalu dibaca ulang dengan git rev-parse HEAD; hash di atas adalah anchor product sebelum dokumentasi handoff.
- Base merge-base terhadap origin/feature/ui/release/1.0: bd9d389211a70fe54a464b3bec87acf9f628b7
- Branch product berada ahead 40 commits terhadap origin/feature/ui/release/1.0 sebelum commit dokumentasi handoff; hitungan live harus dihitung ulang.
- Git status: hanya satu file untracked yang dilindungi, 2026-09-14-release-1.0-verification.md
- File report tersebut berasal dari pekerjaan sebelumnya, tidak boleh dibaca untuk diubah, di-stage, dihapus, atau di-commit sebelum seluruh release gate selesai.
- Tidak ada production deployment, production migration, atau production feature-flag activation yang dilakukan.

## Commit map branch

Commit berikut adalah seluruh delta product dari base sampai product implementation anchor, sebelum commit dokumentasi handoff.

### Public V3

- b3e472b docs(public): lock production parity to final mockup
- fce816c docs(public): plan final v3 production parity
- ca6c806 fix(competition): bound workspace read transactions
- 9090f93 test(competition): verify workspace read transaction options
- 5983d9c feat(public): normalize v3 event lifecycle data
- 189ea7a fix(public): harden normalized lifecycle boundary
- ca2236a fix(public): preserve localized event routes
- 35c262a test(public): seed authoritative v3 event lifecycle
- 570f412 fix(public): harden seeded v3 lifecycle fixtures
- 4c8793a fix(public): harden seeded lifecycle completion
- 4d45797 feat(public): port final v3 visual system
- 6f18525 fix(public): recover poster failures before hydration
- 2c29c5d feat(public): ship final v3 homepage composition
- 5a2d8b3 fix(public): enable anonymous homepage registration CTA
- f225cb6 feat(public): ship final v3 event center
- 9309a57 fix(public): propagate event directory read failures

### Organizer shell and command center

- c5f0628 docs(organizer): approve master workspace design
- e02c7a1 docs(organizer): plan master workspace implementation
- a48d581 feat(organizer): define master workspace contract
- 041c82e fix(organizer): centralize workspace navigation labels
- f2f74cb feat(organizer): add shared event master shell
- 9ef3f8d fix(organizer): localize setup match day action
- 8da3b01 feat(organizer): ship event-first command center
- 905999c fix(organizer): address command center review findings

### Registration, payment, import, and participants

- 868a62a feat(registration): scope payment settings per event
- 90d2e07 fix(registration): wire captain payment settings to event
- 13b8f00 refactor(registration): expose event-local organizer actions
- 8cdccc7 fix(registration): secure event-local readers and legacy adapters
- f7b05fb fix(registration): preserve mapping and not-found compatibility
- 7122cf1 test(registration): cover real missing-event lookup
- 3c25255 feat: build event registration and participant workspace
- 6feef6b docs: record task 6 implementation verification
- 135802f fix: preserve registration review and import handoff flows

### Competition, schedule, match control, result, and player stats

- 19c8710 fix(actions): expose async registration server adapters
- 45f550b feat(organizer): focus competition schedule and match control
- 465192f fix(organizer): route tiebreak actions to standings
- 2a7a70e feat(organizer): integrate match results and player stats
- e911551 fix(organizer): format match review dates in event timezone
- 4a50518 test(organizer): verify canonical stats and hydrated legacy inputs
- a3624c6 docs(organizer): record Task 8 verification and handoff

## Model routing and agent rules

The user-approved routing for the continuation is:

- Orchestrator: current parent task, intended gpt-5.6-sol with reasoning high.
- Normal implementation/review workers: gpt-5.6-luna with reasoning max.
- Complex UI or architecture decisions: gpt-6-astra with reasoning high.
- Always specify the model and reasoning effort when dispatching.
- Use a fresh implementer and a fresh task reviewer per task.
- Never run two implementation agents in parallel in this shared worktree.
- For a review finding, resume the original implementer for fix rounds 1–3, then re-review each round. Do not fix product code from the orchestrator context.
- The project handoff policy caps the normal fix loop at three rounds; unresolved load-bearing findings are BLOCKED and must be reported factually.
- A final whole-branch review uses the most capable available model, gpt-6-astra with reasoning high.

## Skills and SDD workflow

The approved implementation uses:

- brainstorming for product/interaction decisions;
- writing-plans for the implementation plan;
- using-git-worktrees for isolation;
- test-driven-development for every code change;
- subagent-driven-development for fresh implementer/reviewer gates;
- systematic-debugging for unexpected behavior and test failures;
- requesting-code-review before integration;
- verification-before-completion before any READY claim.

Approved source documents:

- docs/superpowers/specs/2026-09-14-organizer-master-workspace-design.md
- docs/superpowers/plans/2026-09-14-organizer-master-workspace.md
- .superpowers/brainstorm/1049-1789394661/content/organizer-master-shell-v3.html

SDD ledger and reports:

- .superpowers/sdd/2026-09-14-organizer-master-workspace/progress.md
- .superpowers/sdd/2026-09-14-organizer-master-workspace/task-1-report.md through task-8-report.md

Treat the ledger as the recovery source after context compaction. Do not re-dispatch Tasks 1–7.

## ACL and patch workflow

This linked worktree can reject ordinary process setup with the helper error “apply deny-read ACLs”. When that occurs:

1. Use an escalated read-only command only when repository inspection is required.
2. For file edits, use the Codex apply-patch backend with its working directory set explicitly to E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full.
3. Keep edits in Codex patch format. Do not use cat, shell redirection, Python write scripts, or broad file replacement.
4. Verify git status and diff after every patch.
5. Never use destructive reset/checkout/clean commands in this worktree.

## Flags and composition

Current FeatureFlag keys and defaults are in src/lib/feature-flags.ts. All listed flags default false unless an environment override exactly equals the string true:

- organizer_master_shell_v3 — new master-shell composition; current default false.
- organizer_workspace_v3 — existing organizer operation capability.
- registration_workspace_v3 — existing registration capability.
- competition_operations_v3 — existing competition/schedule/match-control capability.
- completion_workspace_v3 — existing completion capability.
- adaptive_public_event_v3 — public event lifecycle capability.
- public_discovery_v3 — homepage/event listing capability.
- public_visual_v2 — existing public visual rollback flag.

The critical rollback is FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=false or omission. Turning it off restores the prior composition and does not reverse schema/operation commits. The feature flag is not a security boundary.

## Test environment safeguards

- Use .env.test only for reset/seed and E2E preparation.
- Run pnpm test:e2e:preflight before any test that can write to a database.
- Preflight must reject a production Neon host; stop if it does not.
- Use the guarded Delicate/preview test branch only. Do not use production DATABASE_URL.
- Do not print or store DATABASE_URL, JWT_SECRET, QRIS URL, payment proof URL, roster PII, credentials, certificate tokens, or other secrets in reports.
- No production migration; inspect migration status only against Delicate/preview.
- Browser component harnesses are useful visual evidence but do not prove authenticated persistence. E2E and repository/action tests must cover the authoritative write/read path.
- Do not count skipped dashboard/performance checks as passing release evidence.
- Use --fail-on-flaky-tests for CI-style Playwright runs. Rerun only after a code change or documented infrastructure failure.

## What is implemented

### Public experience

Public V3 homepage, event center, lifecycle normalization, localized routes, event directory error propagation, visual system, and anonymous registration CTA are present in the branch.

### Master shell and command center

- Feature flag and shared contracts are in src/lib/feature-flags.ts, src/lib/organizer/workspace-types.ts, and src/lib/organizer/workspace-navigation.ts.
- Compact event summary reader is src/lib/organizer/workspace-read.ts.
- Shared shell components are under src/components/v3/organizer/OrganizerMasterShell.tsx, OrganizerEventRail.tsx, OrganizerEventHeader.tsx, OrganizerShellBoundary.tsx, and ContextualGuide.tsx.
- Command center and cards are OrganizerCommandCenter.tsx and OrganizerEventCard.tsx.
- Canonical event routes live under src/app/[locale]/organizer/events/[eventId].
- Flag-off and legacy admin composition remain available.

### Registration and participants

EventPaymentSettings, event-first payment reader/service, event-local registration readers/actions, registration queue/import/payment/QRIS panels, participant directory, mapping/pagination/selection retention, proof review, captain credential handoff, and event-scoped QRIS UI are present. Existing import/payment repositories and legacy adapters remain authoritative.

### Competition and match control

Competition, schedule, and match-control route composition is present with format-aware phase/drawing/standings context, bounded queues, live/next/needs-result filters, event-level tiebreak routing, guarded start/action operations, schedule versions, and existing operation boundaries.

### Match results and player statistics

Task 8 committed implementation is present:

- URL-backed result, statistics, and history views.
- BO1/BO3/BO5 score ordering from authoritative MatchGame data.
- Flashpeak player scores with 0.0–10.0, one decimal, or null.
- Canonical stats goal, assist, passing, defense.
- Legacy goals/assists reader fallback without alias summation.
- Captain pending submission and organizer approve/reject/direct save.
- Event/match/submission CAS, serializable rollback, audit receipt, idempotent replay, and guarded authorization.
- ID/EN form labels, field errors, review dates in event timezone, bounded tables, keyboard/focus behavior, and Miracle V3 font/tokens.

## Current in-progress state

Task 8 is implemented and committed, but not review-complete.

Evidence supplied by the implementer:

- Focused command: 5 files, 322 tests passed.
- Browser matrix: 110/110 cases passed across ID/EN, required widths, views, and format controls.
- Corrected master-ON full E2E: 23/23 passed.
- Corrected legacy repeated checks: 9/9 passed.
- Master-OFF full E2E was manually terminated for clean handoff after 13 tests passed and no failure was observed; process exit code 1 was caused by Ctrl+C. This is incomplete evidence and must be rerun to completion.
- Latest full unit run before the final two timezone tests: 179 files passed, 2 skipped; 2,020 tests passed, 6 skipped. A fresh full unit run at committed HEAD is required.
- Typecheck, scoped lint, Prisma validate, and diff-check passed. Four pre-existing repository warnings remain documented.
- Independent Task 8 review is pending. Do not mark Task 8 complete in the SDD ledger until review is clean or findings are explicitly parked under the approved breaker rule.

Next work is Task 8 final verification and review, then Task 9.

## Stable interfaces and file map

- Shared contract: src/lib/organizer/workspace-types.ts — OrganizerEventSection, OrganizerWorkspaceLifecycle, OrganizerWorkspacePublication, OrganizerWorkspaceRole, OrganizerWorkspaceBlocker, OrganizerWorkspaceSummary.
- Navigation: src/lib/organizer/workspace-navigation.ts — buildOrganizerEventNavigation(locale, eventId, summary, pathname).
- Shell reader: src/lib/organizer/workspace-read.ts — readOrganizerWorkspaceSummary(eventId, actor).
- Feature evaluation: src/lib/feature-flags.ts — isFeatureEnabled(flag), exact env value true.
- Event payment reader/service: src/lib/registration/event-payment-settings.ts — getPublishedPaymentSettingsForEvent, saveEventPaymentSettingsDraft, publishEventPaymentSettings; legacy aliases remain exported.
- Registration reader/actions: src/lib/registration/organizer-workspace-read.ts and src/lib/actions/registration-v3-actions.ts.
- Player-stat parser: src/lib/player-stats/form.ts — parsePlayerStatForm, validatePlayerStatPayload, resolvePlayerScoreGameNumbers, getPlayerStatNumericValue.
- Player-stat action adapters: src/lib/actions/player-stats-v3-actions.ts — saveEventPlayerStatsAction, approveEventPlayerStatsAction, rejectEventPlayerStatsAction.
- Match workspace components: src/components/v3/organizer/matches/MatchResultStatisticsWorkspace.tsx, MatchGameScoreForm.tsx, PlayerStatisticsForm.tsx, StatSubmissionReview.tsx.
- Completion readers/components: src/lib/completion, src/components/v3/completion, and canonical completion route.
- Certificate service/studio: src/lib/certificate, src/components/v3/certificates/CertificateStudio.tsx, and canonical certificates route.
- Current public routes remain separate from organizer operation routes; no new public Live Center or recap route is permitted.

## Exact resume commands

Run from the isolated worktree:

    Set-Location E:\dev\MiracleTourney-gitnative\.worktrees\miracle-ui-release-1.0-full
    git status --short --branch
    git rev-parse HEAD
    git log --oneline -12

Finish Task 8 evidence:

    pnpm exec vitest run src/components/v3/organizer/matches/match-result-statistics.test.tsx src/lib/actions/player-stats-v3-actions.test.ts src/lib/player-stats/form.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts
    pnpm exec playwright test tests/e2e/admin-player-stats.spec.ts tests/e2e/v3-matchday.spec.ts --project=chromium --fail-on-flaky-tests
    pnpm test
    pnpm lint
    pnpm exec eslint . --quiet
    pnpm exec prisma validate
    git diff --check

The current playwright.config.ts has only an unnamed project, so the literal --project=chromium command is known to fail at project selection until Task 11 resolves that configuration mismatch. Preserve the failure as configuration evidence, then run the equivalent guarded spec with the configured Edge/unnamed project after confirming the target. Do not silently call a different test green.

Run release gates only after Tasks 9–11:

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

## Handoff rule

Do not update 2026-09-14-release-1.0-verification.md, push, deploy, or claim READY until Tasks 8–12, independent reviews, local gates, CI, and preview verification are complete. If any gate remains red or incomplete, the release report must state BLOCKED and name the evidence.
