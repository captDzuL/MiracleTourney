# Miracle V3 — Plan

## Scope
Dokumen ini melanjutkan perombakan Miracle menjadi competitive gaming ecosystem yang berangkat dari komunitas gamer. Scope sesi ini fokus pada dua surface yang sudah disetujui:
1. Homepage Miracle
2. Public Tournament Page

Organizer Dashboard **tidak** menggunakan mockup terbaru dari sesi ini. User lebih memilih dashboard dari sesi lain, sehingga implementasi dashboard harus mengambil referensi dari snapshot/percakapan Work berikutnya.

## Product Direction
Miracle bukan sekadar bracket generator. Arah jangka panjang:
- Tournament builder / tournament operating system
- Public tournament discovery
- Community layer
- Competitive data & stats
- Team profiles / team management
- Official league verticals
- Premium organizer/team features
- Potensi sponsorship dan esports ecosystem

## Information Architecture

### Homepage
- Global navigation
- Hero: “Built by gamers, for gamers”
- Explore / start tournament CTAs
- Tournament discovery: Live Now, Open Registration, Starting Soon, Recently Completed
- Organizer value proposition
- Official Miracle League / MFL section
- Community scale / platform stats
- Footer

### Public Tournament Page
- Event hero + high-level event metadata
- CTA: register / follow / share
- Main nav: Overview, Participants, Bracket, Schedule, Leaderboard, Announcements
- Live / next match
- Bracket preview
- Top leaderboard
- Searchable participants list
- Schedule & results
- Latest announcements
- Follow / update CTA
- Tournament facts + rulebook

## Core UX Principle
**Miracle should always make the user's next action obvious.**

Applied as:
- Homepage: discover an event or start an event.
- Public tournament page: see what is happening now, find team/player, view bracket, or follow updates.
- Organizer: contextual next action and embedded guidance.
- Captain/participant: what to complete next.
- Spectator: what is live / important right now.

## Visual Principles
- Competitive Tech = foundation
- Community Energy = personality
- Digital Arena = peak moments
- Sharp, modern, non-cliché
- Gaming feel without cyberpunk/glitch/shield clichés
- Max 3 core brand colors
- Strong contrast and information hierarchy
- Dense information only when grouped clearly
- Motion communicates state/change, not random decoration

## Color System
Core brand colors (working palette):
- Cyan / Blue: `#18C8F2`
- Violet / Purple: `#7A22FF`
- Cream / Off-white: `#FFF3D4`

Neutrals are UI infrastructure and do not count as core brand colors:
- Background: `#07111F`
- Panel: `#0C1728`
- Secondary panel: `#101C2F`

Semantic colors may exist for usability and must not compete visually with the core palette.

## Component Map
Shared: AppHeader, MiracleMark, Button, Badge, Card, StatusPill, StatCard, SectionHeader, Footer.

Homepage: Hero, PlatformPreview, TournamentDiscoveryRow, TournamentCard, OrganizerValueCard, OfficialLeagueBanner, CommunityStats.

Public Tournament: TournamentHero, EventTabNav, LiveMatchCard, BracketPreview, LeaderboardCard, ParticipantSearch, ParticipantTable, ScheduleCard, AnnouncementList, FollowTournamentCard, TournamentFacts.

## Data Dependencies
Homepage:
- Featured/live tournaments
- Open-registration tournaments
- Starting-soon tournaments
- Recently-completed tournaments
- Official Miracle leagues
- Platform/community aggregate stats

Public Tournament:
- Event metadata
- Registration state
- Participants / teams / players
- Match schedule & status
- Bracket state
- Leaderboard / stats
- Announcements
- Rulebook
- Follow/subscription state

## Implementation Phases
1. Static shell + tokens + responsive layout
2. Real data wiring
3. Interaction: follow/search/tabs/share/registration states
4. Contextual guide layer
5. Motion & polish

## Accessibility
- WCAG AA contrast target
- Keyboard-accessible tabs and controls
- Clear focus state
- `prefers-reduced-motion`
- No information communicated by color alone
- Tables usable on narrow screens
- Live updates need non-visual labels

## Performance
- Avoid heavy animated backgrounds by default
- Lazy-load tournament artwork
- Prefer CSS/SVG over video for ambient effects
- Keep public pages fast on mobile connections
- Paginate/virtualize very large participant lists

## Open Questions
- Final logo and wordmark
- Final font pairing
- Exact neutral scale
- Homepage discovery ranking algorithm
- Follow notification channels: in-app / email / WhatsApp / push
- Public player profile scope
- Team profile and premium team management scope
- Official league naming system beyond MFL
- Preferred Organizer Dashboard from prior session to be imported into blueprint
## Captain direct registration — approved (5 September 2026)

Reference: `public/miracle-captain-v3-direct-registration-mockup.html`.

- User approved the complete captain journey from a public paid event CTA through login return, team selection or creation, roster review, payment proof upload, and persistent registration status.
- A captain with no reusable draft can create a team in context: name, 2–5 character tag, optional logo, and at least one player with UID and IGN. Position remains optional.
- The new team is treated as a reusable draft before event registration; captain does not need to leave the event journey.
- Paid registration follows existing states: `pending_payment`, `pending_review`, `approved`, `rejected`, and `expired`.
- Payment requests reserve the team identity for 24 hours. Proof upload uses PNG/JPG/WebP up to 2 MiB, matching existing validation.
- Organizer rejection includes a reason and allows resubmission. Approval activates the team and roster for the event.
- The captain can always return to `Pendaftaran Saya`; the organizer handoff shows the same pending-review record in the approved registration workspace.
- Dark Montserrat UI, official Miracle logo and palette, responsive mobile layout, and the Miracle copyright/social footer remain required.

### Next design surface

Create the captain Match Day experience: upcoming match context, readiness/check-in, opponent and schedule, event communication, completed-match follow-up, and empty/delayed states. Preserve existing match and roster rules and label any new operational capability as a v3 enhancement.

## Match Control algorithm requirement — 5 September 2026

The reviewed organizer command-center direction requires production algorithms, not UI-only sorting:

- deterministic action priority with critical/urgent/soon bands;
- unresolved-condition deduplication and escalation;
- automatic bracket scheduling across parallel rooms;
- duration, buffer, team-rest, dependency, stream, and lock constraints;
- affected-only delay recalculation with a before/after preview;
- explicit publication before captain notifications;
- manual organizer readiness and WO decisions with audit records.

Implementation contract: `docs/snapshots/product-ux-redesign-2026-09/match-control-scheduling-algorithm-v3.md`.


## Official Result & Player Stats Desk — approved (5 September 2026)

Canonical interactive reference: public/miracle-organizer-v3-result-stats-mockup.html.

- Official match results receive one explicit confirmation, then immediately complete the match, advance the winner, resolve dependent bracket slots, refresh the affected schedule, and notify captains.
- BO3 game scores are validated before confirmation; tied games or an unfinished series cannot be made official.
- Player statistics remain a separate tab and lifecycle. Each team data autosaves as a draft and may come from a captain submission or organizer entry.
- Organizer can review, return with a reason, and publish statistics per team. Publishing one team data does not lock the other team.
- Statistics publication updates the public leaderboard but never blocks bracket or schedule progression.
- Evidence and incident notes remain optional supporting detail in a drawer so the result screen stays focused.
- Result corrections require a reason, audit trail, and impact preview. Corrections cannot silently rewrite a dependent match that is already live or completed.
- The approved design includes activity history, dark default with light-mode control, official Miracle branding, Montserrat, responsive behavior, and the Miracle copyright/social footer.

### Next design surface

Design the public Live Tournament Match Center as the immediate output of Match Control: live/just-finished result status, bracket progression, updated schedule, team and player statistics publication states, incident-safe public messaging, and clear follow actions. This closes the organizer-to-public information loop before tournament completion and recap surfaces are designed.



## Third Place Match — approved v3 requirement (5 September 2026)

For elimination tournaments that contain two semifinals, Miracle V3 adds a Third Place Match. The loser of Semifinal 1 and the loser of Semifinal 2 feed into this match, while both semifinal winners continue to the Final.

- The Third Place Match is generated automatically after both semifinal participants are known and becomes playable after both semifinal results are official.
- It is scheduled before the Grand Final by default and uses the same duration, room, buffer, rest, lock, readiness, and delay rules as other matches.
- Organizer may configure its own Best of value under the round label Third Place.
- Tournament completion and final podium publication require official results for both the Final and Third Place Match.
- Champion and runner-up come from the Final; third place comes from the Third Place Match winner.
- Public brackets show a separate Perebutan Juara 3 card beneath the Final, with clear loser-from-semifinal provenance.
- A normal semifinal loser advances to the Third Place Match. Disqualification does not advance automatically and requires an organizer decision with an audit record.
- The current production bracket only propagates winners and currently generates one champion certificate after the Final. Loser routing, completion gating, third-place configuration, public display, and multi-recipient certificate generation are v3 enhancements.



## Tournament format scope for V3 first release — approved (5 September 2026)

The first Miracle V3 release supports three organizer-facing format families:

1. Head-to-Head Elimination
   - Single Elimination.
   - Double Elimination with Upper and Lower Brackets.
   - Configurable Best of per round.
   - In Single Elimination, events with two semifinals generate a Third Place Match.
   - In Double Elimination, third place is the loser of the Lower Bracket Final, so no separate Third Place Match is generated.

2. League / Round-Robin
   - Pure league ending in final standings.
   - Single round-robin or double round-robin.
   - Configurable scoring and ordered competitive tiebreakers.
   - No playoff or podium match; Champion, Runner-up, and Third Place come from the locked final standings.

3. Group + Playoffs
   - Participants are divided into groups.
   - Each group uses round-robin fixtures.
   - A configurable Top N from every group advances.
   - Playoffs may use Single or Double Elimination.
   - Seeding rules prevent immediate rematches from the same group where the selected preset permits it.
   - Podium determination follows the chosen playoff type.

Battle Royale Points, Match Point / Champion Rush, Swiss, FFA / Heat Qualification, and Score / Time Trial remain post-release backlog. The creation UI should expose simple presets first and place advanced settings behind contextual controls.


## Format-aware Group Match Day — approved (5 September 2026)

Canonical interactive references:
- public/miracle-organizer-v3-format-aware-match-day-mockup.html
- public/miracle-organizer-v3-group-matchday-mockup.html

The organizer Match Day foundation remains shared across formats, while the competition context changes:
- Group + Playoffs opens on Pertandingan, not the standings table.
- Organizer selects Group A-D and Matchday 1-3, then filters fixtures by all, needs result, or official.
- Score entry uses the same Result & Stats Desk contract as elimination: an official score updates standings and qualification previews immediately; player statistics may remain draft.
- Standings are read-only derived output. Organizer never edits points directly.
- Klasemen & kelolosan is a separate view with Top N cutline, ordered tiebreakers, and playoff-seed readiness.
- The action queue follows the active group and identifies the exact match that needs a result, dispute resolution, or statistics review.
- Pure League centers on matchweek balance and delayed fixtures. Elimination centers on bracket dependencies and Upper/Lower routing.
- Desktop and mobile mockups were verified without page errors or document-level horizontal overflow.

## Tournament Completion and Premium Certificates — approved (5 September 2026)

Canonical interactive references:
- public/miracle-organizer-v3-tournament-completion-mockup.html
- public/miracle-organizer-v3-certificate-studio-mockup.html

Completion is a gated organizer workspace with four contextual views: readiness, awards, e-certificates, and public recap.

Completion requirements:
- all format-specific required results are official;
- no active competitive dispute remains;
- final podium is deterministically available;
- the official statistics needed for individual awards are validated;
- tied awards require an explicit organizer decision recorded in the audit log.

Podium source remains format-aware:
- Single Elimination: Final plus Third Place Match;
- Double Elimination: Grand Final plus Lower Bracket Final result;
- Pure League: locked final standings;
- Group + Playoffs: the selected playoff format after the group phase is locked.

Completing a tournament locks the podium and award recipients, prepares a versioned public recap, and generates seven e-certificates:
1. Champion
2. Runner-up
3. Third Place
4. MVP of Tournament
5. Top Scorer
6. Top Defender
7. Top Assist

Premium certificate direction:
- portrait output at 1080 x 1920;
- collectible championship editorial styling, retaining the premium character of the existing certificate;
- no ambiguous team visual or team celebration placeholder;
- podium team certificates use the team logo as the primary hero asset and do not require character art;
- individual award certificates use character art as the primary visual and the team logo as a secondary identity badge;
- Miracle identity, event logo, award copy, recipient name, date, certificate ID, and verification occupy fixed protected zones;
- optional safe-zone guides help organizers position assets and never appear in the exported certificate;
- the light identity header and dark award field are separated so white, cream, cyan, and violet accents remain legible;
- missing character artwork may use a controlled branded fallback without shifting protected text or verification zones.

The mockups are approved visual/product references. Production implementation still requires the corresponding data, generation, audit, and publication work.

### Updated next design focus

The adaptive public Event Page now completes the public information loop. Do not create separate Live Tournament Match Center or Final Public Recap pages. The same permanent event URL changes its primary content and contextual navigation for Registration, Ongoing, and Finished states while existing participant, bracket, standings, schedule, leaderboard, award, and certificate detail routes remain available. Next, consolidate the V3 sitemap, design tokens, reusable component system, existing-to-V3 mapping, and incremental implementation plan.

## Adaptive Public Event Page — approved and final public architecture (5 September 2026)

Canonical interactive reference:
- public/miracle-public-v3-adaptive-event-page-mockup.html

The public event experience uses one permanent event URL and one stable identity shell. Its primary content, calls to action, and contextual navigation adapt to lifecycle status:

- Registration: event description, registration dates, remaining capacity, fee, roster requirements, registration guidance, verified organizer identity, contacts, rules, and registration CTA.
- Ongoing: current live match, score and series state, next match, official recent results, public schedule changes, bracket or standings context, leaderboard access, and organizer announcements.
- Finished: the Event Page becomes the final recap, including champion story, complete podium, Grand Final result, champion journey, final standings or bracket, individual awards, and seven published e-certificates.

There is no separate Live Tournament Match Center route and no separate Final Public Recap route. Those concepts are lifecycle states of the Event Page. Existing detail routes for participants, schedule/results, bracket, standings, leaderboards, awards, and certificates remain available for deeper inspection.

This decision avoids duplicated content, competing URLs, and navigation ambiguity. Public share links remain stable from registration through completion. The approved mockup was verified in all three lifecycle states on desktop and mobile without page errors or document-level horizontal overflow.

## V3 architecture and implementation package — completed (5 September 2026)

The approved design work is now consolidated into one architecture blueprint and five executable workstream plans:

- `docs/snapshots/product-ux-redesign-2026-09/miracle-v3-product-architecture.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-design-foundation.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-event-lifecycle-registration.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-competition-operations.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-completion-certificates.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-adaptive-public-event.md`
- `docs/superpowers/plans/2026-09-05-miracle-v3-rollout-roadmap.md`

Execution order is foundation, organizer lifecycle and registration, competition operations, completion and certificates, then the adaptive public Event Page. Each composition ships behind a default-off feature flag with the current experience retained as rollback until parity and full-story verification pass.

The architecture confirms there will be no separate Live Tournament Match Center or Final Public Recap. `/[locale]/events/[slug]` is the permanent public destination and becomes the recap when the tournament finishes.

## V3 implementation checkpoint — 6 September 2026

The V3 rollout is now implementation work, not only a visual reskin. The approved HTML mockups remain the canonical product references; completion of the foundation does not imply that the organizer, captain, registration, Match Day, completion, certificate, adaptive event, or homepage compositions already match those references.

Completed on `feature/ui/release/1.0`:
- Design foundation through `084d740`: official Miracle branding, Montserrat, three-color token system, dark-default operator theme with light/system controls, responsive shells, footer, locale-safe navigation, and accessibility coverage.
- Event Lifecycle Task 1 in `b770318`: default-off organizer/registration flags, organizer profile, structured registration and event dates, WIB default, draft/preview revisions, and hashed preview-token persistence.
- Event Lifecycle Task 2 in `b379060`: Draft-only revision-aware autosave, UUID-backed retry idempotency, stale-tab conflicts, exact publish-readiness blockers, non-blocking same-WIB-day overlap notices, actor-scoped transactional publication, legacy publish-gate parity, and preview-token revocation on publication.

Migration order was corrected to preserve dependencies:
1. `20260905010000_v3_event_lifecycle`
2. `20260905011000_v3_event_draft_idempotency`

These migrations are committed but have not been applied to a shared or production database. Apply them through the normal deployment migration process before enabling organizer workspace writes.

### Corrected implementation order from this checkpoint

1. Event Lifecycle Task 3: secure private preview without login, using the same event presentation in read-only mode.
2. Competition Task 1 and persistence contract: add validated Single/Double Elimination, Round-Robin, and Group + Playoffs configuration without changing legacy `Event.format` behavior.
3. Event Lifecycle Task 4: build the contextual Create Event workspace from the approved contextual and multiformat mockups.
4. Event Lifecycle Task 5: unified Miracle/direct/import registration queue with 10/25/50 server pagination.
5. Event Lifecycle Task 6: full organizer lifecycle verification.
6. Continue Match Day, completion/certificates, adaptive public Event Page, and homepage workstreams in their dependency order.

Single Elimination keeps the required Third Place Match when two semifinals exist. The optional toggle visible in an older mockup is superseded by this approved rule.

## Organizer Command Center V3 — implemented (8 September 2026)

`/[locale]/organizer` is now the authenticated V3 work home for an organizer. It lists only events owned by the active organizer, separates unfinished Drafts as priority work, shows registration capacity, and links each card to its existing V3 event workspace. The sidebar now provides Event saya, Buat event, and Profil organizer. The command center also exposes a compact profile card so a new organizer can immediately add the organization name and public contact needed for publish readiness.

`/[locale]/admin` remains the platform administration surface. An organizer who reaches that URL is redirected to their Command Center, while platform-admin and admin roles retain the legacy platform operations.

The organizer profile is owner-scoped. Updating it upserts organization name and contact details, and propagates the organization name only to events owned by that organizer. The verification state remains read-only for this release.

Validation checkpoint:
- full unit suite: 606 passed;
- TypeScript and lint: passed;
- full serial browser suite on Delicate: 39 passed, 2 skipped;
- browser contract covers organizer landing, sidebar access, admin redirect, create/autosave/preview/revoke/publish lifecycle, and 360px workspace width.

Next implementation focus: migrate the remaining organizer operations from the legacy admin surface into format-aware event workspaces, beginning with registration intake and Match Day control.

## V3 Delivery Register — implementation truth (8 September 2026)

The approved mockups remain the product reference. This register separates an approved design from working production behavior so foundation work is never represented as visual parity.

| Experience | Canonical mockup | Approved | Actual implementation | Remaining gap | Next milestone |
| --- | --- | --- | --- | --- | --- |
| Homepage | `miracle-homepage-mockup.html` | Yes | Brand tokens, logo, Montserrat, dark shell, footer foundation | Homepage information architecture and public journey are not rebuilt | Public experience rollout |
| Public tournament | `miracle-public-tournament-mockup.html` | Yes | Existing public event route remains available | Full information-first tournament composition is not at mockup parity | Adaptive public event |
| Adaptive public event | `miracle-public-v3-adaptive-event-page-mockup.html` | Yes | Lifecycle decision and data foundation only | Registration, ongoing, and completed responsive public compositions are not implemented | Adaptive public event rollout |
| Captain direct registration | `miracle-captain-v3-direct-registration-mockup.html` | Yes | Existing registration/payment workflow remains | V3 contextual registration UI is not implemented | Registration workspace |
| Captain match day | approved captain Match Day mockup | Yes | Existing schedule/status remains | Check-in, call-up, and captain-ready workflow are not implemented | Competition operations |
| Organizer contextual workspace | approved contextual workspace mockup | Yes | V3 Draft workspace, revision-safe autosave, readiness, preview/revoke/publish are working behind flags | Contextual polish and all operation panels remain incomplete | Registration and Match Day panels |
| Multiformat create event | `miracle-organizer-v3-multiformat-create-event-mockup.html` | Yes | V3 creation surface shows full game + mode labels, format choices, ownership choices, and live structure preview | It creates the Draft then enters the workspace; five-step content parity and per-step persistence are still incomplete | Create wizard parity |
| Registration import | approved registration-import mockup | Yes | Legacy CSV/import remains | V3 paginated review surface is not implemented | Registration workspace |
| Match control | `miracle-organizer-v3-match-control-mockup.html` | Yes | Scheduling algorithm contract recorded | Command-center UI and scheduler are not implemented | Competition operations |
| Format-aware Match Day | `miracle-organizer-v3-format-aware-match-day-mockup.html` | Yes | Validated V3 format configuration is persisted | Format-aware operations UI is not implemented | Competition operations |
| Group Match Day | `miracle-organizer-v3-group-matchday-mockup.html` | Yes | Group + playoff configuration persists | Fixture, standings, and qualification UI are not implemented | Competition operations |
| Result & Stats | `miracle-organizer-v3-result-stats-mockup.html` | Yes | Existing score/stat handling remains | Official-result and stat-review V3 desk is not implemented | Competition operations |
| Tournament completion | `miracle-organizer-v3-tournament-completion-mockup.html` | Yes | Existing completion behavior remains | Format-aware completion, awards, and recap are not implemented | Completion rollout |
| Certificate studio | `miracle-organizer-v3-certificate-studio-mockup.html` | Yes | Existing certificate system remains | Premium template, assets, safe zones, and seven awards are not implemented | Completion rollout |
| Organizer Command Center | approved organizer command-center direction | Yes | `/[locale]/organizer` has owner-scoped Draft/Published inventory, Create Event, profile, and V3 workspace links | Critical action queue and all operational workspaces are not implemented | Registration and Match Day panels |

### Working V3 ownership and creation rules

- Organizer enters through `/[locale]/organizer`; an organizer who reaches `/[locale]/admin` returns to the Command Center.
- Platform Admin remains on `/[locale]/admin`, can open the shared V3 creation surface, and may create a Miracle-owned event, assign an event to an existing organizer, or provision a new organizer together with its Draft in one transaction.
- A Miracle-owned event has `organizerUserId = null`, appears publicly as **by Miracle**, and its publish readiness uses the editable global Miracle contact.
- A new organizer receives an admin-selected temporary password only as a bcrypt hash. `mustChangePassword` blocks organizer pages and server actions until the first password change succeeds.
- Draft creation uses the same event persistence as the V3 workspace. Workspace autosave is Draft-only, revision-safe, retry-idempotent, and owner-scoped. Publication is actor-scoped and atomically revokes private previews.

### Approved product rules

| Rule | Decision |
| --- | --- |
| Visual system | Dark default, Montserrat, Miracle logo as the palette source, maximum three brand colors; organizer supports light/night/system preference. |
| Persistent shell | Footer retains copyright by Miracle and social/contact links. |
| Audience priority | Organizer first, then public visitor, then captain. |
| Event essentials | WIB is the default timezone; venue name is required while full address is optional; registration open/close and event start are distinct. |
| Draft and preview | Every Draft must be saveable; an expiring private preview opens without login, remains read-only, can be revoked, and becomes invalid when published. |
| First-release formats | Single Elimination, Double Elimination, Round-Robin, and Group + Playoffs only. |
| Podium rule | Single Elimination exposes an optional third-place match, disabled by default; Double Elimination uses the lower-final loser for third; league uses final standings. |
| Results and stats | Official results progress brackets/schedules immediately; player statistics are draft/review/publish work and never block progression. |
| Certificates | Champion, Runner-up, Third Place, MVP, Top Scorer, Top Defender, and Top Assist; team logo is primary for podiums, character art primary for individual awards. |
| Public event | One permanent adaptive Event Page replaces separate live-center and final-recap routes. |
### Superseding format decision — 8 September 2026

The third-place match is no longer mandatory in Single Elimination. It is disabled by default and the organizer may enable it in Format settings; only then does its Best-of control and planned match enter the live structure preview.

### Workspace journey correction — 8 September 2026

The V3 event workspace now follows the approved journey model rather than showing every edit area at once. The top bar is a numbered horizontal sequence: **Identity → Schedule → Registration → Visuals → Format → Review & publish**. One session is visible at a time; **Back** and **Continue** move the organizer through it, and the URL hash keeps the active session in sync with the numbered bar. The live public-structure preview remains beside every session and updates from the current Draft state. The distracting right-side “Next action” panel is removed. Its necessary functions are retained only in the final Review & publish session: organizer or Miracle contact, readiness blockers, private preview, revoke, and publication.

This changes the Delivery Register status for **Organizer contextual workspace** to: *numbered single-session editing, live preview, autosave, preview/revoke/publish implemented; detailed visual polish and downstream operations remain.* It changes **Multiformat create event** only in the continuation workspace: the initial Create Event wizard is still a separate surface and has not yet reached full per-step mockup parity.

## Published Event Revision V3 — implemented (10 September 2026)

Published event editing now uses a private revision instead of mutating the public Event row. Organizer and Platform Admin open the same five-session editor, retain revision-safe autosave and live preview, and explicitly apply the result through **Perbarui event publik**. Until apply succeeds, the permanent public Event Page continues to render the previously published values.

Routes and entry points:
- Organizer: `/<locale>/organizer/events/<eventId>/edit`.
- Platform Admin: `/<locale>/admin/events/<eventId>/edit`.
- Organizer Command Center and Platform Admin inventory show **Lanjutkan setup** for Draft, **Edit event/Lanjutkan revisi** for editable published states, and read-only workspace/public actions for locked states.
- Event workspace exposes public page, edit/continue revision, and discard revision actions according to event status.

Status and field contract:

| Event state | Revision access | Registration period and fee | Public content | Structure fields |
| --- | --- | --- | --- | --- |
| Published, registration open | Editable | Editable | Editable | Editable until a Match exists |
| Published, registration time elapsed | Editable | Locked | Editable | Editable until a Match exists |
| Registration Closed | Editable | Locked | Editable | Editable until a Match exists |
| Ongoing | Locked; active revision discarded and preview revoked | Locked | Locked | Locked |
| Finished | Locked; active revision discarded and preview revoked | Locked | Locked | Locked |

Public content includes description, prize information, poster, event logo, venue, and match channel. Structure fields include event name, start date and timezone, game/mode, capacity, tournament format, groups, Best-of settings, and third-place configuration. Organizer slug is immutable after publish. Platform Admin has a dedicated slug action that records a permanent redirect, including public bracket, standings, participants, and leaderboard subroutes.

Persistence and concurrency contract:
- `Event.publishedRevision` identifies the exact public version on which a private revision is based.
- `EventEditRevision` stores one active Draft per event, its creator, validated payload, autosave revision, mutation identity, and Applied/Discarded history.
- Autosave returns `saved`, `conflict`, `locked`, or `not_editable`; identical retries remain idempotent and stale tabs cannot overwrite newer work.
- Applying a revision atomically claims the revision, checks ownership and event status, rechecks field locks and public revision, updates Event and stream data, then revokes revision preview tokens.
- Revision poster uploads remain inactive until apply. Private preview tokens are hash-only, expiring, replaceable, revocable, and invalid after apply, discard, or event start.

This closes the implementation gap for editing Published and Registration Closed event information. Registration operations, Match Day, Results & Stats, Completion, Certificates, and full Adaptive Public Event compositions remain separate milestones in the V3 Delivery Register.
