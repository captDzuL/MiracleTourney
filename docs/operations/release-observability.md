# Release observability runbook

Status: `BLOCKED` for external Vercel evidence. This document defines the
Vercel-native Runtime Logs, Observability, and Speed Insights views that must
be created and verified for a release. It does not claim that those views or a
preview scan exist.

## Signal contract

Server boundaries emit one JSON object per phase through `console.info`:

| Field | Meaning | Safety rule |
| --- | --- | --- |
| `phase` | `start`, `done`, or `failed` | fixed enum |
| `operation` | stable operation code | lower-case safe code only |
| `route` | static route template | dynamic path values are removed or hashed |
| `requestId` | `x-vercel-id` or generated UUID | correlation value only |
| `durationMs` | elapsed operation time | non-negative integer |
| `status` | response/status classification | integer; `0` is reserved for `start` |
| `errorCode` | safe public error code on failure | no exception message or stack |
| `actorId`, `resourceId` | optional correlation identifiers | truncated SHA-256 values only |

Payloads, request bodies, response bodies, email addresses, tokens, payment
URLs, environment values, secret values, Prisma details, and stack traces are
not log fields. Vercel Runtime Logs are the only server-log destination; this
change adds no Sentry SDK and no external drain.

The fix-round adapter behavior is explicit: returned route responses with
status 500 or greater, and action results classified as `failed`,
`unauthorized`, or `rate_limited`, emit `phase="failed"` with a safe error
code. A Next `NEXT_REDIRECT` is a successful control-flow outcome: it emits
`phase="done"` with its redirect status and is rethrown unchanged. Route
adapters inject one generated request ID into the traced request before the
handler runs, so the response body and both log records share the same ID.
Password-reset request and consume actions emit the stable operation codes
`password_reset_request` and `password_reset_consume`.

## Required saved views

The following five views are the release baseline. The filter recipes are
field-level predicates for Vercel Runtime Logs; the exact dashboard syntax
depends on the connected Vercel project and must be confirmed by the PIC.

| View | Filter recipe | First response |
| --- | --- | --- |
| 1. 5xx and unhandled failures | `phase="failed" OR status >= 500`; group by `operation`, `route`, `errorCode`; correlate by `requestId` | inspect the correlated request, then create a bounded rollback/fix incident |
| 2. Auth denials and rate spikes | `errorCode="forbidden" OR errorCode="rate_limited" OR status IN (401,403,429)`; group by `operation`, `route`, `requestId` | check abuse/rate-limit volume and authorization changes; do not expose actor/resource hashes |
| 3. Function timeout and high duration | `phase="done" AND durationMs >= 5000`, plus Vercel timeout/runtime events | correlate the slow operation and deployment; protect the route before increasing limits |
| 4. Password-reset failure/reuse | `operation IN ("password_reset_request","password_reset_consume") AND phase="failed"`; group by `errorCode` | verify generic response, token reuse/expiry handling, and rate-limit state; never log email/token/reset URL |
| 5. Completion/certificate transaction failures | `operation IN ("completion_complete","completion_reopen","certificate_publish","certificate_regenerate","certificate_asset_upload") AND phase="failed"` | correlate the request and transaction code, then preserve idempotency and inspect the preview artifact |

Saved-view names and filters above are definitions only. The existence of
these views in a Vercel project is `BLOCKED` until a PIC with project access
creates or verifies them.

## Access and evidence matrix

| Capability/evidence | PIC or account | Current evidence | Status/blocker |
| --- | --- | --- | --- |
| Vercel Runtime Logs read access | Not provided | No authenticated Vercel session or project identifier was supplied | `BLOCKED`; PIC must provide project access |
| Deployment-failure notifications | Not provided | Notification settings were not inspected or changed | `BLOCKED`; PIC must verify the notification destination |
| Vercel Observability saved views | Not provided | Five filter recipes are documented above; no UI/API verification was available | `BLOCKED`; PIC must create/verify all five views |
| Speed Insights/RUM | Not provided | `<SpeedInsights />` is rendered by the production root layout; no deployed RUM sample exists | `BLOCKED`; PIC needs an authorized preview URL and Speed Insights access |
| Preview deployment and log scan | Not provided | No preview URL or deploy authorization was supplied; no deployment was attempted | `BLOCKED`; PIC must deploy/inspect preview and attach scan evidence |
| Request correlation | Release implementation | Tests cover `x-vercel-id` and generated UUID behavior; production request samples are unavailable | Local contract green; runtime evidence `BLOCKED` |

No credential, preview URL, Vercel deployment mutation, production deploy, or
production-setting change was performed for this task.

## Preview and post-deploy scan procedure

After explicit authorization, the PIC should deploy a preview, record its URL
and deployment ID, exercise one safe request per critical operation, and save a
Runtime Logs export showing `start`/`done` or `failed` pairs correlated by
`requestId`. Scan the five views for unhandled errors, leaked fields, denial
spikes, high duration, reset failures, and Completion/certificate transaction
failures before promotion. Attach the Speed Insights/RUM observation to the
same preview record. A future production deployment requires separate human
authorization and an initial error scan; this task performs no production
mutation.
