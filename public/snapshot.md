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

## Organizer Command Center checkpoint — 8 September 2026

Branch remains `feature/ui/release/1.0` in the dedicated worktree. The organizer entry point is now `/<locale>/organizer`, guarded for the organizer role and `organizer_workspace_v3` feature flag. It reads `getManageableEventsForUser`, which scopes event inventory to `organizerUserId`, and opens each record at `/<locale>/organizer/events/<eventId>/overview`.

Organizer navigation contains the Command Center, Create Event, and Organizer Profile. Platform Admin navigation contains `/admin`; an organizer request to `/admin` is redirected to `/organizer`. Organizer profile writes use `updateOrganizerProfileForUser`, enforce organizer ownership, and update only that user's event `organizerName` records.

E2E login helpers assign distinct RFC 2544 test-net client addresses per browser login. This keeps the real per-IP brute-force middleware enabled while preventing a serial test suite from self-triggering its ten-login rate limit. Local retries remain disabled so deterministic failures stay visible.

Verification on the isolated Delicate database (`.env.test`): `pnpm test:unit` 606 passed; lint and TypeScript passed; `pnpm test:e2e:full` 39 passed and 2 skipped. No production database operation was performed.

## V3 Create Event and Platform Admin handoff — 8 September 2026

Working tree: `feature/ui/release/1.0` in `.worktrees/miracle-ui-release-1.0-full`.

Feature flags needed to expose the current V3 work:
- `FEATURE_FLAG_UI_V3_FOUNDATION=true`
- `FEATURE_FLAG_ORGANIZER_WORKSPACE_V3=true`
- `FEATURE_FLAG_COMPETITION_OPERATIONS_V3=true` for Double Elimination, Round-Robin, and Group + Playoffs

Current contracts:
- V3 create event sends organizers to `/<locale>/organizer/events/<id>/overview`; Platform Admin sends all created events to `/<locale>/admin/events/<id>/overview`.
- The shared surface presents Miracle ownership, existing-organizer ownership, and atomic new-organizer ownership. New organizer password material is hash-only and `mustChangePassword` prevents access to organizer workspace and mutations until changed.
- Platform-owned Drafts are publish-ready only when global `PlatformProfile` contact is configured. The pending migration adds `PlatformProfile` and `User.mustChangePassword`.
- Group + Playoffs values from the create preview persist as `formatConfig`; invalid group capacity or qualification layouts are rejected.
- E2E, local test server, Prisma reset/seed, CI, and preview safety use `.env.test` and the isolated Delicate Neon branch only. The production host is rejected by preflight before Prisma operations.

Verification performed after this checkpoint:
- `pnpm prisma validate`: passed.
- `pnpm exec tsc --noEmit`: passed.
- full unit suite: 618 passed across 61 files.
- focused V3 action, readiness, create-page, organizer-profile, security, and workspace-layout tests: passed.
- `pnpm test:e2e:preflight` and `pnpm test:e2e:prepare`: passed against Delicate; migrations including `20260908020000_platform_profile_and_forced_password` and deterministic seed completed.
- targeted browser lifecycle (`v3-organizer-lifecycle.spec.ts`): passed on Delicate.
- production build compiled, emitted build artifacts, and completed type validation.

Before enabling the schema-backed Platform Admin flow in a shared environment:
1. Apply `20260908020000_platform_profile_and_forced_password` through the normal test/preview migration process only.
2. Run `pnpm test:e2e:prepare` and `pnpm test:e2e` with `.env.test`.
3. Run the full unit suite, lint, production build, and browser suite.

Known implementation gap: the Create Event surface currently creates a Draft and continues in the existing autosaving workspace. It has the approved five-stage guidance and live structure preview, but its separate step panels and per-step save behavior are not yet full mockup parity. Registration, Match Day, Results & Stats, Completion, Certificates, and Adaptive Public Event remain planned work as detailed in the V3 Delivery Register in `public/plan.md`.
### Latest UI correction — 8 September 2026

The workspace setup rail is horizontal and numbered. The Draft editor renders a live public-structure preview from current autosaved values. Single Elimination now defaults to no third-place match; organizers may enable it explicitly.

### Workspace journey correction — 8 September 2026

The V3 event workspace now follows the approved journey model rather than showing every edit area at once. The top bar is a numbered horizontal sequence: **Identity → Schedule → Registration → Visuals → Format → Review & publish**. One session is visible at a time; **Back** and **Continue** move the organizer through it, and the URL hash keeps the active session in sync with the numbered bar. The live public-structure preview remains beside every session and updates from the current Draft state. The distracting right-side “Next action” panel is removed. Its necessary functions are retained only in the final Review & publish session: organizer or Miracle contact, readiness blockers, private preview, revoke, and publication.

This changes the Delivery Register status for **Organizer contextual workspace** to: *numbered single-session editing, live preview, autosave, preview/revoke/publish implemented; detailed visual polish and downstream operations remain.* It changes **Multiformat create event** only in the continuation workspace: the initial Create Event wizard is still a separate surface and has not yet reached full per-step mockup parity.

## Published Event Revision V3 handoff — 10 September 2026

Current branch remains `feature/ui/release/1.0` in `.worktrees/miracle-ui-release-1.0-full`. The working tree also contains the previously accumulated Create Event, Platform Admin, organizer profile, test-database, CI, and V3 shell work; do not reset or discard those changes when continuing.

Implemented revision lifecycle:
- Published and Registration Closed events expose **Edit event** and reuse one active private revision as **Lanjutkan revisi**.
- Ongoing and Finished event edit routes render a locked explanation and never open an editable form.
- The shared five-session editor autosaves into `EventEditRevision`, renders revision values in live preview, stages poster/logo changes, supports preview/revoke/discard, and applies only through **Perbarui event publik**.
- Registration date/fee fields lock after registration closes. Structure fields lock once a Match exists. Public descriptive and visual fields remain editable until the event becomes Ongoing.
- Platform Admin may change the published slug through the dedicated action. `EventSlugRedirect` preserves the old permanent event URL and its public detail subroutes.
- Explicit or automatic transition to Ongoing discards active revisions and revokes previews. Finished is also fully locked.

Database and environment safety:
- Migration `20260909010000_published_event_revision_v3` adds `publishedRevision`, `EventEditRevision`, revision-bound preview tokens, and `EventSlugRedirect` with a partial unique index for one Draft revision per event.
- The migration was applied only by `pnpm test:e2e:prepare` after preflight confirmed `ep-delicate-forest-azuodo4q` (Neon Delicate). No production database operation was performed.
- `scripts/e2e-db-prepare.mjs` now uses `--skip-generate` during reset so Windows DLL locks cannot produce a misleading Prisma generate error. Client generation remains a separate build/install concern.

Verification checkpoint:
- full Vitest suite: 651 passed across 65 files;
- TypeScript/lint command: passed;
- production build through the `.env.test` loader: passed;
- Published Event Revision E2E from a clean Delicate reset: 5 passed serially (private edit/autosave/preview/apply, Registration Closed locks, Ongoing/Finished locks, Platform Admin slug redirect, and 360 px overflow).


## Adaptive Public Event V3 handoff - 11 September 2026

Workspace and branch:
- worktree: .worktrees/adaptive-public-event-v3;
- branch: feature/ui/adaptive-public-event-v3;
- base: origin/feature/ui/release/1.0 at 014f45317c7bd257ac85cbddb1019fa19a8a0f7a;
- rollout flag: adaptive_public_event_v3, default false; dev:e2e forces it true for browser coverage.

Registration-phase public behavior is implemented at the permanent localized event URL. Published and Registration Closed events with structured registration and event-start dates use the adaptive renderer when enabled. Legacy, Draft, Ongoing, and Finished behavior remains unchanged. Private preview remains read-only and never shows registration CTA or the Captain dialog.

The request-scoped view model owns availability, live slot counts, event visual fallbacks, organizer or Miracle identity, contact normalization, format description, viewer state, and CTA selection. It is not response-cached because it includes session-specific Captain state and current capacity. The route retries one transient view-model query once, then safely falls back to the existing renderer.

Captain intent contract:
- login and signup accept only internal locale and event ID values;
- destinations are built server-side and never accept an arbitrary redirect URL;
- a successful login or signup opens /<locale>/captain?tab=registration&eventId=<eventId>;
- the workspace validates accessibility, prioritizes the requested event, shows its name and a breadcrumb back to the public page, and ignores invalid IDs;
- registration and proof-upload redirects preserve the same event context.

Slot contract:
- active Team and pending_review occupy slots;
- pending_payment, rejected, and expired do not;
- payment proof may be uploaded during its full 24-hour request window even after registration closes;
- free registration, proof acceptance, approval, signup, and import use retryable Prisma Serializable transactions and recheck capacity;
- rejection releases the reservation; approval transforms the reserved request into a Team without double counting.

Database safety:
- all local and browser verification loads .env.test;
- preflight confirmed Neon Delicate host ep-delicate-forest-azuodo4q;
- this work used unique fixtures and cleanup, not a Delicate reset;
- production database was not accessed or modified.

Latest verification:
- full Vitest: 705 passed across 73 files;
- TypeScript/lint: passed;
- production build with .env.test loaded first: passed;
- adaptive E2E: 5 passed serially, including login/signup intent, CTA states, slot reservation, both locales, and 360 px;
- full no-reset Playwright run: 39 passed, 2 skipped, 6 failed, and 4 not run. Four failures came from stale shared seed state while another release server was active; two came from existing organizer-workspace expectations outside this adaptive-page batch;
- independent review: no remaining blocking findings after fixes for registration windows, Registration Closed approval, expiry persistence, roster limits, Serializable capacity races, and safe JSON-LD serialization.

Next product milestone: complete the separate Registration workspace workstream, then implement the Ongoing adaptive Match Center after format-aware Match Day is available. Finished public composition follows Results, Completion, and Certificate delivery.
