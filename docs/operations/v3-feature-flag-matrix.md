# V3 feature-flag matrix — 7 October 2026

Evidence only; this document authorizes no production change. Source of truth for
defaults is `src/lib/feature-flags.ts` (`DEFAULTS`, every flag `false`). A flag is read
from the environment variable `FEATURE_FLAG_<NAME>`; only the literal string `true`
enables it. Flags are read at runtime from `process.env`, but Vercel injects variables
at deployment creation, so **changing a flag in Vercel requires a new deployment** to
take effect, and a flag change is reverted by the same mechanism.

`pnpm ops:vercel-readback` (`scripts/operations/vercel-readback.mjs`) reads the live
values GET-only. `src/feature-flag-matrix.test.ts` fails when this table and the code
disagree (a flag added, removed, or given another default without updating the table).

## Matrix

Vercel values below are the read-back of 2026-10-07 (project `miracle-tourney`,
scope `miracle25`). "Prod" and "Preview" are the Vercel targets. "Effect when off" is derived from the read
sites (names, not an exhaustive per-page audit); the legacy E2E profile is the behavioural
evidence.

| Flag | Environment variable | Default | Prod | Preview | Read in | Effect when off |
| --- | --- | --- | --- | --- | --- | --- |
| `ui_v3_foundation` | `FEATURE_FLAG_UI_V3_FOUNDATION` | false | true | true | public shell and event pages (participants, bracket, standings, schedule, leaderboards), `PanelShell` | Legacy shell and legacy public event sub-pages |
| `organizer_master_shell_v3` | `FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3` | false | true | true | shell, `PanelShell`, organizer home/overview/edit/match pages, admin workspace, `lib/actions.ts` | Legacy organizer/admin panels |
| `public_discovery_v3` | `FEATURE_FLAG_PUBLIC_DISCOVERY_V3` | false | true | true | shell, home page, `/events` (both locales) | Legacy home and event list (or the V2 variant when `public_visual_v2` is on) |
| `adaptive_public_event_v3` | `FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3` | false | true | true | shell, localized event page, participants/bracket/schedule, `lib/events/public-ongoing.ts` | Legacy public event detail and sub-pages |
| `completion_workspace_v3` | `FEATURE_FLAG_COMPLETION_WORKSPACE_V3` | false | true | true | organizer completion/certificate pages, completion and certificate actions, workspace read | Completion and certificates are not reachable through V3 actions |
| `competition_operations_v3` | `FEATURE_FLAG_COMPETITION_OPERATIONS_V3` | false | true | true | organizer event setup/new/edit/match pages, competition/event/player-stats V3 actions, workspace read | Legacy competition operations |
| `registration_workspace_v3` | `FEATURE_FLAG_REGISTRATION_WORKSPACE_V3` | false | true | true | organizer registration and participants pages, workspace read | Legacy registration management |
| `organizer_workspace_v3` | `FEATURE_FLAG_ORGANIZER_WORKSPACE_V3` | false | true | true | organizer profile/password/new-event/overview/edit/match pages, admin workspace, `lib/actions.ts`, player-stats actions | Legacy organizer workspace |
| `public_visual_v2` | `FEATURE_FLAG_PUBLIC_VISUAL_V2` | false | false | false | shell, home page, `/events`, legacy event detail | The V2 public visual is off; legacy visuals |
| `email_password_reset` | `FEATURE_FLAG_EMAIL_PASSWORD_RESET` | false | false | false | `lib/email/send.ts` only | **Reset emails are suppressed** (a stub log line is the only effect), also when `RESEND_API_KEY` is set |
| `premium_event_promotion` | `FEATURE_FLAG_PREMIUM_EVENT_PROMOTION` | false | not set | not set | nowhere (no read site) | No effect |
| `premium_auto_checkin` | `FEATURE_FLAG_PREMIUM_AUTO_CHECKIN` | false | not set | not set | nowhere (no read site) | No effect |
| `premium_analytics_dashboard` | `FEATURE_FLAG_PREMIUM_ANALYTICS_DASHBOARD` | false | not set | not set | nowhere (no read site) | No effect |
| `premium_match_scheduling` | `FEATURE_FLAG_PREMIUM_MATCH_SCHEDULING` | false | not set | not set | nowhere (no read site) | No effect |
| `premium_notifications` | `FEATURE_FLAG_PREMIUM_NOTIFICATIONS` | false | not set | not set | nowhere (no read site) | No effect |
| `ai_event_art` | `FEATURE_FLAG_AI_EVENT_ART` | false | not set | not set | nowhere (no read site) | No effect |

## Findings

1. **All eight V3 flags are already `true` for the production target.** The next
   production deployment shows V3 immediately, independent of any schema state. This is
   the reason the cutover runbook stages them to `false` first.
2. **`email_password_reset` is `false` in production**, so password-reset emails are
   suppressed today. Enabling it also requires `RESEND_API_KEY` and a verified
   `RESEND_FROM_EMAIL`; both names exist in Vercel (values not read). Decide
   explicitly whether V3 go-live needs working reset emails.
3. **Six flags have no read site** (the five `premium_*` flags and `ai_event_art`).
   Setting them changes nothing; they must not be presented as gating anything.
4. **The legacy `legacy_raw` password-reset token window is bounded in code**
   (`src/lib/platform/password-reset.ts`); it does not depend on a flag.
5. Previews share the production Blob and Resend variable names in Vercel; a preview
   with `email_password_reset=true` could send real mail. Keep that flag `false` on
   Preview.

## Activation order (after the schema is at 38/38 and drift is zero)

Each step is its own deployment followed by the smoke checks in the cutover runbook;
stop and turn the last flag off at the first failure.

1. `ui_v3_foundation`
2. `public_discovery_v3`, `adaptive_public_event_v3`
3. `organizer_master_shell_v3`, `organizer_workspace_v3`
4. `registration_workspace_v3`, `competition_operations_v3`
5. `completion_workspace_v3`
6. `email_password_reset` only on explicit owner decision (finding 2)

## Flags-off verification

With all sixteen flags unset or `false`, the application must render the legacy UI. The
E2E legacy profile (`playwright.legacy.config.ts`) runs the suite in that state; run it
locally against a reset database before the first deployment that carries the V3 code,
because the staged-off production deployment is the first time those pages meet the
production database.
