# Miracle V3 Organizer Master Workspace — Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and verify the Miracle V3 Organizer Master Workspace release-readiness changes on `codex/organizer-release-readiness`, then produce evidence and a pull request targeting `feature/ui/release/1.0` without performing a production deployment or production data migration.

**Architecture:** Work proceeds through twelve serial tasks because the worktree and shared Neon E2E database are shared. Each production change follows TDD RED/GREEN, focused verification, self-review, a commit, and two fresh `gpt-5.6-sol` review verdicts for specification compliance and code quality; the orchestrator records evidence in the SDD ledger and keeps the release decision `BLOCKED` until every gate is evidenced.

**Tech Stack:** Next.js/React/TypeScript, Prisma/PostgreSQL, Playwright, Vitest/Jest as provided by the repository, GitHub Actions, Node 24-compatible actions, Vercel-native Runtime Logs/Observability/Speed Insights, Neon Delicate/preview branches, and Git.

## Global Constraints

- Base the isolated worktree at starting SHA `5926781438c933f4d3240ddfb0aa8c132b8f7a92`; target `origin/feature/ui/release/1.0` at observed SHA `e2f7c289f25954780e4de8eff71a9cbc5121e00c`, with observed ancestry 7 commits ahead and 0 behind.
- Preserve the dirty checkout at `E:\dev\MiracleTourney-gitnative`; do not inspect, edit, clean, reset, or commit it.
- Do not change production code in the orchestrator task; implementation work is serial and delegated one task at a time to a fresh `gpt-5.6-luna` at reasoning `max`, `fork_turns: "none"`.
- Each implementation task must use TDD, run focused tests, self-review, commit, and write a report; every task receives fresh `gpt-5.6-sol`/high specification-compliance and code-quality verdicts.
- Fix rounds 1–3 return to the same implementer; rounds 4–5 use fresh Sol/high escalation; a load-bearing finding after round 5 leaves the branch `BLOCKED`.
- The shared Neon E2E database is serial; no two implementation, migration, or E2E phases may overlap.
- Required interfaces are `COMPLETION_WORKSPACE_READ_TRANSACTION_OPTIONS`, `HydrationGate` native `div` props plus `data-hydration-ready`, `PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000`, SHA-256 password-reset token digests, `User.sessionVersion`, JWT claim `sv`, a reusable same-origin/API guard, a structured server logger, and `playwright.ci-default.config.ts`.
- Monitoring is Vercel-native only; do not add Sentry or an external drain.
- Production deployment, production migration, production flag activation, Vercel production-setting mutation, and Neon production restore require separate explicit human authorization and are out of scope for this plan.
- An unchecked or unverifiable security, performance, monitoring, recovery, preview, CI, or release-evidence item keeps the final decision `BLOCKED`.

---

## Repository map and evidence contract

The focused repository search has established the exact path families below; new files are named explicitly in the task that owns them.

| Concern | Planned paths and artifacts | Required evidence |
| --- | --- | --- |
| App and server code | `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/components/v3/public-discovery/**`, `src/components/v3/organizer/**`, `src/components/HydrationGate.tsx`, `src/lib/**` | focused tests, diff, review verdicts |
| Browser and unit tests | `tests/e2e/**`, `tests/competition/**`, `src/**/*.test.ts`, `src/**/*.test.tsx`, `playwright.config.ts`, `playwright.legacy.config.ts`, `playwright.smoke.config.ts` | command, count, duration, exit status, no required skip/flaky retry |
| Database | `prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/platform/db.ts`, `src/lib/completion/prisma-adapter.ts` | validate output, migration review on Delicate/preview only, query/transaction tests |
| CI and scripts | `.github/workflows/ci.yml`, `scripts/e2e-ci.mjs`, `scripts/e2e-db-preflight.mjs`, `scripts/e2e-db-prepare.mjs`, `package.json` | ordered CI run, phase timings, failure behavior, action-major diff |
| Product/release documents | `docs/handoff/2026-09-16-organizer-master-workspace/**`, `docs/testing/**`, `docs/superpowers/plans/**`, `.superpowers/sdd/**` | ledger, handoff, verification report, PR evidence |

Every command recorded in a report includes its exact command, exit code, test/pass/skip/failure counts when applicable, and duration. Every production task's report includes the RED command/output and the GREEN command/output. Shared-Neon commands are explicitly marked serial.

### Task 1: Worktree baseline, plan, and SDD ledger

**Files:**
- Create: `docs/superpowers/plans/2026-09-20-organizer-master-workspace-release-readiness.md`
- Create: `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md`
- Create: `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/task-1-report.md`
- Use: `C:\Users\dzulf\.codex\skills\subagent-driven-development\scripts\sdd-workspace`

**Interfaces:**
- Consumes: the execution brief at `C:\Users\dzulf\.codex\visualizations\2026\09\20\01a0bf81-9428-7101-b982-1f7ac1be9001\release-readiness-orchestrator-brief.md`.
- Produces: the tracked plan, an ignored SDD ledger whose first line is `# SDD ledger — plan: docs/superpowers/plans/2026-09-20-organizer-master-workspace-release-readiness.md`, and a baseline report that later tasks use for recovery and evidence.

- [ ] **Step 1: Capture the isolated-worktree baseline before implementation.**

  Run from `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`:

  ```bash
  git rev-parse --show-toplevel
  git rev-parse --git-dir
  git rev-parse --git-common-dir
  git branch --show-current
  git rev-parse HEAD
  git rev-parse origin/feature/ui/release/1.0
  git merge-base HEAD origin/feature/ui/release/1.0
  git status --short --branch
  git rev-list --left-right --count origin/feature/ui/release/1.0...HEAD
  ```

  Record the expected worktree, branch `codex/organizer-release-readiness`, starting SHA `5926781438c933f4d3240ddfb0aa8c132b8f7a92`, base SHA `e2f7c289f25954780e4de8eff71a9cbc5121e00c`, merge-base, and clean status in the Task 1 report. Do not run any command against `E:\dev\MiracleTourney-gitnative`.

- [ ] **Step 2: Initialize the SDD workspace and verify its output.**

  Run the repository skill helper against this plan, using Bash:

  ```bash
  bash C:/Users/dzulf/.codex/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-09-20-organizer-master-workspace-release-readiness.md
  ```

  Preserve the helper-created ignored artifacts and ensure the ledger exists at `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md`.

- [ ] **Step 3: Record the starting ledger facts and CI hypothesis set.**

  Make the first ledger line exactly the identity line above. Record Task 1 facts, `Status: BLOCKED`, and CI run `#283`: lint/typecheck passed; unit passed with 182 files, 2050 tests, 6 skipped; Match Day passed with 10 passed and 1 skipped; default shard 1 failed with 8 failures, 33 passed, 2 skipped. Record these hypotheses to validate: stale locale E2E because V3 has no locale switcher and the header intentionally uses flex; Certificate Studio file input below 44px; Completion read transaction near the default 5s timeout causing Prisma `P2028`; certificate publication losing a click before hydration; and duplicate Match Day/visual execution in default shards.

- [ ] **Step 4: Self-review the plan and create the Task 1 report.**

  Re-read the brief, scan the plan against the complete No Placeholders list in `writing-plans/SKILL.md`, check contradictory interfaces and exact paths, then run `git diff --check`. The banned-pattern scan must return no matches. The report at `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/task-1-report.md` must include baseline values, plan coverage/self-review, every command with duration and exit status, files changed, commit, and concerns.

- [ ] **Step 5: Commit only the tracked plan.**

  ```bash
  git add docs/superpowers/plans/2026-09-20-organizer-master-workspace-release-readiness.md
  git commit -m "docs: plan organizer workspace release readiness"
  git status --short --branch
  ```

  SDD artifacts remain ignored and uncommitted. Task 1 review is a fresh Sol/high review of the plan and baseline report; record separate specification-compliance and code-quality verdicts before starting Task 2.

### Task 2: Homepage locale contract

**Files:**
- Modify: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, and `src/components/v3/public-discovery/PublicHomepageShellBoundary.tsx` only if the focused contract test identifies a production defect.
- Test: `tests/e2e/locale-switcher.spec.ts`.
- Evidence: Task 2 brief/report/review files under `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/`.

**Interfaces:**
- Consumes: the existing V3 public reader shell and locale routing.
- Produces: a browser contract proving `/id` and `/en`, `html.lang`, `Beranda/Home`, `Masuk/Sign in`, current navigation, and computed `header` `display:flex`; no locale switcher and no grid header.

- [ ] **Step 1 (TDD RED):** Identify the stale locale test and replace its expectation with an explicit test that visits `/id` and `/en`, asserts the language attribute and localized labels, checks current navigation, checks `getComputedStyle(header).display === "flex"`, and accepts the branded error state while still asserting the shell. Run the focused Playwright test and record the expected failure against the current implementation.
- [ ] **Step 2 (TDD GREEN):** Make the smallest production change required for the V3 contract, preserving the flex header and omitting any language-switcher control. Run the same focused test and record passing counts, skips, duration, and exit status.
- [ ] **Step 3:** Run the locale test at the supported desktop/mobile viewport matrix, inspect artifacts for credentials/PII, self-review the diff, commit `test/fix: align homepage locale contract`, and write the report.
- [ ] **Step 4:** Obtain fresh Sol/high specification-compliance and code-quality verdicts; fix any finding through the five-round review protocol and record the verdicts in the ledger.

### Task 3: Completion read transaction reliability

**Files:**
- Modify: `src/lib/completion/prisma-adapter.ts` and `src/lib/completion/workspace.ts`.
- Test: `src/lib/completion/prisma-adapter.test.ts`, `src/lib/completion/workspace.test.ts`, `src/lib/completion/complete.test.ts`, and `tests/e2e/organizer-v3-completion.spec.ts`.
- Evidence: serial shared-Neon report and review package.

**Interfaces:**
- Consumes: Prisma transaction API and existing parallel Completion reads.
- Produces: exported `COMPLETION_WORKSPACE_READ_TRANSACTION_OPTIONS` with `isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead`, `maxWait: 5_000`, and `timeout: 20_000`, forwarded to every Completion read transaction while preserving snapshot consistency and parallel queries.

- [ ] **Step 1 (TDD RED):** Add the option-forwarding test that spies on the transaction call and asserts the exact exported object and every Completion read path; run it and capture the failure before implementation.
- [ ] **Step 2 (TDD RED):** Add or enable focused Completion E2E coverage for four tournament formats and a no-`P2028` assertion; run serially against the shared Neon test database and capture the pre-fix failure or timeout evidence.
- [ ] **Step 3 (TDD GREEN):** Export and apply the exact options to all Completion read transactions without serializing the existing parallel queries; rerun the option test and four-format E2E serially, recording counts and no `P2028`.
- [ ] **Step 4:** Run focused typecheck/lint for touched files, inspect query behavior and snapshot consistency, self-review, commit `fix: harden completion workspace reads`, and write the report.
- [ ] **Step 5:** Obtain both fresh Sol/high review verdicts; all shared-Neon review reruns remain serial and ledgered.

### Task 4: Certificate Studio hydration, controls, and publication

**Files:**
- Modify: `src/components/HydrationGate.tsx`, `src/app/admin/admin-workspace.tsx`, `src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx`, `src/lib/actions/certificate-v3-actions.ts`, and `src/lib/certificate/studio-repository.ts`.
- Test: `src/lib/certificate/studio-schema.test.ts`, `src/lib/certificate/studio-repository.test.ts`, `src/lib/actions/certificate-v3-actions.test.ts`, `src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx`, and `tests/e2e/organizer-v3-certificates.spec.ts`.
- Evidence: readiness/publication/geometry artifacts and serial Neon report.

**Interfaces:**
- Consumes: existing Certificate Studio controls, publication revision API/action, and `HydrationGate`.
- Produces: `HydrationGate` accepting native `React.HTMLAttributes<HTMLDivElement>` props and exposing `data-hydration-ready`; every interactive control including file input has minimum 44px height; pre-hydration UI is inert; publication waits for readiness, clicks once, asserts localized feedback, then asserts publication revision.

- [ ] **Step 1 (TDD RED):** Add tests for native div props/readiness attribute, pre-hydration inertness, 44px file input and controls, single-click publication, localized feedback, and revision increment; run focused tests to capture failures.
- [ ] **Step 2 (TDD RED):** Add serial E2E coverage for seven certificates, historical verification, and geometry at 1440x900 and 390x844; run it against shared Neon and capture failures or missing readiness evidence.
- [ ] **Step 3 (TDD GREEN):** Implement the prop forwarding/readiness attribute, inert pre-hydration state, control sizing, and publication readiness flow; rerun focused unit/component and E2E tests serially until the exact assertions pass.
- [ ] **Step 4:** Run localized ID/EN publication, geometry screenshots, keyboard/focus checks for touched controls, self-review, commit `fix: stabilize certificate studio publication`, and write the report.
- [ ] **Step 5:** Obtain fresh Sol/high spec and quality verdicts and record review artifacts.

### Task 5: CI stabilization and Node 24 action majors

**Files:**
- Create: `playwright.ci-default.config.ts` at the repository root.
- Modify: `scripts/e2e-ci.mjs`, `.github/workflows/ci.yml`, `src/e2e-ci.test.ts`, and `package.json` scripts/configuration.
- Test: `src/e2e-ci.test.ts`, `src/playwright-config.test.ts`, and the Playwright project-selection tests introduced with the new config.
- Evidence: separate action-major commit and an ordered CI run report.

**Interfaces:**
- Consumes: existing Playwright configs, Match Day/visual project selectors, `--fail-on-flaky-tests`, and CI phase commands.
- Produces: default shards excluding Match Day and visual specs; serial order preflight -> prepare -> Match Day -> shard 1 -> shard 2 -> visual -> legacy flags-off; `workers: 1`; job timeout 90 minutes; fail-closed ordering and phase timings; Node 24-compatible action majors in a separate commit.

- [ ] **Step 1 (TDD RED):** Add CI runner/config tests that fail when default shards include Match Day/visual tests, phases overlap or reorder, `workers` is not 1, timeout is not 90 minutes, flaky tests are not failed, or a failed phase allows continuation; run them and record RED output.
- [ ] **Step 2 (TDD GREEN):** Create `playwright.ci-default.config.ts`, update the runner and workflow ordering, preserve individual test timeouts, add phase timing/fail-closed handling, and rerun focused config/runner tests.
- [ ] **Step 3:** In a separate commit, update GitHub Actions to Node 24-compatible action majors; run YAML/config validation and record the exact diff.
- [ ] **Step 4:** Run a CI dry run or actual workflow as available, compare counts for duplicate Match Day/visual execution, record phase durations and failures, self-review, and write the report.
- [ ] **Step 5:** Obtain fresh Sol/high spec and quality verdicts, including separate review of the action-major commit.

### Task 6: Authorization and cross-tenant data isolation

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/prisma-adapter.ts`, `src/lib/actions.ts`, `src/lib/actions/*.ts`, and the affected `src/app/api/**/route.ts` files.
- Test: `src/lib/auth/session.test.ts`, `src/lib/organizer/workspace-read.test.ts`, `src/lib/competition/workspace-read.test.ts`, `src/lib/actions.test.ts`, action contract tests under `src/lib/actions/*.test.ts`, and direct API/action matrix tests added under `src/app/api/**`/`src/lib/**`.
- Evidence: matrix, manipulated-ID results, safe-response assertions, and no-partial-write checks.

**Interfaces:**
- Consumes: authenticated actor/session context, event/team/match/player/submission/payment/import/certificate repositories.
- Produces: server-side role, ownership, parent-event, and cross-ID checks for every reader/API/server action; generic 403/404 without target metadata or partial writes; explicit audited platform-admin exceptions.

- [ ] **Step 1 (TDD RED):** Build the matrix for anonymous, captain A/B, organizer A/B, admin, and platform admin; write direct API/action tests for manipulated `eventId`, `teamId`, `matchId`, `playerId`, `submissionId`, `paymentRequestId`, `importBatchId`, `certificateId`, and nested IDs; run to capture unauthorized access and leakage failures.
- [ ] **Step 2 (TDD GREEN):** Add or reuse centralized server guards and apply them to every inventoried reader/route/action, enforcing role/ownership/parent-event/cross-ID relationships before reads or writes; make platform-admin exceptions explicit and audited; rerun the matrix and no-partial-write tests.
- [ ] **Step 3:** Run focused API/action and browser denial tests serially where Neon is involved, assert generic response bodies/statuses and absence of target metadata, self-review, commit `fix: enforce organizer workspace isolation`, and write the report.
- [ ] **Step 4:** Obtain both fresh Sol/high review verdicts and record any minor deferred finding in the ledger.

### Task 7: Password reset hardening and session revocation

**Files:**
- Modify: `src/lib/platform/password-reset.ts`, `src/lib/actions.ts`, `src/lib/auth/session.ts`, `src/lib/email/send.ts`, and `prisma/schema.prisma`.
- Create: the next timestamped migration under `prisma/migrations/**` for `User.sessionVersion`.
- Test: `src/lib/auth/session.test.ts`, `src/lib/actions.test.ts`, `src/lib/email/send.test.ts`, and new focused password-reset tests adjacent to `src/lib/platform/password-reset.ts`.
- Evidence: Delicate/preview migration review and no-production-apply record.

**Interfaces:**
- Consumes: user identity, token persistence, session/JWT callbacks, rate-limit primitives, and mail template.
- Produces: `PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000`; SHA-256 digest-only storage; new-token invalidation; atomic one-winner consume with `usedAt = null` and `expiresAt > now`; `User.sessionVersion`; JWT `sv`; generic responses; safe redacted logs; request/consume rate limits.

- [ ] **Step 1 (TDD RED):** Add failing tests for exact TTL/copy, digest storage, expiry boundary, used/reuse rejection, new-token invalidation, concurrent one-winner consume, tampering, unknown-email generic response, session revocation, enumeration resistance, rate limiting, and no sensitive logs; run them before implementation.
- [ ] **Step 2 (TDD GREEN):** Implement digest generation/storage, exact TTL constant/copy, invalidate-old-token issuance, atomic consume predicate, session-version schema/JWT checks, generic response timing/body, and redacted logging; rerun the focused unit/API suite.
- [ ] **Step 3:** Review the migration on Delicate/preview only, execute serial reset E2E and concurrency tests, verify no production connection/command was used, self-review, commit `fix: harden password reset sessions`, and write the report.
- [ ] **Step 4:** Obtain fresh Sol/high spec and quality verdicts with explicit review of the migration and race behavior.

### Task 8: Injection, XSS, API exposure, and safe errors

**Files:**
- Create/modify: `src/lib/security/request-guard.ts`, `src/lib/observability/logger.ts`, `src/lib/security/public-error.ts`, `src/middleware.ts`, every `src/app/api/**/route.ts`, `src/lib/actions.ts`, `src/lib/actions/*.ts`, `src/lib/registration/actions.ts`, and the existing validation modules under `src/lib/validation/**` and `src/lib/imports/**`.
- Test: `src/middleware.test.ts`, `src/security-smoke.test.ts`, `src/lib/actions.test.ts`, `src/lib/server-action-bundle.test.ts`, every existing `src/app/api/**/route.test.ts`, and the complete negative-input inventory tests added under `src/lib/security/**`.
- Evidence: inventory table, negative-input matrix, redacted-log samples, and cache/CORS headers.

**Interfaces:**
- Consumes: middleware, route/action auth context, validation library, Prisma access layer, rate-limit service, and request ID source.
- Produces: same-origin protection for unsafe API requests, no authenticated `Access-Control-Allow-Origin: *`, schema validation for IDs/query/JSON/CSV/XLSX/URLs/filenames/enums, parameterized Prisma-only runtime SQL, safe generic public error codes, and logs limited to safe error code/operation/route/request ID/duration/redacted actor/resource IDs.

- [ ] **Step 1 (TDD RED):** Inventory every `src/app/api/**/route.ts` and mutation/server action with auth, ownership, input schema, origin policy, rate limit, response exposure, and cache policy columns; add failing tests for SQL-shaped values, stored/reflected XSS, `javascript:`/scriptable URLs, JSON-LD breakout, MIME spoofing, path traversal, CSV formula injection, CORS, and error leakage.
- [ ] **Step 2 (TDD GREEN):** Apply the reusable guard/validators/error mapper/logger to all inventoried unsafe endpoints and actions, preserving Prisma parameterization and private cache policy; rerun the full focused negative-input matrix and inspect response/log fixtures for stacks, Prisma codes/queries, secrets, env values, tokens, emails, payment proof URLs, and PII.
- [ ] **Step 3:** Run targeted ESLint/typecheck/tests for all touched endpoints, self-review the inventory against the route list, commit `fix: harden API inputs and public errors`, and write the report.
- [ ] **Step 4:** Obtain fresh Sol/high spec and quality verdicts; any unprotected route is a failed gate.

### Task 9: Performance fixtures, query counts, and N+1 regression

**Files:**
- Create/modify: fixture helpers under `tests/e2e/helpers/fixtures.ts` and `prisma/seed.ts`, query-count tests adjacent to `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/workspace.ts`, and `src/lib/events/public-v3-read.ts`, plus `scripts/run-smoke-pressure.mjs`, `scripts/run-dashboard-performance.mjs`, `scripts/load-test.mjs`, and `scripts/load-test-quick.mjs` as needed.
- Test: organizer overview, registration queue, participants, competition, Match Control, Completion, Certificate Studio, and public event routes through `tests/e2e/**` and the named readers' unit/integration tests.
- Evidence: 64-team dataset manifest, query counts, p95 measurements, browser metric report, and credential/URL skip decisions.

**Interfaces:**
- Consumes: existing fixture/database factories, route readers, Playwright performance hooks, and production-like build configuration.
- Produces: up to 64 teams with at least 5 players/team, all relevant matches/player stats/audit rows/completion/certificates; bounded/paginated queue/audit/participants/import/certificate history; query-count regression coverage; server/load and browser budgets.

- [ ] **Step 1 (TDD RED):** Create the fixture manifest and failing query-count tests for all named readers, plus pagination/bounds assertions; run them and record N+1/over-budget failures on the fixture.
- [ ] **Step 2 (TDD GREEN):** Implement minimal batching/select/pagination changes and rerun query-count tests, requiring no server/load errors and p95 under 3 seconds wherever a pressure-test contract exists.
- [ ] **Step 3:** Measure browser production indicators LCP `<2.5s`, INP `<200ms`, CLS `<0.1`, TTFB `<800ms`; record that local results do not replace RUM. A required performance test skipped for missing credentials/URL keeps the gate `BLOCKED`, not green.
- [ ] **Step 4:** Run fixture cleanup/reuse serially against shared Neon, self-review counts and bounds, commit `perf: bound organizer workspace readers`, and write the report.
- [ ] **Step 5:** Obtain fresh Sol/high spec and quality verdicts, including review of any skipped/blocked performance evidence.

### Task 10: Vercel-native logging, monitoring, and alerting

**Files:**
- Modify: `src/lib/observability/logger.ts`, `src/app/api/**/route.ts`, `src/lib/actions.ts`, `src/lib/actions/*.ts`, `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/workspace.ts`, `src/lib/events/public-v3-read.ts`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/api/health/env/route.ts`, and `docs/operations/**`.
- Test: `src/app/api/health/env/route.test.ts`, `src/lib/observability/logger.test.ts`, `src/app/layout.test.tsx` or `src/app/[locale]/layout.test.tsx`, and preview smoke scripts under `scripts/run-smoke-*.mjs`.
- Evidence: structured log samples, `x-vercel-id`/generated request ID correlation, Speed Insights proof, saved-view/PIC access record, and preview scan.

**Interfaces:**
- Consumes: Vercel request headers, `@vercel/speed-insights`, route/action boundaries, and Vercel Runtime Logs/Observability.
- Produces: `start`/`done`/`failed` logs with operation/duration/status/safe error code; minimal public health response; production layout Speed Insights; documented views for five required failure classes; no Sentry/external drain.

- [ ] **Step 1 (TDD RED):** Add failing tests for structured start/done/failed records, request-ID correlation, safe field allowlist, minimal health output, Speed Insights layout presence, and absence of payload/PII/secrets; run them and record failures.
- [ ] **Step 2 (TDD GREEN):** Implement the structured logger and correlation, instrument APIs/security-sensitive actions/expensive readers, add/secure the health endpoint, and verify Speed Insights in the production layout; rerun focused tests.
- [ ] **Step 3:** Document saved views for 5xx/unhandled, auth denials/rate spikes, function timeout/high duration, password reset failure/reuse, and Completion/certificate transaction failures; verify the PIC can access Runtime Logs, deployment-failure notifications, Observability, and Speed Insights.
- [ ] **Step 4:** Build/preview, scan preview logs before promotion, self-review redaction and signal coverage, commit `feat: add vercel-native release observability`, and write the report. A future production deploy, only if separately authorized, must reach READY and receive an initial error scan.
- [ ] **Step 5:** Obtain fresh Sol/high specification-compliance and quality verdicts.

### Task 11: End-to-end product verification and accessibility

**Files:**
- Modify: `tests/e2e/v3-organizer-lifecycle.spec.ts`, `tests/e2e/organizer-v3-completion.spec.ts`, `tests/e2e/organizer-v3-certificates.spec.ts`, `tests/e2e/v3-matchday.spec.ts`, `tests/e2e/helpers/auth.ts`, `tests/e2e/helpers/fixtures.ts`, and `playwright.config.ts`.
- Evidence: journey report, role/flag matrix, ID/EN parity results, accessibility results, and baselines at 360, 390, 768, 1024, and 1440 widths.

**Interfaces:**
- Consumes: Tasks 2–10 contracts, shared Neon fixtures, feature flags, and publication revision state.
- Produces: full login -> registration/import/payment/QRIS -> competition/schedule -> Match Control -> score/stat review -> Completion -> seven certificates -> publication journey; admin shared workspace coverage; organizer non-owner denial; flags on/off; keyboard/focus/Escape/dialog/`aria-sort`/reduced-motion/44px/bounded-overflow assertions.

- [ ] **Step 1 (TDD RED):** Add the complete journey and role/flag/accessibility/visual assertions, normalize time/data/fonts/animation, and run focused specs to capture missing or flaky behavior.
- [ ] **Step 2 (TDD GREEN):** Fix only the production/test seams required by the failing contract, rerun journey coverage serially, and treat every required skip or flaky retry as a failure.
- [ ] **Step 3:** Capture visual baselines at 360, 390, 768, 1024, and 1440 widths for ID/EN and mobile/desktop; inspect artifacts for credential/PII leakage; self-review, commit `test: verify organizer release journey`, and write the report.
- [ ] **Step 4:** Obtain fresh Sol/high spec and quality verdicts, including the role matrix and all visual/accessibility evidence.

### Task 12: Rollback, recovery, release gates, and PR evidence

**Files:**
- Create or modify: `2026-09-14-release-1.0-verification.md`, `docs/handoff/2026-09-16-organizer-master-workspace/progress.md`, `docs/handoff/2026-09-16-organizer-master-workspace/snapshot.md`, and `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md`.
- Use: GitHub Actions, Vercel preview, Neon Delicate/preview, `git`, and the final review package.

**Interfaces:**
- Consumes: all task commits/reports/review verdicts, CI evidence, preview deployment, Vercel deployment ID, Neon snapshot/PITR details, and the security pre-deployment checklist.
- Produces: rollback/recovery runbook, final ledger/handoff/verification report, PR targeting `feature/ui/release/1.0`, and an explicit `READY` only when all evidence is complete; otherwise `BLOCKED` with exact human/external blockers.

- [ ] **Step 1:** Record a known-good Vercel deployment ID and exact `vercel rollback <deployment-id>` procedure; application rollback must use an already-validated artifact. Record Neon snapshot/PITR availability and retention, RPO, RTO, PIC, switchover decision, post-restore integrity queries, and a fresh non-production restore rehearsal. Rehearse on Delicate/preview only; production restore remains human-authorized.
- [ ] **Step 2:** Run the complete release-evidence commands serially and record count/duration/exit status: install (without repeating unnecessarily), Prisma validate, TypeScript, ESLint, unit, smoke, pressure, E2E, audit, build, and `git diff --check`. Verify no flaky retry, no required skip, and the final SHA's CI is green.
- [ ] **Step 3:** Deploy/inspect preview, validate ID/EN, mobile/desktop, roles, all formats, Completion, certificates, and rollback procedure; scan logs and preserve preview URL/evidence. Do not promote or mutate production settings.
- [ ] **Step 4:** Run fresh Sol/high whole-branch review from `git merge-base origin/feature/ui/release/1.0 HEAD`, include deferred-minor/parked ledger entries, resolve or explicitly park findings through the permitted one fix wave and scoped re-review, and require no P0/P1/P2.
- [ ] **Step 5:** Update the progress ledger, handoff, and `2026-09-14-release-1.0-verification.md`; run `git status`, `git diff --check`, and the final evidence checklist. Push normally without force, wait for GitHub Actions, verify preview, create a PR targeting `feature/ui/release/1.0`, and record the URL.
- [ ] **Step 6:** Make the final decision: `READY` only if every security gate, CI/preview/recovery gate, review verdict, and release-evidence command is evidenced; otherwise `BLOCKED` with exact unresolved blockers and why each requires human or external action.

## Security pre-deployment gate checklist

The following evidence is required before a `READY` decision. An unchecked or unverifiable item keeps the branch `BLOCKED`:

- [ ] **Auth and isolation:** The authorization matrix is green; manipulated IDs across users/events are denied without leakage; direct APIs/actions are protected; there are no partial writes; platform-admin exceptions are explicit and audited.
- [ ] **Password reset:** Exact 30-minute TTL and copy; digest storage; expired/used rejection; one success under concurrent consume; new token invalidates old; old sessions are revoked; no account enumeration; request/consume rate limits are active.
- [ ] **Injection and XSS:** Schema validation everywhere; no unsafe raw SQL; spreadsheet formula neutralization; XSS/scriptable-URL/JSON-LD/MIME/path-traversal tests green; React escaping is not bypassed for user-controlled data.
- [ ] **API exposure:** Complete security inventory; role/ownership checks; same-origin unsafe requests; no permissive private CORS; rate limits for auth/reset/registration/import/upload/expensive mutation; private cache policy is safe.
- [ ] **Error handling:** Safe client codes/messages; no stack/Prisma/secret/token/env/PII leakage; generic error pages; redacted correlated logs; CI/Playwright artifacts contain no credentials or PII.
- [ ] **Performance:** 64-team dataset passes functional/performance smoke; no N+1 in key readers; list queries are bounded; p95 budget is met; build/E2E has no timeout; production Speed Insights is installed for later real data.
- [ ] **Monitoring:** Structured critical-flow logs are searchable by request ID/operation; deployment-failure notification is active; saved views and PIC are documented; preview scan is clean; post-deploy scan procedure is written.
- [ ] **Recovery:** Known-good Vercel ID and rollback command/PIC; Neon snapshot/PITR and retention verified; non-production restore rehearsal succeeds; RPO/RTO/integrity checks documented; feature-flag rollback tested; production action requires explicit human decision.
- [ ] **Release evidence:** Install, Prisma validate, TypeScript, ESLint, unit, smoke, pressure, E2E, audit, build, and `git diff --check` all exit 0; no flaky retry or required skip; every command has count and duration; final-SHA CI is green; preview validates ID/EN, mobile/desktop, roles, formats, Completion, certificates, and rollback; final review has no P0/P1/P2.

## Per-task review and whole-branch gates

After each task, the orchestrator runs the repository SDD review-package helper with the task base/head, dispatches a fresh `gpt-5.6-sol` at reasoning `high` for two separate verdicts (specification compliance and code quality), and records both in the ledger. Findings enter the five-round fix protocol: rounds 1–3 resume the same `gpt-5.6-luna`/max implementer, rounds 4–5 use fresh Sol/high escalation, and load-bearing findings after round 5 keep the release `BLOCKED`.

Before the PR, the whole-branch review uses the merge-base package and a fresh Sol/high reviewer. A final fix wave, if required, gets one scoped re-review. The final evidence package includes final SHA/branch, PR URL/target, commits by task, all review verdicts, commands/counts/durations/statuses, CI and preview evidence, the complete security/recovery checklist, and exact unresolved blockers. No production deploy/migration/restore/flag activation is performed by this plan.

The final report must list: final SHA and branch; PR URL and target; commits by task; task review verdicts and final review verdict; commands, counts, durations, and exit statuses; CI and preview evidence; checklist status; exact unresolved blockers and why they require human/external action; and an explicit `READY` or `BLOCKED` decision.
