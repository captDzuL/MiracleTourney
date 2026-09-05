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
