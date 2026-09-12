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
