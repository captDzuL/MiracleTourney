# CI 36147449749-A drawing-action observability implementer report

Date: 2026-09-26 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA: `f4c54458c8c25c1a2273f4f6d1b98cd5bd86545b`
Implementation SHA: `36a0bb1`

## Outcome

Brief A is implemented as a bounded observability and action-settlement change.
The 24-team drawing path now emits safe, structured stage timing/count events
through the existing logger, while the action returns only the discriminated
`transaction_timeout` or `internal_error` code and the same request/correlation
ID. Raw Prisma messages, payloads, URLs, credentials, and stack traces are not
returned or logged.

The overnight Save drawing check now settles the exact completed POST response,
asserts `{status: "saved"}`, and reports the safe code/correlation ID before
polling the database. The exact matcher requires POST, the event competition
pathname, a `next-action` header, the event ID, and the `drawing_save` command.

## TDD evidence

### RED

The focused action/logger/operation tests were written first and run against
the pre-change implementation. The command produced four expected failures:

```text
.\node_modules\.bin\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/operations.test.ts src/lib/observability/logger.test.ts
Result: expected RED; action timeout/internal-error result contract, logger safe timeout code, and operation stage contract were missing.
```

The RED fixtures used the exact 24-team single-elimination drawing payload and a
deterministic test-store write failure; no browser, live database, seed, reset,
sleep, or transaction-timeout increase was used.

### GREEN

```text
.\node_modules\.bin\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/operations.test.ts src/lib/observability/logger.test.ts tests/competition/ci-36125458721-server-action-settlement.static.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot
Result: 5 files passed; 105 tests passed.

.\node_modules\.bin\tsc.cmd --noEmit
Result: passed.

.\node_modules\.bin\eslint.cmd src/lib/actions/competition-v3-actions.ts src/lib/actions/competition-v3-actions.test.ts src/lib/observability/logger.ts src/lib/observability/logger.test.ts src/lib/tournament/operations/index.ts src/lib/tournament/operations/commands.ts src/lib/tournament/operations/observability.ts src/lib/tournament/operations/operations.test.ts src/lib/tournament/operations/test-store.ts src/components/v3/organizer/AnnouncementsWorkspace.tsx tests/e2e/helpers/server-action.ts tests/e2e/overnight-smoke.spec.ts
Result: passed.

git diff --check
Result: passed; only normal LF/CRLF conversion warnings.
```

The new static contract verifies completed response-body parsing, exact Save
drawing request matching, safe result assertion, and that the database poll is
ordered after action settlement.

## Bounded implementation and preserved behavior

- Added a narrow failure classifier for `P2028`/transaction-timeout-shaped
  errors and an `internal_error` fallback. Conflict and authorization results
  remain `conflict` and `unauthorized`.
- Propagated the existing server-action request ID into operation logs and the
  returned safe failure result; logger allowlisting and count sanitization keep
  logs bounded and non-sensitive.
- Added stage events for transaction, drawing mutability/cleanup, roster,
  graph, phases, groups, matches, dependencies, event update, and audit,
  including aggregate counts and elapsed milliseconds only.
- Kept one atomic interactive transaction, Serializable isolation, `maxWait:
  5000`, `timeout: 20000`, the existing six-attempt `P2034` retry policy,
  authorization/CAS checks, idempotency, and drawing payload/product behavior.
- Added only a test-store failure seam to prove rollback; failed 24-team match
  persistence leaves the event version, phases, matches, dependencies, and
  audit rows unchanged.
- No live browser test, database query/mutation, fixture seed/reset, CI rerun,
  timeout increase, or retry broadening was performed.

## Scope and protected roots

Changed implementation/test paths are limited to the competition action/logger,
operation observability and drawing persistence, the existing E2E response
helper/spec, the focused tests, and this report. The following pre-existing
untracked protected roots were inspected and left untouched and unstaged:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`
