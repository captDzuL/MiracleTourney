# Task 12 — Miracle V3 public leaderboard and login UI fix

Date: 2026-10-02

## Root cause

The `ui_v3_foundation` flag selected `V3ShellRouter` in `src/components/shell.tsx`, but the Flashpeak branch of the leaderboard route still rendered the legacy `BackToEvent`/`Section` composition. The result was a dark V3 shell around the old white leaderboard surface. The table itself already had the six sortable statistics and filtering behavior, but its single empty message described every empty result as a filter miss.

`getFlashpeakLeaderboardForEvent` correctly limits the read to `playerStat` rows whose match is `Completed`, then aggregates only validated player identities and numeric stats. Its broad catch intentionally returned `[]` for both a successful empty query and a database/query failure. That made the UI unable to distinguish “no completed statistics yet” from “the reader failed.”

The login page submitted directly to `loginAction` without `useFormStatus`, so it had no visible pending state and no native disabled guard against duplicate submissions.

## Implementation

- Added a flag-gated V3 Flashpeak leaderboard composition using the existing `PublicV3Action`, `PublicV3Eyebrow`, `PublicV3Count`, `PublicV3SectionHeading`, `PublicV3EmptyState`, V3 classes, and token variables. The flag-off path still renders the legacy composition and legacy empty copy.
- Added `getFlashpeakLeaderboardForEventResult`, returning `ready`, `empty`, or `error` while retaining `getFlashpeakLeaderboardForEvent` as the existing array-returning compatibility API. The completed-match query and aggregation scope were not broadened, and no data was seeded or fabricated.
- Kept all six sortable statistics, localized Indonesian/English labels, responsive overflow, filtering, and `aria-sort`. V3 empty states use distinct localized copy and `status`/`alert` announcements.
- Reworked login presentation with the established V3 tokens, visible labels, `autoComplete` metadata, focus rings, localized forgot-password copy, and a client submit button using `useFormStatus`. Pending state changes the visible label, sets `aria-busy`, announces through a live region, and uses native `disabled` semantics.

## TDD and verification evidence

Focused behavior tests were written before the production changes. The first RED run was:

```text
& .\node_modules\.bin\vitest.cmd run src/components/v3/public-event/FlashpeakLeaderboardTable.test.tsx src/components/v3/public-event/FlashpeakLeaderboardTable.behavior.test.tsx src/app/events/[slug]/leaderboards/leaderboards-page.test.tsx src/lib/platform/repository.test.ts src/components/v3/LoginSubmitButton.test.tsx src/app/login/login-page-content.test.tsx
```

RED result: 6 test files failed and 9 tests failed. The failures covered the missing V3 route branch, missing source/error empty-state distinction, missing pending submit control, and missing tokenized login output.

The fresh focused GREEN run used the same command and completed with:

```text
Test Files  6 passed (6)
Tests       155 passed (155)
```

Additional final checks:

```text
& .\node_modules\.bin\tsc.cmd --noEmit
```

Exit code 0.

ESLint was run over all changed TypeScript/TSX files. It completed with exit code 0 and 0 errors; it reported four existing warnings in unrelated/pre-existing repository symbols (`repository.test.ts` unused imports and `repository.ts` `matchesProjectedPairing`).

The focused tests include a real jsdom interaction that types a non-matching search and verifies the filter-empty state, route tests for the V3/legacy flag branches and reader error state, repository tests for empty versus error results, and pending/idle submit-button tests.

## UI and accessibility decisions

The V3 page uses the existing dark shell language and primitives rather than a new component system. The data table remains horizontally scrollable on narrow screens. Empty source, reader error, and filter miss have separate localized headings/descriptions. Sort buttons retain keyboard-focus treatment and `aria-sort` on all six statistic columns.

The login form retains `loginAction`, safe `returnTo`, validated `eventId`, locale propagation, forgot-password and register links. Inputs keep visible labels, support password managers and paste, use large touch targets, and retain a visible focus treatment. No cognitive friction or extra confirmation step was added.

The ui-ux-pro-max targeted searches were run for sortable/empty data states and accessible authentication pending feedback. They reinforced meaningful empty-state copy, responsive table overflow, paste/password-manager compatibility, and visible submit feedback. The targeted Next.js accessibility search did not return a relevant result, so the repository’s established primitives and token guidance were used.

## Visual smoke

No database writes or seed/reset operations were used. A local Next.js server was started briefly and the login route was requested with `returnTo` and `eventId`; it returned HTTP 200 and the rendered markup contained the localized submit/pending labels, `current-password`, `miracle-focus-ring`, `returnTo`, and `eventId` fields.

The V3 leaderboard route was requested with `FEATURE_FLAG_UI_V3_FOUNDATION=true` using the existing `flashpeak-champions-32` slug. It returned HTTP 200 with `miracle-public-v3`, `mpv3-section-head`, and `Leaderboard unavailable`, and without `pv-section-card`. The server log showed the expected limitation: this isolated checkout has no `DATABASE_URL`, so the route exercised the truthful reader-error state rather than a live completed-statistics table. A flag-off request returned the legacy `pv-section-card` markup. No screenshot/browser interaction with live data was possible without a configured database fixture; no fixture was created.

## Protected artifact check

The pre-existing protected report and both certificate directories remained untracked and were not edited, staged, or committed. Final status was checked with `git status --short --untracked-files=all`; protected paths were present only as untracked entries, and `git diff --name-only` contained none of them.

## Unresolved issues

There is no live-data visual assertion for completed player rows in this isolated checkout because `DATABASE_URL` is unavailable. The focused rendering, interaction, data-reader, type, lint, and no-database error-state checks are green.
