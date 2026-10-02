# Task 12 — Public bracket V3 surface fix

Date: 2026-10-02

## Root cause

The single root-cause hypothesis is that `ui_v3_foundation` selected the dark `V3ShellRouter`, while the public event detail routes still selected legacy `BackToEvent` + `Section`/`DataTable` markup. The adaptive bracket branch added in `1ef64e1` returned `AdaptiveBracketBoard` inside that legacy composition, and the League/elimination fallback paths retained the same legacy wrappers. Those wrappers intentionally emit white `pv-section-card`/`bg-white` surfaces and slate text, so the route became a dark V3 shell around a legacy white surface. The same wrapper boundary was present on schedule, standings, and participants, which made them the same evidence-backed bug class.

The approved V3 route pattern in `ee02ad1` (the V3 leaderboard page) provided the comparison: use a route-owned `miracle-public-v3` frame, `PublicV3Action`, token-backed V3 table/section surfaces, and preserve the legacy branch when the visual flag is off.

## Implementation

- Added V3-gated composition for the adaptive bracket route, the legacy League table fallback, and the legacy elimination bracket/detail fallback. The flag-off branches retain the existing `BackToEvent`, `Section`, `DataTable`, and legacy match-card markup.
- Reused V3 route primitives and tokens through `PublicV3Action`, a shared `PublicV3DetailFrame`, `mpv3-section`, `mpv3-panel`, `mpv3-table-wrap`, V3 badges, and the existing V3 bracket board tokens. The V3 bracket board is bounded by `max-width: 100%` horizontal scrolling and its page frame uses `min-height: 0`, avoiding a nested full-viewport canvas.
- Extended the same flag-on/flag-off composition boundary to public schedule, standings, and participants routes. The adaptive participants directory remains the same data component; only its containing route surface changes under the V3 foundation flag.
- Kept match, round, series, game-detail, bye/TBD, standings, empty-state, and schedule data readers unchanged. Completed scores and BO series detail continue to use the same source records. Added Indonesian/English adaptive status labels (`Dijadwalkan`/`Scheduled`, etc.) rather than exposing raw status tokens.
- Kept interactive bracket detail summaries at `min-h-11` and retained the established V3 action/button sizing and focus treatment. No database, schema, seed, or fixture changes were made.

## TDD evidence

Focused route regression tests were written before the implementation. The bracket RED run was:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/app/events/[slug]/bracket/page.test.ts"
```

RED result: 1 test file ran, 19 tests total; 2 failed and 17 passed. The two new V3 assertions failed because the rendered adaptive and League fallback markup still contained the legacy `pv-section-card`/`bg-white` composition instead of the expected `miracle-public-v3` frame.

The sibling-route RED run was:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/app/events/[slug]/schedule/page.test.ts" "src/app/events/[slug]/standings/page.test.ts" "src/app/events/[slug]/participants/page.test.ts"
```

RED result: 3 test files ran, 8 tests total; 3 failed and 5 passed. Each failure was the new `ui_v3_foundation` assertion observing `pv-section-card bg-white` rather than the V3 route frame.

The adaptive board localization RED run was:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/components/v3/public-event/AdaptiveBracketBoard.test.tsx"
```

RED result: 1 test file ran, 4 tests total; 1 failed and 3 passed. Indonesian scheduled output was the legacy `Menunggu hasil` text rather than the required localized status label.

The focused GREEN run after implementation was:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/app/events/[slug]/bracket/page.test.ts" "src/components/v3/public-event/AdaptiveBracketBoard.test.tsx" "src/app/events/[slug]/schedule/page.test.ts" "src/app/events/[slug]/standings/page.test.ts" "src/app/events/[slug]/participants/page.test.ts"
```

GREEN result: 5 test files passed and 31 tests passed.

The nearby public-event regression run was:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/components/v3/public-event/PublicScheduleBoard.test.tsx" "src/components/v3/public-event/PublicParticipantsDirectory.test.tsx" "src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx" "src/components/v3/public-event/AdaptivePhaseEventPage.test.tsx" "src/components/v3/public-event/AdaptiveOngoingEventPage.test.tsx"
```

GREEN result: 5 test files passed and 22 tests passed.

## Verification

TypeScript:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\tsc.CMD --noEmit; Write-Output "tsc-exit=$LASTEXITCODE"
```

Result: `tsc-exit=0`.

ESLint was run against the changed route, component, test, and shared-frame files with:

```text
E:\dev\MiracleTourney-gitnative\node_modules\.bin\eslint.CMD "src/app/events/[slug]/bracket/bracket-page-content.tsx" "src/app/events/[slug]/bracket/page.test.ts" "src/app/events/[slug]/participants/participants-page.tsx" "src/app/events/[slug]/participants/page.test.ts" "src/app/events/[slug]/schedule/schedule-page-content.tsx" "src/app/events/[slug]/schedule/page.test.ts" "src/app/events/[slug]/standings/standings-page.tsx" "src/app/events/[slug]/standings/page.test.ts" "src/components/v3/public-event/AdaptiveBracketBoard.tsx" "src/components/v3/public-event/AdaptiveBracketBoard.test.tsx" "src/components/v3/public-event/PublicV3DetailFrame.tsx"; Write-Output "eslint-exit=$LASTEXITCODE"
```

Result: `eslint-exit=0` and 0 errors, with 2 warnings for unused `store` parameters in existing test mock callbacks in `src/app/events/[slug]/bracket/page.test.ts`.

`git diff --check` completed without whitespace errors.

No database-backed browser smoke was run. The task explicitly forbids DB/seed changes and broad E2E/CI, and a live visual check would require a configured database fixture. Static route rendering, flag branches, localized status output, typechecking, linting, and nearby component tests were used instead.

## Changed files

- `src/app/events/[slug]/bracket/bracket-page-content.tsx`
- `src/app/events/[slug]/bracket/page.test.ts`
- `src/app/events/[slug]/schedule/schedule-page-content.tsx`
- `src/app/events/[slug]/schedule/page.test.ts`
- `src/app/events/[slug]/standings/standings-page.tsx`
- `src/app/events/[slug]/standings/page.test.ts`
- `src/app/events/[slug]/participants/participants-page.tsx`
- `src/app/events/[slug]/participants/page.test.ts`
- `src/components/v3/public-event/AdaptiveBracketBoard.tsx`
- `src/components/v3/public-event/AdaptiveBracketBoard.test.tsx`
- `src/components/v3/public-event/PublicV3DetailFrame.tsx`
- `src/styles/miracle-public-v3.css`
- this report

## Protected artifact check

The pre-existing task11 report and both certificate directories remained untracked and were not edited, staged, or committed. They were excluded from every staging command. Final status inspection must continue to show those protected paths only as untracked entries, and neither path may appear in the tracked diff or commit.

## Remaining limitations

There is no live-data screenshot/browser assertion for Flashpeak Rising 64 in this isolated checkout because no database fixture was available and no fixture was created. The focused render tests verify both V3 and legacy markup boundaries, including adaptive and fallback paths, but cannot replace a visual check against the production event data.
