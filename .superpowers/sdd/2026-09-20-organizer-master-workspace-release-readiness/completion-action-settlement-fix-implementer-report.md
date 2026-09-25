# Completion action-settlement fix implementer report

Date: 2026-09-25 (Asia/Jakarta)
Status: `DONE_WITH_CONCERNS`
Base SHA: `eddd83b8c5600a8cc19c969fc6ddea7e1e8f6ed3`
Implementation commit: `789ae6b` (`test: settle Completion action response`)
Requested execution model: `gpt-5.6-luna` at `max` reasoning (the brief's `gpt-6-luna` label was overridden by the user request).

## Root cause

The Completion E2E awaited the real button click dispatch but not the matching server-action response. The click did enter the pending `Completing…` state and sent the event-bound POST, but the test then gave the terminal-status locator only its default five seconds while the action was still in flight. The old `afterEach` cleanup could begin while that same request was pending, so the retained trace could not distinguish action latency from persistence or refresh behavior.

## Correction

- Added an exact `waitForCompletionActionResponse()` predicate for the localized Completion pathname, `POST`, a present `Next-Action` header, and the current event ID in request data.
- Awaited that response and the real `[data-complete-tournament]` click together, asserted HTTP 200 before any persistence or terminal-UI assertion, and captured the response status/duration.
- Read the persisted Completion row after the successful response, asserted `status="completed"`, and retained the existing podium, four-award, tied top-assist decision-reason, one audit-entry, and P2028-health checks.
- Asserted `data-completion-status="completed"` in a separate refresh step after persistence.
- Added a helper callback that installs the exact event cleanup handle before authentication/navigation/action. The cleanup hook awaits any outstanding action response (including rejection) before deleting the fixture; helper partial-failure cleanup remains event-and-slug scoped.
- Added named steps for fixture setup, organizer authentication, navigation/readiness, action response, persistence, refresh, and cleanup.
- No production Completion component/action/service/repository code changed.

## TDD evidence

RED contract run, before implementation:

```text
& .\\node_modules\\.bin\\vitest.CMD run tests/competition/completion-action-settlement.static.test.ts
exit 1
1 file / 2 tests failed (about 419ms)
Expected failures: missing event-bound response waiter, cleanup callback, pending-response cleanup guard, and ordered persistence/refresh steps.
```

GREEN contract run, after implementation and post-commit:

```text
& .\\node_modules\\.bin\\vitest.CMD run tests/competition/completion-action-settlement.static.test.ts
exit 0
1 file / 2 tests passed (357ms)
```

## Focused browser evidence

The literal anchored command from the brief was attempted exactly:

```text
pnpm exec playwright test tests/e2e/organizer-v3-completion.spec.ts --config=playwright.ci-default.config.ts --grep "^completes the authoritative single_elimination release format with an audited tied award$" --workers=1 --retries=0
exit 1: No tests found; 0 tests executed.
```

This runner matches the file-qualified title path, consistent with the inherited certificate implementer report. The runner-compatible title-substring command selected only the same single test. Its first execution stopped in fixture setup (one test failed in 278ms) because the deterministic namespace included the format underscore, which the helper correctly rejects. The namespace was normalized to hyphens; no browser action or product code ran on that attempt.

Final focused browser command:

```text
pnpm exec playwright test tests/e2e/organizer-v3-completion.spec.ts --config=playwright.ci-default.config.ts --grep "completes the authoritative single_elimination release format with an audited tied award" --workers=1 --retries=0
exit 0
1 test passed; test body 16.7s; wall time about 1.1m including dev-server startup.
```

The response instrumentation reported:

```text
[completion-action] status=200 durationMs=1471
```

The response was awaited and status-checked first; the direct database read proved persisted `completed` state and all existing podium/award/audit contracts next; only then did the test assert the terminal Completion UI. Cleanup therefore ran after the response had settled. Skips: 0. Playwright retries: 0. Final focused run had no flakes.

## Verification gates

| Gate | Command | Result |
| --- | --- | --- |
| Focused static contract | `& .\\node_modules\\.bin\\vitest.CMD run tests/competition/completion-action-settlement.static.test.ts` | exit 0; 1 file / 2 tests passed; 357ms |
| TypeScript | `& .\\node_modules\\.bin\\tsc.CMD --noEmit` | exit 0; 5.09s |
| Changed-file ESLint | `& .\\node_modules\\.bin\\eslint.CMD tests/e2e/helpers/completion.ts tests/e2e/organizer-v3-completion.spec.ts tests/competition/completion-action-settlement.static.test.ts` | exit 0; 4.12s |
| Diff check | `git diff --check` (working tree) and staged diff check before commit | exit 0; no whitespace errors |

## Changed files

- `tests/e2e/helpers/completion.ts`
- `tests/e2e/organizer-v3-completion.spec.ts`
- `tests/competition/completion-action-settlement.static.test.ts`
- This report (ignored by default and force-added separately).

## Cleanup proof

`prepareCompletionFixture()` invokes `onBaseFixtureReady` after the event-scoped base fixture is created and before the helper returns. The focused spec stores that exact cleanup handle before login/navigation. It tracks the exact response promise and, in `afterEach`, awaits it when still pending before invoking cleanup. The helper catch path retains its event-and-slug `deleteMany`; no global sweep, reset, seed, or cleanup while the action was pending was added.

## Self-review

- The real UI click and real server action remain under test; no direct action/database replacement was used.
- Existing 30-second test deadline, Playwright config, workers, retries, and assertion strengths remain unchanged.
- No timeout inflation, `test.slow()`, retry, sleep, arbitrary polling delay, skip, forced click, seed/reset, full file/profile, auth/security/rate-limit, workflow, or product transaction change was made.
- The response predicate is event-bound and localized, and the response status is asserted before persistence, UI refresh, and cleanup.
- The three protected pre-existing untracked roots were not staged or edited:
  - `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
  - `public/certificates/e2e-completion-single_elimination-release-journey-en/`
  - `public/certificates/e2e-completion-single_elimination-release-journey-id/`
- No production defect was exposed by the response-settled run; no production fix was attempted.
- No push was performed.
