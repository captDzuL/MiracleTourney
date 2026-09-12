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
