# Miracle V3 Competition Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each implementation task and `verification-before-completion` before marking the plan complete.

**Goal:** Support Single Elimination, Double Elimination, League/Round-Robin, and Group + Playoffs from format setup through scheduling, captain readiness, official results, bracket or standings progression, and player-stat publication.

**Architecture:** Model competition phases and format configuration explicitly. Pure deterministic engines generate fixtures and calculate derived outputs. Transactional services own official-result propagation and schedule revisions; React surfaces consume read models and never calculate authoritative standings or brackets in the browser.

**Tech Stack:** TypeScript, Prisma/PostgreSQL transactions, Next.js Server Actions, Zod, Vitest, Playwright.

**Global Constraints:** An official score must immediately progress every safe downstream dependency. Player statistics have separate draft/review/publish states and never block competition progression. Organizers never edit brackets or standings directly. Single Elimination includes a Third Place Match when semifinals exist. Double Elimination derives third place from the Lower Bracket Final loser. Schedule generation uses start time, match duration, buffer, rooms, and rest rules, with explicit manual locks and audit history.

## Scope boundary

This plan owns competition configuration, fixture generation, schedule calculation, readiness, official results, standings/brackets, and stats workflow. Awards and certificates are in the completion plan.

## Task 1: Add typed format configuration and rollout flag

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Modify: `src/lib/platform/types.ts`
- Create: `src/lib/tournament/formats/types.ts`
- Create: `src/lib/tournament/formats/types.test.ts`

- [ ] Add `competition_operations_v3` with default `false`.
- [ ] Replace the two-value format assumption with a discriminated union for `single_elimination`, `double_elimination`, `round_robin`, and `group_playoffs`.
- [ ] Encode best-of rules, third-place behavior, round-robin legs, points, ordered tiebreakers, group count, qualifiers per group, and playoff format.
- [ ] Reject unsupported Battle Royale, Swiss, FFA, and time-trial formats at V3 publication.
- [ ] Test valid presets and invalid combinations.
- [ ] Commit: `git commit -am "feat(tournament): add v3 format contracts"`

## Task 2: Add competition persistence and audit trail

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260905_v3_competition_operations/migration.sql`
- Create: `src/lib/tournament/persistence-contract.test.ts`

- [ ] Add `CompetitionPhase`, `TournamentGroup`, `TournamentGroupMember`, and format configuration JSON with a schema version.
- [ ] Extend `Match` with phase/group references, planned start, estimated duration, buffer, room, manual schedule lock, lifecycle revision, and official-result version.
- [ ] Add `MatchReadiness`, `CompetitionIncident`, and `CompetitionAuditEntry` records.
- [ ] Preserve existing matches by mapping legacy elimination and league events to version-1 configurations in the migration.
- [ ] Validate indexes for event/phase/status/scheduled-time and unique fixture identities.
- [ ] Run `pnpm prisma validate` and schema tests.
- [ ] Commit: `git commit -am "feat(tournament): persist phases schedules and audits"`

## Task 3: Implement pure fixture engines

**Files:**
- Create: `src/lib/tournament/formats/single-elimination.ts`
- Create: `src/lib/tournament/formats/double-elimination.ts`
- Create: `src/lib/tournament/formats/round-robin.ts`
- Create: `src/lib/tournament/formats/group-playoffs.ts`
- Create: `src/lib/tournament/formats/fixtures.test.ts`
- Modify: `src/lib/tournament/engine.ts`

- [ ] Write failing fixtures for odd/even participant counts, byes, semifinal loser routing, lower-bracket routing, one/two-leg leagues, balanced groups, and playoff seeding.
- [ ] Make engine inputs immutable and outputs deterministic for a stable seed.
- [ ] Generate a Third Place Match only when Single Elimination has two semifinal losers.
- [ ] Keep `src/lib/tournament/engine.ts` as a compatibility facade until existing callers migrate.
- [ ] Run `pnpm vitest run src/lib/tournament/formats/fixtures.test.ts src/lib/tournament/engine.test.ts`.
- [ ] Commit: `git commit -am "feat(tournament): add deterministic format engines"`

## Task 4: Implement standings and qualification projections

**Files:**
- Create: `src/lib/tournament/standings/calculate.ts`
- Create: `src/lib/tournament/standings/calculate.test.ts`
- Create: `src/lib/tournament/standings/qualification.ts`
- Create: `src/lib/tournament/standings/qualification.test.ts`

- [ ] Calculate played, wins, draws, losses, score for/against, differential, points, form, and ordered tiebreak values from official matches only.
- [ ] Return unresolved ties explicitly when configured tiebreakers cannot separate teams.
- [ ] Calculate Top N cutlines and stable playoff seed previews without mutating persisted standings.
- [ ] Test correction, walkover, incomplete match, head-to-head tie, multi-team tie, and equal final rank behavior.
- [ ] Commit: `git commit -am "feat(tournament): derive standings and qualification"`

## Task 5: Implement schedule generation and recalculation

**Files:**
- Create: `src/lib/tournament/scheduling/generate.ts`
- Create: `src/lib/tournament/scheduling/recalculate.ts`
- Create: `src/lib/tournament/scheduling/scheduling.test.ts`
- Create: `src/lib/tournament/scheduling/impact-preview.ts`

- [ ] Implement the approved algorithm in `docs/snapshots/product-ux-redesign-2026-09/match-control-scheduling-algorithm-v3.md`.
- [ ] Respect event start, per-round duration, buffers, room concurrency, rest constraints, dependency readiness, and manual locks.
- [ ] Return an impact preview before a schedule override or official-result correction.
- [ ] Block automatic correction when a dependent match is live or completed; return the exact blocking match.
- [ ] Test delay propagation, parallel rooms, locked slots, cross-group fixtures, DST-independent WIB values, and idempotent reruns.
- [ ] Commit: `git commit -am "feat(schedule): add deterministic match scheduling"`

## Task 6: Make official results transactional

**Files:**
- Create: `src/lib/tournament/results/officialize.ts`
- Create: `src/lib/tournament/results/correct.ts`
- Create: `src/lib/tournament/results/results.test.ts`
- Create: `src/lib/actions/competition-v3-actions.ts`

- [ ] In one database transaction validate a series, version the result, complete the match, advance the winner/loser, recalculate affected standings and schedules, enqueue captain notifications, and record audit entries.
- [ ] Keep statistics outside this transaction except for recording their independent draft state.
- [ ] Require an impact preview token for corrections and reject stale previews.
- [ ] Test rollback on each injected failure so no partial bracket or schedule state remains.
- [ ] Commit: `git commit -am "feat(results): make official progression transactional"`

## Task 7: Build organizer Match Control and group Match Day

**Files:**
- Create: `src/app/[locale]/organizer/events/[eventId]/match-day/page.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/results/[matchId]/page.tsx`
- Create: `src/components/v3/match-day/ActionQueue.tsx`
- Create: `src/components/v3/match-day/ScheduleBoard.tsx`
- Create: `src/components/v3/match-day/GroupFixtures.tsx`
- Create: `src/components/v3/match-day/StandingsQualification.tsx`
- Create: `src/components/v3/match-day/OfficialResultPanel.tsx`
- Create: `src/components/v3/match-day/match-day.test.tsx`

- [ ] Order “Needs action” by blocker severity, live impact, scheduled proximity, and age; show the reason and next action in text.
- [ ] For groups, open on fixtures, filter by group/matchday/status, and keep standings/qualification in a separate view.
- [ ] Keep official score entry visually urgent and player statistics in a separate draft panel.
- [ ] Test format-aware navigation, action ordering, impact confirmation, and responsive tables/cards.
- [ ] Commit: `git commit -am "feat(organizer): build format-aware match control"`

## Task 8: Build captain Match Day readiness

**Files:**
- Create: `src/app/[locale]/captain/events/[eventId]/match-day/page.tsx`
- Create: `src/components/v3/captain/CaptainMatchCard.tsx`
- Create: `src/components/v3/captain/ReadyAction.tsx`
- Create: `src/components/v3/captain/captain-match-day.test.tsx`

- [ ] Show current call state, planned/estimated time, room, opponent, roster readiness, and the single most useful captain action.
- [ ] Allow organizer roll-call readiness when a captain is physically present and not using the website; record actor and time.
- [ ] Prevent repeated Ready actions from creating duplicate readiness records.
- [ ] Test captain and organizer readiness paths, schedule changes, no-show state, and mobile layout.
- [ ] Commit: `git commit -am "feat(captain): add match-day readiness"`

## Task 9: Verify the full competition story

**Files:**
- Create: `tests/e2e/organizer-v3-multiformat.spec.ts`
- Create: `tests/e2e/organizer-v3-match-control.spec.ts`
- Create: `tests/e2e/captain-v3-match-day.spec.ts`

- [ ] Cover all four format configurations, Third Place Match, group qualification, Double Elimination routing, generated schedules, organizer roll call, immediate official progression, stats draft isolation, and safe correction.
- [ ] Run `pnpm lint`, `pnpm test`, the three E2E specs, and `pnpm build`.
- [ ] Commit: `git commit -am "test(tournament): verify v3 competition operations"`

