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

## Review round 1 evidence (base `67b41f1`)

### RED

The review-focused tests were run before the corrections:

```text
.\\node_modules\\.bin\\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/operations.test.ts src/lib/tournament/operations/observability.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot
Result: 4 files failed; 7 tests failed and 84 passed.
```

The expected failures covered Save-drawing diagnostic ordering, parser
ambiguity/non-result handling, explicit action-result/component contracts,
unknown error-message collisions, P2028 evidence gating, and terminal events
for exhausted P2034 retries.

### GREEN

```text
.\\node_modules\\.bin\\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/operations.test.ts src/lib/tournament/operations/observability.test.ts src/lib/observability/logger.test.ts tests/competition/ci-36125458721-server-action-settlement.static.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot
Result: 6 files passed; 117 tests passed.

.\\node_modules\\.bin\\tsc.cmd --noEmit --incremental false
Result: passed.

.\\node_modules\\.bin\\eslint.cmd <changed implementation and focused test paths>
Result: passed.

git diff --check
Result: passed.
```

### Review corrections

- Ordered the browser diagnostic guard and safe `code`/`correlationId` message
  before the saved assertion and database poll; the static mutation test now
  fails if that order regresses.
- Added explicit `CompetitionExpectedError` domain types and an exported
  `CompetitionMutationActionResult` union. Unknown/storage errors, including
  messages containing `unavailable`, `conflict`, or `stale`, use only the safe
  classifier and correlation ID; existing authorization/conflict semantics and
  user-facing messages remain unchanged.
- Added a safe retry terminal event for every `P2034` attempt, including the
  exhausted final attempt, with `serialization_conflict`; retry count and
  transaction behavior are unchanged.
- Replaced the test-only hard-coded response parser with the exported
  `parseServerActionResult`, covering framed React Flight result bodies,
  multiple/ambiguous frames, malformed frames, and non-result bodies.
- Removed the local failed-result assertion/model from
  `AnnouncementsWorkspace`; transport failures now settle as `undefined` while
  the shared action-result union models real server results.
- Classified `P2028` as `transaction_timeout` only with timeout-shaped
  metadata/message evidence; unrelated P2028 values fall back to
  `internal_error`.

### Invariants and scope

The review changes preserve authorization, CAS/conflict handling, atomicity,
transaction options, the existing six-attempt retry policy, payload shape, and
product behavior. No browser, live database, seed/reset, timeout increase, or
retry broadening was used. The review implementation commit is `346d577`; the
protected untracked roots above remain untouched and unstaged.

## Review round 2 evidence (base `8b5e01e`)

### RED

The three review-2 regression tests were added before the production changes
and run against the round-1 implementation:

```text
.\\node_modules\\.bin\\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/observability.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot
Result: 3 files failed; 5 tests failed and 27 passed.
```

The failures reproduced the exhausted `P2034` action result becoming
`failed/internal_error` with a correlation ID, closed/committed `P2028`
messages being mislabeled as timeouts, and hexadecimal React Flight frames
being ignored.

### GREEN

```text
.\\node_modules\\.bin\\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/observability.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot
Result: 3 files passed; 32 tests passed.

.\\node_modules\\.bin\\vitest.cmd run src/lib/actions/competition-v3-actions.test.ts src/lib/tournament/operations/operations.test.ts src/lib/tournament/operations/observability.test.ts src/lib/observability/logger.test.ts tests/competition/ci-36125458721-server-action-settlement.static.test.ts tests/competition/ci-36147449749-drawing-action.static.test.ts --reporter=dot --silent
Result: 6 files passed; 121 tests passed.

.\\node_modules\\.bin\\tsc.cmd --noEmit --incremental false
Result: passed.

.\\node_modules\\.bin\\eslint.cmd <round-2 changed implementation and focused test paths>
Result: passed.

git diff --check
Result: passed.
```

### Review corrections

- Added an explicit `P2034` code classifier shared by the operation retry
  boundary and action boundary. Exhaustion now remains public
  `{ status: "conflict" }`, with no `internal_error`, correlation ID, or raw
  provider data in the action result; stage logs retain only
  `serialization_conflict`. Action tests cover exhaustion and messages that
  contain unavailable/conflict/stale words.
- Removed `already closed` as standalone timeout evidence. `P2028` now needs
  explicit timeout, timed-out, expired, or given-time evidence; closed and
  committed transaction messages remain `internal_error`.
- React Flight frame parsing now accepts hexadecimal IDs, case-insensitively,
  with executable lower- and upper-case saved/failed result tests. Existing
  malformed and ambiguous-frame rejection remains unchanged.

### Invariants and scope

The review-2 changes preserve the public conflict/authorization semantics,
atomic transaction, six-attempt retry count, transaction options, payload
shape, safe logging, and product behavior. No browser, live database,
seed/reset, timeout increase, or retry broadening was used. The review-2
implementation commit is `9c1c91f`; protected untracked roots remain untouched
and unstaged.

## Whole-delta review round 4 correction

Commit `ba7b87ca616266ef459e5ed0a0aba0372100545f` corrects terminal transaction
observability for domain failures. A `CompetitionExpectedError` with code
`conflict` now emits terminal `errorCode: "conflict"`, and code `unauthorized`
emits terminal `errorCode: "unauthorized"`; neither is mislabeled as
`internal_error`. Other expected-error codes and unknown/storage failures keep
the `internal_error` fallback, while timeout and `P2034` classification remain
unchanged.

Focused classifier and transaction tests prove both domain categories, one
transaction attempt, `terminal: "failed"`, no retry, and unchanged rollback.
The focused three-file run passed 87/87 tests, and the expanded A/B/C
regression run passed 140/140 tests. TypeScript, changed-file ESLint, and
`git diff --check` exited 0. No browser, database, seed, reset, timeout, or
retry behavior was exercised or changed.
