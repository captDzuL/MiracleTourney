# Task 2 implementation report

Status: implemented and committed, with one confirmed pre-existing full-suite failure.

Workspace: `E:\dev\MiracleTourney-gitnative\.worktrees\match-day-v3`
Branch: `feature/ui/match-day-v3`
Baseline: `f9267d7`
Implementation commit: `bd33e34c8b84379539bc984da7701e2367cfb3b1` — `feat: add deterministic competition graph engines`
This report is committed separately as `docs: record task 2 graph engine verification`.

## Delivered scope

The public factory is `generateCompetitionGraph` in `src/lib/tournament/competition/index.ts`.
It accepts the existing v1 config, event ID, explicit `{ id, seed }` teams, optional
elimination `slotCount`, and `hasOfficialResults`. It returns a typed graph with
phases, groups and members, matches, winner/loser dependencies, group-rank
qualification dependencies, configured standings rules and placement sources.

Single elimination includes balanced seeding, explicit byes and empty nodes,
chained bye advancement, best-of per round and optional bronze placement.
Double elimination includes upper and lower rounds, crossed upper drops,
lower consolidation, one grand final, and third place from the lower-final loser.
Round robin uses circle pairing, idle rounds for odd fields, configurable one or
two legs, reversed home/away in leg two, and preserves points/tiebreaker rules.
Groups allocate snake seeds, preserve per-group round-robin rules, expose cutlines,
and feed rank placeholders into either single- or double-elimination playoffs.
The rematch avoidance option controls rank-band group ordering.

Validation rejects blank/duplicate team IDs, non-contiguous or non-integer seeds,
fewer than two or more than 256 teams, invalid capacities, insufficient group
membership, malformed config, and regeneration after any official result.
Results are detached from caller inputs. There is no persistence, score resolution,
scheduling, UI or legacy behavior change in this task.

## Files

All production additions are under `src/lib/tournament/competition/`:

- `types.ts` — graph, participant source, phase, group, match/dependency and input types (84 lines).
- `index.ts` — validated public factory and format dispatch (45 lines).
- `validation.ts` — config, seed, count and regeneration guards (30 lines).
- `shared.ts` — balanced seed order, match construction, bye outcomes, dependency construction, elimination rounds (85 lines).
- `single-elimination.ts` — single elimination and bronze graph generation (34 lines).
- `double-elimination.ts` — upper/lower bracket and grand-final graph generation (59 lines).
- `round-robin.ts` — circle pairing and reverse legs (34 lines).
- `group-playoffs.ts` — group allocation, cutlines and qualifier placeholder seeding (47 lines).
- `README.md` — public boundary and downstream interpretation contract (49 lines).
- `single-elimination.test.ts` — 4 tests.
- `double-elimination.test.ts` — 4 tests.
- `round-robin.test.ts` — 2 tests.
- `group-playoffs.test.ts` — 4 tests.
- `validation.test.ts` — 24 tests.
- `contracts.test.ts` — 12 cross-format determinism/integrity checks.

15 implementation/test/documentation files, 834 added lines. No existing source
file was edited. The largest production module is 85 lines.

## RED/GREEN evidence

Used the test-driven-development skill and its writing-good-tests reference.
Tests use literal, hand-derived fixtures for each format. Initial type and empty
factory scaffolding was in place before tests so RED was an assertion failure on
missing behavior, not an unresolved import.

1. `pnpm test:unit src/lib/tournament/competition/single-elimination.test.ts`
   - RED at 13:13:26: 3 failed; empty match output versus seeded five-team and
     chained-bye fixtures, and no two-team final.
   - GREEN at 13:17:31: 3 passed after adding shared primitives and SE generator.
2. `pnpm test:unit src/lib/tournament/competition/double-elimination.test.ts --reporter=dot`
   - RED at 13:19:11: 4 failed on absent DE graph output.
   - Covered literal four-team full topology/dependencies/placements; eight-team
     crossed drops and lower consolidation; odd three-team byes; two-team final.
   - `pnpm test:unit src/lib/tournament/competition` GREEN at 13:20:15: 7 passed.
3. `pnpm test:unit src/lib/tournament/competition/round-robin.test.ts --reporter=dot`
   - RED at 13:21:22: 2 failed on missing even-field pairing and odd two-leg output.
   - `pnpm test:unit src/lib/tournament/competition` GREEN at 13:22:09: 9 passed.
4. `pnpm test:unit src/lib/tournament/competition/group-playoffs.test.ts --reporter=dot`
   - RED at 13:23:58: 4 failed on absent snake allocation, SE/DE qualification
     dependencies, and rematch-option output.
   - `pnpm test:unit src/lib/tournament/competition` GREEN at 13:24:51: 13 passed.
5. `pnpm test:unit src/lib/tournament/competition/validation.test.ts src/lib/tournament/competition/single-elimination.test.ts --reporter=dot`
   - RED at 13:26:12: 25 failed, 3 passed. Invalid inputs were accepted or
     recursively overflowed instead of returning the boundary error; official
     results did not block; config aliased its caller; two entrants in a larger
     capacity created an impossible empty bronze match.
   - Added validated/detached inputs and bronze feasibility guard.
   - `pnpm test:unit src/lib/tournament/competition` GREEN at 13:27:05: 38 passed.
6. Added 12 characterization/invariant checks after the feature cycles; these
   required no new production behavior or implementation changes. They check
   repeat/reordered determinism, graph input immutability, dependency ordering,
   unique target slot IDs, literal playable counts through 256 teams, and a
   128-qualifier cross-group first round.

## Final verification

- `pnpm test:unit src/lib/tournament/competition src/lib/tournament/engine.test.ts`
  - Exit 0: 7 files, 69 passed (50 graph tests plus all 19 legacy engine tests).
  - Final focused run at 13:28:52.
- `pnpm lint`
  - Exit 0: `tsc --noEmit`, no diagnostics.
- `pnpm test:unit` — run exactly once for this task, at 13:29:09.
  - Exit 1: 98 files passed, 1 failed, 1 skipped; 887 tests passed, 1 failed,
    1 skipped (889 total); 21 seconds.
  - Only failure: `src/security-smoke.test.ts` / `application code does not use
    raw SQL escape hatches`.
  - Its recursive source scanner includes test files. The raw-SQL tokens are in
    Task 1 tests already committed in the baseline:
    `src/lib/competition/persistence-migration-harness.test.ts:36` and
    `src/lib/competition/persistence-migration.integration.test.ts:34`.
  - Confirmed with `git grep -n -E '\$queryRaw|\$executeRaw|queryRawUnsafe|executeRawUnsafe' HEAD -- src/lib`
    while HEAD was still `f9267d7`; both matches were present in HEAD.
  - No new graph file contains those tokens. Left the unrelated baseline issue
    untouched and notified the controller.
  - The skipped integration test needs its configured database. Existing mocked
    password-reset error logging also appears during the passing action tests.
- `git diff --cached --check` and `git diff HEAD^ HEAD --check`
  - Exit 0, no whitespace errors. Git emitted ordinary LF-to-CRLF notices during
    staging only. Staged diff and final committed scope reviewed.
- `git status --short` after implementation commit: clean.

## Self-review

- Re-read Task 2 brief and checked each requirement against the delivered graph.
- Confirmed no old exports or call sites changed; all legacy tests still pass.
- Checked dependency source nodes precede targets, target slots/IDs are unique,
  byes produce no losers, and no idle RR match is scheduled as a game.
- Checked two-team, odd-field, chained-bye, eight-team DE, larger non-power-of-two,
  maximum 256-team elimination, and maximum supported qualification field cases.
- Configured point values are carried to phase rules; computing official standings
  and resolving ties/ranks belongs to Task 5, not this generation-only task.
- Both playoff types reuse the same tested elimination generators. Group-rank
  qualification edges remain separate from match winner/loser edges because
  qualification depends on authoritative group standings, not one match.
- Runtime validation occurs before recursive bracket construction.
- Focused modules remain small, typed and free of I/O or scheduling concerns.

## Integration concerns and limitations

1. The existing full-suite security scan failure above remains unresolved.
2. `hasOfficialResults` is caller-supplied because this is a pure graph factory.
   A future persistence service must obtain it from official revisions and
   enforce the same guard inside its transaction; a pure function cannot stop a
   caller that omits or falsifies storage state.
3. DE v1 has no reset setting. This task uses a single grand final and documents
   that policy. A bracket reset would require an explicit config/conditional
   match extension in a later requirement.
4. Consumers should schedule only `pending` nodes. `bye`/`empty` nodes are retained
   for structure and display; unresolved `pending` participants are not readiness.
5. Group rank sources must remain placeholders until final qualification is known,
   including any configured tiebreak match. The Task 1 match dependency table
   represents match outcomes; group qualification metadata needs its appropriate
   phase/configuration projection in the upcoming persistence service.

## Environment handling

Normal shell startup failed with `helper_unknown_error: apply deny-read ACLs`.
Read/test commands succeeded under escalation. `apply_patch` could add files but
its sandboxed update reads failed with the same ACL error. A direct invocation
of the installed native `codex.exe --codex-run-as-apply-patch` under escalation
applied narrowly scoped patches; the batch wrapper was unsuitable because it
lost multiline arguments. No broad rewrites, resets, deletions, or unrelated
repository edits were used.
