# Miracle V3 — Snapshot

## Brand / Product Context
Miracle berangkat dari komunitas gamer: **from gamers, for gamers**.

Miracle harus berkembang sebagai master brand / ecosystem brand, bukan hanya nama sebuah tournament builder. Target jangka panjangnya adalah menjadi **top of mind untuk mengadakan turnamen lokal**, menjangkau banyak komunitas game dengan pengalaman yang paling mudah digunakan.

## Brand Architecture
Master brand: **Miracle**.

Official competition vertical:
- **MFL = Miracle Foot-Ball League**
- MFL adalah liga resmi yang dioperasikan Miracle.
- Vertical official lain dapat muncul untuk Kuroko, Mobile Legends, Honor of Kings, dll.
- Naming boleh fleksibel, tetapi harus memiliki elemen Miracle yang eksplisit.
- Setiap vertical dapat punya personality sendiri, tetapi tetap terasa sebagai keluarga Miracle.

Community tournament:
- Event milik organizer eksternal dapat menggunakan Miracle tanpa dianggap sebagai official Miracle event.
- Perlu membedakan “Official Miracle competition” vs “Hosted on Miracle”.

## Brand Personality
- Community-first
- Gamer-friendly
- Competitive
- Energetic
- Easy-to-use
- Approachable
- Data-driven
- Reliable

Hierarki:
- Core identity: Community-first, Gamer-friendly, Easy-to-use
- Competitive/trust layer: Competitive, Data-driven, Reliable
- Emotional layer: Energetic, Approachable

## Organizer Audience
Persona utama:
- Streamer / creator
- Official / admin komunitas
- Top-up game store
- Experienced organizer / EO

Tone:
- Praktis
- Jelas
- Supportif
- Gamer-friendly
- Tidak terlalu corporate
- Tidak patronizing
- Advanced controls melalui progressive disclosure

## Visual Territory
- **Competitive Tech** sebagai foundation
- **Community Energy** sebagai personality
- **Digital Arena** untuk peak moments / official league / finals / hero moments

Prinsip: **“Miracle should feel like gaming without looking like a gaming cliché.”**

Hindari cyberpunk overload, glitch font, shield esports cliché, lightning everywhere, neon demi terlihat gaming, dan SaaS dashboard generic / AI slop.

## Color Rule
Maksimal 3 warna utama untuk brand identity maupun website.

Working palette:
- Cyan / Blue — `#18C8F2`
- Violet / Purple — `#7A22FF`
- Cream / Off-white — `#FFF3D4`

Dark neutrals adalah infrastructure UI, bukan core color. Semantic/status colors boleh dipakai untuk usability.

## UX Direction
Core principle: **“Miracle should always make the user's next action obvious.”**

Miracle Guide System adalah contextual UX layer, bukan sekadar FAQ.

Persona goals:
- Organizer: “Teach me how to run a tournament.”
- Captain: “Tell me what I need to do next.”
- Participant: “Tell me when and where I play.”
- Spectator: “Show me what's happening.”

## Organizer Creation Direction
Konsep yang disukai:
- Event creation/editor dalam satu workspace
- Live preview pada halaman yang sama
- Contextual guide
- User melihat dampak perubahan tanpa berpindah flow
- Progress/state tetap jelas

## Public Discovery Direction
Homepage harus membantu user menemukan event tanpa direct link.

Discovery:
- Live Now
- Open Registration
- Starting Soon
- Recently Completed
- Search/filter by game / event / team / organizer

Future follow system:
- Follow organizer
- Follow tournament series
- Follow game
- Notify registration opens / bracket publishes / important match starts

## Public Tournament Information Hierarchy
Public tournament page harus intent-first dan membantu user menjawab:
- Gue tanding kapan?
- Lawan siapa?
- Tim gue sudah masuk?
- Bracket di mana?
- Siapa yang lolos?
- Siapa top scorer / top leaderboard?
- Apa yang live sekarang?

Quick access:
- Participants
- Bracket
- Schedule / Matches
- Leaderboard / Stats
- Announcements

Participant/team search menjadi entry point ke roster, captain, verification status, seed, upcoming match, recent results, dan bracket position.

## Approved Visual Mockups
Disetujui:
1. Miracle Homepage mockup
2. Public Tournament Page mockup

Tidak disetujui:
- Organizer Dashboard mockup terbaru pada sesi ini.
User lebih menyukai organizer dashboard dari sesi lain. Jangan gunakan dashboard mockup yang ditolak sebagai source of truth.

## Homepage Approved Direction
- Hero: “Built by gamers, for gamers.”
- Tournament discovery
- Organizer value proposition
- Official Miracle league section
- Community stats
- Dark sharp interface
- 3-color system
- Competitive-tech structure with community energy

## Public Tournament Approved Direction
- Hero kuat tapi tidak terlalu berat
- Main tabs sangat terlihat
- Live/Next Match di atas
- Bracket preview
- Top leaderboard
- Participant search/list
- Schedule & results
- Announcement feed
- Follow updates
- Tournament facts
- Rulebook

## Knowledge Base References
- Gurade — gradient / background ambience
- Bklit — creative data visualization
- Cap.so — product demo / marketing video
- Laws of UX — UX principles
- Color Hunt — palette sourcing
- React Bits — animated React UI
- Watermelon UI — UI components/templates
- CodeFronts — implementation patterns
- Transitions.dev — purposeful UI transitions
- MotionSites — motion website inspiration
- Aura — hero / landing / design-to-code
- Taste Skill — anti-AI-slop UI guidance
- Trickle prompt library — vibe coding prompts
- Vibe Coder blog — UI prompting patterns
- 8bitcn — gaming/pixel accents
- unDraw — illustrations
- TextLab — mockup/social UI assets
- Bloub — animated SVG assets
- Settigation — motion/visual reference
- ScrapeGraphAI — data/dev tooling
- x-minus — video/audio production tooling

## Next Work Session
1. Import these HTML mockups as visual reference.
2. Recover preferred organizer dashboard from prior session.
3. Build complete Miracle V3 sitemap and screen inventory.
4. Lock design tokens.
5. Create reusable component system.
6. Map existing implementation to V3 IA.
7. Start implementation incrementally without breaking live tournament operations.
## Approved captain registration checkpoint — 5 September 2026

Canonical interactive reference: `public/miracle-captain-v3-direct-registration-mockup.html`.

The user is satisfied with both captain paths:
- reuse an existing draft team; or
- create a team from an empty account without leaving the event registration flow.

The create-new path includes team name, tag, optional logo, initial roster, validation, review, paid registration, proof upload, and status tracking. Team and roster values carry through payment and organizer review. This mockup is approved as design direction; it does not authorize production implementation.

Existing behavior verified before approval:
- only published events accept registration;
- paid events create a 24-hour payment request;
- proof upload changes `pending_payment` or `rejected` to `pending_review`;
- approval activates the team; rejection requires a reason and permits a new proof;
- UID and IGN are required for players, position is optional;
- a captain may have only one active registration per event;
- team name and tag must be unique within the event.

Next session focus: captain Match Day. Existing has match schedule/status and post-completion stat submissions. `CheckIn` and `Notification` data models exist but do not yet form a captain workflow. No captain room/lobby exchange or captain score-reporting flow was found. These must be treated as proposed v3 enhancements rather than current behavior.

## Match Control algorithm checkpoint — 5 September 2026

User requested that the prioritization and automatic scheduling behavior shown in `public/miracle-organizer-v3-match-control-mockup.html` be implemented in production code later. The algorithm contract is recorded at `docs/snapshots/product-ux-redesign-2026-09/match-control-scheduling-algorithm-v3.md`. It covers stable action ordering, deduplication/escalation, bracket dependencies, parallel rooms, buffers, team rest, locked matches, delay propagation, explicit publication, notifications, readiness sources, WO decisions, audit data, and required tests.

## Official result versus player statistics — 5 September 2026

Product decision: saving an official match result must immediately complete the match, determine the winner, advance the bracket, and recalculate affected downstream schedules. Player statistics use a separate draft/review/publication lifecycle and never block match progression. Result corrections require audit and impact preview; automatic correction is blocked once a dependent match is live or completed. Full contract: `docs/snapshots/product-ux-redesign-2026-09/match-control-scheduling-algorithm-v3.md` section 7.


## Approved result and statistics checkpoint — 5 September 2026

Canonical interactive reference: public/miracle-organizer-v3-result-stats-mockup.html.

The user approved the organizer Result & Stats Desk. The official score is the urgent path: validate the BO3 series, show one impact confirmation, then update bracket, the affected downstream schedule, captain notifications, and audit history immediately. Player statistics are deliberately separated, autosaved as drafts, reviewed or returned with a reason, and published per team. A published team does not lock the other team draft. Evidence and incident reporting stay optional and secondary.

The mockup was verified in desktop and mobile layouts with no page errors or horizontal overflow. It is an approved design reference and does not authorize production implementation.

Recommended next focus: the public Live Tournament Match Center, because it is where spectators see the output of the newly approved result, schedule, bracket, and statistics workflows. After that, design tournament completion, final standings, awards, and recap.



## Third-place bracket decision — 5 September 2026

User decided that elimination tournaments with semifinals must include a Third Place Match. Both semifinal losers play again to determine the official third-place team. Final podium publication waits for both the Final and Third Place Match results, enabling objective Champion, Runner-up, and Third Place certificates.

Existing code does not provide loser routing or a Third Place round; it currently propagates semifinal winners to the Final and triggers one champion certificate from the completed Final. Treat the new match, scheduling rules, completion gate, and multi-award certificates as v3 enhancements.



## V3 first-release format scope — 5 September 2026

User intentionally reduced the initial release scope to:
- Head-to-Head Elimination: Single and Double.
- League / Round-Robin.
- Group + Playoffs.

Single Elimination uses the approved Third Place Match when two semifinals exist. Double Elimination does not create an extra bronze match because third place is resolved by the Lower Bracket Final loser. Pure league podium positions come from the locked standings. Group + Playoffs uses round-robin groups followed by selectable Single or Double Elimination playoffs.

Battle Royale, threshold-win finals, Swiss, FFA/heats, and score/time-trial engines are deferred.


## Approved format-aware Match Day checkpoint — 5 September 2026

Canonical references:
- public/miracle-organizer-v3-format-aware-match-day-mockup.html
- public/miracle-organizer-v3-group-matchday-mockup.html

The user approved the revised group workflow. Pertandingan is the default organizer view, organized by group and matchday, with filters for fixtures needing results. Klasemen & kelolosan is separate and calculated only from official results. Official scores immediately update points, rank, qualification cutlines, and playoff-seed previews; player statistics retain the previously approved draft/review/publication lifecycle. Desktop and mobile flows were verified without page errors or horizontal overflow.

## Approved Tournament Completion and Premium Certificate checkpoint — 5 September 2026

Canonical references:
- public/miracle-organizer-v3-tournament-completion-mockup.html
- public/miracle-organizer-v3-certificate-studio-mockup.html

The user approved a gated completion workflow covering format-aware podium determination, award review, certificate generation, and public recap preparation. Completion waits for required official results, zero active disputes, a deterministic podium, and validated award-source statistics. Award ties require an explicit audited organizer decision.

The approved certificate set contains Champion, Runner-up, Third Place, MVP of Tournament, Top Scorer, Top Defender, and Top Assist. The premium direction preserves the collectible championship-poster quality of the existing certificate at 1080 x 1920 portrait.

Asset placement is now explicit:
- team podium certificate: team logo is the hero visual; no generic team visual or character art is required;
- individual certificate: character art is the hero visual and the team logo is a secondary badge;
- Miracle logo, event logo, award title, recipient identity, date, certificate ID, and verification occupy protected zones;
- an optional safe-zone overlay guides placement and is excluded from exports;
- light identity and dark award fields remain separated to prevent the contrast collision found during review.

The certificate studio was tested across all certificate-type transitions, safe-zone behavior, desktop, and mobile with no page errors or document-level overflow. This is an approved design reference, not production implementation authorization.

The separate Live Tournament Match Center and Final Public Recap concepts are superseded by the approved adaptive Event Page. Next focus: V3 sitemap and component consolidation, existing-to-V3 mapping, and implementation planning.

## Approved adaptive public Event Page checkpoint — 5 September 2026

Canonical reference:
- public/miracle-public-v3-adaptive-event-page-mockup.html

The user approved one lifecycle-aware public Event Page and decided that separate Live Match Center and Final Public Recap pages would be redundant.

The permanent event URL now adapts as follows:
- Registration prioritizes information and team registration.
- Ongoing prioritizes live match state, schedule changes, current competitive context, and recent official results.
- Finished transforms the main Event Page into the final recap with champion, podium, Grand Final, champion journey, awards, and certificates.

Existing detail pages remain the deeper destinations for participants, schedule/results, bracket, standings, leaderboards, awards, and individual certificates. This decision keeps shared links stable and eliminates duplicate public content. The three lifecycle variants and mobile layout were verified without page errors or horizontal overflow.

Next focus: consolidate the complete V3 sitemap, reusable components, design tokens, implementation dependencies, and phased migration plan.

## V3 implementation planning checkpoint — 5 September 2026

The sitemap, lifecycle matrix, design tokens, component inventory, current-to-V3 mapping, data gaps, and rollout order are consolidated in `docs/snapshots/product-ux-redesign-2026-09/miracle-v3-product-architecture.md`.

Implementation is split into five bounded workstreams plus one rollout roadmap under `docs/superpowers/plans/`. This is intentional: the current `src/app/admin/page.tsx`, `src/app/captain/page.tsx`, `src/lib/actions.ts`, and `src/lib/platform/repository.ts` are large modules, so V3 domains migrate incrementally instead of being rewritten in one unsafe change.

Default-off flags preserve rollback during the transition:
- `ui_v3_foundation`
- `organizer_workspace_v3`
- `registration_workspace_v3`
- `competition_operations_v3`
- `adaptive_public_event_v3`

Completion and certificate UI remains dependent on the competition-operation rollout; its records are versioned and its public output appears through the adaptive Event Page. The next action is implementation Phase 1: Miracle V3 design foundation.

## V3 implementation handoff — 6 September 2026

Current implementation branch: `feature/ui/release/1.0`.

Completed commits:
- `084d740` — V3 design foundation and rollout hardening.
- `b770318` — additive event lifecycle schema and preview-token foundation.
- `b379060` — reliable event draft autosave and guarded publication.

Task 2 production contract:
- Autosave accepts incomplete Draft patches and never injects an omitted timezone; new events retain the database default `Asia/Jakarta`.
- Every autosave mutation carries a UUID. A retry is accepted only when the next revision, stored mutation ID, and normalized submitted values all match.
- A stale or changed request returns a conflict and cannot overwrite a newer draft. Published events are not editable through the draft service.
- Publish readiness reports independent field and cross-field blockers, requires a non-blank slug and organizer contact, accepts a zero-value fee, and treats another organizer event on the same WIB date as informational.
- Publication runs in one actor-scoped transaction, requires the exact checked draft revision and Draft state, prevents duplicate publication, records `publishedAt`, and revokes active private-preview tokens.
- When `organizer_workspace_v3` is enabled, the legacy admin publish action uses the same readiness guard. Default-off flags retain the current interface as rollback.

Verification at this checkpoint:
- Focused Task 2 suite: 151 tests passed.
- Full Vitest suite: 500 tests passed across 44 files.
- TypeScript: passed.
- Prisma schema validation: passed.
- Production build: passed.
- Independent review: PASS after two fix rounds; all authorization, revision race, sparse patch, slug, blocker completeness, and retry identity findings were closed.
- No migration was applied to a shared or production database.

Handoff next action:
- Implement Event Lifecycle Task 3 from `docs/superpowers/plans/2026-09-05-miracle-v3-event-lifecycle-registration.md`.
- Preview tokens must be unguessable, hash-only, expiring, replaceable/revocable, uncached, noindex, no-referrer, and readable without login only while the event remains Draft.
- Extract a shared event view model so private preview and the later adaptive public Event Page render the same normalized event identity without exposing edit, registration, share, or public-navigation controls in preview mode.
- Before building the multiformat Create Event UI, land the validated V3 format configuration contract while retaining legacy format strings as compatibility fields.
