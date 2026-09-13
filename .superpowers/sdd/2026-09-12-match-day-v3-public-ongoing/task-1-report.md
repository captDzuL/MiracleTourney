# Task 1 — Competition operations persistence foundation

## Files changed

- `prisma/schema.prisma`
  - Added bounded enums for phase, schedule, readiness, action priority, announcement, schedule-revision, and dependency-slot states.
  - Added competition phases/groups/members, match dependencies/readiness/result revisions, action items, incidents, audit logs, schedule revisions, and announcements.
  - Extended `Event`, `Team`, `User`, and `Match` relations without removing legacy fields. `Match.scheduledLabel` remains unchanged.
  - Added nullable/defaulted structured schedule and result fields, plus required unique constraints and indexes.
- `prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql`
  - One additive PostgreSQL migration for the schema foundation.
- `src/lib/competition/persistence-schema.test.ts`
  - Prisma DMMF contract coverage and additive-migration assertions.
- `docs/superpowers/plans/2026-09-12-match-day-v3-public-ongoing.md`
  - Tracked Task 1 implementation plan.

## Red / green evidence

Red was recorded before schema implementation:

```text
pnpm vitest run src/lib/competition/persistence-schema.test.ts -t "competition operations persistence Prisma contract"
3 failed, 1 skipped
expected undefined to deeply equal [ 'draft', 'active', 'completed' ]
missing Prisma model MatchDependency
missing Prisma model CompetitionPhase
```

After the additive schema and migration were implemented, the focused contract suite passed:

```text
pnpm vitest run src/lib/competition/persistence-schema.test.ts
1 passed file; 4 passed tests
```

## Commands and results

- `pnpm prisma validate` — passed. The clean worktree has no `.env`, so local placeholder PostgreSQL URLs were supplied only for validation; no database connection was made.
- `pnpm prisma generate` — passed; Prisma Client generated successfully.
- `pnpm vitest run src/lib/competition/persistence-schema.test.ts` — passed (4 tests).
- `pnpm lint` — passed (`tsc --noEmit`).
- `git diff --check` — passed.

## Commit

Implementation commit: `38f1ef00a843865ccd1b2c8f023cb76199a9881a` (`feat: add competition operations persistence foundation`).

## Self-review

- Verified every required bounded state is represented by a Prisma enum using the required lowercase values.
- Verified dependency slots constrain each target match slot to one source outcome.
- Verified readiness, result-revision version/idempotency, action-condition, and schedule-revision version/idempotency constraints are present.
- Verified schedule revisions store a versioned JSON snapshot and draft/published state.
- Verified the migration is additive and preserves legacy event/match fields, including `scheduledLabel`.

## Concerns

- Result-revision immutability and strictly increasing version allocation are enforced by the append-only model and unique constraint; transactional sequencing and correction guards are intentionally deferred to Task 5.
- The migration has not been applied to a live database in this task; Prisma validation/generation and the schema contract test passed without requiring database credentials.


## Review remediation — round 1

### Findings addressed

- Result revisions now require a non-null actor and reason. Their actor foreign key uses RESTRICT, and a PostgreSQL trigger rejects updates/deletes and rejects non-sequential inserts. The trigger serializes same-match inserts with an advisory transaction lock before calculating the required next version.
- Event-scoped composite unique keys and foreign keys now bind every redundant ownership pair to its parent event. This covers match phase/group links, group phase/member/team links, dependencies, readiness, result revisions, action items, incidents, and audit logs.
- Composite referenced keys are created before their foreign keys. Composite delete policies use RESTRICT where nulling the required event half would be invalid.
- Contract coverage now asserts both idempotency indexes, preserves the legacy Match round/slot uniqueness, and protects the existing optional-relation delete policies.

### Red / green evidence

Red before the fix:

    pnpm vitest run src/lib/competition/persistence-schema.test.ts -t "result-revision persistence hardening|competition ownership integrity"
    2 failed: actorUserId was optional; composite event/entity foreign keys were absent.

A second red cycle caught the required ordering for referenced composite keys, and a third caught invalid SET NULL behavior for composite foreign keys with required eventId. A focused legacy compatibility regression also failed after an accidental broad replacement and then passed after its narrow restoration.

Green after the fix:

    pnpm prisma validate           # passed
    pnpm prisma generate           # passed
    pnpm vitest run src/lib/competition/persistence-schema.test.ts  # 10 passed
    pnpm lint                      # passed (tsc --noEmit)
    git diff --check               # passed

### Commits

- 38f1ef00a843865ccd1b2c8f023cb76199a9881a — initial persistence foundation.
- 7469db5 — original verification report.
- 8f0b126df82e0c0f5394318a0b6f259fd8bae3d1 — review remediation: integrity hardening.

### Remaining concern

The migration still has not been applied against a live PostgreSQL instance in this worktree. Its trigger and composite-FK contracts are validated structurally by focused tests and Prisma validation/generation; deployment should exercise it against the target PostgreSQL version before release.


## Review remediation — round 2

### Findings addressed

- MatchResultRevision.winnerTeamId now has an optional Team relation scoped by eventId and winnerTeamId, with a composite database foreign key. A winner therefore cannot reference a team from another event.
- Prisma relation declarations now match the deployed composite foreign keys. Every event-scoped Match, Team, Phase, and Group relation uses fields [eventId, entityId] and references [eventId, id]. DMMF contract tests verify the generated relation metadata, preventing a future Prisma migration from silently returning to single-column constraints.
- The append-only result trigger now distinguishes direct history deletion from referential cleanup. Direct revision DELETE runs at normal trigger depth while its Match remains and raises the append-only exception. A foreign-key cascade runs at nested trigger depth, or after the parent Match is gone, and returns OLD so Match/Event cascading deletion can complete. UPDATE remains rejected; INSERT remains advisory-lock serialized and sequential.

### Red / green evidence

Red before implementation:

    pnpm vitest run src/lib/competition/persistence-schema.test.ts -t "event-scoped relation metadata|result-revision cascade durability"
    3 failed: relations exposed only single-column metadata, winnerTeam was absent, and the trigger lacked cascade handling.

Green after implementation:

    pnpm prisma validate           # passed
    pnpm prisma generate           # passed
    pnpm vitest run src/lib/competition/persistence-schema.test.ts  # 13 passed
    pnpm lint                      # passed (tsc --noEmit)
    git diff --check               # passed

### Commits

- 38f1ef00a843865ccd1b2c8f023cb76199a9881a — initial persistence foundation.
- 7469db5 — original verification report.
- 8f0b126df82e0c0f5394318a0b6f259fd8bae3d1 — first integrity remediation.
- e463bec — first remediation report.
- a713b7ad2b8f7aedaf3892ab2c0106d1cea6032f — composite relation, winner, and cascade remediation.

### Remaining concern

The reviewed migration is structurally validated but has not been executed against a live PostgreSQL instance in this credential-less worktree. Deployment should verify trigger-depth cascade behavior against the target PostgreSQL version.


## Review remediation — round 3

### Finding addressed

- The event-scoped MatchResultRevision winner foreign key now uses Prisma onDelete: NoAction and PostgreSQL ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED.
- PostgreSQL defers the winner-team check to transaction commit. A direct Team deletion still fails while its result revision survives; a transaction deleting the Event can cascade Event to Team, Match, and result revisions and commit once all dependent rows are gone. The append-only trigger continues to reject direct result-revision deletes while allowing referential cascade cleanup.
- The Prisma DMMF contract asserts relationOnDelete: NoAction, and the migration contract asserts the full deferred-constraint clause.
- Added an opt-in migration integration test. It accepts only MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL, passes that value through the repository's production-Neon/valid-PostgreSQL preflight, and then verifies direct Team deletion is rejected while Event deletion removes the revision.

### Red / green evidence

Red before the policy change:

    pnpm vitest run src/lib/competition/persistence-schema.test.ts -t "ties an optional winner|defers same-event winner"
    2 failed: generated DMMF reported relationOnDelete Restrict; migration had ON DELETE RESTRICT rather than deferred NO ACTION.

Green after implementation:

    pnpm prisma validate           # passed (local placeholder URLs only; no connection)
    pnpm prisma generate           # passed
    pnpm vitest run src/lib/competition/persistence-schema.test.ts src/lib/competition/persistence-migration.integration.test.ts
                                      # 14 passed; 1 skipped because MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL is unset
    pnpm lint                      # passed (tsc --noEmit)
    git diff --check               # passed

### Safe integration availability

The existing E2E database tooling was inspected before attempting any connection. It rejects the known production Neon host, validates PostgreSQL URLs before constructing Prisma, and requires a separate reset sentinel for destructive E2E setup. This worktree has no configured .env and no explicit MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL; therefore no database connection, migration application, reset, or live integration execution was attempted. The new focused test remains opt-in and guarded for a future isolated test database.

### Commits

- 38f1ef00a843865ccd1b2c8f023cb76199a9881a — initial persistence foundation.
- 7469db5 — original verification report.
- 8f0b126df82e0c0f5394318a0b6f259fd8bae3d1 — first integrity remediation.
- e463bec — first remediation report.
- a713b7ad2b8f7aedaf3892ab2c0106d1cea6032f — composite relation, winner, and cascade remediation.
- c8c76f2 — second remediation report.
- efa8f05 — deferred winner relation and guarded migration integration coverage.

## Review remediation — round 4

### Finding addressed

- The opt-in integration test now queries PostgreSQL's installed constraint metadata through the same Prisma client configured exclusively with the guarded `MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL`. Before creating any fixture, it requires the named MatchResultRevision winner foreign key to be validated, deferrable, initially deferred, NO ACTION on delete, CASCADE on update, and to link exactly `[eventId, winnerTeamId]` to Team `[eventId, id]`. Missing or stale constraints fail the test before writes. This uses the review's explicit installed-constraint validation alternative; it does not reset the database or run migrations against ambient URLs.
- Existing explicit opt-in, production-host, and malformed-URL guards are retained before Prisma construction. The created User is deleted during cleanup after the Event/revision cleanup, and disconnect still runs if User cleanup fails.
- Added `src/lib/competition/persistence-migration-harness.test.ts`, which executes the actual integration test body with the database boundary replaced. It checks missing/stale constraint rejection before fixture writes, exact guarded datasource selection, validation ordering, and successful User/Event cleanup. Its local URL is a mock-only input and never opens a connection.

### Red / green evidence

RED, before the implementation change:

```text
pnpm vitest run src/lib/competition/persistence-migration-harness.test.ts
1 failed file; 8 failed tests
Seven missing/stale constraint cases: promise resolved "undefined" instead of rejecting.
Ordering/cleanup case: expected 'create user' to be 'validate constraint'.
```

GREEN after implementation:

```text
pnpm vitest run src/lib/competition/persistence-schema.test.ts src/lib/competition/persistence-migration.integration.test.ts src/lib/competition/persistence-migration-harness.test.ts
2 passed files, 1 skipped file; 22 passed tests, 1 skipped test.

pnpm prisma validate
The schema at prisma/schema.prisma is valid.

pnpm prisma generate
Generated Prisma Client (v6.19.3) successfully.

pnpm lint
tsc --noEmit; exit 0.

pnpm vitest run src/lib/competition/persistence-schema.test.ts src/lib/competition/persistence-migration.integration.test.ts src/lib/competition/persistence-migration-harness.test.ts src/e2e-db-preflight.test.ts src/e2e-db-safety.test.ts
4 passed files, 1 skipped file; 34 passed tests, 1 skipped test.

git diff --check
git diff --cached --check
Both passed; only Git's existing LF-to-CRLF normalization warning was emitted.
```

Prisma validation/generation used local placeholder URLs for configuration only. No database connection was made. Shell execution and updates through the patch utility required approved escalation because the Windows sandbox failed to start with an ACL-helper error.

### Commits

- `cd5e6c0d57cdc044903eb8e68ceff4a7d8ccec27` — installed-constraint gate and behavioral regression coverage.
- This round-4 report is recorded in the following documentation commit.

### Self-review and remaining concerns

The query scopes the constraint to the resolved MatchResultRevision table, checks the resolved Team target and ordered columns, and validates PostgreSQL-specific deferral metadata before fixture creation. The existing schema/migration files and production guards are unchanged. Task 2 was not started.

`MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL` is absent, so the live integration remains skipped. The catalog query and cascade must still be exercised against a deliberately configured, already migrated isolated PostgreSQL database; this round does not claim live migration execution.

## Review remediation — round 5

### Finding addressed and files changed

- Reproduced the full-suite regression in `src/security-smoke.test.ts`: its unchanged application source scan found legitimate test-only Prisma `$queryRaw` calls in both migration test files under `src/lib/competition`.
- Relocated `persistence-migration-harness.test.ts` and `persistence-migration.integration.test.ts` to `tests/competition/`. The harness is an exact rename; the integration test only changes its relative preflight import to `../../scripts/e2e-db-preflight.mjs`.
- Extended `vitest.config.ts` discovery with `tests/competition/**/*.test.ts`, retaining both existing source test globs. The migration tests remain discoverable in focused runs and the full unit suite.
- The security scan, installed-constraint gate, explicit database opt-in, production-host and URL guards, fixture cleanup, Prisma schema/migration, and Task 2 graph implementation are unchanged.

### Red / green evidence

RED before relocation, on starting head `8914520`:

```text
pnpm vitest run src/security-smoke.test.ts
1 failed file; 1 failed test, 5 passed tests.
application code does not use raw SQL escape hatches:
expected combined application source not to match /\$queryRaw|\$executeRaw|queryRawUnsafe|executeRawUnsafe/
```

The source search found exactly the two migration test files identified above.

GREEN after relocation:

```text
pnpm vitest run src/lib/competition/persistence-schema.test.ts tests/competition/persistence-migration.integration.test.ts tests/competition/persistence-migration-harness.test.ts src/security-smoke.test.ts
3 passed files, 1 skipped file; 28 passed tests, 1 skipped test.

pnpm test:unit
99 passed files, 1 skipped file; 888 passed tests, 1 skipped test.
Full unit suite executed once after the fix; exit 0.

pnpm lint
tsc --noEmit; exit 0.

git diff --check
git diff --cached --check
Both passed. Git emitted only LF-to-CRLF normalization warnings.
```

The full suite emitted the existing expected stderr from the password-reset test that simulates an unreachable email provider; that test passed. Shell and patch execution again required approved escalation because the Windows sandbox ACL helper could not start.

### Commit

- `5787237f6157c409667f99d246057ea1e5c939b5` — migration-only test relocation and discovery adjustment.
- This round-5 evidence is recorded in the following documentation commit.

### Self-review and remaining concerns

The staged implementation diff contains two renames and only two changed lines: the preflight import and Vitest discovery. No security exemption was added. The full suite discovers the moved harness (8 passing tests) and guarded integration (1 skipped test).

`MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL` remains unset. No live database connection, migration execution, reset, or cascade verification was attempted; the prior requirement to exercise the guarded integration on an explicitly configured isolated database remains.
