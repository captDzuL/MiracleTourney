# CI 36125458721-02 Seeded competition batch transaction report

Date: 2026-09-25 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA: `07b462c5ffe574659380b378c47f5bee23463f97` (`07b462c`)
Implementation commit: `ab8c10cb6d9dd26dad80050c315a00c79efc95c9` (`ab8c10c`)
Review-round 1 commit: `b86a2172a08f861244a582a468793e993cb662a6` (`b86a217`)
Review-round 2 commit: `f5e0f9add1896c23df3c3244476be392f5ad4f95` (`f5e0f9a`)
Review-round 3 implementation commit: `918ec12`
Status: `DONE_WITH_CONCERNS`; runtime acceptance is deferred to the next
authorized normal CI execution.

## Outcome

`clearEventCompetition` now uses one ordered Prisma array transaction. The 13
foreign-key-safe deletes remain unchanged in order and scope, followed by the
final event update setting `status: "Registration Closed"` and
`publishedScheduleVersion: null`.

The implementation does not add transaction options, retries, sleeps,
parallelism, raw SQL, product/schema changes, or seed/reset behavior changes.
The static guard now targets the exact `runSeed`, `runSeedExpectFailure`, and
unknown phase-less-match preservation contracts. It no longer hashes the
entire remainder of the E2E spec, so unrelated legitimate fixture/test edits
do not require updating an opaque digest.

## TDD RED/GREEN evidence

The mutation-resistant static contract was added before changing the fixture.
The local `pnpm exec vitest run ...` shim did not resolve bare `vitest`, so the
checked-in local executable was invoked through the equivalent
`pnpm exec -- .\\node_modules\\.bin\\vitest.cmd` entry point. Vitest config
startup also required the approved elevated local runtime because sandboxed
esbuild process creation returned `spawn EPERM`.

### RED

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 1; 1 failed, 5 passed; 1 file, 6 tests
Failure: clearEventCompetition still used prisma.$transaction(async (tx) => ...)
Duration: 444 ms
```

### GREEN

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 0; 1 file, 6/6 tests passed
Duration: 542 ms (final fresh verification; an earlier GREEN run was 850 ms)
```

The static contract parses every top-level array entry independent of
indentation or outer wrapping parentheses, recognizes each
`prisma.<model>.<method>(...)` entry, asserts exactly 14 entries, then checks
their exact sequence, all delete scopes, and the final event data. The parser
tracks nested delimiters, quoted strings, and escapes while splitting the
transaction array. It rejects phase-before-groups, early event update,
removed scope, an extra valid `updateMany` operation even when indented or
parenthesized differently, timeout, `maxWait`, `Promise.all`, and raw-SQL
mutations. It also fingerprints the non-cleanup fixture surface, protecting
the seed helpers, setup, and test assertions.

### Review-round 1 RED/GREEN

The review mutation inserted a valid top-level `prisma.event.updateMany(...)`.
Before broadening the parser, the mutation was invisible and the new test
failed as intended:

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 1; 1 failed, 6 passed; 1 file, 7 tests
Failure: the previous deleteMany/update-only parser did not reject the extra updateMany entry
Duration: 630 ms
```

After matching every top-level Prisma method and asserting the exact count:

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 0; 1 file, 7/7 tests passed
Duration: 665 ms
```

### Review-round 2 RED/GREEN

Two formatting mutations were added: an extra valid `updateMany` entry with
arbitrary indentation, and the same entry wrapped in outer parentheses. The
six-space line-anchored parser missed both mutations, producing the intended
RED:

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 1; 2 failed, 7 passed; 1 file, 9 tests
Failures: changed-indentation and parenthesized extra-operation mutations were not rejected
Duration: 596 ms
```

The parser was then replaced with a delimiter-aware top-level array splitter
that accepts arbitrary indentation and strips complete outer parentheses before
matching each Prisma operation:

```text
Command: pnpm exec -- .\\node_modules\\.bin\\vitest.cmd run tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
Result: exit 0; 1 file, 9/9 tests passed
Duration: 440 ms
```

### Review-round 3 targeted-contract supersession

The earlier whole-file external-surface SHA-256 fingerprint is superseded. It
froze unrelated fixture and test content and failed only because source bytes
changed, not because the seeded behavior regressed. The replacement assertions
isolate and protect:

- both helpers' exact cross-platform `pnpm db:seed` invocation and spawn
  options;
- `runSeed`'s successful-exit assertion and failure diagnostic;
- `runSeedExpectFailure` returning the raw failed process result;
- installation of the unknown phase-less match before the seed attempt;
- the non-zero result and exact refusal-message assertion;
- identical before/after selected match fields and cleanup only after equality.

Negative mutations prove that reversed success semantics, removal of the raw
failure return, acceptance of exit zero, weakening full before/after equality,
and deletion before the post-failure read are rejected.

```text
Command: pnpm exec -- .\node_modules\.bin\vitest.cmd run tests/competition/ci-36125458721-server-action-settlement.static.test.ts tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts
RED: exit 1 only for the newly added redirect-concurrency contract; all 12 seeded assertions passed
GREEN after helper fix: exit 0; 2 files, 19/19 assertions passed
```

## Verification gates

| Check | Result |
| --- | --- |
| Initial focused static contract | exit 0; 1 file, 6/6 tests; 542 ms |
| Changed-file ESLint | exit 0; `public-v3-seeded-events.spec.ts` and the new static contract |
| TypeScript | exit 0; `--noEmit --incremental false` |
| `git diff --check` | exit 0; normal LF/CRLF normalization warning only |
| Review-round static contract | exit 0; 1 file, 7/7 tests; 665 ms |
| Review-round 2 static contract | exit 0; 1 file, 9/9 tests; 440 ms |
| Review-round 3 focused static contracts | exit 0; 2 files, 19/19 tests |
| Review-round 3 changed-file ESLint | exit 0 |
| Review-round 3 TypeScript | exit 0; `--noEmit --incremental false` |
| Playwright / seed / reset | Not run, per brief; runtime evidence is deferred to normal CI |

## Changed files

- `tests/e2e/public-v3-seeded-events.spec.ts`
- `tests/competition/ci-36125458721-seeded-competition-transaction.static.test.ts`

## Scope and protected-root proof

The implementation and initial static contract were committed in `ab8c10c`;
the first review-round static guard was committed in `b86a217`, the
formatting-resilient parser was committed in `f5e0f9a`, and the targeted
contract replacement was committed in `918ec12`. This phase-02 report is now
deliberately force-added as a tracked branch artifact; the final handoff records
the separate artifact commit SHA.

These pre-existing untracked roots remain untracked, untouched, and unstaged:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

No Playwright acceptance claim is made locally; the next authorized normal CI
run must provide runtime confirmation.
