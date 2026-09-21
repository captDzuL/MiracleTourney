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

The query counter is deliberately test-only and counts calls recorded by instrumented mocked Prisma delegates; no production query hook was added. The scale helper executes real Prisma `create`/`createMany` calls when passed an authorized client and exposes event/organizer-scoped cleanup, but no live database was used in this run.

## Scale fixture manifest

`tests/performance/organizer-readers.test.ts` exports the exact required `OrganizerScaleFixture`, executable `seedOrganizerScaleFixture(client, { namespace? })`, and `countQueries<T>()` contracts.

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

Instrumented delegate calls are bounded, credential-independent evidence; they are not a substitute for the blocked live Neon query trace.

| Reader/surface | Instrumented query calls (small / 64 teams) | Test budget | Row/history/page bounds |
| --- | ---: | ---: | --- |
| Organizer summary (`src/lib/organizer/workspace-read.ts`) | 1 / 1 | 4 | one event query with filtered `_count`; no event-sized list payload |
| Registration queue + participants (`src/lib/platform/repository.ts`) | 5 / 5 total, 3 / 3 list reads | 12 overall helper budget | teams, requests, import items, roster players capped by `ORGANIZER_READER_ROW_LIMIT = 500`; existing `filterRegistrationRecords` page output remains capped by requested/default page size (25) |
| Import history/batches/context | included above | — | history batches `ORGANIZER_READER_HISTORY_LIMIT = 100`; nested items/participant teams/players capped at 500 |
| Payment review | 1 list read | — | deterministic order; probes 101 rows and throws `PaymentReviewOverflowError` when more than `ORGANIZER_READER_HISTORY_LIMIT = 100` are present |
| Competition workspace (`src/lib/competition/workspace-read.ts`) | 16 / 16 | 20 | core rows capped at 1,000; phases/actions/round configs and incidents/announcements/audit history capped at 100; latest draft revision `take: 1`; >cap delegate test passes |
| Completion workspace (`src/lib/completion/prisma-adapter.ts`) | 13 / 13 | 20 | source matches/revisions/teams/player stats/submissions capped at 1,000; certificates, incidents, and completion audit history capped at 100; >cap delegate test passes |
| Public compatibility snapshot (`src/lib/events/public-v3-read.ts`) | 7 / 7 | 12 | teams/matches/registrations/certificates capped at 500; podium `take: 3`; awards `take: 4`; certificate IDs sliced to 500; >cap delegate test passes |

The page contract asserts a requested page of 25 never returns more than 25 items. The tests invoke each named reader through instrumented mocked delegates, compare one-team and 64-team traces, assert exact `take` args, and exercise overflow delegates above the configured caps.

## Script contracts

- `scripts/run-smoke-pressure.mjs` now declares a p95 budget of `< 3,000 ms` and zero fetch/status failures for its local pressure contract.
- `scripts/run-dashboard-performance.mjs` installs buffered LCP/INP/CLS observers with `addInitScript` before each measured navigation, records one deterministic safe body interaction for INP, and rejects unavailable or non-finite LCP/INP/CLS/TTFB values against `<2.5s/<200ms/<0.1/<800ms` budgets.
- `scripts/load-test.mjs` and `scripts/load-test-quick.mjs` now report actual p95 (not p97.5 mislabeled as p95), enforce `<3,000 ms`, and require an explicit `BASE_URL` instead of defaulting to a remote production URL.
- Missing dashboard/load inputs return exit `2` with `BLOCKED` text rather than a successful skip.

## Verification commands

| Command | Exit | Duration/result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run ...` focused reader set | 0 | 1.29 s; 7 files / 81 tests passed |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | 4.40 s |
| `node node_modules/eslint/bin/eslint.js` on changed TS/config/test files | 0 | 3.99 s; 0 errors, 3 existing unused-symbol warnings |
| `node --check` on all four changed `.mjs` scripts | 0 | included in 3.99 s verification command |
| `git diff --check 11f1fcc..HEAD` | 0 | exact committed Task 9 range; no whitespace errors |
| `node node_modules/prisma/build/index.js validate --schema prisma/schema.prisma` | 1 | 10.01 s; blocked by missing `DIRECT_URL` (`P1012`) |

Pre-existing ESLint warnings are in `src/lib/events/public-v3-read.ts` (`publicV3RouteTarget`, `CompatiblePublicCertificate`) and `src/lib/platform/repository.ts` (`matchesProjectedPairing`); this task did not introduce them.

## Review fix round 1 evidence

- Load-script RED: the supplied-target failure contract failed because neither load script contained an exit-1 path. GREEN: both scripts now set `process.exitCode = 1` when a supplied target has missing routes, errors, non-2xx responses, or a p95 budget failure; missing `BASE_URL` remains exit 2.
- Fixture RED: passing a Prisma-compatible client to the synthetic helper raised `TypeError: object is not a function`. GREEN: the helper now performs the scoped 64-team/320-player/63-match/320-stat/100-audit/1-completion/7-certificate writes in a transaction and returns idempotent event/user cleanup. The live test is intentionally blocked without credentials.
- Query RED: the previous tests only counted a test hook and source regexes. GREEN: `tests/performance/organizer-reader-query-budget.test.ts` invokes all four named readers through instrumented mocked delegates, compares small and 64-team traces, checks exact `take` arguments, and covers >cap delegate responses.
- Payment RED: 101 mocked payment rows resolved through the old capped reader. GREEN: the reader probes 101 rows and throws `PaymentReviewOverflowError` instead of silently truncating.
- Dashboard/report RED: the browser script lacked pre-navigation buffered observers and the report had trailing whitespace/no exact range command. GREEN: `addInitScript` installs buffered LCP/INP/CLS observers before navigation, a deterministic body click records INP, unavailable/non-finite metrics fail explicitly, and the report is whitespace-clean with `git diff --check 11f1fcc..HEAD` recorded below.

Fix-round focused verification:

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts tests/performance/organizer-reader-query-budget.test.ts src/lib/platform/repository.test.ts` | 0 | 1.23 s; 3 files / 142 tests passed |
| `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts -t "(buffered browser|Task 9 report)"` | 0 | 284 ms; 2 tests passed |
| `npm run lint` (`tsc --noEmit`) | 0 | 5.19 s |
| `node node_modules/eslint/bin/eslint.js` on the five changed TypeScript/test files | 0 | 3.97 s; 0 errors, 4 existing warnings |
| `node --check` on all four changed `.mjs` scripts | 0 | all syntax checks passed |
| `git diff --check 11f1fcc..HEAD` | 0 | exact committed Task 9 range; no whitespace errors |

## Blocker matrix

| Gate | Status | Exact missing external input / reason |
| --- | --- | --- |
| Shared-Neon/live fixture and runtime query count | `BLOCKED` | authorized `.env.test` with `DATABASE_URL` and `DIRECT_URL` is absent; no live fixture rows or cleanup were attempted |
| Pressure smoke / p95 | `BLOCKED` | credentialed preview/shared Neon target and authorized `.env.test` are absent; no pressure timing claim is made |
| Browser performance | `BLOCKED` | `DASHBOARD_PERF_BASE_URL`, `DASHBOARD_ADMIN_EMAIL`, `DASHBOARD_ADMIN_PASSWORD`, `DASHBOARD_CAPTAIN_EMAIL`, `DASHBOARD_CAPTAIN_PASSWORD`, `DASHBOARD_PERF_EVENT_ID`, and `DASHBOARD_PERF_PUBLIC_EVENT_SLUG` were not supplied; no preview/browser budget claim is made |
| Production-like preview | `BLOCKED` | no authorized credentialed preview URL was supplied |
| Load test | `BLOCKED` | `BASE_URL` was not supplied; both load scripts now exit `2` rather than target a default remote URL |

No production deployment, migration, shared-Neon mutation, preview mutation, or secret inspection was performed. The release decision remains `BLOCKED` pending the external evidence gates and independent Task 9 review verdicts.
