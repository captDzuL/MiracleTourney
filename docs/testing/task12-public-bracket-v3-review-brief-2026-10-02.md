# Task 12 — Public bracket V3 independent review brief

Re-review date: 2026-10-03
Verdict: **APPROVE**
Reviewed corrective implementation: `cddba12830d17a0ffac4d8bb79036a822018f708`
Final corrective base: `a32f585561e9e874d4c714f63191f89e73354884`
Original review base: `ee02ad1c78225c5dfef73d4dee0514fe58e16bab`

## Findings

No Critical, Important, or Minor findings remain in the authorized final re-review scope.

The final correction introduces an explicit `presentation="v3" | "legacy"` boundary in `src/components/v3/public-event/PublicScheduleBoard.tsx:46,56`. `src/app/events/[slug]/schedule/schedule-page-content.tsx:61-64` resolves `ui_v3_foundation` once, passes the matching presentation, and uses the same value to select the V3 or legacy route composition. Non-empty component and route tests prove V3 ID/EN localization for all five statuses while preserving the exact prior legacy expression under flag-off.

## Prior findings resolved

1. **Adaptive legacy copy:** resolved. `AdaptiveBracketBoard.tsx:34-36,56` restores `Menunggu hasil` / `Awaiting result` for the default legacy presentation and selects the new localized labels only for `presentation="v3"`. Component tests cover both ID/EN presentations, and the published adaptive flag-off route test checks `Menunggu hasil`.
2. **Direct bracket-path coverage:** resolved. `src/app/events/[slug]/bracket/page.test.ts:243-348` now directly exercises a published drawn adaptive bracket and non-adaptive single-elimination fallback under both V3 and flag-off modes. Assertions cover V3/legacy composition, bounded scrolling, BO3 series/game detail, bye auto-advance, TBD, scores, and absence of legacy white surfaces in V3.
3. **Schedule presentation boundary:** resolved. `PublicScheduleBoard` defaults to the legacy expression; only `presentation="v3"` uses localized status labels. `src/app/events/[slug]/schedule/page.test.ts:78-104` renders non-empty Indonesian and English schedules for both flag states, while the component tests independently cover both presentations.

## Fresh independent verification

Commands ran from `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative` at `cddba12830d17a0ffac4d8bb79036a822018f708`.

1. Focused affected routes/components:

   ```text
   E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/app/events/[slug]/bracket/page.test.ts" "src/components/v3/public-event/AdaptiveBracketBoard.test.tsx" "src/components/v3/public-event/PublicScheduleBoard.test.tsx" "src/app/events/[slug]/schedule/page.test.ts" "src/app/events/[slug]/standings/page.test.ts" "src/app/events/[slug]/participants/page.test.ts"
   ```

   Result: 6 files passed, 42 tests passed, 0 failed.

2. Nearby public-event components:

   ```text
   E:\dev\MiracleTourney-gitnative\node_modules\.bin\vitest.CMD run "src/components/v3/public-event/PublicScheduleBoard.test.tsx" "src/components/v3/public-event/PublicParticipantsDirectory.test.tsx" "src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx" "src/components/v3/public-event/AdaptivePhaseEventPage.test.tsx" "src/components/v3/public-event/AdaptiveOngoingEventPage.test.tsx"
   ```

   Result: 5 files passed, 24 tests passed, 0 failed.

3. TypeScript:

   ```text
   E:\dev\MiracleTourney-gitnative\node_modules\.bin\tsc.CMD --noEmit
   ```

   Result: exit 0.

4. Focused ESLint across all 13 changed TS/TSX files in the reviewed range:

   ```text
   E:\dev\MiracleTourney-gitnative\node_modules\.bin\eslint.CMD "src/app/events/[slug]/bracket/bracket-page-content.tsx" "src/app/events/[slug]/bracket/page.test.ts" "src/app/events/[slug]/participants/participants-page.tsx" "src/app/events/[slug]/participants/page.test.ts" "src/app/events/[slug]/schedule/schedule-page-content.tsx" "src/app/events/[slug]/schedule/page.test.ts" "src/app/events/[slug]/standings/standings-page.tsx" "src/app/events/[slug]/standings/page.test.ts" "src/components/v3/public-event/AdaptiveBracketBoard.tsx" "src/components/v3/public-event/AdaptiveBracketBoard.test.tsx" "src/components/v3/public-event/PublicScheduleBoard.tsx" "src/components/v3/public-event/PublicScheduleBoard.test.tsx" "src/components/v3/public-event/PublicV3DetailFrame.tsx"
   ```

   Result: exit 0, 0 errors, 2 warnings. The warnings are unused `store` callback parameters at `src/app/events/[slug]/bracket/page.test.ts:119` and `:122`.

5. Full reviewed-range whitespace check:

   ```text
   git diff --check ee02ad1c78225c5dfef73d4dee0514fe58e16bab..cddba12830d17a0ffac4d8bb79036a822018f708
   ```

   Result: exit 0, no whitespace errors.

## Acceptance evidence

- V3 adaptive and fallback compositions: supported by direct render tests and source inspection.
- Flag-off adaptive legacy copy: supported by component and route tests.
- Schedule ID/EN localization: supported for all five statuses by non-empty component and V3 route tests.
- Flag-off schedule preservation: supported by an explicit legacy presentation and non-empty component/route assertions for the exact prior status expression.
- Series, bye/TBD, score, standings, participants, schedule data, and empty-state semantics: focused and nearby tests passed; the new fallback fixture directly covers series, bye/TBD, and score output.
- Contrast/layout/touch targets: unchanged from the first review. Token contrast remains above 4.5:1; actions and interactive summaries retain at least 44px height.
- Mobile bracket containment: direct adaptive/fallback assertions cover `mpv3-bracket-scroll`, `overflow-x-auto`, and the existing bounded board classes; scoped CSS retains `max-width:100%` and no nested full-viewport page frame.
- Scope/global impact: the final corrective commit changes only the report, schedule route/component, and their tests. No global CSS changed.

## Status, protected artifacts, and limitations

Final pre-brief status showed corrective `HEAD` at `cddba12830d17a0ffac4d8bb79036a822018f708`, no staged changes, and only these untracked paths:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `docs/testing/task12-public-bracket-v3-review-brief-2026-10-02.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

The task11 report and both certificate directories remained untouched, unstaged, and uncommitted. No production or test file was edited during this final re-review. With no P0/P1/P2 findings remaining, only this review brief is eligible for the focused reviewer documentation commit.

No browser smoke was attempted: representative live route rendering requires `DATABASE_URL`/fixture data, while reseeding and broad E2E/CI are outside the authorized review scope.
