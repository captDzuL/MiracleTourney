# Task 7 report — unified public V3 event overview

Status: DONE_WITH_CONCERNS

Commit: `6d2dc01 feat(public): unify adaptive v3 event experience`

## Implemented

- Unified `Published`, `Registration Closed`, `Ongoing`, and `Finished` public overview routing through `readPublicV3Event` and `PublicV3EventPage` whenever `adaptive_public_event_v3` is enabled.
- Kept `renderEventDetailPage` as the explicit flag-off rollback path.
- Added the shared V3 event frame, hero, route-backed navigation, and registration, drawing, ongoing, and finished lifecycle modules.
- Preserved compatible projections for incomplete/legacy records without inventing seeds, results, statistics, awards, or certificates.
- Kept publication boundaries explicit: unpublished drawing schedules and incomplete certificate sets stay unavailable/TBD.
- Updated the public shell boundary so an exact `/events/<slug>` overview owns the single V3 header/main frame while participant, schedule, bracket, and leaderboard routes retain their existing shell behavior.
- Added/updated route, component, reader, shell-boundary, lifecycle-contract, and E2E contract coverage for ID/EN and authoritative/compatible views.

## RED

Command:

```powershell
node_modules\.bin\vitest.cmd run "src/components/v3/public-event/PublicV3EventPage.test.tsx"
```

The first runner attempt was blocked by the sandbox's esbuild child-process `EPERM`; the elevated rerun recorded the intended RED: `Test Files 1 failed (1)`, `Tests 3 failed (3)`. Failures were the missing normalized route/page contract and missing event-overview shell-boundary ownership.

## GREEN / verification

Final focused command:

```powershell
node_modules\.bin\vitest.cmd run "src/components/v3/public-event/PublicV3EventPage.test.tsx" "src/components/v3/public-discovery/HomePublicV3.test.tsx" "src/app/[locale]/events/[slug]/page.test.ts" "src/app/[locale]/events/[slug]/ongoing-render.test.tsx" "src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx" "src/lib/events/public-v3-read.test.ts" "src/lib/events/adaptive-public-event.test.ts"
```

Result: `Test Files 7 passed (7)`, `Tests 84 passed (84)`.

```powershell
node_modules\.bin\tsc.cmd --noEmit
```

Result: exit 0.

`git diff --check` completed without whitespace errors.

The requested single full unit run completed with `222 passed`, `6 skipped`, and `14 failed` tests across five files. The failures are in existing CI/overnight/static-contract suites; the affected route contract was corrected afterward and the final focused suites above are green. No broad Playwright run or database reseed was performed because the task explicitly requested focused verification and no repeated/broad E2E execution.

## Self-review

- Flag-off behavior remains legacy; flag-on public lifecycle statuses do not select the legacy renderer after a reader miss.
- Reader errors render a branded honest error state rather than fixture data.
- The shell boundary uses an exact single-segment event overview match, avoiding duplicate header/main landmarks and preserving detail-route behavior.
- ID/EN labels and localized route targets are supplied by the V3 presentation model.
- Ongoing compatible events show empty/live/schedule/result/statistic states from persisted data only.
- Finished certificate links are rendered only for a complete current publication and include localized verification URLs.

## Concerns

- Full unit remains red in unrelated CI contract tests; the full run was intentionally executed once, as requested, and was not chased into unrelated work.
- Playwright lifecycle and registration suites were updated to the new route-backed V3 semantics but not executed locally because they require the configured E2E database/auth environment.
- No visual baseline/screenshot review was run in this focused implementation pass; that remains a release-gate concern.

