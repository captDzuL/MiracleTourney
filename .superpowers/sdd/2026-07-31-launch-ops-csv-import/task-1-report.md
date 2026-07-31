# Task 1 Report: Correct event visibility and event-scoped reads

## Summary

Implemented the public-event visibility guardrails inside the existing demo-store and public pages, scoped leaderboard aggregation by event match IDs, and updated league standings to award draws correctly.

## Changes made

- Added `getPublicEvents()` in `src/lib/platform/demo-store.ts` to exclude `Draft` events from public lists.
- Updated the home page and events index to use `getPublicEvents()`.
- Added `Draft` guards with `notFound()` on:
  - `src/app/events/[slug]/page.tsx`
  - `src/app/events/[slug]/leaderboards/page.tsx`
  - `src/app/events/[slug]/standings/page.tsx`
- Changed `getLeaderboardForEvent(eventId)` to aggregate only stats whose `matchId` belongs to the selected event.
- Extended `TeamStanding` with `draws`.
- Updated `buildLeagueStandings()` so drawn matches award one point to each team.
- Updated the public standings table to show draws and the correct scoring description.
- Added the required launch visibility regression tests in `src/lib/tournament/engine.test.ts`.
- Added `@` alias resolution to `vitest.config.ts` so the new demo-store tests can execute under Vitest.

## TDD record

### RED

Target command used:

`C:\Program Files\nodejs\node.exe .\node_modules\vitest\vitest.mjs run src/lib/tournament/engine.test.ts`

Behavioral RED result:

- `hides draft events from public lists` failed because `getPublicEvents` did not exist.
- `awards one point each for a draw in league standings` failed because the received points were `0` instead of `1`.

Notes from getting to behavioral RED:

- `corepack` was unavailable in the shell.
- `node` was not on PATH, so the local Vitest entrypoint was invoked directly with `C:\Program Files\nodejs\node.exe`.
- Vitest initially could not resolve the existing `@/` imports from `demo-store.ts`, so `vitest.config.ts` was updated with the matching alias before rerunning the suite.

### GREEN

Same target command:

`C:\Program Files\nodejs\node.exe .\node_modules\vitest\vitest.mjs run src/lib/tournament/engine.test.ts`

Result:

- 1 test file passed
- 8 tests passed
- 0 failed

## Additional verification

Type check command:

`C:\Program Files\nodejs\node.exe .\node_modules\typescript\bin\tsc --noEmit --incremental false`

Result:

- Passed with exit code 0

Note:

- Plain `tsc --noEmit` attempted to write `tsconfig.tsbuildinfo` and failed with `EPERM`, so incremental output was disabled for verification.

## Self-review

- Confirmed public list pages now source only public events.
- Confirmed selected public event pages now 404 drafts instead of rendering them.
- Confirmed standings display stays consistent with the new `draws` field.
- Confirmed leaderboard aggregation is event-scoped even though the new regression test already passed against the current fixture data.
- Left unrelated existing worktree change in `src/app/captain/page.tsx` untouched.

## Files changed

- `src/lib/platform/demo-store.ts`
- `src/app/page.tsx`
- `src/app/events/page.tsx`
- `src/app/events/[slug]/page.tsx`
- `src/app/events/[slug]/leaderboards/page.tsx`
- `src/app/events/[slug]/standings/page.tsx`
- `src/lib/tournament/engine.test.ts`
- `src/lib/tournament/engine.ts`
- `src/lib/tournament/types.ts`
- `vitest.config.ts`

## Commit

Planned commit message:

`fix: scope public events and event aggregations`

## Concerns

- The current brief scoped draft guards to the public list, event detail, leaderboard, and standings pages. Direct draft access on other public event subpages such as participants or bracket was not changed in this task because those files were outside the specified modification list.

---

## Round 1 fix report: strengthen leaderboard-scoping TDD evidence

### Finding addressed

- Medium: The TDD/quality evidence is incomplete for the leaderboard-scoping requirement.

### What changed

- Strengthened `keeps leaderboard scoped to the selected event` in `src/lib/tournament/engine.test.ts`.
- The test now injects a second `flashpeak` event with:
  - its own event record,
  - a separate team,
  - a separate player,
  - a separate completed match,
  - and a high-scoring `player-outsider` stat line.
- The assertion now proves `getLeaderboardForEvent("event-flashpeak-open")` returns only the selected event’s player IDs in order and excludes `player-outsider`.
- The test restores the demo-store global state after execution so it does not leak fixture changes into other tests.

### Explicit RED evidence for leaderboard scoping

To prove the new test really catches the old bug, `getLeaderboardForEvent()` was temporarily reverted to the pre-fix implementation that filtered by `gameSlug` instead of event match IDs, then the focused suite was run.

Command:

`C:\Program Files\nodejs\node.exe .\node_modules\vitest\vitest.mjs run src/lib/tournament/engine.test.ts`

Result:

- 1 test file failed
- 1 test failed, 7 passed
- Failing test: `launch visibility > keeps leaderboard scoped to the selected event`

Observed failure:

- Received leaderboard IDs began with `player-outsider`, proving same-game stats from a different event leaked into `event-flashpeak-open` under the old selector.

### Explicit GREEN evidence after restoring the fix

After restoring the event-match filter in `getLeaderboardForEvent()`, the same focused suite was rerun.

Command:

`C:\Program Files\nodejs\node.exe .\node_modules\vitest\vitest.mjs run src/lib/tournament/engine.test.ts`

Result:

- 1 test file passed
- 8 tests passed
- 0 failed

### Verification

Type check command:

`C:\Program Files\nodejs\node.exe .\node_modules\typescript\bin\tsc --noEmit --incremental false`

Result:

- Passed with exit code 0

### Scope confirmation

- Task scope remained inside Task 1.
- No route shapes changed.
- No database work was introduced.
- The production behavior change remained the existing event-match leaderboard filter; this round only strengthened the regression proof and appended the evidence.
