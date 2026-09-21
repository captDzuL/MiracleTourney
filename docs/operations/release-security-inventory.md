# Release security inventory

Scope: Task 8 release-readiness routes, server actions, validators, and import
boundaries. Every request-controlled identifier is parsed before a repository
call; workspace mutations require both role and event ownership checks. The
default response policy for authenticated data is `private, no-store`.

| Surface | auth | ownership | input schema | origin | rate limit | response exposure | cache policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/admin/captain-credentials` | platform admin, admin, or organizer | organizer is limited to its event; admin roles use repository authorization | safe event-id query; CSV cells formula-neutralized | same-origin guard is available for unsafe methods; GET is read-only | login/session boundary; export is not a public mutation | CSV contains credential material and is treated as sensitive; generic denial/provider failures | `no-store, max-age=0`, `Vary: Cookie`, `X-Robots-Tag: noindex` |
| `GET /api/debug-locale` | platform admin; development only | platform-admin session | no caller input; request headers are not echoed | same-origin guard for unsafe methods | platform-admin session boundary | locale only; auth/locale-provider failures are generic | `no-store, max-age=0`, `Vary: Cookie` |
| `GET /api/events/[slug]/ongoing` | public | published event slug only | bounded safe slug path; repository owns public projection | same-origin guard for unsafe methods | public read service policy | public ongoing-event projection only; generic unavailable errors | public ETag is allowed; failures `no-store` |
| `GET /api/health/env` | platform admin | platform-admin session | no caller input | same-origin guard for unsafe methods | platform-admin session boundary | `{ status: "ok" }` only; auth failures are generic; no env values, lengths, or secret state | `no-store, max-age=0`, `Vary: Cookie` |
| `GET /api/me` | optional session | current session user | no caller input | same-origin guard for unsafe methods | session boundary | name, role, and scoped pending count only; no email/token/PII | `private, no-store`, `Vary: Cookie` |
| `GET /api/organizer/events/[eventId]/competition` | organizer/admin/platform admin via reader | reader resolves event ownership | safe event-id path | same-origin guard for unsafe methods | expensive reader policy | competition workspace projection; generic safe error code | `private, no-store`, `Vary: Cookie` |
| `src/lib/actions.ts` legacy auth/import/payment/stat/visual actions | role-specific server session | event/team/match ownership before reads/writes | Zod schemas, safe entity IDs, bounded uploads/imports, HTTP(S) URLs, image signatures | middleware same-origin protection for unsafe server-action requests | exact round-3 upload/import boundaries use actor + authoritative event/team/request keys before file read/parser/storage/write | redirects contain stable codes/messages only; repository/Prisma errors are not returned | server-action mutations invalidate affected tags; no shared public cache |
| `src/lib/actions/captain-event-login.ts` | captain session/login boundary | event membership and credential lookup | Zod email/password/event-id schema | same-origin server action | login rate limit | generic authentication failure | no-store mutation response |
| `src/lib/actions/certificate-v3-actions.ts` | organizer/admin/platform admin | event workspace authorization | Zod IDs, versions, UUID idempotency keys, bounded asset form | same-origin server action | shared `checkRateLimit` for regeneration/publication/upload, keyed by actor + event before asset read | stable action result codes only | mutation invalidates workspace/public tags |
| `src/lib/actions/competition-v3-actions.ts` | organizer/admin/platform admin | event workspace authorization | Zod event ID plus strict nested match/team/revision/incident/action/announcement IDs; descriptive/opaque fields use separate bounded schemas | same-origin server action | expensive competition mutation policy | stable action result codes only | mutation invalidates competition tags |
| `src/lib/actions/completion-v3-actions.ts` | organizer/admin/platform admin | event workspace authorization | Zod IDs, versions, UUID idempotency key, award decisions | same-origin server action | completion mutation policy | stable action result codes only | mutation invalidates completion/certificate tags |
| `src/lib/actions/event-revision-actions.ts` | organizer/admin/platform admin | revision/event ownership | Zod IDs, versions, locales, slug, upload metadata | same-origin server action | revision visual upload limiter; other revision actions retain existing mutation policy | stable redirect/action codes; no storage or Prisma errors | mutation invalidates revision/event tags |
| `src/lib/actions/event-v3-actions.ts` | organizer/admin/platform admin | event ownership | Zod IDs, locales, status enums, bounded text and HTTP(S) URLs | same-origin server action | event mutation policy | stable action result/redirect codes | mutation invalidates event tags |
| `src/lib/actions/organizer-profile-actions.ts` | organizer | current user only | bounded profile/password form schemas | same-origin server action | password/profile mutation policy | stable validation/auth codes | no-store mutation response |
| `src/lib/actions/platform-profile-actions.ts` | platform admin/admin | current user only | bounded profile form schemas | same-origin server action | profile mutation policy | stable validation/auth codes | no-store mutation response |
| `src/lib/actions/player-stats-v3-actions.ts` | organizer/admin/platform admin | event/match/player ownership | bounded form fields; strict safe IDs for event/match/team/submission; opaque operation ID remains separate | same-origin server action | expensive stat mutation policy | stable action result codes | mutation invalidates stat/match tags |
| `src/lib/registration/actions.ts` | captain session | current captain and event registration | bounded event/team/contact fields and validated import payloads | same-origin server action | actor+event registration limiter before repository lookup/write | stable registration result codes | mutation invalidates registration/team tags |
| `src/lib/validation/team-data.ts` | called by authenticated registration/import flows | caller must enforce workspace ownership | bounded names/tags/contact values; profanity/XSS-safe plain text | n/a (library boundary) | inherited from caller | validation errors contain field/code, not database details | n/a |
| `src/lib/validation/profanity.ts` | library boundary | n/a | normalized plain text; no dynamic code or HTML | n/a | inherited from caller | boolean only | n/a |
| `src/lib/validation/email.ts` | library boundary | n/a | email parser/domain lookup | n/a | inherited from caller | boolean only | n/a |
| `src/lib/imports/registration-intake.ts` | called after authenticated import action | caller supplies authorized event | bounded CSV/XLSX bytes, rows, columns, filenames, mapped fields; formula cells rejected | n/a (upload boundary) | import limiter in caller | preview fields are normalized plain text; formulas never persisted | n/a |

## Round-2 explicit action-ID coverage

The direct-call negative matrix exercises the reviewed actor/ID pairs below; IDs are rejected before the mocked repository/service boundary.

| Actor fixture | Boundary IDs exercised | Tests |
| --- | --- | --- |
| organizer `organizer-1` | `event-1` vs `../secrets`; `revision-1` vs `../secrets`; event `event-1` | `event-v3-actions.test.ts`, `event-revision-actions.test.ts`, `completion-v3-actions.test.ts`, `certificate-v3-actions.test.ts` |
| organizer/admin workspace fixtures | competition event `event` vs `../secrets`; legacy public-info event `../secrets` | `competition-v3-actions.test.ts`, `actions.test.ts` |
| captain `captain-1` | registration event `event-1`, event slug `event-two`, and markup payload | `registration/actions.test.ts` |

## Round-3 final coverage

| Finding | Covered boundary | Limiter/schema/response evidence |
| --- | --- | --- |
| Upload/import throttling | `captainUploadPaymentProofAction`, `captainUploadTeamLogoAction`, `adminImportTeamsCsvAction`, `adminUploadCharacterArtAction`, shared event-logo helper (admin + organizer wrappers), shared event-visual helper (admin + organizer wrappers), `adminUploadTeamLogoAction`, `uploadCertificateAssetAction` | actor plus authoritative request/event/team key where available; global team import uses authenticated actor key; all checks run before file read/parser/blob/repository work; blocked tests assert zero downstream calls |
| Nested operation IDs | player-stats `matchId`, `teamId`, `submissionId`; public tournament operation `matchId`, `teamId`, `revisionId`, `incidentId`, `actionId`, `announcementId` | strict safe entity IDs reject SQL/traversal before repository/transaction; server-issued competition graph match IDs use a bounded safe opaque pattern; descriptive `reason`, `incidentKind`, `previewToken`, and opaque operation keys retain separate schemas |
| Auth/provider failure and private cache policy | captain credentials, health/env, debug-locale | auth/session/locale-provider failures map to `{ code: "internal_error", requestId }`; forbidden and success responses declare `Cache-Control: no-store, max-age=0` and `Vary: Cookie` |

The direct-call matrix now covers the exact round-3 upload/import boundaries above. Other legacy actions remain outside this bounded round and are not represented as exhaustively rate-limited here.

## Negative-input matrix

| Input | Boundary | Expected result |
| --- | --- | --- |
| SQL-shaped ID (`' OR 1=1--`) | route/action ID schemas | rejected before repository/Prisma access |
| HTML/script payload | team/captain names, descriptions, labels, preview data | markup rejected at team-field validation; React escaping remains the rendering boundary |
| `javascript:` / `data:` URL | public/stream/registration URLs | rejected; only absolute HTTP(S) URLs accepted |
| JSON-LD/script breakout | public text/JSON projections | `serializeJsonLd` escapes `<`; no caller-controlled raw HTML/script insertion |
| MIME spoof or traversal filename | image/import upload | declared MIME/signature consistency and extension/filename checks reject before storage |
| CSV/XLSX formula (`=`, `+`, `-`, `@`) | exported/imported cells | reject mapped formulas or prefix exported cells with `'` |
| cross-origin unsafe request | middleware/API guard | generic JSON 403 with request ID |
| permissive private CORS | authenticated route response | no `Access-Control-Allow-Origin: *`; private responses are no-store |
| repository/Prisma/internal error | route/action boundary | stable generic public code; details go only to redacted server logs |

## Evidence contract

Focused tests cover the shared origin/error/formula helpers, route cache and
projection boundaries, upload/import validation, raw-SQL absence, and logger
redaction. Runtime browser/live-database evidence remains outside Task 8 when
credentials or a non-production database are unavailable.
