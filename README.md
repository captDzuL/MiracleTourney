# MiracleTourney (Internal README)

Last updated: Sunday, August 3, 2026.

## Purpose

MiracleTourney is the MVP web app for running lightweight multi-game community tournaments. The app is now past the demo-only phase — it runs on real Postgres persistence, real JWT auth, and a two-tier stat submission flow between captains and admins.

This README is for internal developers only.

---

## Current MVP status

As of August 3, 2026, the following flows are implemented and verified:

### Public surface
- `/events` — event hub (public lifecycle states only)
- `/events/[slug]` — event detail with game/mode/format pills, registration window, venue, livestream
- `/events/[slug]/participants`
- `/events/[slug]/bracket`
- `/events/[slug]/standings`
- `/events/[slug]/leaderboards`
- Event-level livestream rendering (YouTube embed + external fallback)

### Captain surface
- `/captain` — Team hero card (GameArt gradient + logo badge), 3-column player grid with jersey badges, add-player form
- `/captain/stats` — Submit per-match player stats for completed matches; resubmit after admin rejection
- Captain accounts are auto-provisioned on CSV import — no manual setup needed

### Admin surface
- Create and manage draft events
- Publish/update event lifecycle status
- Import team registrations from CSV → auto-creates captain `User` accounts
- Download captain credentials CSV (`login_email` + `temp_password`) per event
- Update event livestream metadata
- Enter match results
- Review and approve/reject captain stat submissions
- Pending stat submission count badge on nav

### Tournament behavior
- Single-elimination bracket generation for 8 / 12 / 16 / 24 presets
- Deterministic advancement from completed results, chained bye propagation
- Round-robin fixture generation + league standings aggregation
- Player leaderboard aggregation from approved `PlayerStat` records

### Stat submission flow (new)
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
| Tests | Vitest (unit/integration) |
| E2E | Playwright |

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
  GameArt.tsx       → shared game hero gradient, StatusBadge (used on homepage + captain page)
  ui.tsx            → DataTable, Section, StatCard, Pill, buttonStyles
  shell.tsx         → AppShell nav with role-aware links and pending badge
prisma/
  schema.prisma     → Prisma schema (db push, no migration history)
  seed.ts           → seeds admin + captain accounts with bcrypt hashes
```

Mutations flow: Server Action → `src/lib/platform/repository.ts` → Prisma → Neon Postgres.
Reads flow: Server Component → repository function → Prisma.

---

## Architecture breakdown

### Route layer (`src/app/**`)

| Route | Description |
|---|---|
| `/` | Landing page with event cards |
| `/login` | JWT login form |
| `/events/[slug]/**` | Public event sub-pages |
| `/captain` | Captain dashboard (team hero + roster) |
| `/captain/stats` | Stat submission for completed matches |
| `/admin` | Full admin operations surface |
| `/api/admin/captain-credentials` | GET → downloads credentials CSV for an event |

### Server action layer (`src/lib/actions.ts`)

Current responsibilities:
- `loginAction` / `logoutAction`
- `captainRegisterTeamAction` — register team for an event
- `captainAddPlayerAction` — add player with optional jersey number
- `captainSubmitStatsAction` — submit per-match stats (creates/upserts StatSubmission)
- `adminCreateEventAction`
- `adminSetEventStatusAction`
- `adminImportTeamsAction` — CSV import + captain account auto-creation
- `adminSetMatchResultAction`
- `adminUpdateLivestreamAction`
- `adminApproveStatAction` — approves submission, creates PlayerStat records
- `adminRejectStatAction` — rejects with a note, captain can resubmit

### Repository layer (`src/lib/platform/repository.ts`)

Key exports:
- `getEvents()`, `getEventBySlug()`, `getEvent()` — event reads
- `importTeams()` — two-phase: pre-compute bcrypt hashes outside tx, then upsert user + create team in Prisma interactive transaction (`timeout: 15000`)
- `getCaptainCredentialsForEvent(eventId)` — for admin CSV download
- `getCaptainTeams(captainId)`, `getPlayersForTeam(teamId)`, `addPlayer()`
- `getCompletedMatchesForCaptain(captainId)` — with submission status left-joined
- `upsertStatSubmission()` — idempotent on `@@unique([matchId, teamId])`
- `getPendingStatSubmissions()`, `getPendingStatSubmissionCount()`
- `approveStatSubmission()` — Prisma transaction: upserts PlayerStat per player, marks approved
- `rejectStatSubmission()`
- `getLeaderboard()`, `getStandings()`, `getBracket()`

### Auth layer (`src/lib/auth/session.ts`)

- `signIn(email, password)` → bcrypt compare → sign JWT → set httpOnly cookie `mfl_token`
- `getSessionUser()` → verify JWT → return `AppUser | null`
- `requireRole(role)` → returns user or null (caller redirects)

Roles: `admin` | `captain` | `public`

### CSV import + captain provisioning

1. CSV row → validate → `importTeams()` called
2. Per team: generate email `{tag}@miraclefc.gg` (numeric suffix on collision), random 8-char temp password
3. Pre-compute bcrypt hash outside transaction
4. Prisma interactive transaction: `user.upsert` + `team.create`
5. `captainId` on Team is set to the real User.id
6. Admin downloads `captain-credentials-{eventId}.csv` with login email + temp password

### Database schema (key models)

```
User          — id, email, name, role, passwordHash, tempPassword?
Event         — id, slug, name, gameId, gameModeId, format, status, ...
Team          — id, eventId, captainId (→ User.id), name, tag, source
Player        — id, teamId, eventId, displayName, nickname, position, jerseyNumber?
Match         — id, eventId, homeTeamId, awayTeamId, round, slot, status, scores
PlayerStat    — id, matchId, playerId, teamId, stats (Json) — @@unique([matchId, playerId])
StatSubmission — id, matchId, teamId, eventId, submittedBy, status, stats (Json), rejectionNote?
               — @@unique([matchId, teamId])
```

Schema is managed with `pnpm prisma db push` (no migration history — started with db push, must stay that way).

### Shared `GameArt` component (`src/components/GameArt.tsx`)

Exports: `GameArtTheme`, `gameArtConfig`, `GameArt`, `StatusBadge`

Used on:
- `/` homepage event cards
- `/captain` team hero sections

Gradients are keyed by `gameId`: blue for `game-kuroko`, green for `game-flashpeak`.

### `DataTable` component (`src/components/ui.tsx`)

Uses `overflow-x-auto` on the wrapper — tables scroll horizontally on mobile instead of clipping.

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
corepack pnpm lint
```

### Unit tests

```powershell
corepack pnpm test
```

49 tests. Must stay green. Run after every change to repository/actions/engine.

### E2E smoke

```powershell
corepack pnpm test:e2e
```

Notes:
- Port 3000 must be free before running
- Playwright manages its own app lifecycle

---

## QA assets

Reusable CSV datasets:
- `public/templates/testing/master-multievent-teams.csv`
- `public/templates/testing/miracle-league-8.csv`
- `public/templates/testing/miracle-league-12.csv`
- `public/templates/testing/miracle-league-16.csv`
- `public/templates/testing/miracle-league-24.csv`
- `public/templates/testing/kuroko-summer-cup-8.csv`

Operational notes:
- `docs/operations/testing-datasets.md`
- `docs/operations/team-import-template-notes.md`

---

## Known current limitations

1. **No partial stat approval.** Admin must reject the whole submission if any stat is wrong; captain resubmits the full set.

2. **No deadline enforcement on stat submission.** The system accepts submissions at any time after a match is completed. Deadline gating is out of scope until discussed with the team.

3. **No WhatsApp/Telegram delivery for captain credentials.** Admin downloads the CSV and distributes manually.

4. **No logo upload.** The `GameArt` component shows initials + hover placeholder. Actual file upload is not wired yet.

5. **CSV import is the only registration ingestion path.** No live Google Form integration.

6. **`pnpm prisma migrate dev` is not usable.** Schema was bootstrapped with `db push` — there is no migration history. All schema changes must use `db push`. Running `migrate dev` will throw a drift error.

7. **Playwright smoke coverage is narrow.** It covers the critical happy path only, not a full regression matrix.

---

## Recommended next workstreams

1. **Logo upload** — wire `GameArt` placeholder to a real file upload (Cloudflare R2 or Vercel Blob)
2. **Deadline enforcement** — add submission cutoff per event, decided with team
3. **WhatsApp/Telegram delivery** — send captain credentials automatically on CSV import
4. **Broader E2E coverage** — captain login → stat submit → admin approval flow
5. **PR cleanup** — squash branch into a clean diff for handoff review

---

## Folder map

```
src/
  app/                      route layer and server-rendered pages
    admin/
    captain/
      stats/
    events/[slug]/
    login/
  components/
    GameArt.tsx             shared game hero + StatusBadge
    shell.tsx               AppShell nav with role-aware links + badge
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
docs/
  operations/               operator notes
  superpowers/
    specs/                  feature specs
    plans/                  implementation plans
tests/e2e/                  Playwright smoke tests
public/templates/testing/   reusable CSV datasets
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
corepack pnpm lint
corepack pnpm test
```

5. Open these files:
   - `src/app/admin/page.tsx`
   - `src/lib/actions.ts`
   - `src/lib/platform/repository.ts`
   - `src/lib/tournament/engine.ts`
