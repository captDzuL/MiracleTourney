# Task 8 report — injection, XSS, API exposure, and safe errors

Status: bounded coherent slice complete through Task 8 fix round 2; full runtime/browser/live-database gate remains BLOCKED.

## Scope and inventory

- Isolated worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
- Branch/base: `codex/organizer-release-readiness` at `4bb12d8` before this task.
- Inventory: 6 API route rows + 15 listed action/validation/import boundaries = 21 base rows in `docs/operations/release-security-inventory.md`, with the explicit round-2 actor/ID and uncovered-action lists below. This is a bounded inventory, not an exhaustive action sweep.
- Implemented production slice: reusable same-origin guard with fail-closed unsafe-request policy, public error mapper, structured redacted logger, minimal health response, uniform route error envelopes, competition path validation, credential-export safe errors/formula neutralization, ongoing-event slug/error validation, safe action/registration errors, certificate mutation rate limits, plain-text team-field validation, and CSV/XLSX/image filename/formula/signature validation.

Round-2 finding matrix:

| Finding | Covered code/tests | Result |
| --- | --- | --- |
| P1 public registration markup write | `src/lib/registration/actions.ts`; direct no-write markup regression in `src/lib/registration/actions.test.ts` | GREEN, 4/4 registration tests |
| P1 strict entity IDs | `safeEntityIdSchema` on the listed event/revision/completion/certificate/competition/player-stats and legacy action boundaries; traversal/SQL no-repository tests in the six action test files plus registration | GREEN in the final 18-file suite |
| P1 registration/import/upload rate limits | actor+event keys in captain registration, registration import preview/commit, QRIS upload, and revision visual upload; blocked-path tests in three action suites | GREEN, 3 files/40 tests |
| P1 certificate raw logging | stable codes and structured hashed identifiers for finalization/durable persistence failures; log-capture tests in `service.test.ts` | GREEN, 65/65 service tests |
| P1 six-route error contract | captain credentials, ongoing, health, `/api/me`, debug locale, and competition tests | GREEN, 6 files/19 tests |
| P2 dynamic logger collision | canonical positional templates for dynamic event routes; `/api/events/admin/ongoing` regression | GREEN, 5/5 logger tests |
| P2 localized certificate throttling | ID/EN `certificateStudio.feedback.rate_limited`; regenerate and publish UI regressions | GREEN, 22/22 component tests |

## RED → GREEN evidence

Each production behavior was preceded by a focused failing test. The initial RED failures were expected missing-module, stale-response, unguarded-input, or leaked-error failures; one CSV RED run first exposed malformed test quoting and was corrected before the production RED assertion.

| Check | RED evidence | GREEN evidence |
| --- | --- | --- |
| Shared guard/error/formula matrix | missing `request-guard` module; exit 1 | `negative-inputs.test.ts`: 7 tests passed |
| Structured logger | missing `logger` module; exit 1 | `logger.test.ts`: 3 tests passed |
| Health API | old env/status payload failed `{ status: "ok" }` assertion; exit 1 | `route.test.ts`: 2 tests passed |
| Captain credential export | text errors and uncaught repository error failed generic-body assertions; exit 1 | `route.test.ts`: 7 tests passed |
| Ongoing event API | invalid slug returned 404 and reader failure returned 503; exit 1 | `route.test.ts`: 2 tests passed |
| Registration intake | CSV formula flags and traversal filename were absent; exit 1 | `registration-intake.test.ts`: 8 tests passed |
| Same-origin sibling/missing-Origin policy | 3 failures: missing-Origin guard was `undefined`; middleware sibling and missing-Origin requests returned `200` | `negative-inputs.test.ts` + `middleware.test.ts`: 15 tests passed |
| Uniform route error envelopes | captain/health forbidden bodies exposed `{ error: "forbidden" }`; competition route lacked path validation/request IDs | captain, health, and competition route tests: 7 files in P1 suite, 35 tests passed |
| Action/registration error redaction | repository `Error.message` was copied into redirects/log fields | `actions.test.ts` 162 passed; `registration/actions.test.ts` included secret-error redirect regression |
| Certificate mutation limiter | V3 regeneration/publication had no shared limiter call | `certificate-v3-actions.test.ts` covers both blocked paths; P1 suite 35 passed |
| P2 XSS/JSON-LD/MIME/route redaction matrix | logger route and team markup regressions failed before production changes | logger/security/upload/JSON-LD suite: 4 files, 24 tests passed |
| Round-2 negative matrix | 4 rate-limit, 2 certificate-log, 2 route-contract, 1 logger-collision, and 2 CertificateStudio locale regressions failed before their corresponding changes | all GREEN in the final focused suite |

## Verification commands

Commands were run from the isolated worktree. The repository's `pnpm exec vitest` shim was not discoverable in this Windows shell, so the equivalent checked-in binary was run directly with Node; this is recorded rather than treated as a test pass.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm exec vitest run src/lib/security/negative-inputs.test.ts` | exit 1 | shell could not resolve `vitest` (environment/tooling issue) |
| `node node_modules/vitest/vitest.mjs run src/lib/security/negative-inputs.test.ts src/middleware.test.ts src/app/api/admin/captain-credentials/route.test.ts src/app/api/health/env/route.test.ts "src/app/api/organizer/events/[eventId]/competition/route.test.ts" src/lib/registration/actions.test.ts src/lib/actions/certificate-v3-actions.test.ts` | exit 0; 3.33s | 7 files, 35 tests passed, 0 skipped, 0 failed |
| `node node_modules/vitest/vitest.mjs run src/lib/actions.test.ts src/lib/server-action-bundle.test.ts src/security-smoke.test.ts` | exit 0; 1.01s | 3 files, 165 tests passed, 0 skipped, 0 failed |
| `node node_modules/vitest/vitest.mjs run src/lib/observability/logger.test.ts src/lib/security/negative-inputs.test.ts src/lib/upload-image-asset.test.ts src/lib/seo/json-ld.test.ts` | exit 0; 2.85s | 4 files, 24 tests passed, 0 skipped, 0 failed |
| `node node_modules/vitest/vitest.mjs run src/middleware.test.ts src/security-smoke.test.ts src/lib/actions.test.ts src/lib/server-action-bundle.test.ts src/app/api/admin/captain-credentials/route.test.ts src/app/api/health/env/route.test.ts src/lib/security/negative-inputs.test.ts src/lib/observability/logger.test.ts "src/app/api/events/[slug]/ongoing/route.test.ts" src/lib/imports/registration-intake.test.ts` | exit 0; prior baseline | 10 files, 204 tests passed, 0 skipped, 0 failed |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 | no diagnostics |
| final focused suite over all touched security/action/API tests | exit 0; 3.99s | 15 files, 231 tests passed, 0 skipped, 0 failed |
| final round-2 focused suite over the reviewed action, route, logger, certificate, and UI surfaces | exit 0; 3.70s | 18 files, 404 tests passed, 0 skipped, 0 failed |
| focused ESLint over all changed source/tests | exit 0 | no errors or warnings |
| `git diff --check` | exit 0 | no whitespace errors |
| `rg -n --glob '!**/*.test.ts' --glob '!**/*.test.tsx' '\$queryRawUnsafe|\$executeRawUnsafe|Access-Control-Allow-Origin.*\*' src` | exit 0 | no runtime raw-SQL escape hatch or wildcard CORS matches |

## Redaction and boundary notes

- `requireSameOrigin` gates unsafe methods by comparing parsed `Origin` and request URL origins, rejects missing/malformed origins, and returns only `{ code: "forbidden", requestId }` with `403` for a mismatch. Middleware applies the same fail-closed policy and no longer trusts `Sec-Fetch-Site: same-site` over an origin mismatch.
- `toPublicError` maps validation/authorization/internal failures to the three allowed codes and never returns stack, Prisma, secret, token, environment, email, payment URL, or PII details.
- `writeServerLog` emits an allowlisted JSON event; actor/resource/request identifiers are hashed before certificate failure records, and canonical positional templates prevent dynamic values such as an `admin` slug from colliding with static route segments. `withServerLog` emits `start`, `done`, and safe `failed` records.
- Health now returns `{ status: "ok" }` only to a platform-admin session and `no-store` headers.
- Credential CSV cells beginning with `=`, `+`, `-`, or `@` are prefixed with `'`; invalid event IDs and repository failures are generic, non-cacheable JSON.
- Action and registration redirects preserve only an explicit safe-message allowlist or bounded image-validation messages; arbitrary repository errors are replaced with stable fallbacks and raw exception objects are not logged.
- Certificate V3 regeneration/publication and the bounded registration/import/upload paths use the shared in-process limiter; browser/load behavior still needs authorized runtime evidence.
- Development locale diagnostics return locale data only; JSON-LD uses `<` escaping, team names/captain names reject markup, and image tests cover declared-MIME/signature mismatches.
- Registration CSV formula-leading cells are marked before mapping; mapped formulas remain rejected by preview. Upload filenames reject traversal/separators before parsing.

## Explicit gaps / blocked evidence

- Browser/live-DB runtime, preview deployment, rate-limit service behavior under load, and credentialed E2E evidence were not run; no authorized `.env.test` or non-production DB action was available.
- Broad action instrumentation and exhaustive message allowlisting remain out of scope; only direct repository-error redirect/log paths identified in this review round were hardened.
- Explicit strict-ID coverage is limited to the listed boundaries: V3 event/revision/completion/certificate/competition/player-stats actions, the reviewed legacy event/payment/stat/visual action IDs in `src/lib/actions.ts`, and registration/certificate service IDs. Other legacy action inputs remain outside this round's direct-call matrix.
- Explicit rate-limit gaps for a follow-up round: `adminImportTeamsCsvAction`, `adminUploadCharacterArtAction`, `adminUploadEventLogoAction`, `organizerUploadEventLogoAction`, `adminUploadEventVisualAction`, `organizerUploadEventVisualAction`, `adminUploadTeamLogoAction`, `captainUploadTeamLogoAction`, and `captainUploadPaymentProofAction` retain existing auth/upload validation but do not receive a new actor+event `checkRateLimit` in this bounded slice. The inventory no longer claims exhaustive upload throttling.
- Middleware's existing server-action CSRF behavior remains in place; the reusable guard is applied to the touched API routes. The Next middleware matcher still intentionally excludes `/api`, so future unsafe API handlers must call the guard at their route boundary.
- Logger helpers are tested and available but not instrumented across every listed route/action; broad instrumentation is part of the later observability task.
- No Sentry or external log drain was added.

## Files changed

- `docs/operations/release-security-inventory.md`
- `src/lib/security/request-guard.ts`
- `src/lib/security/public-error.ts`
- `src/lib/security/negative-inputs.test.ts`
- `src/lib/observability/logger.ts`
- `src/lib/observability/logger.test.ts`
- `src/app/api/admin/captain-credentials/route.ts` and test
- `src/app/api/events/[slug]/ongoing/route.ts` and test
- `src/app/api/health/env/route.ts` and test
- `src/app/api/debug-locale/route.ts`
- `src/app/api/debug-locale/route.test.ts`
- `src/app/api/me/route.ts` and test
- `src/app/api/organizer/events/[eventId]/competition/route.ts` and test
- `src/lib/actions.ts`
- `src/lib/actions/certificate-v3-actions.ts` and test
- `src/lib/certificate/service.ts`
- `src/lib/registration/actions.ts` and test
- `src/lib/validation/team-data.ts`
- `src/lib/upload-image-asset.test.ts`
- `src/lib/imports/registration-intake.ts` and test
- Round-2 additions: `src/app/api/me/route.ts` and test, `src/app/api/debug-locale/route.test.ts`, competition route contract test, registration/revision rate-limit tests, certificate structured-log tests, CertificateStudio throttling tests, and ID/EN `certificateStudio.feedback.rate_limited` copy.

Initial Task 8 commit: `796668207d9607fa39c198ea0dc201f84fe6987e` (`fix: harden API inputs and public errors`). Round-1 fix commit: `976141ec530acbe8a1ba3b443fe6ab632abe3a7b` (`fix: close task 8 security review findings`). Round-2 fix commit is the final commit containing this report (`fix: close task 8 round 2 security findings`).
