# Runtime certificate publication response settlement

## Scope and baseline

- Branch: `codex/organizer-release-readiness`
- Expected base: `5391d77b4ed5fae1536c609a0be35b6cf78a42ed`
- Scope: test-only runtime settlement for `tests/e2e/organizer-v3-certificates.spec.ts`.
- Product/server code was not changed.

## Root cause and correction

The inherited test clicked the certificate publication control and then proceeded directly to localized feedback, database readback, and `afterEach` fixture cleanup. The publication transaction could commit version 2 / revision 2 while its server-action response was still in flight. Cleanup deletes the fixture event and could therefore contend with the still-active publication transaction, producing the observed deadlock/race.

The correction adds `waitForCertificatePublicationResponse`. Its predicate is deliberately narrow: exact localized organizer certificate pathname for the current `eventId`, `POST`, a present `Next-Action` header, and request data containing the same `eventId`. Each of the three existing publication interactions now starts that exact response wait before clicking, awaits the response together with the click, and requires HTTP 200 before any feedback, database assertions, navigation, or eventual cleanup can run. This closes the cleanup race at the server-action boundary without `response.finished()`, extra timeouts, retries, skips, forced clicks, weakened assertions, or rate-limit changes.

## Inherited diff audit

The inherited uncommitted diff was reviewed against the repository's established action-wait patterns in `tests/e2e/captain-team.spec.ts` and `tests/e2e/v3-organizer-lifecycle.spec.ts`. The final diff:

- imports only the Playwright `Page` type needed by the helper;
- matches the exact locale/path, method, `Next-Action`, and event-bound request data;
- covers the English publication test, Indonesian publication test, and the ID/EN parity publication interaction;
- asserts status `200` before localized feedback, persisted publication count/revision, verification, or cleanup;
- does not use `response.finished()` or alter product/server code.

No concrete defect was found in the inherited implementation, so no further implementation change was made.

## TDD evidence

No new static or behavioral test was authored: the inherited change is itself a test-only correction, and the three existing publication flows are the smallest honest behavioral coverage for this race. Consequently, there is no new RED/GREEN pair to report. The controller's focused runtime verification below supplied the required GREEN evidence for the corrected test flow; the static contract suite also remained green. No product code was touched.

## Verification

All commands ran in the specified isolated worktree. The focused browser proof used the current `.env.test` state and did not reset or seed the database.

| Command | Result | Duration / counts | Exit |
| --- | --- | --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | TypeScript clean | 17.4s | 0 |
| `node node_modules/eslint/bin/eslint.js tests/e2e/organizer-v3-certificates.spec.ts` | Changed-file ESLint clean | 2.7s | 0 |
| `pnpm test -- tests/competition/task11-release-static-contract.test.ts` | 1 file, 39 tests passed | 1.01s (elevated rerun after sandbox `spawn EPERM`) | 0 |
| `git diff --check` | Clean; only LF-to-CRLF working-copy notice | — | 0 |
| `pnpm exec playwright test tests/e2e/organizer-v3-certificates.spec.ts --fail-on-flaky-tests --workers=1` | 5/5 passed; 0 skipped; 0 flaky/retried | 2.2m total; 31.4s, 12.2s, 16.6s, 19.5s, and 930ms by test | 0 |

The first browser CLI probe used an invalid `--project=chromium` name and exited before starting the server or tests; it is not a test result. The valid focused command above was then run once. The only runtime warnings were repeated `NO_COLOR` ignored because `FORCE_COLOR` was set by the web-server processes. There were no database warnings, deadlocks, cleanup races, skips, or flakes.

## Files and commit

Changed task file:

- `tests/e2e/organizer-v3-certificates.spec.ts`

Required report file:

- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/runtime-certificate-publication-response-report.md`

Implementation commit SHA: pending the final task commit.

## Self-review and concerns

Final review found only the intended response-settlement additions and status assertions. The protected untracked accessibility report and both protected certificate artifact directories remained untouched, unstaged, and uncommitted. No production operations, reset, seed, migration, deploy, or push was performed.

Concern: the first invalid project-name probe is an execution-record nuisance only; the valid focused proof passed completely and is the evidence used for this task.
