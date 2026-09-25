# Admin player-stats save/return navigation budget fix implementer report

Date: 2026-09-25 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA: `55acb5e`
Status: `DONE_WITH_CONCERNS`

## Outcome

Implemented the narrow Playwright settlement fix for the saved player-stats
prefill journey. Both run-page navigations now settle at
`waitUntil: "domcontentloaded"`; the existing URL, enabled/form, heading, and
saved-value assertions remain the hydration and product-readiness boundary.
The Save redirect waiter is registered before the real UI click and awaited
with it in `Promise.all`. Its predicate requires `/id/admin`, the exact fixture
`activeEventId` and `matchId`, and `success=player-stats-saved`.

The test timeout remains 30 seconds. No retry, sleep, polling, `test.slow()`,
skip, seed/reset, fixture deletion, assertion weakening, production action, or
repository change was added.

## Root cause and timing evidence

The CI trace retained in the brief showed cumulative budget pressure: the
initial run-page document took **4,347.894 ms**, the matching Save
`Next-Action` POST returned HTTP **303** after **15,603.737 ms**, success RSC
responses took **102.256/301.666 ms**, and the second run-page document returned
HTTP 200 in **663.811 ms**. The second `page.goto` was still waiting for the
default `load` boundary while the UI showed its loading skeleton. The original
Save test also clicked before it registered the URL assertion. The evidence
points to browser settlement and waiter ordering, not a failed write or a slow
route response.

The required pre-change focused run was attempted first. The exact `pnpm exec`
command could not start in this Windows checkout because the package shim did
not resolve the local Playwright binary; its equivalent anchored grep then
selected zero tests because this runner includes the describe title in the
full-title match. The equivalent substring selection ran the unchanged test
once with workers 1 and retries 0 and passed locally, so the historical CI
trace is the RED evidence rather than a locally reproducible failure.

The pre-change trace from that run recorded:

| Boundary | Result |
| --- | ---: |
| Focused test body | 16.3 s; 1 passed |
| Initial run-page document | HTTP 200, 3,517.391 ms |
| Matching Save `Next-Action` POST | HTTP 303, 1,955.761 ms |
| Success RSC response(s) | HTTP 200, 80.106/98.944 ms |
| Return run-page document | HTTP 200, 1,441.446 ms |

Post-change GREEN used the same equivalent substring selection, workers 1,
retries 0, and trace capture:

| Boundary | Result |
| --- | ---: |
| Focused test body | 16.0 s; 1 passed |
| Initial run-page document | HTTP 200, 3,559.248 ms |
| Matching Save `Next-Action` POST | HTTP 303, 1,791.893 ms |
| Success RSC response | HTTP 200, 107.747 ms |
| Return run-page document | HTTP 200, 1,306.154 ms |

The passing GREEN journey retained the real Save click, exact success redirect,
return navigation, visible `Statistik Pemain` heading, hydrated form, and
persisted goal value `7` assertion.

## Gates and durations

| Gate | Result |
| --- | --- |
| Focused browser GREEN | 1 passed; test body 16.0 s; workers 1; retries 0; Playwright run 52.7 s |
| Changed-file ESLint | `node_modules/.bin/eslint.CMD tests/e2e/admin-player-stats.spec.ts` — exit 0; 3.360 s. The exact `pnpm exec eslint ...` form failed before execution because `eslint` was not resolved by the Windows package shim. |
| TypeScript | `node_modules/.bin/tsc.CMD --noEmit` — exit 0; 4.393 s after the sandbox blocked its normal `tsconfig.tsbuildinfo` cache write. No source/config flag was changed. The exact `pnpm exec tsc --noEmit` form likewise failed before execution because `tsc` was not resolved by the shim. |
| Diff check | `git diff --check` — exit 0; only the normal LF/CRLF conversion warning. |

No full Playwright file, full E2E profile, CI rerun, seed, reset, or retry
command was run.

## Self-review and scope proof

- The diff contains only the two document-boundary options, the exact
  pre-armed Save redirect waiter, the `Promise.all` click settlement, and this
  report.
- The exact event/match success URL predicate is stricter than the previous
  substring URL assertion; the existing heading and final input value `7`
  checks are retained.
- No application source, Server Action, repository query, Playwright config,
  workflow, global setup, fixture preparation, timeout, or retry policy was
  changed.
- The three protected pre-existing untracked roots were preserved and were
  not staged or edited:
  - `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
  - `public/certificates/e2e-completion-single_elimination-release-journey-en/`
  - `public/certificates/e2e-completion-single_elimination-release-journey-id/`

## Changed files

- `tests/e2e/admin-player-stats.spec.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/admin-player-stats-budget-implementer-report.md`
