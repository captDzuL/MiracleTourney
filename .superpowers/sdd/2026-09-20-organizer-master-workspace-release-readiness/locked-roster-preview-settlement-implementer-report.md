# Locked-roster preview settlement implementer report

Date: 2026-09-25 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA for review round: `c438fc1`
Status: `DONE_WITH_CONCERNS`

## Outcome

The locked-roster CSV preview case now pre-arms an exact registration-preview
URL waiter and a Playwright-managed `requestfinished` waiter before the real
Preview click. The response predicate requires HTTP 200, GET, `/en/admin`,
`phase=registration`, the locked `activeEventId`, a non-empty
`registrationBatchId`, `success=registration-preview-ready`, and either the RSC
request header or document resource type. The completed request is converted to
its response, and the existing `response.finished()` null assertion remains
before the unchanged locked-roster message assertion.

The review correction replaces the custom unresolved `new Promise<Response>` and
raw `page.on("requestfinished")` listener with
`page.waitForEvent("requestfinished", { predicate })`. Playwright therefore
owns the event waiter lifecycle and its configured timeout/cleanup behavior if
the companion URL waiter or click fails. No custom timeout or retry was added.

## Root cause and review evidence

The first implementation used a manually resolved Promise around a raw
`requestfinished` listener. If the URL navigation or click failed, that Promise
had no rejection path and the listener was not removed by Playwright’s waiter
machinery. The reviewer’s requested correction is technically applicable: the
same exact response predicate can be expressed with Playwright’s timeout-aware
event waiter without weakening the body-completion boundary.

The earlier diagnostic trace also showed why the body-complete event matters.
The preview redirect produced two matching HTTP 200 RSC GETs with the same
exact registration-preview query: an early `fetch` response ended with
`net::ERR_ABORTED`, while the later `fetch` response completed with a 325,103
byte text/x-component body. The managed `requestfinished` predicate ignores
the aborted response and resolves only for the completed request. The final
focused browser run passed with the unchanged 30-second test budget.

## TDD RED/GREEN evidence

The original implementation RED was captured before the first implementation
commit. The focused static contract failed because the locked-roster case had
no exact route/response settlement boundary:

```text
Command: .\node_modules\.bin\vitest.cmd run tests/competition/admin-event-management-settlement.static.test.ts -t "pre-arms the exact locked-roster preview payload before click"
Result: exit 1; 1 test failed
Duration: 370 ms (Vitest)
Failure: expected the locked case to contain the exact /en/admin registration-preview route predicate
```

After the custom listener implementation, the review contract was changed
first to require the Playwright-managed waiter. That review-round RED was
captured before changing the E2E source:

```text
Command: .\node_modules\.bin\vitest.cmd run tests/competition/admin-event-management-settlement.static.test.ts -t "uses Playwright's timeout-aware requestfinished waiter"
Result: exit 1; 1 failed, 1 skipped
Duration: 285 ms (Vitest)
Failure: expected page.waitForEvent("requestfinished"), but found the custom new Promise<Response>/page.on listener
```

The final focused static contract is GREEN:

```text
Command: .\node_modules\.bin\vitest.cmd run tests/competition/admin-event-management-settlement.static.test.ts
Result: exit 0; 1 test file passed, 2 tests passed
Duration: 367 ms (Vitest)
```

## Focused browser evidence

The exact requested browser selection was run with the local Playwright binary
because this Windows checkout’s `pnpm exec` shim did not resolve local package
binaries. The equivalent command selected the same single test:

```text
Command: .\node_modules\.bin\playwright.cmd test tests/e2e/admin-event-management.spec.ts --config=playwright.ci-default.config.ts --grep "admin sees error when importing CSV after bracket is locked" --workers=1 --retries=0
Result: exit 0; 1 passed; no retries
Test body: 16.7 s
Playwright process: 53.5 s
```

The completed response was selected from the real file-upload/Server Action
journey, with an RSC `fetch` response at HTTP 200 and the exact
`registration-preview-ready` query. `await settlementResponse.finished()`
resolved to `null`; the existing locked-roster UI message assertion then
passed. The repeated web-server `NO_COLOR`/`FORCE_COLOR` warnings were
non-failing environment warnings.

## Verification gates

| Gate | Result |
| --- | --- |
| Focused static contract | `node_modules/.bin/vitest.cmd ...` — exit 0; 2 passed; 367 ms |
| Focused browser | `node_modules/.bin/playwright.cmd ...` — exit 0; 1 passed; 16.7 s body; 53.5 s process; workers 1; retries 0 |
| Changed-file ESLint | `node_modules/.bin/eslint.cmd tests/e2e/admin-event-management.spec.ts tests/competition/admin-event-management-settlement.static.test.ts` — exit 0; 3,035 ms |
| TypeScript | `node_modules/.bin/tsc.cmd --noEmit --incremental false` — exit 0; 17,699 ms |
| Diff check | `git diff --check` — exit 0; 112 ms; only normal LF/CRLF conversion warnings |

The TypeScript verification used `--incremental false` because the ordinary
incremental check attempts to rewrite the existing `tsconfig.tsbuildinfo` in
this managed worktree and is blocked by filesystem permissions. No project
configuration or source cache was changed.

No full Playwright file, full E2E profile, CI rerun, seed/reset, retry, or push
was run.

## Scope and protected-root proof

- Product source, Server Actions, database code, fixtures, Playwright config,
  workflow files, timeout budgets, retry policy, skip behavior, and assertions
  outside the unchanged locked-roster message were not modified.
- The staged implementation scope is limited to the locked-roster E2E case, its
  static source contract, and this report.
- These pre-existing untracked roots remain untracked, untouched, and unstaged:
  - `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
  - `public/certificates/e2e-completion-single_elimination-release-journey-en/`
  - `public/certificates/e2e-completion-single_elimination-release-journey-id/`

## Changed files

- `tests/e2e/admin-event-management.spec.ts`
- `tests/competition/admin-event-management-settlement.static.test.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/locked-roster-preview-settlement-implementer-report.md`

## Concerns

1. The brief’s `pnpm exec` forms are not executable in this Windows checkout
   because the package shim does not resolve the local binaries. All focused
   commands were run through the corresponding local `node_modules/.bin/*.cmd`
   entry points.
2. `.superpowers/` is ignored by the repository defaults, so this report must
   be explicitly force-staged for the requested SDD artifact commit.
