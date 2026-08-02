# MiracleTourney (Internal README)

Last updated: Sunday, August 2, 2026.

## Purpose

MiracleTourney is the current MVP web app for running lightweight multi-game community tournaments with a strong launch-week bias toward speed, readability, and operator control.

The current MVP scope is intentionally narrow:
- web only
- Next.js app router
- demo/in-memory persistence
- admin-operated results and event lifecycle
- CSV-based team registration import
- public event hub with bracket, standings, participants, leaderboard, and livestream support

The current two supported game modes are:
- Kuroko no Basket Street Rival (3v3)
- Flashpeak (5v5)

This README is for internal developers only. It is not written as a public-facing project overview.

## Current MVP status

As of Sunday, August 2, 2026, the following launch-critical flows are implemented and verified locally:

### Public surface
- `/events` event hub
- `/events/[slug]` event detail
- `/events/[slug]/participants`
- `/events/[slug]/bracket`
- `/events/[slug]/standings`
- `/events/[slug]/leaderboards`
- event-level livestream rendering with YouTube embed and external fallback behavior

### Admin surface
- create draft event
- update event lifecycle/status
- import team registrations from CSV
- review imported team + PIC rows
- update event livestream metadata
- enter match results from admin panel

### Tournament behavior
- single-elimination bracket generation for 8 / 12 / 16 / 24 presets
- preset slot count is authoritative; brackets do not auto-compress
- deterministic advancement from completed results
- chained bye propagation
- round-robin fixture generation for league events
- team standings aggregation for league events

### Testing and QA support
- Vitest coverage for tournament, import, and action logic
- Playwright smoke coverage for the critical admin -> public flow
- reusable CSV testing datasets under `public/templates/testing`

## Tech stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Zod for server-action/form validation
- Vitest for unit/integration tests
- Playwright for browser smoke coverage

Notes:
- `@prisma/client` and `prisma` are installed but the current MVP still runs on an in-memory demo store.
- Neon/Postgres remains the intended next persistence target, but it is not wired yet.

## How the app works

At a high level, the app currently uses a simple read/write split:

1. UI routes in `src/app/**` render server components.
2. Mutations are performed through server actions in `src/lib/actions.ts`.
3. Those actions mutate the in-memory store in `src/lib/platform/demo-store.ts`.
4. Tournament projections and aggregations are computed by pure helpers in `src/lib/tournament/engine.ts`.
5. Public pages consume derived state from the store and tournament engine.

That gives us a fast MVP loop without database setup, but it also means state persistence is process-local and reset-sensitive.

## Architecture breakdown

### 1. Route layer (`src/app/**`)

Main route groups:
- `src/app/page.tsx` landing page
- `src/app/login/page.tsx` demo auth entry
- `src/app/admin/page.tsx` admin operations surface
- `src/app/captain/page.tsx` captain surface
- `src/app/events/page.tsx` public event hub
- `src/app/events/[slug]/**` event sub-pages

All major UI is currently server-rendered via the App Router.

### 2. Server action layer (`src/lib/actions.ts`)

This is the write-path entry point.

Current action responsibilities include:
- demo login/logout
- captain team registration and player add flow
- admin event creation
- admin event status update
- admin CSV team import
- admin match result entry
- admin livestream metadata update

Important property:
- actions redirect after mutation and use `revalidatePath("/", "layout")` to refresh public/admin views.

### 3. Demo store (`src/lib/platform/demo-store.ts`)

This is the current source of truth for runtime state.

It holds:
- users
- events
- teams
- players
- matches
- player stats

Key characteristics:
- initialized from `initialState`
- stored on `globalThis.__mflStore`
- cloned once per server process boot
- mutable at runtime
- resets when the dev server process restarts

This file currently provides both:
- raw selectors (`getEvents`, `getTeamsForEvent`, `getMatchesForEvent`, etc.)
- domain mutations (`createEvent`, `importTeams`, `setEventStatus`, `setMatchResult`, etc.)

This is acceptable for the MVP but should eventually be split behind a real repository/data-access boundary.

### 4. Tournament engine (`src/lib/tournament/engine.ts`)

This file contains the core pure tournament logic.

Current responsibilities:
- single-elimination bracket generation
- single-elimination bracket projection from results
- bye resolution and chained advancement
- round-robin schedule generation
- league standings aggregation
- player leaderboard aggregation
- livestream platform parsing/presentation helpers

Important current rule:
- for single elimination, the configured participant cap is authoritative; the engine does not compress undersubscribed brackets into smaller live brackets.

### 5. Tournament types (`src/lib/tournament/types.ts`) and platform types (`src/lib/platform/types.ts`)

These define the operational contracts between:
- demo store state
- engine functions
- public rendering
- admin mutation flows

Notable match metadata now in use:
- `round`
- `slot`
- `winnerTeamId`
- `scheduledLabel` (optional)

These fields are important because they allow bracket projection and admin match operations to share a stable operational model.

### 6. CSV import pipeline (`src/lib/imports/team-import.ts`)

Import contract:
- one CSV row = one team registration
- required header order is exact
- import attaches to an existing `event_slug`
- imported data currently creates event participation at team + PIC level only

Required CSV header:

```csv
event_slug,team_name,team_tag,captain_name,captain_contact
```

Current validation behavior includes:
- exact header validation
- row length validation
- required field validation
- unknown `event_slug` rejection
- duplicate `team_tag` rejection within the same event
- duplicate `team_name` rejection within the same event

### 7. Demo auth/session (`src/lib/auth/**`)

Auth is still demo-mode and role-based.

Current roles:
- `admin`
- `captain`

This is enough for local MVP flow testing, but not enough for production identity management.

## Implemented feature brief

### Public event hub
The public event hub only exposes events in public lifecycle states:
- Published
- Registration Closed
- Ongoing
- Finished

`Draft` is admin-only.

### Event detail
Event detail provides:
- game + mode + format pills
- registration window, participant count, venue
- bracket/fixture count snapshot
- leaderboard summary
- livestream section if enabled

### Participants
Participants are event-scoped and use the same public visibility guard as the rest of the public event surface.

### Bracket / fixtures
Single elimination:
- projected from team seeds + recorded results
- byes auto-advance
- result propagation is guarded so unrelated recorded matches do not incorrectly advance winners

League:
- fixtures display completed state rather than static placeholders

### Standings
League standings are recalculated from completed match results using:
1. points
2. score difference
3. score for

### Leaderboards
Current leaderboard support is event-scoped.

Supported stat families:
- Kuroko: points, assists, rebounds, steals, blocks
- Flashpeak: goals, assists, tackles, blocks

Important current product behavior:
- if an event only has team + PIC import data and no player stat data, the UI degrades gracefully with an empty state instead of fabricating player rows.

### Admin operations
The admin page currently exposes:
- event creation
- event publish/status control
- livestream metadata update
- CSV import
- imported registration review
- match result entry
- high-level operations overview

### Browser smoke coverage
Current smoke coverage validates the critical operational loop:
- admin login
- lifecycle mutation
- CSV import
- match result entry
- public state change confirmation

## Folder map

These are the main folders a second developer should care about first:

- `src/app/`
  - route layer and server-rendered UI
- `src/components/`
  - shared presentation components
- `src/lib/actions.ts`
  - all current server-side mutations
- `src/lib/platform/`
  - config, types, demo-store
- `src/lib/tournament/`
  - pure tournament and aggregation logic
- `src/lib/imports/`
  - CSV parsing and validation
- `tests/e2e/`
  - Playwright smoke tests
- `public/templates/testing/`
  - reusable CSV import datasets
- `docs/operations/`
  - operator notes for datasets/import
- `docs/superpowers/`
  - design and execution artifacts from the overnight MVP push

## Local development

### Prerequisites
- Node.js 24.x is currently what the environment has been using successfully
- Corepack enabled
- pnpm available through Corepack

### Install

```powershell
corepack pnpm install
```

### Run the app

```powershell
corepack pnpm dev
```

Default local URL:
- `http://127.0.0.1:3000`

### Type-check

```powershell
corepack pnpm lint
```

### Unit/integration tests

```powershell
corepack pnpm test
```

### Browser smoke test

```powershell
corepack pnpm test:e2e
```

Notes for E2E:
- the Playwright run is now configured to own a fresh app lifecycle per invocation
- port `3000` should be free before running `test:e2e`
- do not rely on a manually running dirty dev server for repeatable smoke verification

## QA assets

Reusable datasets live here:
- `public/templates/testing/master-multievent-teams.csv`
- `public/templates/testing/miracle-league-8.csv`
- `public/templates/testing/miracle-league-12.csv`
- `public/templates/testing/miracle-league-16.csv`
- `public/templates/testing/miracle-league-24.csv`
- `public/templates/testing/kuroko-summer-cup-8.csv`

Operational notes:
- `docs/operations/testing-datasets.md`
- `docs/operations/team-import-template-notes.md`

## Known limitations

These are real current limitations, not future nice-to-haves:

1. Persistence is in-memory only.
   - Restarting the app process resets operational data to `initialState`.
   - This is the single biggest technical limitation right now.

2. Auth is still demo auth.
   - No production-grade identity, session hardening, or admin authorization boundary beyond current app flow.

3. CSV import is the only registration ingestion path.
   - There is no live Google Form integration yet.
   - Captain self-service roster/account provisioning is not production-ready.

4. Database libraries are present, but DB persistence is not wired.
   - The app is not yet using Prisma/Neon for runtime state.

5. Some branch history/worktree hygiene is still mid-cleanup.
   - The current overnight MVP push landed through multiple overlapping working-tree changes.
   - Logic is tested and reviewed, but commit history still needs a proper cleanup pass before public handoff.

6. The Playwright smoke flow is intentionally narrow.
   - It covers the critical happy path, not a full regression matrix.

## Recommended next workstreams

Recommended order from here:

1. Branch cleanup and integration hygiene
   - consolidate the current working tree into reviewable commits
   - remove residual generated artifacts from source control candidates
   - prepare a clean PR-ready diff

2. Replace demo-store with real persistence
   - Prisma + Neon/Postgres
   - durable events, teams, imports, matches, and stats

3. Real auth and role enforcement
   - production login/session model
   - admin authorization at mutation boundaries
   - captain account lifecycle

4. P1 event media polish
   - event logo / game art hooks
   - stronger event card readability on public pages

5. Expand test depth
   - more negative-path E2E
   - broader public/admin route assertions
   - import edge-case coverage with real operator files

## Internal branch hygiene note

What I cleaned in this pass:
- added this internal `README.md`
- marked `test-results/` as generated output to ignore
- removed the current generated `test-results/` artifact from the working tree

What is intentionally not claimed yet:
- the branch is not fully commit/PR-clean yet
- there are still many intentional MVP source changes in the working tree that need a dedicated cleanup/integration pass

## Quick start for the next developer

If you are the next developer touching this repo, do this first:

1. Read this file fully.
2. Read `docs/operations/testing-datasets.md`.
3. Run:

```powershell
corepack pnpm install
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
```

4. Open these files next:
- `src/app/admin/page.tsx`
- `src/lib/actions.ts`
- `src/lib/platform/demo-store.ts`
- `src/lib/tournament/engine.ts`
- `tests/e2e/overnight-smoke.spec.ts`

That should be enough to understand both the current runtime model and the riskiest operational paths.
