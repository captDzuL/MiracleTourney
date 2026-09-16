# PRD — Miracle V3 Organizer Master Workspace

Status: approved product direction; implementation handoff snapshot dated 16 September 2026 (Asia/Jakarta).

## Product intent

Miracle V3 needs one event-first workspace for organizers and platform administrators. The workspace must feel like the approved Miracle V3 mockup: Montserrat typography, existing Miracle V3 spacing and alignment, dark surfaces, cyan/lime/violet accents, dense but readable operational panels, and direct navigation from the event context.

The product promise is simple: an organizer can select one event, understand its lifecycle and blockers, operate registration and match day, record results and player statistics, complete the tournament, and publish certificates without falling into the old global AdminWorkspace.

## Personas

- Organizer: owns one or more events and is responsible for setup, registration decisions, match operations, completion, awards, certificates, and publication.
- Platform administrator: can enter the same canonical event workspace with platform-wide access; the interface is shared, while capabilities and server authorization remain role-aware.
- Captain: submits registration data, payment proof, and player statistics where the event flow permits. Captain statistic submissions remain pending until an organizer approves them.
- Public viewer: reads the published event experience; this PRD only covers the organizer/admin workspace changes and the handoff between operational and public routes.

## Lifecycle and primary action

The canonical workspace is /[locale]/organizer/events/[eventId]/[section].

| Lifecycle | Meaning | Primary useful action |
| --- | --- | --- |
| draft | Event is private and still being configured. | Continue event setup at the edit route. |
| registration | Registration is open or accepting event-local operations. | Open Registrasi and review the participant queue. |
| drawing | Registration is closed and the published drawing/schedule is the next dependency. | Open Registrasi or Kompetisi and resolve publication blockers. |
| ongoing | Matches are running or results remain operational. | Open Kontrol Pertandingan and select live/next/needs-result work. |
| finished | Official results exist and completion can be published. | Open Penyelesaian and finish awards/certificates. |

Completion remains navigable before the event is ready so blockers are visible, but complete and publish actions remain locked until the authoritative readiness service allows them.

## Functional requirements

### 1. Master shell and command center

1. /[locale]/organizer is an event command center with event selection/search, lifecycle grouping, portfolio counts, attention blockers, lifecycle-aware CTAs, event workspace links, public-event links, event creation, and organizer profile access.
2. A draft card opens edit/setup; registration or drawing cards open the relevant registration/competition context; ongoing cards open match control; finished cards open completion.
3. The canonical event shell is shared by organizer, admin, and platform_admin. The shell shows event title, game display label, format, lifecycle, publication state, role, and authoritative update time.
4. Desktop exposes a persistent event rail. Narrow screens expose an accessible drawer and compact header. Both expose the same destinations:
   - Ringkasan
   - Registrasi
   - Peserta
   - Kompetisi
   - Jadwal
   - Kontrol Pertandingan
   - Penyelesaian
   - Pengumuman
   - Pengaturan
5. Guidance is a small dismissible next-useful-action card. It is non-modal, does not disable unrelated controls, and is stored per event, lifecycle, and guide version. Factual blockers are separate and link to the resolving module.
6. The setup wizard is limited to creating/editing an event. Operational event routes use direct links and do not replace a route with a hash.

### 2. Registration, import, payment, and QRIS

Registrasi is one event-local route with URL-backed views:

- view=queue: applications, accepted participants, source/status/search filters, capacity, pagination, roster review, and event-local actions.
- view=import: XLSX/CSV upload, mapping, validation preview, valid/problem rows, selected commit, expired-batch feedback, and import history.
- view=payments: payment-proof queue, proof zoom/dialog, payment metadata, approve, reject with required reason, saved/pending/conflict feedback, and audit label.
- view=qris: event QRIS image upload/replace, preview/zoom, payment instructions, save draft, explicit publish, version, and captain-facing published state.

Import requirements:

- Accept .xlsx and .csv.
- Enforce a maximum file size of 5 MB and 500 data rows.
- Never commit invalid rows silently.
- Preserve stable item IDs across pagination and filtering; commit selected item IDs, never page-relative offsets.
- Keep parser, mapping, preview, import-batch, and commit services authoritative; do not create a second parser or import engine.

Payment and QRIS requirements:

- Payment-proof mutations verify event identity, actor role/ownership, and current status/version.
- QRIS settings are event-scoped. Organizer writes never mutate the legacy global writable setting.
- Captains read published event QRIS first, then the legacy global setting only as a temporary fallback when no event setting exists.
- Draft QRIS content is invisible to captains until explicit publication.
- Proof URLs, QRIS URLs, roster PII, credentials, and secrets are never written to logs.

### 3. Participants

Peserta is a focused team and roster directory with search, source/status filters, pagination, captain information appropriate to the viewer, and a roster detail dialog. It must not expose payment proof in the participant directory or public pages.

### 4. Competition, schedule, and match control

Competition owns format, phases, drawing, standings, and advancement. Jadwal owns fixtures, rooms, time, locks, and publication. Match Control is an operational queue with live, next, needs-result, readiness, incident, delayed, and completed filters; selected-match summary; priority/action badges; bounded pagination; and a canonical match-detail link.

The UI must adapt to Single Elimination, Double Elimination, Round Robin/League, and Group + Playoffs:

- Group + Playoffs shows group selection, matchday, standings, qualification context, and the playoff phase.
- League does not invent a Grand Final when the competition model has none.
- Drawing and schedule publication remain explicit and authoritative.
- Existing versioned operations, schedule locks, CAS, idempotency, and authorization remain the source of truth.
- Tables and brackets may scroll only inside bounded containers; the document itself must not overflow.

### 5. Match result and player statistics

A match detail uses URL-backed views:

- view=result: score per game, official result, correction mode/reason, impact preview, status, and version feedback.
- view=statistics: organizer input and captain submissions for player statistics.
- view=history: result revisions, statistic review history, and audit events.

The result engine remains authoritative. MatchGame order controls score-slot order for BO1, BO3, and BO5.

PlayerStat.stats uses this boundary:

    {
      "scores": [7.6, null, 8.1],
      "goal": 3,
      "assist": 4,
      "passing": 28,
      "defense": 12
    }

Rules:

- scores follows MatchGame order.
- Each score is 0.0–10.0 with at most one decimal. Blank input is stored as null.
- The score-array parser is separate from the generic numeric-stat merger.
- The only new aggregate fields are goal, assist, passing, and defense.
- Reader fallback may read legacy goals and assists when the canonical singular field is absent. It must not sum aliases.
- blocks and tackles are not converted into defense and historical values are not destructively deleted.
- Captain and organizer use the same field and validation rules.
- Captain writes remain pending until organizer approval; pending data is excluded from the published leaderboard.
- Organizer can save/approve/reject through one guarded core, with event, match, actor, ownership, password state, submission status, and expected versions rechecked inside the transaction.
- Pending approval/rejection is compare-and-swap: only status=pending can transition. A stale or competing review returns conflict and does not mutate PlayerStat.
- Serializable rollback/idempotency behavior and CompetitionAuditLog receipts remain authoritative.
- Organizer selection of MVP is explicit. Leaderboard data supports the decision and never changes awards or certificates automatically.

### 6. Completion, awards, and certificates

Penyelesaian separates four decisions:

1. readiness and unresolved official results;
2. podium and individual awards;
3. certificate generation;
4. final publication.

Individual awards:

- MVP Tournament
- Top Scorer
- Top Defender
- Top Assist

Premium Certificate Studio preserves the seven-recipient contract:

- Champion
- Runner-up
- Third Place
- MVP
- Top Scorer
- Top Defender
- Top Assist

The studio must keep recipient selection, asset/placement controls, preview, versioning, generation, publication, readiness/errors, and safe-set publication. The later compact layout keeps the preview usable on desktop/mobile, does not repeat the event banner, and does not hide readiness or publication state. Published certificates expose their link from the finished event flow.

### 7. Announcements and settings

Pengumuman moves announcement management into an event-shell utility route backed by existing authoritative actions and audit history.

Pengaturan is a focused entry to edit event details, publication state, organizer contact, and safe operational preferences. It does not duplicate the setup wizard fields or create a second event editor.

### 8. Locale and content

- All product copy is in messages/id.json and messages/en.json.
- /id renders Indonesian interface copy throughout; /en renders English interface copy throughout.
- Dates, times, currency, plural forms, validation errors, aria labels, dialogs, toasts, and status feedback use the route locale.
- Brand names, player/team names, game names, and file extensions are not translated.
- No mixed-language fallback, emoji-as-icon, raw replacement character, or literal placeholder copy is allowed.

### 9. Responsive and accessibility contract

Verify 360, 390, 768, 1024, and 1440 pixel widths.

- Document scrollWidth must not exceed clientWidth.
- Drawers trap focus, close on Escape, restore focus, and do not leave the body locked.
- Tabs use links or correct tab semantics consistently.
- File upload has a keyboard-operable input and a non-drag path.
- Payment proof and QRIS images have meaningful accessible labels and zoom controls.
- Sortable tables expose aria-sort.
- Reduced-motion users can understand state changes without animation.
- Visible controls and touch targets are at least 44px and retain Miracle V3 focus styling.
- Error/loading states preserve event-shell context and identify the failed module without fabricating event data.

## Data, security, and concurrency

- Shared shell reads only the compact OrganizerWorkspaceSummary. Route readers own domain payloads.
- Organizer authorization uses assertUserCanManageEvent. Admin/platform_admin enter the same route with their allowed access.
- Hidden navigation is not a security boundary; every write rechecks actor role, ownership, event identity, status, and expected version.
- EventPaymentSettings is unique per event with draft/published status, version, publishedAt, updatedById, timestamps, and a legacy read fallback.
- Import, payment, QRIS, result, statistic, completion, and certificate writes preserve existing idempotency/CAS/transaction guarantees.
- Logs contain identifiers and error classes only; never payment URLs, QRIS URLs, roster PII, credentials, secrets, or certificate tokens.
- Production database migration, production deployment, and production flag activation are outside this scope.

## Feature flags and rollback

The composition flag is:

    organizer_master_shell_v3

It defaults to false and is enabled only by the exact environment value FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=true. Existing flags remain independent:

- organizer_workspace_v3
- registration_workspace_v3
- competition_operations_v3
- completion_workspace_v3
- adaptive_public_event_v3
- public_discovery_v3

Turning off organizer_master_shell_v3 restores the existing shell composition. It does not reverse migrations or operation commits. The event payment table may remain present while legacy UI reads the global fallback.

## Explicit non-goals

- No production deploy, production migration, or production feature-flag activation.
- No automatic MVP or award selection.
- No new tournament engine, result engine, import parser, or certificate generator.
- No iframe or direct HTML prototype embedding.
- No destructive removal or reinterpretation of historical blocks/tackles.
- No global AdminWorkspace copy embedded inside the V3 registration or overview routes.
- No new public Live Center or recap URL; event URLs remain stable.

## Acceptance criteria

The release candidate is product-complete only when all of the following are demonstrated:

1. Organizer home and event routes are recognizably the approved Miracle V3 master-shell composition.
2. Kelola registrasi never opens or renders the legacy global AdminWorkspace.
3. Organizer and admin use the same canonical event shell with server-side authorization.
4. Registration covers XLSX/CSV import, payment-proof review, and event-scoped QRIS draft/publication.
5. Competition, schedule, and Match Control work for all four formats without fabricated phases.
6. Match detail supports result, statistics, history, score validation, captain review, organizer writes, and no-partial-write concurrency behavior.
7. Completion exposes readiness, podium, four individual awards, seven certificates, and final publication.
8. ID and EN are complete and consistent.
9. Responsive, keyboard, focus, reduced-motion, target-size, and overflow checks pass at all required viewports.
10. Feature-flag on/off and role/ownership rollback checks pass.
11. Local unit, static, build, audit, preflight, smoke, pressure, and CI-style E2E gates pass without flaky retries.
12. Preview verification is green. Only then may the release report state READY; otherwise it must state BLOCKED with factual evidence.

