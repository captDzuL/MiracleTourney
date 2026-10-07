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
| App and server code | `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/components/v3/public-discovery/PublicHomepageShellBoundary.tsx`, `src/components/v3/public-discovery/PublicDiscoveryV3.tsx`, `src/components/v3/organizer/OrganizerMasterShell.tsx`, `src/components/HydrationGate.tsx`, `src/lib/actions.ts`, `src/lib/auth/session.ts` | focused tests, diff, review verdicts |
| Browser and unit tests | `tests/e2e/locale-switcher.spec.ts`, `tests/e2e/v3-organizer-lifecycle.spec.ts`, `tests/e2e/organizer-v3-completion.spec.ts`, `tests/e2e/organizer-v3-certificates.spec.ts`, `tests/e2e/v3-matchday.spec.ts`, `tests/competition/completion-e2e-fixture.test.ts`, `playwright.config.ts`, `playwright.legacy.config.ts`, `playwright.smoke.config.ts`, and named `src` test files in each task | command, count, duration, exit status, no required skip/flaky retry |
| Database | `prisma/schema.prisma`, `prisma/migrations/20260921000000_add_user_session_version/migration.sql`, `src/lib/platform/db.ts`, `src/lib/completion/prisma-adapter.ts` | validate output, migration review on Delicate/preview only, query/transaction tests |
| CI and scripts | `.github/workflows/ci.yml`, `scripts/e2e-ci.mjs`, `scripts/e2e-db-preflight.mjs`, `scripts/e2e-db-prepare.mjs`, `package.json` | ordered CI run, phase timings, failure behavior, action-major diff |
| Product/release documents | `docs/handoff/2026-09-16-organizer-master-workspace/progress.md`, `docs/handoff/2026-09-16-organizer-master-workspace/snapshot.md`, `docs/testing/v3-e2e-and-preview.md`, `docs/superpowers/plans/2026-09-20-organizer-master-workspace-release-readiness.md`, `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md` | ledger, handoff, verification report, PR evidence |

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
- Inspect: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, and `src/components/v3/public-discovery/PublicHomepageShellBoundary.tsx`.
- Modify: only the inspected V3 shell file that fails the contract; the RED test is allowed to remain a test-only correction when the current shell already satisfies the contract.
- Test: `tests/e2e/locale-switcher.spec.ts`.
- Evidence: Task 2 brief/report/review files under `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/`.

**Interfaces:**
- Consumes: the existing V3 public reader shell and locale routing.
- Produces: a browser contract proving `/id` and `/en`, `html.lang`, `Beranda/Home`, `Masuk/Sign in`, current navigation, and computed `header` `display:flex`; no locale switcher and no grid header.

- [ ] **Step 1 (TDD RED — write the failing contract):** Replace the stale body of `tests/e2e/locale-switcher.spec.ts` with this exact contract shape, keeping the test file name for CI discovery:

  ```ts
  const cases = [
    { path: "/id", lang: "id", home: "Beranda", signIn: "Masuk" },
    { path: "/en", lang: "en", home: "Home", signIn: "Sign in" },
  ] as const;

  for (const item of cases) {
    test(`renders the V3 ${item.lang} shell`, async ({ page }) => {
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", item.lang);
      await expect(page.getByRole("link", { name: item.home, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: item.signIn, exact: true })).toBeVisible();
      await expect(page.locator("header")).toHaveCount(1);
      const display = await page.locator("header").evaluate((node) => getComputedStyle(node).display);
      expect(display).toBe("flex");
      await expect(page.getByLabel(/pilih bahasa|select language/i)).toHaveCount(0);
    });
  }
  ```

- [ ] **Step 2 (TDD RED — run and record the failure):** Run `pnpm exec playwright test tests/e2e/locale-switcher.spec.ts --project=chromium --fail-on-flaky-tests`; expected RED evidence is a failure from the stale language-switcher or grid assertion, while the report records the exact observed message, count, duration, and exit `1`.
- [ ] **Step 3 (TDD GREEN — keep the V3 contract minimal):** Remove the stale switcher/grid assertions and change only the shell implementation necessary for the exact test. The accepted DOM has no language-switcher label, and `getComputedStyle(document.querySelector("header")!).display` is `"flex"`; do not add a switcher or change the header to grid.
- [ ] **Step 4 (GREEN verification):** Run `pnpm exec playwright test tests/e2e/locale-switcher.spec.ts --project=chromium --fail-on-flaky-tests`; expected output is two passing locale tests, zero failures, and zero required skips. Run `pnpm exec eslint "tests/e2e/locale-switcher.spec.ts" "src/app/[locale]/layout.tsx" "src/app/[locale]/page.tsx" "src/components/v3/public-discovery/PublicHomepageShellBoundary.tsx"`; expected exit is `0`.
- [ ] **Step 5 (refactor/review):** Run `pnpm exec playwright test tests/e2e/locale-switcher.spec.ts --project=chromium --fail-on-flaky-tests --workers=1` at 1440x900 and 390x844 via the test's `test.use` matrix; inspect the branded error-state screenshot/DOM and ensure no credentials or PII are in artifacts. Self-review the diff, write the Task 2 report with RED/GREEN evidence, and commit `test: align homepage locale contract`.
- [ ] **Step 6 (gate):** Generate the task review package from the Task 2 base/head and obtain separate fresh Sol/high verdicts for specification compliance and code quality. Record both verdicts and any fix-round command/output in the SDD ledger before Task 3.

### Task 3: Completion read transaction reliability

**Files:**
- Modify: `src/lib/completion/prisma-adapter.ts` and `src/lib/completion/workspace.ts`.
- Test: `src/lib/completion/prisma-adapter.test.ts`, `src/lib/completion/workspace.test.ts`, `src/lib/completion/complete.test.ts`, and `tests/e2e/organizer-v3-completion.spec.ts`.
- Evidence: serial shared-Neon report and review package.

**Interfaces:**
- Consumes: Prisma transaction API and existing parallel Completion reads.
- Produces: exported `COMPLETION_WORKSPACE_READ_TRANSACTION_OPTIONS` with `isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead`, `maxWait: 5_000`, and `timeout: 20_000`, forwarded to every Completion read transaction while preserving snapshot consistency and parallel queries.

- [ ] **Step 1 (TDD RED — define the exact contract test):** Add `src/lib/completion/prisma-adapter.test.ts` coverage with this assertion shape:

  ```ts
  it("forwards the repeatable-read workspace options", async () => {
    const transaction = vi.spyOn(prisma, "$transaction");
    await loadPrismaCompletionWorkspaceData("event-1").catch(() => undefined);
    expect(transaction.mock.calls.at(-1)?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 20_000,
    });
  });
  ```

  The exported production contract is:

  ```ts
  export const COMPLETION_WORKSPACE_READ_TRANSACTION_OPTIONS: Prisma.TransactionOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 5_000,
    timeout: 20_000,
  };
  ```

- [ ] **Step 2 (TDD RED — run unit failure):** Run `pnpm exec vitest run src/lib/completion/prisma-adapter.test.ts -t "repeatable-read workspace options"`; expected RED output is a missing export or an options mismatch and exit `1`. Record the exact failure and duration before production edits.
- [ ] **Step 3 (TDD RED — serial shared-Neon E2E):** In `tests/e2e/organizer-v3-completion.spec.ts`, keep `test.describe.configure({ mode: "serial" })` and exercise the existing four format fixtures from `tests/e2e/helpers/completion.ts`. Add `expect(test.info().errors).toHaveLength(0)` after each completion read and fail if any captured message contains `/P2028/`. Run `pnpm test:e2e:preflight`, then `pnpm test:e2e:prepare`, then `pnpm exec playwright test tests/e2e/organizer-v3-completion.spec.ts --fail-on-flaky-tests --workers=1`; expected RED evidence is the current timeout/P2028 or a failing option assertion, with all three commands marked serial.
- [ ] **Step 4 (TDD GREEN — apply one shared constant):** Change `src/lib/completion/prisma-adapter.ts` so `loadPrismaCompletionWorkspaceData(eventId: string): Promise<PrismaCompletionWorkspaceData>` calls `prisma.$transaction(async (tx) => { ... }, COMPLETION_WORKSPACE_READ_TRANSACTION_OPTIONS)`. Keep the four `Promise.all` read groups intact and forward the same constant to every Completion read transaction; do not turn the reads into sequential awaits.
- [ ] **Step 5 (GREEN verification):** Run `pnpm exec vitest run src/lib/completion/prisma-adapter.test.ts src/lib/completion/workspace.test.ts src/lib/completion/complete.test.ts`; expected output is all selected tests passing and exit `0`. Repeat the three serial Neon commands from Step 3; expected output is four format cases passing, no `P2028`, no required skip, and exit `0`.
- [ ] **Step 6 (refactor/verify):** Run `pnpm lint`; expected exit `0`. Run `pnpm exec eslint "src/lib/completion/prisma-adapter.ts" "src/lib/completion/workspace.ts" "src/lib/completion/prisma-adapter.test.ts" "src/lib/completion/workspace.test.ts"`; expected exit `0`. Self-review that the transaction snapshot is RepeatableRead, `maxWait` is exactly `5_000`, `timeout` exactly `20_000`, and parallel query grouping remains visible in the diff. Write the report and commit `fix: harden completion workspace reads`.
- [ ] **Step 7 (gate):** Generate the task review package from the Task 3 base/head and obtain separate fresh Sol/high specification-compliance and code-quality verdicts; any shared-Neon re-review remains serial and is recorded with command, count, duration, and exit status.

### Task 4: Certificate Studio hydration, controls, and publication

**Files:**
- Modify: `src/components/HydrationGate.tsx`, `src/app/admin/admin-workspace.tsx`, `src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx`, `src/lib/actions/certificate-v3-actions.ts`, and `src/lib/certificate/studio-repository.ts`.
- Test: `src/lib/certificate/studio-schema.test.ts`, `src/lib/certificate/studio-repository.test.ts`, `src/lib/actions/certificate-v3-actions.test.ts`, `src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx`, and `tests/e2e/organizer-v3-certificates.spec.ts`.
- Evidence: readiness/publication/geometry artifacts and serial Neon report.

**Interfaces:**
- Consumes: existing Certificate Studio controls, publication revision API/action, and `HydrationGate`.
- Produces: `HydrationGate` accepting native `React.HTMLAttributes<HTMLDivElement>` props and exposing `data-hydration-ready`; every interactive control including file input has minimum 44px height; pre-hydration UI is inert; publication waits for readiness, clicks once, asserts localized feedback, then asserts publication revision.

- [ ] **Step 1 (TDD RED — define `HydrationGate` contract):** Add a focused test adjacent to `src/components/HydrationGate.tsx` that renders `<HydrationGate id="studio" aria-label="Certificate Studio"><button>Publish</button></HydrationGate>` and asserts the native props, `aria-busy="true"`, `inert`, and `data-hydration-ready="false"` before effects, then `data-hydration-ready="true"` after the effect. The implementation signature is:

  ```tsx
  export function HydrationGate(
    props: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>,
  ): React.JSX.Element;
  ```

- [ ] **Step 2 (TDD RED — control/publication tests):** Add assertions to `src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx` and `src/lib/actions/certificate-v3-actions.test.ts` that every `input[type="file"]`, button, select, and link has computed height `>= 44`, that a pre-hydration click is not submitted, and that publication returns `{ status: "published", revision: number }`. Run `pnpm exec vitest run "src/components/HydrationGate.test.tsx" "src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx" "src/lib/actions/certificate-v3-actions.test.ts"`; expected RED output is the missing readiness attribute, props mismatch, undersized input, or publication assertion, exit `1`.
- [ ] **Step 3 (TDD RED — serial shared-Neon browser contract):** Add `test.describe.configure({ mode: "serial" })` coverage to `tests/e2e/organizer-v3-certificates.spec.ts` that waits for `[data-hydration-ready="true"]`, clicks the publication button once, asserts localized ID and EN feedback, then reads the publication revision and seven certificate links. Add a historical verification visit to `/id/certificates/verify/<verificationCode>` and geometry assertions at `{ width: 1440, height: 900 }` and `{ width: 390, height: 844 }`. Run `pnpm test:e2e:preflight`, `pnpm test:e2e:prepare`, then `pnpm exec playwright test tests/e2e/organizer-v3-certificates.spec.ts --fail-on-flaky-tests --workers=1`; expected RED evidence is missing readiness or a lost publication click, with all commands serial.
- [ ] **Step 4 (TDD GREEN — implement the exact gate):** In `src/components/HydrationGate.tsx`, destructure `children` and `className`, spread the remaining native div props, preserve `pointer-events-none` and `inert` before hydration, and render `data-hydration-ready={hydrated ? "true" : "false"}`. In the Certificate Studio page/action, disable publication until that attribute is true and await the server action once before displaying localized feedback and the returned revision.
- [ ] **Step 5 (GREEN verification):** Rerun the Vitest command from Step 2; expected all selected tests pass, exit `0`. Rerun the three serial E2E commands from Step 3; expected seven certificates, historical verification, one publication click, localized feedback, revision increment, and both viewport geometries pass with no required skip.
- [ ] **Step 6 (refactor/verify):** Run `pnpm exec eslint "src/components/HydrationGate.tsx" "src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx" "src/lib/actions/certificate-v3-actions.ts" "src/lib/certificate/studio-repository.ts"`; expected exit `0`. Run `pnpm lint`; expected exit `0`. Inspect screenshots and DOM for keyboard focus, 44px controls, credentials, and PII; self-review, write the report, and commit `fix: stabilize certificate studio publication`.
- [ ] **Step 7 (gate):** Generate the task review package from the Task 4 base/head and obtain separate fresh Sol/high specification-compliance and code-quality verdicts; record any fix round before Task 5.

### Task 5: CI stabilization and Node 24 action majors

**Files:**
- Create: `playwright.ci-default.config.ts` at the repository root.
- Modify: `scripts/e2e-ci.mjs`, `.github/workflows/ci.yml`, `src/e2e-ci.test.ts`, and `package.json` scripts/configuration.
- Test: `src/e2e-ci.test.ts`, `src/playwright-config.test.ts`, and the Playwright project-selection tests introduced with the new config.
- Evidence: separate action-major commit and an ordered CI run report.

**Interfaces:**
- Consumes: existing Playwright configs, Match Day/visual project selectors, `--fail-on-flaky-tests`, and CI phase commands.
- Produces: default shards excluding Match Day and visual specs; serial order preflight -> prepare -> Match Day -> shard 1 -> shard 2 -> visual -> legacy flags-off; `workers: 1`; job timeout 90 minutes; fail-closed ordering and phase timings; Node 24-compatible action majors in a separate commit.

- [ ] **Step 1 (TDD RED — assert the runner contract):** Extend `src/e2e-ci.test.ts` with the exact ordered labels `Database preflight`, `Database reset and seed`, `Match Day profile`, `Default profile shard 1/2`, `Default profile shard 2/2`, `Visual profile`, `Legacy flags-off profile`, and assert that a rejected phase never invokes the next command. Add `src/playwright-config.test.ts` coverage that imports `playwright.ci-default.config.ts` and asserts `workers === 1`, `testDir === "./tests/e2e"`, and `testIgnore` excludes `v3-matchday.spec.ts` and `public-visual-v2.smoke.spec.ts`. Run `pnpm exec vitest run src/e2e-ci.test.ts src/playwright-config.test.ts`; expected RED output is missing Visual profile/config or duplicate specs, exit `1`.
- [ ] **Step 2 (TDD RED — pin the expected config):** Add this root config skeleton to the plan implementation:

  ```ts
  import { defineConfig } from "@playwright/test";
  import base from "./playwright.config";

  export default defineConfig(base, {
    testDir: "./tests/e2e",
    workers: 1,
    retries: 0,
    testIgnore: [/v3-matchday\.spec\.ts$/, /public-visual-v2\.smoke\.spec\.ts$/],
  });
  ```

  The runner export has this exact type and order: `export const RELEASE_STEPS: readonly [label: string, command: "pnpm", args: readonly string[]][]`. Run the RED Vitest command and record the missing-config or order failure.
- [ ] **Step 3 (TDD GREEN — implement fail-closed serial phases):** Create `playwright.ci-default.config.ts`; change `scripts/e2e-ci.mjs` so the visual phase runs `pnpm exec playwright test --config playwright.smoke.config.ts --fail-on-flaky-tests`, the two default shards run `--config playwright.ci-default.config.ts --shard=1/2` and `--shard=2/2`, and every phase logs `[e2e-ci] START`, `[e2e-ci] PASS <label> (<ms>ms)`, or `[e2e-ci] FAIL <label> (<ms>ms)` before throwing. Change `.github/workflows/ci.yml` to `timeout-minutes: 90` and invoke `pnpm test:e2e:ci`; preserve individual Playwright timeouts and `workers: 1`.
- [ ] **Step 4 (GREEN verification):** Run `pnpm exec vitest run src/e2e-ci.test.ts src/playwright-config.test.ts`; expected all selected tests pass and exit `0`. Run `pnpm exec playwright test --config playwright.ci-default.config.ts --list`; expected listed tests exclude `tests/e2e/v3-matchday.spec.ts` and `tests/e2e-smoke/public-visual-v2.smoke.spec.ts`; record the test count.
- [ ] **Step 5 (separate action-major commit):** Inspect `.github/workflows/ci.yml` and keep `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/cache@v4`, and `actions/upload-artifact@v4` on Node 24-compatible majors. Run `pnpm exec prettier --check .github/workflows/ci.yml scripts/e2e-ci.mjs playwright.ci-default.config.ts`; expected exit `0`; commit the workflow-major verification/change separately as `ci: align github actions with node 24`.
- [ ] **Step 6 (refactor/verify):** Run `pnpm test:e2e:ci` serially with `E2E_ENABLED=true` when credentials are available; expected phase order is preflight -> prepare -> Match Day -> shard 1 -> shard 2 -> visual -> legacy flags-off, with no duplicate Match Day/visual tests, `--fail-on-flaky-tests` on every Playwright command, phase durations, and fail-closed behavior. If credentials are unavailable, record the external blocker and do not mark the gate green. Self-review, write the report, and commit `ci: stabilize serial e2e release phases`.
- [ ] **Step 7 (gate):** Generate review packages for both Task 5 commits and obtain separate fresh Sol/high specification-compliance and code-quality verdicts, recording each in the ledger.

### Task 6: Authorization and cross-tenant data isolation

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/prisma-adapter.ts`, `src/lib/actions.ts`, `src/lib/actions/captain-event-login.ts`, `src/lib/actions/certificate-v3-actions.ts`, `src/lib/actions/competition-v3-actions.ts`, `src/lib/actions/completion-v3-actions.ts`, `src/lib/actions/event-revision-actions.ts`, `src/lib/actions/event-v3-actions.ts`, `src/lib/actions/organizer-profile-actions.ts`, `src/lib/actions/platform-profile-actions.ts`, `src/lib/actions/player-stats-v3-actions.ts`, `src/lib/registration/actions.ts`, `src/app/api/admin/captain-credentials/route.ts`, `src/app/api/debug-locale/route.ts`, `src/app/api/events/[slug]/ongoing/route.ts`, `src/app/api/health/env/route.ts`, `src/app/api/me/route.ts`, and `src/app/api/organizer/events/[eventId]/competition/route.ts`.
- Create: `src/lib/security/authorization.ts`.
- Test: `src/lib/auth/session.test.ts`, `src/lib/organizer/workspace-read.test.ts`, `src/lib/competition/workspace-read.test.ts`, `src/lib/actions.test.ts`, `src/lib/actions/certificate-v3-actions.test.ts`, `src/lib/actions/completion-v3-actions.test.ts`, `src/lib/actions/competition-v3-actions.test.ts`, `src/lib/actions/event-v3-actions.test.ts`, `src/lib/actions/registration-v3-actions.test.ts`, and `src/lib/security/authorization-matrix.test.ts`.
- Evidence: matrix, manipulated-ID results, safe-response assertions, and no-partial-write checks.

**Interfaces:**
- Consumes: authenticated actor/session context, event/team/match/player/submission/payment/import/certificate repositories.
- Produces: server-side role, ownership, parent-event, and cross-ID checks for every reader/API/server action; generic 403/404 without target metadata or partial writes; explicit audited platform-admin exceptions.

- [ ] **Step 1 (TDD RED — define the guard contract):** Create `src/lib/security/authorization.ts` with this exported signature and no UI-only checks:

  ```ts
  export type WorkspaceActor = Readonly<{ id: string; role: "captain" | "organizer" | "admin" | "platform_admin" }>;
  export type WorkspaceResource = Readonly<{ eventId: string; ownerUserId?: string | null }>;
  export type AuthorizationDecision =
    | Readonly<{ ok: true; platformAdminException: boolean }>
    | Readonly<{ ok: false; status: 403 | 404; code: "forbidden" }>;
  export function authorizeWorkspaceResource(
    actor: WorkspaceActor | null,
    resource: WorkspaceResource | null,
    eventOwnerUserId: string | null,
  ): AuthorizationDecision;
  ```

  Add `src/lib/security/authorization-matrix.test.ts` cases for anonymous, captain A/B, organizer A/B, admin, and platform admin against each manipulated `eventId`, `teamId`, `matchId`, `playerId`, `submissionId`, `paymentRequestId`, `importBatchId`, `certificateId`, and nested ID. Each denied case must assert a generic `{ status: 403 | 404, code: "forbidden" }`, absence of the target ID/name/email, and no mocked write call.
- [ ] **Step 2 (TDD RED — run direct-call failures):** Run `pnpm exec vitest run src/lib/security/authorization-matrix.test.ts src/lib/actions.test.ts src/lib/actions/certificate-v3-actions.test.ts src/lib/actions/completion-v3-actions.test.ts src/lib/actions/competition-v3-actions.test.ts src/lib/actions/event-v3-actions.test.ts src/lib/actions/registration-v3-actions.test.ts`; expected RED output is missing guard behavior or a target-ID leak, exit `1`. Record the exact failing actor/resource case.
- [ ] **Step 3 (TDD GREEN — enforce before read/write):** Implement `authorizeWorkspaceResource` so anonymous/captain/non-owner/admin mismatches return only the generic decision, organizer access requires the event owner and matching parent event, and a platform-admin `ok` decision sets `platformAdminException: true` and emits an audit record. Call it from each listed reader, action, and API route after schema parsing and before any Prisma read/write; never rely on hidden UI controls.
- [ ] **Step 4 (GREEN verification):** Rerun the Vitest command from Step 2; expected all matrix/action tests pass, exit `0`, no unauthorized target metadata appears in serialized bodies, and mocked writes remain at zero for denied cases. Run `pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts --grep "denied|owner|admin" --fail-on-flaky-tests --workers=1`; expected anonymous/non-owner denial and admin shared-workspace cases pass with no required skip.
- [ ] **Step 5 (refactor/verify):** Run `pnpm lint` and `pnpm exec eslint "src/lib/security/authorization.ts" "src/lib/auth/session.ts" "src/lib/actions.ts" "src/lib/actions/captain-event-login.ts" "src/lib/actions/certificate-v3-actions.ts" "src/lib/actions/competition-v3-actions.ts" "src/lib/actions/completion-v3-actions.ts" "src/lib/actions/event-revision-actions.ts" "src/lib/actions/event-v3-actions.ts" "src/lib/actions/organizer-profile-actions.ts" "src/lib/actions/platform-profile-actions.ts" "src/lib/actions/player-stats-v3-actions.ts" "src/lib/registration/actions.ts" "src/app/api/admin/captain-credentials/route.ts" "src/app/api/debug-locale/route.ts" "src/app/api/events/[slug]/ongoing/route.ts" "src/app/api/health/env/route.ts" "src/app/api/me/route.ts" "src/app/api/organizer/events/[eventId]/competition/route.ts"`; expected exit `0`. Review each of the six API route files for role/ownership/parent-event/cross-ID checks and confirm platform-admin audit fields contain no target secrets/PII. Write the report and commit `fix: enforce organizer workspace isolation`.
- [ ] **Step 6 (gate):** Generate the Task 6 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts; record minor deferred findings explicitly in the ledger.

### Task 7: Password reset hardening and session revocation

**Files:**
- Modify: `src/lib/platform/password-reset.ts`, `src/lib/actions.ts`, `src/lib/auth/session.ts`, `src/lib/email/send.ts`, and `prisma/schema.prisma`.
- Create: `prisma/migrations/20260921000000_add_user_session_version/migration.sql`.
- Test: `src/lib/platform/password-reset.test.ts`, `src/lib/auth/session.test.ts`, `src/lib/actions.test.ts`, and `src/lib/email/send.test.ts`.
- Evidence: Delicate/preview migration review and no-production-apply record.

**Interfaces:**
- Consumes: user identity, token persistence, session/JWT callbacks, rate-limit primitives, and mail template.
- Produces: `PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000`; SHA-256 digest-only storage; new-token invalidation; atomic one-winner consume with `usedAt = null` and `expiresAt > now`; `User.sessionVersion`; JWT `sv`; generic responses; safe redacted logs; request/consume rate limits.

- [ ] **Step 1 (TDD RED — define token/session contracts):** Add `src/lib/platform/password-reset.test.ts` cases with these exact production signatures:

  ```ts
  export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
  export function digestPasswordResetToken(rawToken: string): string;
  export async function createPasswordResetToken(userId: string, now?: Date): Promise<string>;
  export async function consumePasswordResetToken(token: string, newPasswordHash: string, now?: Date): Promise<void>;
  ```

  Cover exact TTL/copy, SHA-256 digest storage (raw token absent from the row), expiry boundary, used/reuse rejection, new-token invalidation, concurrent one-winner consume, tampering, unknown-email generic response, session revocation, enumeration resistance, rate limits, and logs that omit email/token/reset URL.
- [ ] **Step 2 (TDD RED — run tests):** Run `pnpm exec vitest run src/lib/platform/password-reset.test.ts src/lib/auth/session.test.ts src/lib/actions.test.ts src/lib/email/send.test.ts`; expected RED output names the missing constant/digest/session-version behavior or an old 60-minute copy, exit `1`. Record counts and duration.
- [ ] **Step 3 (TDD GREEN — implement digest and atomic consume):** Change `src/lib/platform/password-reset.ts` using `createHash("sha256").update(rawToken).digest("hex")`, delete/invalidate older user rows before creating the new digest, and consume with a transaction whose conditional update is equivalent to `where: { token: digest, usedAt: null, expiresAt: { gt: now } }`. Proceed to the user update and `sessionVersion: { increment: 1 }` only when the conditional update count is `1`; otherwise throw the generic invalid/expired result. Add `sessionVersion Int @default(0)` to `User` and apply `20260921000000_add_user_session_version/migration.sql` only on Delicate/preview.
- [ ] **Step 4 (TDD GREEN — JWT and generic action):** In `src/lib/auth/session.ts`, make `signToken(payload: { sub: string; role: string; sv: number }, maxAge: number)` emit `sv`, make `verifyToken` return `sv`, and have `getSessionUser` reject a token whose claim differs from the current user row. In `src/lib/actions.ts`, keep known/unknown email request responses indistinguishable, use the exact 30-minute copy, apply request/consume limits with `checkRateLimit`, and never pass email/token/reset URL to logs.
- [ ] **Step 5 (GREEN verification):** Rerun the Vitest command from Step 2; expected all reset/session/action tests pass and exit `0`, including one winner under `Promise.all` concurrent consume. Run `pnpm prisma validate`; expected exit `0`. Run `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`; expected output contains only the session-version change for the reviewed Delicate/preview migration.
- [ ] **Step 6 (refactor/verify):** Run serial reset E2E through `pnpm test:e2e:preflight`, `pnpm test:e2e:prepare`, and `pnpm exec playwright test tests/e2e/captain-auth.spec.ts --grep "reset|password" --fail-on-flaky-tests --workers=1`; expected expiry/reuse/tampering/enumeration/session-revocation cases pass with no required skip. Review the migration connection target, self-review, write the report, and commit `fix: harden password reset sessions`.
- [ ] **Step 7 (gate):** Generate the Task 7 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts, explicitly reviewing the migration and concurrent consume race.

### Task 8: Injection, XSS, API exposure, and safe errors

**Files:**
- Create/modify: `src/lib/security/request-guard.ts`, `src/lib/observability/logger.ts`, `src/lib/security/public-error.ts`, `src/middleware.ts`, `src/app/api/admin/captain-credentials/route.ts`, `src/app/api/debug-locale/route.ts`, `src/app/api/events/[slug]/ongoing/route.ts`, `src/app/api/health/env/route.ts`, `src/app/api/me/route.ts`, `src/app/api/organizer/events/[eventId]/competition/route.ts`, `src/lib/actions.ts`, `src/lib/actions/captain-event-login.ts`, `src/lib/actions/certificate-v3-actions.ts`, `src/lib/actions/competition-v3-actions.ts`, `src/lib/actions/completion-v3-actions.ts`, `src/lib/actions/event-revision-actions.ts`, `src/lib/actions/event-v3-actions.ts`, `src/lib/actions/organizer-profile-actions.ts`, `src/lib/actions/platform-profile-actions.ts`, `src/lib/actions/player-stats-v3-actions.ts`, `src/lib/registration/actions.ts`, `src/lib/validation/team-data.ts`, `src/lib/validation/profanity.ts`, `src/lib/validation/email.ts`, and `src/lib/imports/registration-intake.ts`.
- Create: `docs/operations/release-security-inventory.md`.
- Test: `src/middleware.test.ts`, `src/security-smoke.test.ts`, `src/lib/actions.test.ts`, `src/lib/server-action-bundle.test.ts`, `src/app/api/admin/captain-credentials/route.test.ts`, `src/app/api/health/env/route.test.ts`, and `src/lib/security/negative-inputs.test.ts`.
- Evidence: inventory table, negative-input matrix, redacted-log samples, and cache/CORS headers.

**Interfaces:**
- Consumes: middleware, route/action auth context, validation library, Prisma access layer, rate-limit service, and request ID source.
- Produces: same-origin protection for unsafe API requests, no authenticated `Access-Control-Allow-Origin: *`, schema validation for IDs/query/JSON/CSV/XLSX/URLs/filenames/enums, parameterized Prisma-only runtime SQL, safe generic public error codes, and logs limited to safe error code/operation/route/request ID/duration/redacted actor/resource IDs.

- [ ] **Step 1 (TDD RED — define security interfaces and inventory):** Create the security interfaces:

  ```ts
  export function requireSameOrigin(request: Request): Response | null;
  export type PublicErrorBody = Readonly<{ code: "forbidden" | "invalid_input" | "internal_error"; requestId: string }>;
  export function toPublicError(error: unknown, requestId: string): { status: 400 | 403 | 500; body: PublicErrorBody };
  export function neutralizeSpreadsheetFormula(value: string): string;
  ```

  Inventory the six API routes and all listed action files in `docs/operations/release-security-inventory.md`, with columns `auth`, `ownership`, `input schema`, `origin`, `rate limit`, `response exposure`, and `cache policy`. Add `src/lib/security/negative-inputs.test.ts` cases for SQL-shaped input, stored/reflected XSS, `javascript:` and scriptable URLs, JSON-LD breakout, MIME spoofing, path traversal, CSV formula injection, cross-origin unsafe requests, permissive private CORS, and internal-error leakage.
- [ ] **Step 2 (TDD RED — run the negative matrix):** Run `pnpm exec vitest run src/middleware.test.ts src/security-smoke.test.ts src/lib/actions.test.ts src/lib/server-action-bundle.test.ts src/app/api/admin/captain-credentials/route.test.ts src/app/api/health/env/route.test.ts src/lib/security/negative-inputs.test.ts`; expected RED output identifies an unguarded unsafe request, leaked stack/Prisma code, unsafe URL/formula, or permissive header, exit `1`.
- [ ] **Step 3 (TDD GREEN — guard and map errors):** Implement `requireSameOrigin` for unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) by comparing the `Origin` URL origin with `new URL(request.url).origin`, return only generic 403 JSON on mismatch, and invoke it from `src/middleware.ts` or each API route because middleware currently excludes `/api`. Implement `toPublicError` so clients receive only the three codes and request ID; preserve parameterized Prisma calls and set authenticated responses to private/no-store cache policy. Apply schema parsing before every database access and neutralize spreadsheet cells beginning with `=`, `+`, `-`, or `@`.
- [ ] **Step 4 (GREEN verification):** Rerun the Vitest command from Step 2; expected all negative-input tests pass and exit `0`. Run `rg -n '\$queryRawUnsafe|\$executeRawUnsafe|Access-Control-Allow-Origin.*\*' src`; expected no runtime SQL/CORS matches. Run `pnpm exec eslint "src/lib/security/request-guard.ts" "src/lib/observability/logger.ts" "src/lib/security/public-error.ts" "src/middleware.ts" "src/app/api/admin/captain-credentials/route.ts" "src/app/api/debug-locale/route.ts" "src/app/api/events/[slug]/ongoing/route.ts" "src/app/api/health/env/route.ts" "src/app/api/me/route.ts" "src/app/api/organizer/events/[eventId]/competition/route.ts" "src/lib/actions.ts" "src/lib/actions/captain-event-login.ts" "src/lib/actions/certificate-v3-actions.ts" "src/lib/actions/competition-v3-actions.ts" "src/lib/actions/completion-v3-actions.ts" "src/lib/actions/event-revision-actions.ts" "src/lib/actions/event-v3-actions.ts" "src/lib/actions/organizer-profile-actions.ts" "src/lib/actions/platform-profile-actions.ts" "src/lib/actions/player-stats-v3-actions.ts" "src/lib/registration/actions.ts" "src/lib/validation/team-data.ts" "src/lib/validation/profanity.ts" "src/lib/validation/email.ts" "src/lib/imports/registration-intake.ts"`; expected exit `0`. Inspect captured response/log fixtures and assert absence of stacks, Prisma codes/queries, secrets, env values, tokens, emails, payment proof URLs, and PII.
- [ ] **Step 5 (refactor/verify):** Run `pnpm exec vitest run src/lib/actions.test.ts src/lib/actions/certificate-v3-actions.test.ts src/lib/actions/completion-v3-actions.test.ts src/lib/actions/competition-v3-actions.test.ts src/lib/actions/event-v3-actions.test.ts src/lib/actions/registration-v3-actions.test.ts`; expected all direct action tests pass with generic errors and no partial writes. Update `docs/operations/release-security-inventory.md`, self-review every route row against the six route files, write the report, and commit `fix: harden API inputs and public errors`.
- [ ] **Step 6 (gate):** Generate the Task 8 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts; an unprotected route or unsafe public error is a failed gate.

### Task 9: Performance fixtures, query counts, and N+1 regression

**Files:**
- Create: `tests/performance/organizer-readers.test.ts`.
- Modify: `tests/e2e/helpers/fixtures.ts`, `prisma/seed.ts`, `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/workspace.ts`, `src/lib/events/public-v3-read.ts`, `scripts/run-smoke-pressure.mjs`, `scripts/run-dashboard-performance.mjs`, `scripts/load-test.mjs`, and `scripts/load-test-quick.mjs`.
- Test: organizer overview, registration queue, participants, competition, Match Control, Completion, Certificate Studio, and public event routes through `tests/e2e/v3-organizer-lifecycle.spec.ts`, `tests/e2e/organizer-v3-completion.spec.ts`, `tests/e2e/organizer-v3-certificates.spec.ts`, `tests/e2e/v3-matchday.spec.ts`, `tests/e2e/v3-public-event-lifecycle.spec.ts`, `tests/e2e/public-v3-seeded-events.spec.ts`, and the named readers' unit/integration tests.
- Evidence: 64-team dataset manifest, query counts, p95 measurements, browser metric report, and credential/URL skip decisions.

**Interfaces:**
- Consumes: existing fixture/database factories, route readers, Playwright performance hooks, and production-like build configuration.
- Produces: up to 64 teams with at least 5 players/team, all relevant matches/player stats/audit rows/completion/certificates; bounded/paginated queue/audit/participants/import/certificate history; query-count regression coverage; server/load and browser budgets.

- [ ] **Step 1 (TDD RED — define scale/query contracts):** Add these exact test helpers and fixture contract to `tests/performance/organizer-readers.test.ts`:

  ```ts
  export type OrganizerScaleFixture = Readonly<{
    eventId: string;
    teamIds: readonly string[];
    playerIds: readonly string[];
    matchIds: readonly string[];
    certificateIds: readonly string[];
  }>;
  export async function seedOrganizerScaleFixture(teamCount: 64, playersPerTeam: 5): Promise<OrganizerScaleFixture>;
  export async function countQueries<T>(work: () => Promise<T>): Promise<Readonly<{ value: T; count: number }>>;
  ```

  Seed up to exactly 64 teams, five players/team, relevant matches, player stats, audit rows, one Completion, and seven certificates. Add failing assertions that each named reader has a bounded query count, queue/audit/participants/import/certificate history has `take`/cursor bounds, and result counts never exceed the requested page size.
- [ ] **Step 2 (TDD RED — run fixture/query tests):** Run `pnpm exec vitest run tests/performance/organizer-readers.test.ts`; expected RED output is an N+1 query count or missing pagination bound, exit `1`. Record the fixture cardinalities and query counts.
- [ ] **Step 3 (TDD GREEN — batch and bound):** Implement minimal `select`/batch/pagination changes in the four named readers. Keep list arguments explicit, for example `readRegistrationQueue(eventId: string, input: Readonly<{ cursor?: string; limit: number }>): Promise<...>`, and cap untrusted limits before Prisma. Do not remove authorization checks or change response shape.
- [ ] **Step 4 (GREEN verification):** Rerun `pnpm exec vitest run tests/performance/organizer-readers.test.ts`; expected all query-count and bounds tests pass, exit `0`. Run `pnpm test:pressure:smoke`; expected zero server/load errors and p95 `< 3_000 ms` for its declared pressure contract. Run `pnpm test:dashboard:perf`; expected its report includes organizer overview, registration queue, participants, competition, Match Control, Completion, Certificate Studio, and public event measurements.
- [ ] **Step 5 (browser metrics):** Run the production-like browser measurement command from `scripts/run-dashboard-performance.mjs` against a credentialed preview and record LCP `<2.5s`, INP `<200ms`, CLS `<0.1`, and TTFB `<800ms`; local values are evidence only and do not replace RUM. If the required credential or URL is missing, record the exact missing external input and leave the gate `BLOCKED`; do not convert the test into a skip.
- [ ] **Step 6 (refactor/verify):** Run the two load scripts serially against the shared Neon dataset, clean only their fixture rows, inspect query counts and page bounds, self-review the report, and commit `perf: bound organizer workspace readers`.
- [ ] **Step 7 (gate):** Generate the Task 9 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts, explicitly including any performance evidence blocked by credentials/URL.

### Task 10: Vercel-native logging, monitoring, and alerting

**Files:**
- Modify: `src/lib/observability/logger.ts`, `src/app/api/admin/captain-credentials/route.ts`, `src/app/api/debug-locale/route.ts`, `src/app/api/events/[slug]/ongoing/route.ts`, `src/app/api/health/env/route.ts`, `src/app/api/me/route.ts`, `src/app/api/organizer/events/[eventId]/competition/route.ts`, `src/lib/actions.ts`, `src/lib/actions/captain-event-login.ts`, `src/lib/actions/certificate-v3-actions.ts`, `src/lib/actions/competition-v3-actions.ts`, `src/lib/actions/completion-v3-actions.ts`, `src/lib/actions/event-revision-actions.ts`, `src/lib/actions/event-v3-actions.ts`, `src/lib/actions/organizer-profile-actions.ts`, `src/lib/actions/platform-profile-actions.ts`, `src/lib/actions/player-stats-v3-actions.ts`, `src/lib/registration/actions.ts`, `src/lib/organizer/workspace-read.ts`, `src/lib/competition/workspace-read.ts`, `src/lib/completion/workspace.ts`, `src/lib/events/public-v3-read.ts`, `src/app/layout.tsx`, and `src/app/[locale]/layout.tsx`.
- Create: `docs/operations/release-observability.md`, `src/lib/observability/logger.test.ts`, and `src/app/layout.test.tsx`.
- Test: `src/app/api/health/env/route.test.ts`, `src/lib/observability/logger.test.ts`, `src/app/layout.test.tsx`, `scripts/run-smoke-e2e.mjs`, and `scripts/run-smoke-pressure.mjs`.
- Evidence: structured log samples, `x-vercel-id`/generated request ID correlation, Speed Insights proof, saved-view/PIC access record, and preview scan.

**Interfaces:**
- Consumes: Vercel request headers, `@vercel/speed-insights`, route/action boundaries, and Vercel Runtime Logs/Observability.
- Produces: `start`/`done`/`failed` logs with operation/duration/status/safe error code; minimal public health response; production layout Speed Insights; documented views for five required failure classes; no Sentry/external drain.

- [ ] **Step 1 (TDD RED — define the logger contract):** Add `src/lib/observability/logger.ts` interfaces and tests with this exact shape:

  ```ts
  export type ServerLogPhase = "start" | "done" | "failed";
  export type ServerLogEvent = Readonly<{
    phase: ServerLogPhase;
    operation: string;
    route: string;
    requestId: string;
    durationMs: number;
    status: number;
    errorCode?: string;
    actorId?: string;
    resourceId?: string;
  }>;
  export function getRequestId(request: Request): string;
  export function writeServerLog(event: ServerLogEvent): void;
  export async function withServerLog<T>(request: Request, operation: string, work: () => Promise<{ status: number; value: T }>): Promise<T>;
  ```

  Add tests for `x-vercel-id`/generated request ID correlation, start/done/failed records, safe-field allowlist, and absence of payload/PII/secrets. Add health/layout tests requiring `GET()` to return `{ status: "ok" }` only and `src/app/layout.tsx` to render `<SpeedInsights />`.
- [ ] **Step 2 (TDD RED — run logger/health/layout tests):** Run `pnpm exec vitest run src/lib/observability/logger.test.ts src/app/api/health/env/route.test.ts src/app/layout.test.tsx`; expected RED output is missing logger/Speed Insights/minimal-health behavior, exit `1`.
- [ ] **Step 3 (TDD GREEN — implement and instrument):** `getRequestId` must return `request.headers.get("x-vercel-id") ?? crypto.randomUUID()`. `writeServerLog` must serialize only the `ServerLogEvent` allowlist. `withServerLog` must emit `start`, then `done` with elapsed duration/status or `failed` with a safe error code, never logging request payloads. Instrument the six API routes, the nine action modules, the four expensive readers, and the two layouts; change `src/app/api/health/env/route.ts` to return no environment/secret detail.
- [ ] **Step 4 (GREEN verification):** Rerun the Vitest command from Step 2; expected all selected tests pass and exit `0`. Run `pnpm exec eslint "src/lib/observability/logger.ts" "src/app/api/health/env/route.ts" "src/app/layout.tsx" "src/app/[locale]/layout.tsx"`; expected exit `0`. Inspect emitted JSON and assert no payload, email, token, payment URL, stack, secret, env value, or PII field appears.
- [ ] **Step 5 (operations evidence):** Create `docs/operations/release-observability.md` with saved views for 5xx/unhandled, auth denials/rate spikes, function timeout/high duration, password-reset failure/reuse, and Completion/certificate transaction failures. Record the PIC's access to Vercel Runtime Logs, deployment-failure notifications, Observability, and Speed Insights; do not add Sentry or an external drain.
- [ ] **Step 6 (refactor/verify):** Build with `pnpm build`; expected exit `0` and production layout includes Speed Insights. Deploy/inspect a preview, scan preview logs before promotion, record the preview URL and scan result, self-review redaction/signal coverage, write the report, and commit `feat: add vercel-native release observability`.
- [ ] **Step 7 (gate):** Generate the Task 10 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts. A future production deployment, only after separate human authorization, must reach READY and receive an initial error scan; this task performs no production mutation.

### Task 11: End-to-end product verification and accessibility

**Files:**
- Modify: `tests/e2e/v3-organizer-lifecycle.spec.ts`, `tests/e2e/organizer-v3-completion.spec.ts`, `tests/e2e/organizer-v3-certificates.spec.ts`, `tests/e2e/v3-matchday.spec.ts`, `tests/e2e/helpers/auth.ts`, `tests/e2e/helpers/fixtures.ts`, and `playwright.config.ts`.
- Evidence: journey report, role/flag matrix, ID/EN parity results, accessibility results, and baselines at 360, 390, 768, 1024, and 1440 widths.

**Interfaces:**
- Consumes: Tasks 2–10 contracts, shared Neon fixtures, feature flags, and publication revision state.
- Produces: full login -> registration/import/payment/QRIS -> competition/schedule -> Match Control -> score/stat review -> Completion -> seven certificates -> publication journey; admin shared workspace coverage; organizer non-owner denial; flags on/off; keyboard/focus/Escape/dialog/`aria-sort`/reduced-motion/44px/bounded-overflow assertions.

- [ ] **Step 1 (TDD RED — define deterministic journey matrix):** Add this matrix to `tests/e2e/v3-organizer-lifecycle.spec.ts` and use `loginWithCredentials` from `tests/e2e/helpers/auth.ts` plus fixtures from `tests/e2e/helpers/fixtures.ts`:

  ```ts
  const VIEWPORTS = [360, 390, 768, 1024, 1440] as const;
  const LOCALES = ["id", "en"] as const;
  test.describe.configure({ mode: "serial" });

  for (const locale of LOCALES) {
    test(`organizer release journey ${locale}`, async ({ page }) => {
      await loginWithCredentials(page, { locale, email: "organizer-a@miraclefc.gg", password: "Miracle2026!", destination: /organizer/ });
      await page.goto(`/${locale}/organizer/events/fixture/registration`);
      // Assert registration/import/payment/QRIS, competition/schedule, Match Control,
      // score/stat review, Completion, seven certificates, and publication revision.
      await expect(page.locator("[data-publication-revision]")).toHaveAttribute("data-publication-revision", /\d+/);
    });
  }
  ```

  Add explicit cases for admin shared workspace, organizer non-owner denial, feature flag on/off, keyboard tab order/visible focus, Escape closing dialogs, `aria-sort`, `prefers-reduced-motion`, 44px controls, bounded overflow, and all five `VIEWPORTS`. Normalize the clock/data/font/animation in the test setup.
- [ ] **Step 2 (TDD RED — run deterministic specs):** Run `pnpm test:e2e:preflight`, `pnpm test:e2e:prepare`, then `pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts tests/e2e/organizer-v3-completion.spec.ts tests/e2e/organizer-v3-certificates.spec.ts tests/e2e/v3-matchday.spec.ts --fail-on-flaky-tests --workers=1`; expected RED output identifies a missing journey assertion, role denial, flag parity, accessibility issue, or required skip, exit `1`.
- [ ] **Step 3 (TDD GREEN — complete the journey):** Add only the fixture/test seams required by the RED output; do not weaken assertions or turn required tests into skips. Keep login, registration/import/payment/QRIS, competition/schedule, Match Control, score/stat review, Completion, seven certificates, publication, and historical verification in one serial shared-Neon flow.
- [ ] **Step 4 (GREEN verification):** Rerun the three serial commands from Step 2; expected all journey/role/flag/accessibility tests pass, no flaky retry occurs, no required test is skipped, and exit `0`. Run `pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts --project=chromium --grep "keyboard|focus|Escape|aria-sort|reduced-motion|44px|overflow" --fail-on-flaky-tests --workers=1`; expected all accessibility assertions pass.
- [ ] **Step 5 (visual/refactor):** Capture baseline screenshots at widths 360, 390, 768, 1024, and 1440 for both `id` and `en`, with feature flags on and off, using deterministic time/data/fonts/animation. Inspect `test-results/` and `playwright-report/` for credentials/PII, self-review role and parity matrices, write the report, and commit `test: verify organizer release journey`.
- [ ] **Step 6 (gate):** Generate the Task 11 review package and obtain separate fresh Sol/high specification-compliance and code-quality verdicts, including role matrix, ID/EN parity, visual, keyboard, focus, dialog, reduced-motion, control-size, and overflow evidence.

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
