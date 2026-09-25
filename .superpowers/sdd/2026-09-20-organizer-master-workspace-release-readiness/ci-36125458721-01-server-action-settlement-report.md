# CI 36125458721-01 Server Action settlement implementer report

Date: 2026-09-25 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA for this work: `e4b2903`
Review-round commit: `450ca7b`
Review-round status: `DONE_WITH_CONCERNS`; clean-database publish evidence is
deferred to the next CI run, so this local work is not an acceptance pass.

Review-round-2 commit: `572d493`; browser evidence was not rerun by design.
Review round 3: shallow-safe `src` tree invariant pending commit; browser
evidence was not rerun by design.

## Outcome

The five release-readiness observations now use one split Server Action
settlement contract:

- `waitForServerActionResponseHeaders` uses Playwright's timeout-aware
  `page.waitForResponse`, rejects non-POST responses, and delegates exact
  pathname/query matching to the call site.
- `waitForServerActionResponse` checks the selected response status before
  requiring `await response.finished() === null`; this remains the body
  completion boundary for the non-redirect organizer preview.
- `runAndSettleServerActionRedirect` pre-arms the exact response and
  destination URL, checks successful status plus the exact
  `x-action-redirect`, and never calls `response.finished()` for a redirect.
- The destination waiter has an immediate no-op rejection observer so a
  header/status mismatch cannot create a secondary unhandled `page.waitForURL`
  rejection during test teardown.
- The trigger is normalized through a microtask and immediately observed for
  rejection, covering both synchronous throws and rejected trigger promises
  without changing the successful `Promise.all` path.
- The two overnight admin actions, all three public-lifecycle status
  transitions, and both organizer preview locales retain their existing
  product assertions and use exact route/query predicates.

No product source, Server Action, database, seed/reset path, timeout budget,
retry policy, or product assertion was changed.

## Root cause and bounded correction

The corrected trace shows that a redirecting Next Server Action can deliver a
successful HTTP 303 and its exact `x-action-redirect` header while Chromium
records the transport as `net::ERR_ABORTED`. Such a response reaches the
headers boundary but cannot be required to emit `requestfinished` or a clean
`response.finished()` result. The helper therefore observes redirect headers
and the final destination only; body completion is reserved for the
non-redirect registration preview.

During focused verification, a deliberately conflicting publish response
also showed that the pre-armed destination waiter could reject after the
primary exact-header error. The no-op rejection observer handles that pending
promise without hiding the primary failure or changing the successful path.

The review also identified that a rejected trigger could be unhandled while
the exact response waiter was still pending. `Promise.resolve().then(...)`
captures synchronous throws as a promise rejection, and the immediate no-op
catch observes it until the normal `Promise.all` settlement path reports it.

## TDD RED/GREEN evidence

The delegated worktree already contained the main corrected response split when
this bounded follow-up began. The original static command therefore did not
reproduce the superseded `requestfinished` RED: after the sandbox's first
`spawn EPERM` was granted, it was already GREEN at 19:37:19 with 6/6 tests.

For the remaining uncovered behavior, the static contract was extended first
to require the destination rejection observer:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 1; 1 failed, 5 passed (the new observer assertion failed)
Time: 19:43:47
```

After adding the minimal observer to the redirect helper:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 0; 6 passed
Time: 19:44:06
```

Review round 1 added mutation-resistant static assertions for the explicit
preview await, exact request query strings, exact redirect destinations,
forbidden timing/retry constructs, retained localized/database receipts, and
the no-`src/` scope contract. The trigger-observation assertion was written
first and failed against the previous helper:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 1; 1 failed, 6 passed (trigger promise was not normalized/observed)
Time: 19:58:38
```

After the minimal trigger normalization and catch observer:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 0; 7 passed
Time: 19:59:02
```

After adding the final exact public redirect assertion, the unchanged static
contract was rerun:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 0; 7 passed
Time: 20:00:48
```

Review round 2 added three durable contract checks: exact organizer
`requestUrl.search === "?view=import"`, the shared header waiter's absence of
custom timeout options, and a Windows-safe committed-range guard that rejects
any `src/` change in `e4b2903..HEAD`. The organizer equality mutation was
removed temporarily and the contract failed as expected:

```text
Mutation: remove `requestUrl.search === "?view=import"`
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 1; 1 failed, 6 passed
Time: 20:06:39
```

After restoring the exact matcher:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 0; 7 passed
Time: 20:07:05
```

The recorded task-base `src` tree equals the current `HEAD:src` tree; no
product source was edited in this review round.

Review round 3 replaced the history-range guard with the shallow-safe tree
invariant recorded from `git rev-parse e4b2903:src`:
`8ddee33e491bd06435e87546c89a83866b24f990`. The static contract compares that
literal to `git rev-parse HEAD:src`, so it works with the default shallow
`actions/checkout` history and still detects any committed product-source
change.

The expected tree hash was temporarily mutated to all zeroes; the contract
failed as expected:

```text
Mutation: replace the recorded task-base src tree hash with zeroes
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 1; 1 failed, 6 passed
Time: 20:12:41
```

After restoring the recorded tree hash:

```text
Command: pnpm exec vitest run tests/competition/ci-36125458721-server-action-settlement.static.test.ts
Result: exit 0; 7 passed
Time: 20:13:03
```

## Focused browser evidence

The local Windows package shim did not resolve through `pnpm exec` for
Playwright, so the equivalent checked-in `node_modules/.bin/playwright.cmd`
entry point was used. Every command used one worker and zero retries; no seed,
reset, retry, sleep, or timeout override was run. These local results are
diagnostic evidence only; the clean-database publish acceptance result is
deferred to the next CI run.

### Overnight smoke pair

```text
Command: node_modules/.bin/playwright.cmd test tests/e2e/overnight-smoke.spec.ts --config=playwright.ci-default.config.ts --grep "admin can publish, import, enter a result|registration order stays private" --workers=1 --retries=0
Result: 1 passed, 1 failed; 2.0 minutes
```

The registration-order case passed in 1.1 minutes. The publish case selected
the exact `/en/admin?phase=prepare` POST and then failed at the new exact-header
check because the already-prepared shared database had been contaminated by a
prior interrupted run: the real response was
`/en/admin?error=event-publish-conflict;push`, not the expected success
redirect. The case was not rerun and the database was not reset or reseeded;
its clean-database acceptance evidence is explicitly deferred to the next CI
run.

### Organizer release journey locales

```text
Command: node_modules/.bin/playwright.cmd test tests/e2e/v3-organizer-lifecycle.spec.ts --config=playwright.ci-default.config.ts --grep "@task11-release-journey-part-a" --workers=1 --retries=0
Result: 2 passed; 1.9 minutes
```

Both `id` and `en` locales completed their exact preview response-body
settlement, enabled the commit control, and retained their existing localized
and database assertions.

### Permanent public URL lifecycle

```text
Command: node_modules/.bin/playwright.cmd test tests/e2e/v3-public-event-lifecycle.spec.ts --config=playwright.ci-default.config.ts --grep "keeps one permanent URL across registration, drawing, ongoing, and finished" --workers=1 --retries=0
Result: 1 passed; 1.4 minutes
```

The known `NO_COLOR`/`FORCE_COLOR` messages from the managed web server were
non-failing warnings.

## Verification gates

| Gate | Result |
| --- | --- |
| Static settlement contract | exit 0; 7 passed |
| Organizer focused browser cases | exit 0; 2 passed |
| Public lifecycle focused browser case | exit 0; 1 passed |
| Overnight focused pair | 1 passed; publish clean-DB evidence deferred to next CI |
| Changed-file ESLint | exit 0 |
| TypeScript (`--noEmit --incremental false`) | exit 0 |
| `git diff --check` | exit 0; only normal LF/CRLF conversion warnings |

## Scope and protected-root proof

Only these implementation/report paths are intended for the commit:

- `tests/e2e/helpers/server-action.ts`
- `tests/competition/ci-36125458721-server-action-settlement.static.test.ts`
- `tests/e2e/overnight-smoke.spec.ts`
- `tests/e2e/v3-organizer-lifecycle.spec.ts`
- `tests/e2e/v3-public-event-lifecycle.spec.ts`
- this report

The three pre-existing untracked roots remain untracked, untouched, and
unstaged:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

The remaining concern is the contaminated overnight publish precondition. Its
clean-database acceptance result must be revalidated in the next CI run; this
work intentionally does not mutate that database or claim a local acceptance
pass.
