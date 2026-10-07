# Miracle V3 Organizer Master Workspace Design

Date: 14 September 2026  
Status: Approved visual direction; ready for implementation planning

## Decision

Miracle V3 will use one event-first master workspace for organizer and platform-admin operations. The approved prototype at `.superpowers/brainstorm/1049-1789394661/content/organizer-master-shell-v3.html` is the interaction and composition source of truth. Existing production services remain the source of business behavior; the implementation replaces the fragmented shells and legacy composition rather than rebuilding tournament logic.

The event setup wizard appears only while creating or editing an event. Published-event operations use a stable event shell with direct navigation to Overview, Registration, Participants, Competition, Schedule, Match Control, Completion, Announcements, and Settings.

## Goals

- Make the organizer's current event, lifecycle state, blockers, and next useful action obvious.
- Preserve Miracle V3 typography, alignment, density, color tokens, and restrained geometric character.
- Give organizer and admin the same complete event workspace, with authorization deciding capability rather than a different interface.
- Make XLSX/CSV import, payment-proof verification, QRIS publication, score entry, player statistics, completion, awards, and certificates reachable from the event context.
- Use complete Indonesian on `/id` and complete English on `/en`.
- Offer contextual guidance without blocking work or repeatedly forcing onboarding.
- Reuse authoritative registration, competition, Match Day, Completion, and certificate services already present.

## Non-goals

- No production deployment, production migration, or production feature-flag activation.
- No automatic MVP selection. Organizer remains the final award decision-maker.
- No new tournament engine or duplication of Match Day operations.
- No destructive rewrite of historical `blocks` or `tackles` statistics.
- No iframe or direct embedding of the HTML prototype in production.

## Information architecture

### Organizer home

`/[locale]/organizer` is the command center across events. It contains:

1. an event selector with search and lifecycle grouping;
2. concise portfolio counts and actionable blockers;
3. lifecycle-aware primary actions;
4. direct links to the public event page and event workspace;
5. event creation and organizer profile access.

Cards never present registration management as the dominant action for a finished event. Draft events continue setup, registration events open Registration, running events open Match Control, and finished events open Completion.

### Event workspace

The canonical operations URL is `/[locale]/organizer/events/[eventId]/...` for organizer, `admin`, and `platform_admin` roles. Admin dashboards link to this canonical workspace rather than maintaining a second event-operations UI.

Desktop uses a persistent event rail and content canvas. Narrow screens use a compact event header and accessible drawer. Both expose the same destinations:

- Overview / Ringkasan
- Registration / Registrasi
- Participants / Peserta
- Competition / Kompetisi
- Schedule / Jadwal
- Match Control / Kontrol Pertandingan
- Completion / Penyelesaian
- Announcements / Pengumuman
- Settings / Pengaturan

The shell header shows event title, game, format, lifecycle state, publication state, role, and last authoritative update. It does not repeat the setup wizard or generic welcome text on operational routes.

### Setup wizard

Only `/events/new` and `/events/[eventId]/edit` display the five-step setup sequence. Step links use real navigation and valid anchors. They never intercept a link intended for a different route.

### Registration workspace

Registration is one route with URL-backed views:

- `view=queue`: applications and accepted participants;
- `view=import`: XLSX/CSV upload, mapping, validation preview, commit, and history;
- `view=payments`: proof review, approve/reject, rejection reason, and audit metadata;
- `view=qris`: event QRIS image, instructions, preview, draft save, and explicit publication.

Search, status, source, and page are query parameters so back/forward navigation and shared links retain state. Import accepts `.xlsx` and `.csv`, maximum 5 MB and 500 data rows, and never commits invalid rows silently.

### Participants

Participants provides a focused team and roster directory after acceptance. It supports search, status/source filters, pagination, captain details appropriate to the viewer role, and a roster detail panel. It is not another rendering of the global admin workspace.

### Competition and schedule

Competition owns format, phases, drawing, standings, and advancement. Schedule owns fixtures, rooms, times, locks, and publication. Existing versioned operations and format rules remain authoritative.

The UI adapts to Single Elimination, Double Elimination, Round Robin/League, and Group + Playoffs. It never labels a league finale as a Grand Final unless the competition model contains one.

### Match Control and result detail

Match Control is a working queue rather than a long report. It contains urgency filters, match-day/round/group filters, live and next matches, readiness, incidents, and the selected match summary. A match opens `/matches/[matchId]` with URL-backed views:

- `view=result`: score per game, official result, correction reason, and impact preview;
- `view=statistics`: organizer input and captain submissions for player statistics;
- `view=history`: result revisions, statistic review history, and audit events.

Scores remain authoritative Match/MatchGame data. Player statistics use `PlayerStat.stats`:

```json
{
  "scores": [7.6, null, 8.1],
  "goal": 3,
  "assist": 4,
  "passing": 28,
  "defense": 12
}
```

The array follows MatchGame order. Each numeric score is `0.0-10.0` with at most one decimal; missing input is `null`. `goal`, `assist`, `passing`, and `defense` are the only new aggregate fields. Readers may fall back from legacy `goals` and `assists`, but aliases are never summed and `blocks`/`tackles` are not converted into Defense.

Captain submissions remain pending until organizer approval. Organizer may enter or correct the same fields directly. Concurrent review uses a pending-only atomic transition so two reviewers cannot approve/reject the same submission differently.

### Completion

Completion remains available throughout the lifecycle so organizers can see blockers before the tournament ends. It separates four decisions:

1. readiness and unresolved official results;
2. podium and individual awards;
3. certificate generation;
4. final publication.

Individual awards are MVP Tournament, Top Scorer, Top Defender, and Top Assist. Leaderboard data supports the decision but never selects or changes an award automatically.

### Premium Certificate Studio

The existing V3 certificate service and seven-recipient contract remain authoritative:

- Champion;
- Runner-up;
- Third Place;
- MVP;
- Top Scorer;
- Top Defender;
- Top Assist.

The approved studio composition is retained, then vertically compacted as a later polish pass: recipient navigation stays visible, the document preview is sticky on wide screens, asset/placement controls are collapsible, and generation/publication actions remain visible without duplicating the event header. This polish does not delay wiring the complete functional flow.

## Master shell behavior

### Contextual guidance

Guidance is a small, dismissible "next useful action" card. It is never a modal, never disables unrelated controls, and does not reopen repeatedly after dismissal. Dismissal is stored per `eventId`, lifecycle phase, and guide version. A visible "Show guide" action restores it.

Guidance copy describes the consequence and destination, not an order. Blocking requirements are shown separately as factual blockers with links to the affected screen.

### Role behavior

- Organizer can manage only events allowed by `assertUserCanManageEvent`.
- `admin` and `platform_admin` can enter the same canonical event workspace with platform-wide access.
- Role-sensitive controls are capability-gated; hidden navigation is not the security boundary.
- Every write rechecks server-side ownership/role and event identity.

### Locale behavior

All product copy lives in `messages/id.json` and `messages/en.json`. `/id` uses Indonesian terms such as "Kontrol Pertandingan", "Penyelesaian", and "Studio Sertifikat Premium". `/en` uses their English equivalents. Brand names, player/team names, game names, and file extensions are not translated.

Dates, numbers, currency, plural forms, validation errors, aria labels, confirmation dialogs, and toast feedback follow the route locale. There is no mixed-language fallback string in a rendered V3 workspace.

## Data architecture

### Read boundaries

`OrganizerWorkspaceSummary` supplies only shared shell identity, lifecycle, role capabilities, counts, blockers, and navigation badges. Each route has a focused server reader for its own data. React components do not query repositories independently and the shell does not load every event operation on every request.

### Event-scoped payment settings

The legacy `PaymentSettings` model is global and is unsafe as the writable setting for multiple organizers. Add `EventPaymentSettings` with:

- unique `eventId` relation;
- `qrisImageUrl` and localized-neutral payment instructions;
- `status: draft | published`;
- integer `version` for compare-and-swap writes;
- `publishedAt`, `updatedById`, `createdAt`, and `updatedAt`.

Captain registration reads published event settings first, then the existing global setting as a temporary platform fallback. Organizer writes never mutate global settings. The migration is prepared and tested in Delicate/preview only during this scope.

### Import and payment actions

The existing parsing, mapping, validation, import-batch, approval, and rejection repositories are reused. New event-local action adapters accept explicit `locale`, `eventId`, and `returnTo`, validate the safe route server-side, recheck ownership, and revalidate only affected event paths. They do not redirect back to the global `/admin` page.

### Feature flags and rollback

Add `organizer_master_shell_v3`, default off, as the presentation/composition flag. Existing flags continue to guard their capabilities:

- `organizer_workspace_v3`;
- `registration_workspace_v3`;
- `competition_operations_v3`;
- `completion_workspace_v3`.

Turning off `organizer_master_shell_v3` restores the current shell without reverting schema or operation commits. Event payment settings can remain present while the old UI uses the legacy fallback.

## Visual contract

- Montserrat remains the primary workspace font; game-display faces are used only where already defined by Miracle V3 tokens.
- Content follows the established V3 max-width, grid, border, cyan/lime/violet accents, and dark surface hierarchy.
- Alignment is grid-based and consistent across headers, filters, tables, side panels, and empty states.
- Icons come from the existing icon set; decorative emoji and raw replacement characters are not allowed.
- Dense operational tables scroll inside bounded containers and never widen the document.
- Primary, secondary, destructive, pending, disabled, and published states are visually distinct and include text, not color alone.
- Loading and error states preserve the shell and identify the failed module without inventing event data.

## Accessibility and responsive behavior

- Verify 360, 390, 768, 1024, and 1440 pixel widths without document overflow.
- Navigation drawer traps and restores focus; Escape closes drawers/dialogs.
- Tabs use tab semantics or ordinary links consistently and support keyboard navigation.
- File upload has a keyboard-operable input and non-drag alternative.
- Payment proof and QRIS images have meaningful accessible labels and zoom controls.
- Tables expose sortable header state with `aria-sort`.
- Reduced-motion users do not depend on animation for state changes.
- Touch targets are at least 44px and visible focus rings use existing Miracle tokens.

## Failure and concurrency behavior

- A failed route reader shows a localized module error while retaining event context.
- Import preview expiration and mapping errors preserve the selected file summary and explain the next action.
- Payment proof approval/rejection and QRIS publication use current status/version preconditions.
- Duplicate or stale statistic reviews fail cleanly, refresh authoritative state, and never partially write `PlayerStat`.
- Score correction, completion, certificate generation, and publication keep their existing version/idempotency guarantees.
- Server logs include event/match/batch identifiers and error class but no payment image URL, personal roster data, secret, or certificate token.

## Acceptance criteria

1. Organizer home and all event routes are recognizably the approved master-shell prototype at first glance.
2. "Kelola registrasi" never renders or redirects into the embedded legacy global AdminWorkspace.
3. Organizer and admin operate an event through the same canonical shell with correct authorization.
4. Registration includes working XLSX/CSV import, payment-proof review, and event-scoped QRIS draft/publication.
5. Match Control reaches score-per-game and complete player-stat workflows without a legacy route.
6. Completion and Certificate Studio are directly navigable and use authoritative readiness, awards, and publication data.
7. Setup guidance is contextual, dismissible, and non-blocking.
8. `/id` contains no English interface copy and `/en` contains no Indonesian interface copy.
9. Feature-flag on/off, role ownership, four competition formats, responsive geometry, keyboard access, and reduced motion pass automated coverage.
10. Local and CI gates pass without flaky retries before the release can be marked READY.
