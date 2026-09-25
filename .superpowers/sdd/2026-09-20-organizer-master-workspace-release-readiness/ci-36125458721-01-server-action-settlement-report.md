# CI 36125458721-01 Server Action settlement implementer report

Date: 2026-09-25 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA for this work: `e4b2903`
Status: `DONE_WITH_CONCERNS`

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
- The two overnight admin actions, all three public-lifecycle status
  transitions, and both organizer preview locales retain their existing
  product assertions and use exact route/query predicates.

No product source, Server Action, database, seed/reset path, timeout budget,
retry policy, or assertion was changed.

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

## Focused browser evidence

The local Windows package shim did not resolve through `pnpm exec` for
Playwright, so the equivalent checked-in `node_modules/.bin/playwright.cmd`
entry point was used. Every command used one worker and zero retries; no seed,
reset, retry, sleep, or timeout override was run.

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
redirect. The case was not rerun and the database was not reset or reseeded.

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
| Static settlement contract | exit 0; 6 passed |
| Organizer focused browser cases | exit 0; 2 passed |
| Public lifecycle focused browser case | exit 0; 1 passed |
| Overnight focused pair | 1 passed; 1 contaminated-database failure |
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

The remaining concern is limited to the contaminated overnight publish
precondition. It must be revalidated only in a clean already-prepared CI
database; this work intentionally does not mutate that database to manufacture
a pass.
