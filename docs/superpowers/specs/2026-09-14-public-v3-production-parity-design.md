# Miracle Public V3 Production Parity

Date: 14 September 2026
Status: Approved direction; implementation planning pending final spec review

## Decision

`public/miracle-public-v3-final-mockup.html` is the visual source of truth for the production public experience. It is not merely inspiration. Production must preserve the mockup's composition, hierarchy, typography, spacing, poster treatment, event pulse, navigation, event directory, phase modules, and responsive behavior while replacing illustrative content with authoritative application data.

The review toolbar and sample-data controls remain prototype-only and do not appear in production.

## Scope

This parity pass covers:

- `/[locale]` Homepage;
- `/[locale]/events` Event Center;
- `/[locale]/events/[slug]` adaptive event overview;
- participant, schedule, bracket or standings, and leaderboard detail routes;
- registration, published drawing, ongoing, and finished lifecycle states;
- public rendering of events whose persisted records predate V3 competition state.

Organizer operations, Match Day, Completion, player-score contracts, and certificate generation retain their existing behavior. This work changes their public composition only where necessary to supply the approved presentation.

## Visual parity contract

### Homepage

The production Homepage follows the connected mockup's `#home/<phase>` composition:

1. A compact intro row establishes the front-row/live-event context and current date or phase time.
2. The featured-event hero uses the mockup's split composition: dominant identity and phase content on the left, poster stage on the right.
3. The hero contains a phase-aware match/status module. Ongoing shows an authoritative live series when one exists; drawing shows official publication context; registration shows deadline and capacity; finished shows the official final result.
4. Primary and secondary actions never overlap the metadata strip. The hero reserves explicit content space at all breakpoints.
5. The Event Pulse strip surfaces two authoritative, phase-relevant updates. Missing data produces honest phase guidance rather than invented match claims.
6. Four discovery cards provide Participants, Schedule and Results, Road to Champion, and Leaderboard access.
7. A phase-aware highlight module and organizer trust card follow the hero.
8. Other events remain visible through a compact directory and archive entry without competing visually with the featured event.

### Event Center

`/[locale]/events` follows `#events/<phase>`:

- editorial heading and counts;
- URL-backed status and game filters;
- one clearly identified primary event;
- upcoming and finished events in the mockup's directory card grid;
- deterministic ordering and honest empty or error states;
- no full-width generic rows when the mockup specifies bounded cards.

### Adaptive event overview

Every public event uses the approved V3 event shell while the V3 flag is enabled:

- full event identity and poster on the overview;
- compact event identity on detail routes;
- shared sticky navigation for Overview, Participants, Schedule, Bracket or Standings, and Leaderboard;
- phase-aware overview content matching `#event/registration`, `#event/drawing`, `#event/live`, or `#event/finished`;
- organizer trust, official announcements, and event essentials in the supporting column;
- preview sections link to the dedicated detail routes.

The application must not select the legacy renderer merely because an event lacks a V3 competition phase. The legacy renderer remains available only when the V3 rollout flag is explicitly disabled.

## Data architecture

### Normalized public model

Server readers produce a normalized public union:

- `registration`;
- `drawing`;
- `ongoing`;
- `finished`.

Each variant includes shared event identity, game and mode, organizer trust, facts, poster inputs, contextual navigation, relevant official updates, and explicit availability for optional modules. React presentation components consume this model and do not query repositories independently.

### Existing and legacy events

Public V3 supports older persisted events through a read-only compatibility projector:

- base identity comes from `Event`;
- participants come from accepted teams and public roster fields;
- existing `Match` rows may supply schedules and official results;
- published V3 phase data remains authoritative when present;
- legacy team creation order never becomes a published seed declaration;
- missing bracket authority is represented as an unavailable or TBD bracket state;
- missing live state is represented as scheduled, awaiting result, or no live match;
- missing reviewed player statistics produce the approved explanatory empty state.

The compatibility projector changes presentation, not persisted competitive truth. It does not synthesize a published drawing, winner, award, statistic, or certificate.

Local test fixtures are upgraded to coherent V3 lifecycle records so the default featured event exercises the real adaptive path. Production data is not mutated as part of local seeding or this public rendering change.

## Component boundaries

The prototype markup is ported into focused React components rather than embedded as an iframe or copied as one monolith:

- `PublicV3Shell`: content width, breadcrumbs, shared background, and responsive frame;
- `FeaturedEventHero`: identity, phase badge, phase module, actions, facts, and poster;
- `EventPosterStage`: uploaded poster first, existing game/character artwork second, branded typographic fallback last;
- `EventPulse`: authoritative phase updates;
- `PublicEventNavigation`: full and compact sticky variants;
- `EventDirectory`: primary/upcoming/archive cards and URL filters;
- lifecycle overview modules for registration, drawing, ongoing, and finished;
- reusable preview modules for live result, schedule, bracket/standings, leaderboard, awards, and certificates.

The existing mockup CSS tokens and local Montserrat assets are translated into a scoped production stylesheet or equivalent shared tokens. Current generic V3 utility compositions are removed once their replacements have coverage.

## Asset behavior

An organizer-approved event poster remains the first choice. When no poster exists, production uses the mockup's branded poster geometry with available game or character art. When no usable art exists, the same geometry renders a typographic event fallback. Missing assets never collapse into an unrelated flat green tile or alter layout dimensions.

Decorative images use empty alternative text; meaningful event artwork receives a localized accessible name. Image containers reserve their final size to prevent layout shift.

## Responsive and interaction behavior

- Desktop content uses the approved 1220px visual measure.
- Layouts are verified at 360, 390, 768, 1024, and 1440 pixels.
- Hero actions and metadata never overlap.
- Event navigation remains keyboard accessible and horizontally bounded on narrow screens.
- Tables and bracket canvases scroll inside their own containers and never widen the document.
- Dialogs retain Escape handling, focus management, and visible selected states.
- Reduced-motion users receive no ornamental motion dependency.

## Failure behavior

- Database timeout or failure renders a branded error state with no fixture data.
- A single optional module failure does not discard the complete event page.
- Missing V3 phase data invokes the compatibility projector, not the legacy UI.
- Missing official data is named explicitly as unavailable, awaiting publication, or TBD.
- Server logs include the event identifier, requested phase, failed reader, and error class without personal or secret data.

## Verification

### Functional coverage

- featured-event priority and other-event visibility;
- all four lifecycle variants;
- legacy-event compatibility without legacy-renderer fallback;
- registration order never presented as seed order;
- official drawing, schedule, result, statistic, award, and certificate visibility boundaries;
- Indonesian and English routes;
- feature-flag rollback to V2.

### Visual coverage

Playwright screenshot assertions cover Homepage, Event Center, event overview, Participants, Schedule, Bracket or Standings, and Leaderboard at the five required widths. Baselines are taken from the production React routes, reviewed against the final mockup, and stored without generated ad-hoc preview folders.

Assertions additionally check:

- no document overflow;
- no hero action/fact collision;
- stable poster dimensions with uploaded and fallback artwork;
- sticky navigation placement;
- correct card-grid changes by breakpoint;
- bounded tables and bracket canvases;
- honest missing-data states.

The release is not visually accepted merely because text and route assertions pass. Required screenshots must be reviewed against the final mockup and the CI visual suite must pass without flaky retries.

## Rollout and safety

`FEATURE_FLAG_PUBLIC_DISCOVERY_V3` and `FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3` remain default-off. When enabled, all public events use the V3 presentation and compatibility projector. When disabled, the current V2/legacy composition remains the emergency rollback path.

No production deployment, production migration, production data backfill, or production flag activation is part of this implementation task. Preview must be configured and verified before the release decision can become READY.

## Acceptance criteria

The work is accepted when:

1. The production Homepage is recognizably the approved final mockup at first glance, not a simplified reinterpretation.
2. Event Center and every public detail route share the same visual system.
3. No event falls back to the old public layout while V3 is enabled.
4. Existing incomplete events remain truthful and usable through compatibility states.
5. Fixture data exercises V3 rather than hiding reader failures behind legacy pages.
6. Functional, accessibility, responsive, and visual-regression gates are green locally and in CI.
