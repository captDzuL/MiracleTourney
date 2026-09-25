# Match Day CI fix implementer report

Date: 2026-09-25 (Asia/Jakarta)
Status: `DONE`

## Scope and outage recovery

The implementation under review is commit `0471b69941073e104b9aeff42e8bc4573f564883` (`test: isolate Match Day public privacy checks`), whose parent is `e76ce6ede79c0ca0321942ae5ec65aa85a33eaa5`. The commit survived the power outage intact: it was present at the expected head when recovery began, and the tracked worktree contained no implementation edits. The implementation commit changes only `tests/e2e/v3-matchday.spec.ts` (91 insertions, 10 deletions); `tests/e2e/helpers/matchday.ts` and production code are unchanged.

The required focused tests and gates were rerun in the existing isolated worktree at `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`. No implementation change was needed after the outage.

## Root cause and RED evidence

The diagnosis remains `DIAGNOSED_TEST_DEFECT`, with no evidence of a production defect. The prior failed CI run was GitHub Actions run `36016276736`, E2E job `107690039563`. The old final Match Day test coupled announcement filtering, mobile overflow, live-match state, result correction, readiness transitions, timing mutation, and schedule privacy to `prepareMatchdayFixture("round_robin", "showcase")`. On the remote-Neon CI runner, that serialized setup consumed the Playwright 120-second test budget before the first test-body browser action.

The retained RED trace evidence is:

| Attempt | Setup elapsed before first test-body browser action | Result |
| --- | ---: | --- |
| Initial | ~116.28s | Context closed at ~120.01s |
| Retry 1 | ~119.59s | Context closed before navigation settled |
| Retry 2 | ~119.74s | Context closed before navigation settled |

All three attempts exhausted the budget and surfaced a browser session-closed symptom. The retained page snapshots nevertheless showed the expected active announcement and the absence of the expired and draft announcements. The schedule assertion in the old test was also vacuous: it checked for the unrelated correction reason `Verified desk correction` instead of asserting that an unpublished-only schedule is `null`.

## GREEN focused-test evidence

The command below was run exactly twice with the repository-local Windows Playwright executable, one worker, and retries disabled. It selects only the two required focused titles:

```text
& '.\node_modules\.bin\playwright.CMD' test tests/e2e/v3-matchday.spec.ts --grep 'public ongoing API hides an unpublished schedule and private draft data|public ongoing shows only active announcements and has no mobile overflow' --workers=1 --retries=0
```

### Focused run 1

- Exit: `0`
- Workers: `1`
- Retries: `0`
- Result: `2 passed` / `2` executed
- Skips: `0`
- Flakes/retries: `0`
- `public ongoing API hides an unpublished schedule and private draft data`: passed in `3.7s`
- `public ongoing shows only active announcements and has no mobile overflow`: passed in `5.1s`
- Playwright summary: `2 passed (1.1m)`

### Focused run 2

- Exit: `0`
- Workers: `1`
- Retries: `0`
- Result: `2 passed` / `2` executed
- Skips: `0`
- Flakes/retries: `0`
- `public ongoing API hides an unpublished schedule and private draft data`: passed in `2.8s`
- `public ongoing shows only active announcements and has no mobile overflow`: passed in `4.4s`
- Playwright summary: `2 passed (45.0s)`

The first unprivileged harness invocation exited `1` before Playwright startup because the sandbox denied creation of the ignored `test-results` directory (`spawn EPERM`). It executed no test and no fixture setup. The two recorded runs above used the same direct local executable and completed after the required isolated-worktree filesystem authorization; this is an execution-environment note, not a test or implementation failure.

The API contract test creates a four-team `single_elimination` graph, saves an unpublished schedule with a unique private room sentinel, uses Playwright's standalone `request` fixture, checks successful HTTP and JSON responses with bounded diagnostic bodies, asserts `schedule === null`, null draft match timing/room values, and absence of the sentinel/private keys. The mobile contract test creates only the active published urgent, expired published, and unpublished draft announcements, then verifies the four required 390x844 public-page assertions through checked navigation and named steps.

## Required local gates

All gates exited `0`:

| Command | Exit | Duration |
| --- | ---: | ---: |
| `tsc --noEmit --incremental false` | `0` | `19,737ms` |
| `eslint tests/e2e/v3-matchday.spec.ts` | `0` | `4,263ms` |
| `git diff --check e76ce6e..0471b69` | `0` | `87ms` |

The ESLint invocation intentionally names only `tests/e2e/v3-matchday.spec.ts` because the helper file is unchanged. The required working-tree `git diff --check` was also run and exited `0` before the explicit base-to-commit check above.

## Self-review findings

- `e76ce6e..0471b69` contains exactly one file: `tests/e2e/v3-matchday.spec.ts`.
- The old `showcase`-based combined public test was removed and replaced by the two focused contracts required by the brief.
- No production code, helper code, Playwright/CI timeout, retry setting, global setup, seed/reset script, workflow resource, or unrelated test was changed.
- No sleep, `test.slow()`, timeout increase, skip, flaky allowance, or forced interaction was added to either focused test.
- The checked navigation helper includes method/path, status, status text, and bounded response-body diagnostics for non-2xx responses. The API path includes content type and a bounded body for malformed JSON.
- No assertion was weakened during recovery.

## Workspace preservation and prohibited actions

The following pre-existing untracked roots were observed before and after verification and were not edited, removed, staged, or committed:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

No database reset or seed command was run. No full Match Day file, full E2E profile, or full CI replay was run. The Playwright global setup performed only its configured read-only route prewarm; fixture setup/cleanup was per-test and uniquely namespaced. No production action or push occurred. No protected root was touched.

## Commits

- Implementation commit surviving the outage: `0471b69941073e104b9aeff42e8bc4573f564883` (`test: isolate Match Day public privacy checks`)
- Evidence report: this file, to be committed separately with message `docs: record Match Day CI fix evidence`.

## Concerns

No implementation or product concerns remain. The only recovery note is the initial sandbox `EPERM` while Playwright attempted to create its ignored output directory; the required runs passed after isolated-worktree filesystem access was authorized.
