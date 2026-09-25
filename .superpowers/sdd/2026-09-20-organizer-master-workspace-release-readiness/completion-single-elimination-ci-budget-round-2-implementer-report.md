# Completion single-elimination CI budget — round 2 implementer report

Date: 2026-09-25 Asia/Jakarta
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`

## Outcome

Implemented the narrow Completion `single_elimination` CI-budget fix. The
30-second test deadline, `workers=1`, and `retries=0` remain unchanged. The
focused browser case passed with the measured test-body span at **5.400 s**,
below the 24-second target, and the exact completion action response settled
HTTP 200 in **1.236 s**. The body measurement starts at the first executable
line of the Playwright test and ends after the isolated completion context is
closed; the timing attachment itself is explicitly excluded.
The pre-existing parity `test.slow()` remains scoped to that unrelated
localized parity test; the single-elimination describe, timed case, shared
journey, and file-level configuration remain free of timeout/slow/retry
escapes.

The requested retained browser journey is unchanged inside the timed case:
exact event navigation and readiness, tied award selection and reason, real
completion control click, exact event-bound localized POST/Next-Action waiter,
HTTP 200 assertion, direct completion/podium/award/reason/audit persistence
checks, and completed terminal UI verification.

## Root cause and budget evidence

The authoritative CI trace (`36090774024`) showed the test body spending its
budget on safe prerequisites before the action could settle:

| Phase | Before |
| --- | ---: |
| Base fixture creation | 3.118 s |
| Organizer authentication | 4.023 s |
| Completion navigation/readiness | 15.969 s (`page.goto` 15.595 s) |
| Exact action response | 9.166 s (network 9.115 s, HTTP 200) |
| Critical path through response | **32.276 s** |

The action response was successful; the timeout was a test-budget defect.

The implementation creates the uniquely named fixture in a suite hook,
registers exact-scope cleanup immediately after the event row exists, logs in
and prewarms the exact event route in a disposable context, captures its
authenticated storage state, closes that context, and starts the timed case in
a fresh isolated context. The focused local evidence recorded:

| Phase | After |
| --- | ---: |
| Fixture + authentication + exact-route prewarm (outside timed body) | 12.438 s |
| Measured test-body span (first test line → context close; attachment excluded) | **5.400 s** |
| Exact action response | **1.236 s**, HTTP 200 |
| Measured headroom against 30 s | **24.600 s** |

The complete Playwright invocation took 54.9 s wall time because it included
web-server startup/compile and the prerequisite hook; that startup time is not
the test body's deadline budget. Playwright reported the test case itself at
5.5 s including its post-measurement attachment.

## Cleanup ownership

- `prepareCompletionFixture` builds an idempotent exact `{ id, slug }` cleanup
  handle and calls `onBaseFixtureReady` immediately after `event.create`,
  before dependent fixture rows are written.
- The Completion spec owns the handle as soon as it is registered.
- The shared cleanup path awaits the pending exact action response before
  closing the disposable completion context or deleting the fixture.
- The focused suite has an `afterAll` fallback for hook failure; the existing
  `afterEach` path covers test failure and normal completion. The helper's
  idempotent cleanup also covers partial fixture setup failures.
- No global reset/seed, deterministic fixture identity, live page reuse,
  action mock, arbitrary wait, timeout increase, or retry was introduced.

## Files changed

- `tests/e2e/organizer-v3-completion.spec.ts`
- `tests/e2e/helpers/completion.ts`
- `tests/competition/completion-action-settlement.static.test.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/completion-single-elimination-ci-budget-round-2-implementer-report.md`

The protected untracked roots were not touched or staged:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

## TDD and verification evidence

The review-round-3 static contract was first run RED after adding the required
parity-marker assertion: commit `7abc3b3` had removed the pre-existing
`test.slow()` line. After restoring that line, the previous whole-file guard
also failed on the unrelated parity test. The final contract allows only that
scoped marker while using anchored file-level checks; it still rejects
timeout/slow/retry escapes in the single-elimination `describe`, timed case,
shared `runCompletionJourney`, and truly global configuration. It continues to
prove fixture/login/prewarm/storage-state placement in `beforeAll`, and checks
pending-response settlement → context close → fixture cleanup ordering with
exact `{ id, slug }` scope.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/competition/completion-action-settlement.static.test.ts -t "keeps single-elimination prerequisites outside the timed Completion contract"` | The Windows pnpm shim could not resolve the local binary; the equivalent checked-in `node_modules/.bin/vitest.CMD` runner produced round-3 RED for the missing/restored parity marker and the over-broad whole-file guard, then GREEN: **1 passed, 3 skipped**, exit 0, ~0.27 s. |
| `node_modules/.bin/playwright.CMD test tests/e2e/organizer-v3-completion.spec.ts --config=playwright.ci-default.config.ts --grep "completes the authoritative single_elimination release format with an audited tied award" --workers=1 --retries=0` | **1 passed**, exit 0; measured test body 5.400 s from first test line through context close (attachment excluded); action 1.236 s / HTTP 200; 54.9 s wall including startup. |
| `node_modules/.bin/tsc.CMD --noEmit` | exit 0 (elevated only because the repository's incremental build-info write was sandbox-blocked). |
| `node_modules/.bin/eslint.CMD tests/competition/completion-action-settlement.static.test.ts tests/e2e/helpers/completion.ts tests/e2e/organizer-v3-completion.spec.ts` | exit 0; no diagnostics. |
| Focused static contract rerun | exit 0; **1 passed, 3 skipped**. |
| `git diff --check` | exit 0; only normal LF/CRLF conversion warnings. |

Round 3 did not rerun the browser case because the runtime edit only restores
the pre-existing parity-test marker; the target single-elimination path is
unchanged.

No full Playwright file, full E2E profile, CI rerun, seed, or reset command was
run.

## Self-review disposition

The final diff was reviewed against every brief constraint. It contains only
test/helper contract changes and this report; no product code, CI config,
Playwright config, global setup, or database seed/reset path was edited.
