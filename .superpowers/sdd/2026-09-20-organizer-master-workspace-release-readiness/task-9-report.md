# Task 9 report — organizer reader performance bounds

Date: 2026-09-21 Asia/Jakarta
Branch: `codex/organizer-release-readiness`
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Implementation commit: `d3bc602 perf: bound organizer workspace readers`
Round-3 implementation commit: `37c10a1 fix: preserve organizer reader overflow bounds`
Round-4 implementation commit: `8f76d5a fix: complete organizer reader boundary coverage`

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
| Registration queue + participants (`src/lib/platform/repository.ts`) | 5 / 5 total, 3 / 3 list reads | 12 overall helper budget | teams, requests, import items, roster players probe `501`, reject `ReaderResultOverflowError` above `ORGANIZER_READER_ROW_LIMIT = 500`; existing `filterRegistrationRecords` page output remains capped by requested/default page size (25) |
| Import history/batches/context | not separately instrumented | — | batch outer rows probe `9` with limit `8`, and items probe `501`; history batches probe `101` and nested items `501`; context teams/players probe `501`; independent exact-cap and over-cap repository tests cover every outer/nested boundary |
| Payment review | not separately instrumented | — | deterministic order; probes 101 rows and throws `PaymentReviewOverflowError` when more than `ORGANIZER_READER_HISTORY_LIMIT = 100` are present |
| Competition workspace (`src/lib/competition/workspace-read.ts`) | 16 / 16 | 20 | core rows probe `1,001`; phases/actions/round configs and incidents/announcements/audit history probe `101`; latest draft revision `take: 1`; auxiliary history `ReaderResultOverflowError` is rethrown before the `Promise.allSettled` partial-failure fallback; exact 100-row auxiliary history remains supported |
| Completion workspace (`src/lib/completion/prisma-adapter.ts`) | 13 / 13 | 20 | source matches/revisions/teams/player stats/submissions probe `1,001`; certificates, incidents, and completion audit history probe `101`; >cap delegate test throws `ReaderResultOverflowError` |
| Public compatibility snapshot (`src/lib/events/public-v3-read.ts`) | 7 / 7 | 12 | teams/matches/registrations/certificates probe `501`; podium `take: 3`; awards `take: 4`; certificate IDs reject above 500 rather than slice; >cap delegate test throws `ReaderResultOverflowError` |

The page contract asserts a requested page of 25 never returns more than 25 items. The tests invoke each named reader through instrumented mocked delegates, compare one-team and 64-team traces, assert exact `take` args, and exercise overflow delegates above the configured caps.

## Script contracts

- `scripts/run-smoke-pressure.mjs` now declares a p95 budget of `< 3,000 ms` and zero fetch/status failures for its local pressure contract.
- `scripts/run-dashboard-performance.mjs` installs buffered LCP/INP/CLS observers with `addInitScript` before each measured navigation, records one deterministic safe body interaction for INP, and rejects unavailable or non-finite LCP/INP/CLS/TTFB values against `<2.5s/<200ms/<0.1/<800ms` budgets.
- `scripts/load-test.mjs` and `scripts/load-test-quick.mjs` use autocannon's supported conservative `latency.p97_5`, label the output/budget `p97.5 < 3,000 ms`, and require an explicit `BASE_URL` instead of defaulting to a remote production URL.
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

- Load-script RED: the supplied-target failure contract failed because neither load script contained an exit-1 path. GREEN: both scripts now set `process.exitCode = 1` when a supplied target has missing routes, errors, non-2xx responses, or a p97.5 budget failure; missing `BASE_URL` remains exit 2.
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

## Review fix round 2 evidence

- Percentile/exit RED: the healthy autocannon fixture exited `1` because both scripts read unsupported `latency.p95`; the query snapshot RED showed `first.calls` aliasing the later mutable trace. GREEN: both scripts use supported `latency.p97_5`, label/budget p97.5, and executable local fixtures pass healthy/failing/missing as `0/1/2`; `countQueries` returns an independent `[...]` call snapshot.
- Overflow RED: mocked delegates returned over-limit arrays independently of requested `take`, and the capped readers returned partial data. GREEN: competition, completion, public compatibility, and organizer registration readers request cap+1 and throw the shared `ReaderResultOverflowError` before mapping; exactly-at-cap rows remain valid.

Round-2 focused evidence:

| Contract | Test/evidence | Result |
| --- | --- | --- |
| Load exits | `runs scripts/load-test.mjs with executable 0/1/2 contracts`; `runs scripts/load-test-quick.mjs with executable 0/1/2 contracts` | both pass healthy `0`, failing `1`, missing `2` |
| Overflow bounds | `rejects competition overflow even when the delegate ignores take`; `rejects completion source overflow even when the delegate ignores take`; `rejects public compatibility overflow even when the delegate ignores take`; `rejects registration-reader overflow even when the delegate ignores take` | all reject `ReaderResultOverflowError`; probe args are `1001`/`101`/`501` as applicable |
| Query traces | `snapshots query calls independently from the mutable delegate trace`; all small/64 reader budget cases | snapshots are distinct; `small.count === scale.count`; representative args asserted in both snapshots |

Round-2 final verification:

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run` focused performance/query/named-reader set | 0 | 1.99 s; 9 files / 220 tests passed |
| `npm run lint` (`tsc --noEmit`) | 0 | completed; no TypeScript errors |
| scoped ESLint command | 0 | 3.82 s; 0 errors, 6 pre-existing warnings |
| `node --check` on four scripts plus autocannon fixture loader | 0 | all five syntax checks passed |
| `git diff --check 11f1fcc..HEAD` | 0 | rerun after final report commit; no whitespace errors |

## Review fix round 3 evidence

- Competition auxiliary-history RED: the 101-row incident delegate resolved the workspace with `unavailableSections: ["incidents"]` because the `Promise.allSettled` fallback treated `ReaderResultOverflowError` like an ordinary partial failure. GREEN: auxiliary overflow is rethrown before that fallback; the exact 100-row history remains supported.
- Platform import-cap RED: mocked delegates returned over-limit results independently of their requested `take`, and the readers returned partial data or used the cap rather than cap+1. GREEN: import-batch nested items request `501`; import-history outer batches request `101` and nested items `501`; import-context teams and players request `501`; shared bound assertions reject outer and nested overflow while exact-cap results remain supported.

Round-3 focused verification:

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run src/lib/competition/workspace-read.test.ts src/lib/platform/repository.test.ts -t "(auxiliary history|import-batch|import-history|import-context)"` (RED) | 1 | 897 ms; 2 files / 5 failed, 1 passed, 144 skipped; overflow was swallowed and cap+1 args/assertions were absent |
| same focused command after implementation (GREEN) | 0 | 936 ms; 2 files / 6 selected tests passed, 144 skipped |
| `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts tests/performance/organizer-reader-query-budget.test.ts src/lib/platform/repository.test.ts src/lib/organizer/workspace-read.test.ts src/lib/competition/workspace-read.test.ts src/lib/completion/prisma-adapter.test.ts src/lib/completion/workspace.test.ts src/lib/events/public-v3-read.test.ts src/lib/registration/organizer-workspace-read.test.ts` | 0 | 2.27 s; 9 files / 226 tests passed |
| `npm run lint` (`tsc --noEmit`) | 0 | TypeScript check passed |
| scoped ESLint on the four changed source/test files | 0 | 0 errors; 4 pre-existing unused-symbol warnings |
| `node --check` on `scripts/load-test.mjs`, `scripts/load-test-quick.mjs`, `scripts/run-dashboard-performance.mjs`, and `tests/performance/autocannon-fixture-loader.mjs` | 0 | all syntax checks passed |
| `git diff --check 11f1fcc..HEAD` | 0 | no whitespace errors after the final report commit |

## Review fix round 4 evidence

- Import-batch outer RED: the overflow-9 delegate response resolved instead of rejecting, while the exact-8 test observed `take: 8` rather than the required cap+1 probe. GREEN: `ORGANIZER_READER_IMPORT_BATCH_LIMIT = 8`, query `take: 9`, and `assertReaderResultWithinLimit` enforce the outer boundary independently of the nested item cap.
- Competition auxiliary coverage now parameterizes both exact 100 and overflow 101 for incidents, announcements, and audit. The existing generic production overflow path passed all six cases without a production change.
- Import history exact 100 outer batches and exact 500 nested items, plus import context exact 500 teams and exact 500 players, are exercised in independent tests. Import-batch outer exact 8 and overflow 9 are also independent from nested items.
- Query-count wording now reports numeric counts only for readers directly exercised by `organizer-reader-query-budget.test.ts`; import history/batches/context and payment review are explicitly marked not separately instrumented.

Round-4 focused verification:

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/vitest/vitest.mjs run src/lib/platform/repository.test.ts -t "import-batch outer"` (RED) | 1 | 1 file; 2 failed, 137 skipped; overflow resolved and exact-cap query used `take: 8` |
| same focused command after implementation (GREEN) | 0 | 1 file; 2 passed, 137 skipped |
| `node node_modules/vitest/vitest.mjs run src/lib/competition/workspace-read.test.ts src/lib/platform/repository.test.ts -t "(incidents|announcements|audit|import-batch|import-history|import-context)"` | 0 | 2 files; 17 passed, 143 skipped |
| `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts tests/performance/organizer-reader-query-budget.test.ts src/lib/platform/repository.test.ts src/lib/organizer/workspace-read.test.ts src/lib/competition/workspace-read.test.ts src/lib/completion/prisma-adapter.test.ts src/lib/completion/workspace.test.ts src/lib/events/public-v3-read.test.ts src/lib/registration/organizer-workspace-read.test.ts` | 0 | 9 files; 236 tests passed |
| `npm run lint` (`tsc --noEmit`) | 0 | TypeScript check passed |
| scoped ESLint on the three changed source/test files | 0 | 0 errors; 4 pre-existing unused-symbol warnings |

## Blocker matrix

| Gate | Status | Exact missing external input / reason |
| --- | --- | --- |
| Shared-Neon/live fixture and runtime query count | `BLOCKED` | authorized `.env.test` with `DATABASE_URL` and `DIRECT_URL` is absent; no live fixture rows or cleanup were attempted |
| Pressure smoke / p95 | `BLOCKED` | credentialed preview/shared Neon target and authorized `.env.test` are absent; no pressure timing claim is made |
| Browser performance | `BLOCKED` | `DASHBOARD_PERF_BASE_URL`, `DASHBOARD_ADMIN_EMAIL`, `DASHBOARD_ADMIN_PASSWORD`, `DASHBOARD_CAPTAIN_EMAIL`, `DASHBOARD_CAPTAIN_PASSWORD`, `DASHBOARD_PERF_EVENT_ID`, and `DASHBOARD_PERF_PUBLIC_EVENT_SLUG` were not supplied; no preview/browser budget claim is made |
| Production-like preview | `BLOCKED` | no authorized credentialed preview URL was supplied |
| Load test | `BLOCKED` | `BASE_URL` was not supplied; both load scripts now exit `2` rather than target a default remote URL |

No production deployment, migration, shared-Neon mutation, preview mutation, or secret inspection was performed. The release decision remains `BLOCKED` pending the external evidence gates and independent Task 9 review verdicts.

## Focused runtime-harness fix — 2026-09-24

The execution-boundary Windows Schannel preflight failure remains unchanged and was not retried or treated as a repository defect. This scoped fix addresses only the two repo-owned harness defects identified in the runtime report:

- `scripts/run-dashboard-performance.mjs` now installs a buffered `first-input` observer before navigation and uses its finite duration only when the Event Timing `event` value is unavailable. The existing `<200 ms` browser budget remains fail-closed when neither evidence source is available. The representative interaction remains exactly one body click per measurement.
- `scripts/load-test-quick.mjs` now uses `/id`, `/id/events`, and `/id/events/kuroko-summer-cup/bracket` for local targets, avoiding middleware's intentional 307 locale redirect while preserving 50 connections, 5 seconds, zero non-2xx/error requirements, and p97.5 `< 3,000 ms`.

### TDD evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts -t "(first-input fallback|exact locale-prefixed local quick-load routes)"` | Exit 1; 10 tests collected, 2 new contracts failed (missing `first-input`; locale-less local paths), 8 skipped. The initial sandbox attempt was an environment-only `spawn EPERM`; the elevated rerun reached the intended assertions. |
| GREEN | same focused command | Exit 0; 1 file, 2 selected tests passed, 8 skipped; 312 ms. |
| Focused unit | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts` | Exit 0; 1 file, 10 tests passed; 1.50 s. |

### Static verification

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 0 | TypeScript check passed; 18.37 s. The default incremental invocation was not used for evidence because it hit an environment-only `EPERM` rewriting `tsconfig.tsbuildinfo`. |
| `node node_modules/eslint/bin/eslint.js scripts/run-dashboard-performance.mjs scripts/load-test-quick.mjs tests/performance/organizer-readers.test.ts` | 0 | No errors. |
| `node --check scripts/run-dashboard-performance.mjs` and `node --check scripts/load-test-quick.mjs` | 0 | Both scripts parsed successfully. |
| `git diff --check` | 0 | No whitespace errors. |

Files changed for this fix: `scripts/run-dashboard-performance.mjs`, `scripts/load-test-quick.mjs`, `tests/performance/organizer-readers.test.ts`, and this report. No product behavior, thresholds, retries, timeouts, full load script, database, browser run, E2E run, reset/seed, push, or deployment was changed or executed. Residual risks remain the blocked credentialed preview/browser/load evidence and the external Schannel preflight boundary.

## Review fix round 1 — runtime-harness contracts — 2026-09-24

The review-required follow-up is complete. The browser harness now feeds both buffered `event` and buffered `first-input` entries through one finite-only `recordInteractionDuration` reducer. It retains the maximum valid duration regardless of observer order, ignores missing/non-finite values without coercing them to zero, and leaves `inp` null when no valid evidence exists. After the single representative body click, `recordRepresentativeInteraction` uses a bounded `waitForFunction` poll for that shared metric; timeout is swallowed so the existing fail-closed `<200 ms` metric failure remains authoritative. No fixed sleep or synthetic delay remains.

The quick-load contract test now runs the script through the autocannon fixture loader, captures every actual URL/options object, and deep-compares the exact local route set, 50 connections, 5-second duration, accepted header, p97.5 result, zero errors/non-2xx, and absence of redirect/allowlisting options. The fixture loader change is test-only and does not alter the full load script or production behavior.

### TDD evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts -t "(shared finite-only|exact local quick-load route/options)"` | Exit 1; 11 tests collected, 2 review contracts failed, 9 skipped. The opposing observer case produced 30 instead of the required shared maximum 240; the capture marker was absent before fixture instrumentation. |
| GREEN | same focused command | Exit 0; 1 file, 2 selected tests passed, 9 skipped; 440 ms. |
| Focused unit | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts` | Exit 0; 1 file, 11 tests passed; 1.60 s. |

### Static verification

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 0 | TypeScript check passed. |
| `node node_modules/eslint/bin/eslint.js scripts/run-dashboard-performance.mjs scripts/load-test-quick.mjs tests/performance/organizer-readers.test.ts tests/performance/autocannon-fixture-loader.mjs` | 0 | No errors. |
| `node --check scripts/run-dashboard-performance.mjs` and `node --check scripts/load-test-quick.mjs` and `node --check tests/performance/autocannon-fixture-loader.mjs` | 0 | All changed scripts parsed successfully. |
| `git diff --check` | 0 | No whitespace errors. |

Files changed in this review round: `scripts/run-dashboard-performance.mjs`, `tests/performance/organizer-readers.test.ts`, `tests/performance/autocannon-fixture-loader.mjs`, and this report. The Schannel preflight was not retried; live preview/browser/load, database, full E2E, reset/seed, push, and deployment remain out of scope and blocked as previously recorded.

## Review fix round 2 — independent gate and observer-order contracts — 2026-09-24

The second review-round test hardening is complete. The observer contract now exercises both opposing orders (`first-input=240` then `event=30`, and `event=30` then `first-input=240`) and retains the shared maximum in both cases, alongside event-only, first-input-only, invalid/non-finite, and no-metric cases. The production observer implementation was already correct; this round strengthens regression resistance without changing it.

The autocannon fixture now has independent `slow`, `errors`, `non2xx`, `boundary-pass` (p97.5=2,999), and `boundary-fail` (p97.5=3,000) modes. Each mode runs the real quick-load script entrypoint and asserts all three captured calls independently: exact full loopback origin plus `/id`, `/id/events`, and `/id/events/kuroko-summer-cup/bracket`; exact 50 connections, 5-second duration, and headers; zero/non-zero errors and non-2xx fields; and the strict p97.5 `< 3,000 ms` boundary. Exact URL equality rejects prefix-lookalike routes, and exact captured option keys reject redirect/allowlisting options.

### TDD evidence

| Phase | Command | Result |
| --- | --- | --- |
| RED | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts -t "(shared finite-only|exact local quick-load route/options|quick-load gates)"` | Exit 1; 12 tests collected, 1 new independent-gate contract failed, 2 selected contracts passed, 9 skipped. The existing fixture emitted p97.5=100 for `boundary-pass` instead of the required 2,999. |
| GREEN | same focused command | Exit 0; 1 file, 3 selected tests passed, 9 skipped; 1.06 s. |
| Focused unit | `node node_modules/vitest/vitest.mjs run tests/performance/organizer-readers.test.ts` | Exit 0; 1 file, 12 tests passed; 2.14 s. |

### Static verification

| Command | Exit | Result |
| --- | ---: | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 0 | TypeScript check passed. |
| `node node_modules/eslint/bin/eslint.js scripts/run-dashboard-performance.mjs scripts/load-test-quick.mjs tests/performance/organizer-readers.test.ts tests/performance/autocannon-fixture-loader.mjs` | 0 | No errors. |
| `node --check scripts/run-dashboard-performance.mjs` and `node --check scripts/load-test-quick.mjs` and `node --check tests/performance/autocannon-fixture-loader.mjs` | 0 | All relevant scripts parsed successfully. |
| `git diff --check` | 0 | No whitespace errors. |

No browser, database, full E2E, live load target, reset/seed, push, deployment, or Schannel retry was performed. External credentialed preview/load and preflight gates remain blocked as previously recorded.
