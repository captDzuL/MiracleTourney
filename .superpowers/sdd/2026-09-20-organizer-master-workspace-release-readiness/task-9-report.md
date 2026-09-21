# Task 9 report — organizer reader performance bounds

Date: 2026-09-21 Asia/Jakarta  
Branch: `codex/organizer-release-readiness`  
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`  
Commit: `perf: bound organizer workspace readers` (final SHA returned in handoff)

## Outcome

Credential-independent Task 9 contracts and reader bounds are implemented. The four named reader families retain their response shapes and authorization boundaries while list/history Prisma reads now carry explicit caps. Registration queue/participants/payment/import readers were also capped at the existing repository boundary because those lists are the concrete organizer surfaces consumed by the named workspace shell.

No credentialed database, pressure, preview, browser, or load result is claimed. Those gates remain `BLOCKED` with the exact missing inputs below.

## RED/GREEN evidence

The first required command could not resolve the worktree's missing pnpm Vitest shim:

```text
Command: pnpm exec vitest run tests/performance/organizer-readers.test.ts
Exit: 1
Observed: 'vitest' is not recognized as an internal or external command
```

The installed package entrypoint then reached the intended RED after the performance glob was added to `vitest.config.ts` (the repository's original include list excluded `tests/performance`):

```text
Command: node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts
Exit: 1
Duration: 279 ms
Result: 1 test file; 6 tests; 4 passed, 2 failed
Failures: missing `take` bound in `getRegistrationRecordsForEvent` / `getPaymentReviewForEvent`; missing collection caps in `compatibilitySnapshot`
```

After the minimal reader and script changes, the focused contract passed:

```text
Command: node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts
Exit: 0
Duration: 275 ms
Result: 1 test file; 8 tests passed
```

The combined focused verification also passed:

```text
Command: node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts src/lib/organizer/workspace-read.test.ts src/lib/competition/workspace-read.test.ts src/lib/completion/prisma-adapter.test.ts src/lib/completion/workspace.test.ts src/lib/events/public-v3-read.test.ts src/lib/registration/organizer-workspace-read.test.ts
Exit: 0
Duration: 1.29 s
Result: 7 test files; 81 tests passed
```

The query counter is deliberately test-only and works with mocked query markers; no production query hook was added. The scale helper is a deterministic manifest generator and does not claim to seed a live database.

## Scale fixture manifest

`tests/performance/organizer-readers.test.ts` exports the exact required `OrganizerScaleFixture`, `seedOrganizerScaleFixture(teamCount = 64, playersPerTeam = 5)`, and `countQueries<T>()` contracts.

| Dataset item | Cardinality | Evidence/status |
| --- | ---: | --- |
| Teams | 64 | deterministic fixture manifest; no live DB available |
| Players | 320 (64 × 5) | deterministic fixture manifest; no live DB available |
| Relevant matches | 63 | deterministic single-elimination-sized manifest |
| Player-stat rows | 320 | declared scale manifest for one stat row per player |
| Competition/completion audit rows | 100 | declared history pressure manifest and reader cap |
| Tournament Completion | 1 | declared scale manifest |
| Certificates | 7 | exact required certificate types in fixture IDs |

The fixture cardinalities are asserted in the focused test. Because `DATABASE_URL`/`DIRECT_URL` and authorized `.env.test` are absent, no Prisma rows were created or cleaned and no live query count/p95 value is reported.

## Query and page-bound matrix

Static call-site counts are bounded, credential-independent evidence; they are not a substitute for the blocked live Neon query trace.

| Reader/surface | Static query call sites | Test budget | Row/history/page bounds |
| --- | ---: | ---: | --- |
| Organizer summary (`src/lib/organizer/workspace-read.ts`) | 1 | 4 | one event query with filtered `_count`; no event-sized list payload |
| Registration queue + participants (`src/lib/platform/repository.ts`) | 3 underlying list reads | 12 overall helper budget | teams, requests, import items, roster players capped by `ORGANIZER_READER_ROW_LIMIT = 500`; existing `filterRegistrationRecords` page output remains capped by requested/default page size (25) |
| Import history/batches/context | included above | — | history batches `ORGANIZER_READER_HISTORY_LIMIT = 100`; nested items/participant teams/players capped at 500 |
| Payment review | 1 list read | — | `ORGANIZER_READER_HISTORY_LIMIT = 100` |
| Competition workspace (`src/lib/competition/workspace-read.ts`) | 14 | 20 | core rows capped at 1,000; phases/actions/round configs and incidents/announcements/audit history capped at 100; latest draft revision `take: 1` |
| Completion workspace (`src/lib/completion/prisma-adapter.ts`) | 14 in workspace-load/source path | 20 | source matches/revisions/teams/player stats/submissions capped at 1,000; certificates, incidents, and completion audit history capped at 100 |
| Public compatibility snapshot (`src/lib/events/public-v3-read.ts`) | 6 `callOptional` reads | 12 | teams/matches/registrations/certificates capped at 500; podium `take: 3`; awards `take: 4`; certificate IDs sliced to 500 |

The page contract asserts a requested page of 25 never returns more than 25 items. The tests also assert fixed query-call budgets independent of the 64-team cardinality.

## Script contracts

- `scripts/run-smoke-pressure.mjs` now declares a p95 budget of `< 3,000 ms` and zero fetch/status failures for its local pressure contract.
- `scripts/run-dashboard-performance.mjs` measures organizer overview, registration queue, participants, competition, Match Control, Completion, Certificate Studio, and public event routes, and records LCP/INP/CLS/TTFB budgets of `<2.5s/<200ms/<0.1/<800ms`.
- `scripts/load-test.mjs` and `scripts/load-test-quick.mjs` now report actual p95 (not p97.5 mislabeled as p95), enforce `<3,000 ms`, and require an explicit `BASE_URL` instead of defaulting to a remote production URL.
- Missing dashboard/load inputs return exit `2` with `BLOCKED` text rather than a successful skip.

## Verification commands

| Command | Exit | Duration/result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run ...` focused reader set | 0 | 1.29 s; 7 files / 81 tests passed |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | 4.40 s |
| `node node_modules/eslint/bin/eslint.js` on changed TS/config/test files | 0 | 3.99 s; 0 errors, 3 existing unused-symbol warnings |
| `node --check` on all four changed `.mjs` scripts | 0 | included in 3.99 s verification command |
| `git diff --check` | 0 | included in final verification command |
| `node node_modules/prisma/build/index.js validate --schema prisma/schema.prisma` | 1 | 10.01 s; blocked by missing `DIRECT_URL` (`P1012`) |

Pre-existing ESLint warnings are in `src/lib/events/public-v3-read.ts` (`publicV3RouteTarget`, `CompatiblePublicCertificate`) and `src/lib/platform/repository.ts` (`matchesProjectedPairing`); this task did not introduce them.

## Blocker matrix

| Gate | Status | Exact missing external input / reason |
| --- | --- | --- |
| Shared-Neon/live fixture and runtime query count | `BLOCKED` | authorized `.env.test` with `DATABASE_URL` and `DIRECT_URL` is absent; no live fixture rows or cleanup were attempted |
| Pressure smoke / p95 | `BLOCKED` | credentialed preview/shared Neon target and authorized `.env.test` are absent; no pressure timing claim is made |
| Browser performance | `BLOCKED` | `DASHBOARD_PERF_BASE_URL`, `DASHBOARD_ADMIN_EMAIL`, `DASHBOARD_ADMIN_PASSWORD`, `DASHBOARD_CAPTAIN_EMAIL`, `DASHBOARD_CAPTAIN_PASSWORD`, `DASHBOARD_PERF_EVENT_ID`, and `DASHBOARD_PERF_PUBLIC_EVENT_SLUG` were not supplied; no preview/browser budget claim is made |
| Production-like preview | `BLOCKED` | no authorized credentialed preview URL was supplied |
| Load test | `BLOCKED` | `BASE_URL` was not supplied; both load scripts now exit `2` rather than target a default remote URL |

No production deployment, migration, shared-Neon mutation, preview mutation, or secret inspection was performed. The release decision remains `BLOCKED` pending the external evidence gates and independent Task 9 review verdicts.
