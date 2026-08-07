# Miracle League — Internal README

Last updated: Friday, August 8, 2026.

## Purpose

Miracle League is the MVP web app for running lightweight multi-game community tournaments. The app runs on real Postgres persistence, real JWT auth, a two-tier stat submission flow between captains and admins, and Best of N match scoring.

This README is for internal developers only.

---

## Current MVP status

As of August 8, 2026, the following flows are implemented and verified:

### Public surface
- `/` — landing page with event cards, game filter tabs
- `/events` — event hub (public lifecycle states only)
- `/events/[slug]` — event detail with game/mode/format pills, registration window, venue, livestream
- `/events/[slug]/participants`
- `/events/[slug]/bracket` — static HTML pre-rendered at build time (ISR 30s), CDN-served
- `/events/[slug]/standings`
- `/events/[slug]/leaderboards`
- Event-level livestream rendering (YouTube embed + external fallback)

### Captain surface
- `/register` — Captain self sign-up: 2-step wizard (account → team) that creates User + Team atomically; no admin involvement needed
- `/login` — JWT login form with "Daftar di sini" link to `/register`
- `/captain` — Team hero card (GameArt gradient + logo badge), 3-column player grid with jersey badges, add/edit/delete player
- `/captain/stats` — Submit per-match player stats for completed matches; resubmit after admin rejection
- `/captain/settings` — Change password form
- Captain accounts can be created via self sign-up OR auto-provisioned on CSV import

### Admin surface
- Create and manage draft events
- Publish/update event lifecycle status
- Import team registrations from CSV → auto-creates captain `User` accounts
- Download captain credentials CSV (`login_email` + `temp_password`) per event
- Update event livestream metadata
- Configure Best of N (BO1/BO3/BO5) per round
- Enter BO1 match results (direct score) or BO3/BO5 results (game-by-game) — context-aware form auto-selects the correct input
- Event auto-transitions to "Ongoing" when the first match result is saved (no manual status change needed)
- Review and approve/reject captain stat submissions
- Pending stat submission count badge on nav

### Tournament behavior
- Single-elimination bracket generation for 8 / 12 / 16 / 24 presets
- Best of N (BO1/BO3/BO5) per round — configurable by admin; series winner = first to `ceil(bestOf/2)` wins
- Per-game score detail panel (ⓘ toggle, native `<details>`) on bracket cards for completed BO3/5 matches
- Deterministic advancement from completed results, chained bye propagation
- Round-robin fixture generation + league standings aggregation
- Player leaderboard aggregation from approved `PlayerStat` records

### Stat submission flow
1. Captain navigates to `/captain/stats` and sees completed matches
2. Captain fills per-player stat grid and submits → creates a `StatSubmission` record (status: `pending`)
3. Admin sees pending count badge on "Admin" nav link
4. Admin expands submission, previews stats, then approves or rejects with a note
5. On approval: system creates `PlayerStat` records → leaderboard updates automatically
6. On rejection: captain sees the note and can resubmit

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19 |
| Language | TypeScript (strict mode, `typedRoutes: true`) |
| Styling | Tailwind CSS 4 |
| ORM | Prisma 6 |
| Database | Neon Postgres (serverless) |
| Auth | JWT via `jose` (HS256, 7-day), bcryptjs, httpOnly cookie |
| Validation | Zod |
| Unit tests | Vitest (107 tests) |
| E2E | Playwright (23 tests, `global-setup.ts` seeds DB automatically) |
| Load test | autocannon (`scripts/load-test.mjs`, `scripts/load-test-quick.mjs`) |

---

## How the app works

```
src/app/**          → server-rendered routes (async Server Components)
src/lib/actions.ts  → all server mutations (Server Actions)
src/lib/platform/
  repository.ts     → Prisma data-access layer (repository pattern)
  config.ts         → game/mode definitions, stat keys
  types.ts          → shared TypeScript types
src/lib/auth/
  session.ts        → JWT sign/verify, requireRole(), getSessionUser()
src/lib/tournament/
  engine.ts         → pure bracket/standings/leaderboard logic
src/lib/imports/
  team-import.ts    → CSV parsing and validation
src/components/
  GameArt.tsx       → shared game hero gradient, StatusBadge
  ui.tsx            → DataTable, Section, StatCard, Pill, buttonStyles
  shell.tsx         → AppShell nav (SessionNav is a Client Component — reads /api/me)
  session-nav.tsx   → Client Component; fetches /api/me after hydration (keeps bracket CDN-cacheable)
prisma/
  schema.prisma     → Prisma schema (db push, no migration history)
  seed.ts           → seeds admin + captain accounts with bcrypt hashes
scripts/
  load-test.mjs     → 50 concurrent users, 10s per route
  load-test-quick.mjs → 50 concurrent users, 5s burst
tests/e2e/
  global-setup.ts   → DB seed + fixture creation before any spec runs
  captain-auth.spec.ts
  captain-team.spec.ts
  admin-event-management.spec.ts
  admin-match-results.spec.ts
  overnight-smoke.spec.ts
```

Mutations flow: Server Action → `src/lib/platform/repository.ts` → Prisma → Neon Postgres.
Reads flow: Server Component → repository function (cached via `unstable_cache` + React `cache()`) → Prisma.

---

## Architecture breakdown

### Route layer (`src/app/**`)

| Route | Description |
|---|---|
| `/` | Landing page with event cards |
| `/login` | JWT login form |
| `/register` | Captain self sign-up (2-step client wizard) |
| `/events/[slug]/**` | Public event sub-pages |
| `/captain` | Captain dashboard (team hero + roster) |
| `/captain/stats` | Stat submission for completed matches |
| `/captain/settings` | Change password |
| `/admin` | Full admin operations surface |
| `/api/me` | GET → returns current session user for client-side nav |
| `/api/admin/captain-credentials` | GET → downloads credentials CSV for an event |

### Server action layer (`src/lib/actions.ts`)

Current responsibilities:
- `loginAction` / `logoutAction`
- `captainSignUpAction` — create User + Team in one Prisma transaction; calls `signIn` to set cookie
- `changePasswordAction` — bcrypt compare current pw, hash new pw, update DB
- `captainAddPlayerAction` — add player with optional jersey number
- `captainUpdatePlayerAction` / `captainDeletePlayerAction`
- `captainSubmitStatsAction` — submit per-match stats (creates/upserts StatSubmission)
- `adminCreateEventAction`
- `adminUpdateEventStatusAction`
- `adminImportTeamsCsvAction` — CSV import + captain account auto-creation
- `adminUpdateMatchResultAction` — BO1 score; triggers `autoTransitionEventToOngoing`
- `adminSetMatchGamesAction` — BO3/5 game-by-game; triggers `autoTransitionEventToOngoing`
- `adminSetRoundConfigAction` — upsert BO config per round label
- `adminUpdateStreamAction`
- `adminApproveStatAction` — approves submission, creates PlayerStat records
- `adminRejectStatAction` — rejects with a note, captain can resubmit

### Repository layer (`src/lib/platform/repository.ts`)

Key exports (all JSDoc-documented):
- `getEvents()`, `getPublicEventBySlug()`, `getEventBySlug()` — event reads
- `getPublishedEvents()` — for captain sign-up picker (Published only; Ongoing excluded)
- `importTeams()` — two-phase: pre-compute bcrypt hashes outside tx, then upsert user + create team
- `createCaptainWithTeam()` — Prisma `$transaction`: creates User + Team atomically
- `getCaptainCredentialsForEvent(eventId)` — for admin CSV download
- `getTeamsForEvent()`, `getPlayersForEvent()`, `getMatchesForEvent()` — cached with `unstable_cache`
- `getEventRoundConfigs()`, `upsertRoundConfig()` — BO config per round
- `getMatchGamesForEvent()` — returns `Map<matchId, MatchGame[]>` for bracket page (no N+1)
- `setMatchGames()` — deletes + recreates MatchGame rows, updates Match series score
- `autoTransitionEventToOngoing()` — `updateMany` with status filter; no-op if already Ongoing/Finished
- `getCompletedMatchesForCaptain()` — with submission status left-joined
- `upsertStatSubmission()` / `approveStatSubmission()` / `rejectStatSubmission()`
- `getLeaderboard()`, `getStandings()`, `getBracketPreview()`, `getPublicVisibleBracketPreview()`

### Auth layer (`src/lib/auth/session.ts`)

- `signIn(email, password)` → bcrypt compare → sign JWT → set httpOnly cookie `mfl_token`
- `getSessionUser()` → verify JWT → return `AppUser | null`
- `requireRole(role)` → returns user or null (caller redirects)

Roles: `admin` | `captain` | `public`

### CDN caching architecture

The bracket page (`/events/[slug]/bracket`) is pre-rendered at build time via `generateStaticParams` and served from Vercel's CDN edge. Key design decisions:

- `export const revalidate = 30` — ISR: stale-while-revalidate every 30 seconds
- `generateStaticParams` — all event slugs pre-built; Vercel distributes HTML to all edge nodes
- `SessionNav` is a **Client Component** — reads `/api/me` after hydration instead of `cookies()` on the server. This removes the dynamic API from the server render tree, allowing `Cache-Control: public` instead of `private, no-cache`
- All DB queries on the bracket page wrapped in `unstable_cache` + React `cache()` for deduplication

### CSV import + captain provisioning

1. CSV row → validate → `importTeams()` called
2. Per team: generate email `{tag}@miraclefc.gg` (numeric suffix on collision), random 8-char temp password
3. Pre-compute bcrypt hash outside transaction
4. Prisma interactive transaction: `user.upsert` + `team.create`
5. `captainId` on Team is set to the real User.id
6. Admin downloads `captain-credentials-{eventId}.csv` with login email + temp password

### Database schema (key models)

```
User              — id, email, name, role, passwordHash, tempPassword?
Event             — id, slug, name, gameId, gameModeId, format, status, ...
Team              — id, eventId, captainId (→ User.id), name, tag, source
Player            — id, teamId, eventId, displayName, nickname, position, jerseyNumber?
Match             — id, eventId, homeTeamId, awayTeamId, round, slot, status, scores
MatchGame         — id, matchId, gameNumber, homeScore, awayScore — @@unique([matchId, gameNumber])
EventRoundConfig  — id, eventId, roundLabel, bestOf — @@unique([eventId, roundLabel])
PlayerStat        — id, matchId, playerId, teamId, stats (Json) — @@unique([matchId, playerId])
StatSubmission    — id, matchId, teamId, eventId, submittedBy, status, stats (Json), rejectionNote?
                  — @@unique([matchId, teamId])
```

Schema is managed with `pnpm prisma db push` (no migration history — must stay that way).

---

## Supported game modes and stat keys

| Game | Mode | Stat keys |
|---|---|---|
| Kuroko no Basket Street Rival | 3v3 | points, assists, rebounds, steals, blocks, flb |
| Flashpeak | 5v5 | goals, assists, tackles, blocks |

---

## Local development

### Prerequisites
- Node.js 24.x
- Corepack enabled
- pnpm via Corepack
- A Neon Postgres database URL in `.env` as `DATABASE_URL`

### `.env` required variables

```
DATABASE_URL=postgresql://...neon.tech/...
JWT_SECRET=some-random-32-char-string
```

### Setup

```powershell
corepack pnpm install
pnpm prisma db push
pnpm prisma generate
pnpm tsx prisma/seed.ts       # creates admin + captain seed accounts
```

Seed credentials:
- Admin: `admin@miraclefc.gg` / `Miracle2026!`
- Captain: `captain@miraclefc.gg` / `Miracle2026!`

### Run

```powershell
corepack pnpm dev
```

Default: `http://localhost:3000`

### Type-check

```powershell
corepack pnpm tsc --noEmit
```

### Unit tests

```powershell
corepack pnpm test
```

107 tests. Must stay green. Run after every change to repository/actions/engine.

### E2E tests

```powershell
corepack pnpm test:e2e
```

Notes:
- Port 3000 must be free before running
- `global-setup.ts` automatically seeds the DB and creates fixture data — no manual setup needed
- 5 spec files: `captain-auth`, `captain-team`, `admin-event-management`, `admin-match-results`, `overnight-smoke`
- 23 tests total: happy path, negative paths, regression

### Load test

```powershell
pnpm test:load          # 50 concurrent users, 10s per route (default: production URL)
pnpm test:load:quick    # 50 concurrent users, 5s burst
BASE_URL=http://localhost:3000 pnpm test:load   # run against local server
```

Target: p97.5 < 3s, 0 errors. The production bracket page is CDN-served (prerendered), so individual request latency is ~200–300ms at cold start.

---

## QA assets

Reusable CSV datasets:
- `public/templates/testing/master-multievent-teams.csv`
- `public/templates/testing/miracle-league-8.csv`
- `public/templates/testing/miracle-league-12.csv`
- `public/templates/testing/miracle-league-16.csv`
- `public/templates/testing/miracle-league-24.csv`
- `public/templates/testing/kuroko-summer-cup-8.csv`

E2E fixtures (used by Playwright):
- `tests/fixtures/import-22.csv`
- `tests/fixtures/import-2-more.csv`
- `tests/fixtures/late-import-after-lock.csv`

Operational notes:
- `docs/operations/testing-datasets.md`
- `docs/operations/team-import-template-notes.md`

---

## Known current limitations

1. **No partial stat approval.** Admin must reject the whole submission if any stat is wrong; captain resubmits the full set.

2. **No deadline enforcement on stat submission.** The system accepts submissions at any time after a match is completed. Deadline gating is out of scope until discussed with the team.

3. **No WhatsApp/Telegram delivery for captain credentials.** Admin downloads the CSV and distributes manually.

4. **No logo upload.** The `GameArt` component shows initials + hover placeholder. Actual file upload is not wired yet.

5. **CSV import is the only bulk registration ingestion path.** No live Google Form integration. Individual captains can self-register via `/register`.

6. **`pnpm prisma migrate dev` is not usable.** Schema was bootstrapped with `db push` — there is no migration history. All schema changes must use `db push`. Running `migrate dev` will throw a drift error.

---

## Recommended next workstreams

1. **Logo upload** — wire `GameArt` placeholder to a real file upload (Cloudflare R2 or Vercel Blob)
2. **Deadline enforcement** — add submission cutoff per event, decided with team
3. **WhatsApp/Telegram delivery** — send captain credentials automatically on CSV import
4. **Partial stat approval** — allow admin to edit individual stats before approving

---

## Folder map

```
src/
  app/                      route layer and server-rendered pages
    admin/
    captain/
      stats/
      settings/
    events/[slug]/
    login/
    register/
    api/
      me/                   session endpoint for client-side nav
      admin/captain-credentials/
  components/
    GameArt.tsx             shared game hero + StatusBadge
    shell.tsx               AppShell nav
    session-nav.tsx         Client Component; fetches /api/me after hydration
    ui.tsx                  DataTable, Section, StatCard, Pill, buttonStyles
  lib/
    actions.ts              all server mutations
    auth/session.ts         JWT auth
    platform/
      config.ts             game/mode definitions
      repository.ts         Prisma data-access layer
      types.ts              shared types
    tournament/
      engine.ts             pure bracket/standings/leaderboard logic
    imports/
      team-import.ts        CSV parsing
prisma/
  schema.prisma
  seed.ts
scripts/
  load-test.mjs             production load test (50 users, 10s)
  load-test-quick.mjs       quick burst test (50 users, 5s)
docs/
  operations/               operator notes
  superpowers/specs/        feature design specs
tests/e2e/                  Playwright E2E tests (23 tests, global-setup)
tests/fixtures/             CSV fixtures for E2E
public/templates/testing/   reusable CSV datasets for QA
```

## Quick start for the next developer

1. Read this file.
2. Read `docs/operations/testing-datasets.md`.
3. Set up `.env` with `DATABASE_URL` and `JWT_SECRET`.
4. Run:

```powershell
corepack pnpm install
pnpm prisma db push
pnpm prisma generate
pnpm tsx prisma/seed.ts
corepack pnpm tsc --noEmit
corepack pnpm test
```

5. Open these files:
   - `src/app/admin/page.tsx`
   - `src/lib/actions.ts`
   - `src/lib/platform/repository.ts`
   - `src/lib/tournament/engine.ts`
