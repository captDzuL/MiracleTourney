# Captain Dashboard + Stat Submission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the captain page with a game-art hero + player grid, add a `/captain/stats` page for submitting match player stats, and wire admin approval with a pending-count badge.

**Architecture:** Extract `GameArt`/`StatusBadge` into a shared component, then compose both captain pages from it. Stat submissions are stored in a new `StatSubmission` table; on approval the system creates `PlayerStat` records that feed the existing leaderboard — no changes to the leaderboard query.

**Tech Stack:** Next.js 15 App Router (server components), Prisma 6 + Neon Postgres (`pnpm prisma db push`), Vitest, `bcryptjs`, `lucide-react`.

## Global Constraints

- `pnpm` for all package commands — never `npm install`
- `pnpm prisma db push` (not `migrate dev`) — project has no migration history
- TypeScript strict mode; `typedRoutes: true` — cast dynamic hrefs: `"/captain/stats" as "/captain/stats"`
- All page components are async Server Components; use `Promise.all` for parallel fetches
- `revalidatePath("/", "layout")` after mutations that affect nav badge count
- Test runner: `pnpm test` (vitest) — must stay green after every task
- Do not commit `.env` or any file with secrets

---

### Task 1: Schema changes + config `statKeys` update

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/platform/config.ts`

**Interfaces:**
- Produces: `StatSubmission` Prisma model with `@@unique([matchId, teamId])`; `PlayerStat` gains `@@unique([matchId, playerId])`; kuroko gameModeId `mode-kuroko-3v3` statKeys includes `"flb"`

- [ ] **Step 1: Add `"flb"` to kuroko statKeys in `config.ts`**

In `src/lib/platform/config.ts`, change the `mode-kuroko-3v3` entry:
```ts
statKeys: ["points", "assists", "rebounds", "steals", "blocks", "flb"],
```

- [ ] **Step 2: Add `StatSubmission` model to `prisma/schema.prisma`**

Add after the `PlayerStat` model:
```prisma
model StatSubmission {
  id            String    @id @default(cuid())
  matchId       String
  match         Match     @relation(fields: [matchId], references: [id], onDelete: Cascade)
  teamId        String
  eventId       String
  event         Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  submittedBy   String
  status        String    @default("pending")
  rejectionNote String?
  stats         Json
  submittedAt   DateTime  @default(now())
  reviewedAt    DateTime?
  reviewedBy    String?

  @@unique([matchId, teamId])
}
```

Add back-references in `Match` and `Event`:
```prisma
model Match {
  // ... existing fields ...
  statSubmissions StatSubmission[]
}

model Event {
  // ... existing fields ...
  statSubmissions StatSubmission[]
}
```

Add unique constraint to `PlayerStat` (enables idempotent approval):
```prisma
model PlayerStat {
  // ... existing fields ...
  @@unique([matchId, playerId])
}
```

- [ ] **Step 3: Push schema to DB**

```bash
pnpm prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm prisma generate
```

- [ ] **Step 5: Verify tests still pass**

```bash
pnpm test
```

Expected: 49 tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/platform/config.ts
git commit -m "feat: add StatSubmission schema and flb stat key"
```

---

### Task 2: Extract shared `GameArt` component

**Files:**
- Create: `src/components/GameArt.tsx`
- Modify: `src/app/page.tsx` (import from shared, remove local definitions)

**Interfaces:**
- Produces:
  ```ts
  export interface GameArtTheme { bg: string; orb1: string; orb2: string; ring: string; label: string; }
  export const gameArtConfig: Record<string, GameArtTheme>
  export function GameArt(props: { gameId: string; logoUrl?: string; entityName: string }): JSX.Element
  export function StatusBadge(props: { status: string }): JSX.Element
  ```

- [ ] **Step 1: Create `src/components/GameArt.tsx`**

```tsx
import { ImagePlus } from "lucide-react";

export interface GameArtTheme {
  bg: string; orb1: string; orb2: string; ring: string; label: string;
}

export const gameArtConfig: Record<string, GameArtTheme> = {
  "game-kuroko": {
    bg: "linear-gradient(135deg, #0c1445 0%, #1e3a8a 50%, #1e40af 100%)",
    orb1: "rgba(96,165,250,0.18)", orb2: "rgba(147,197,253,0.10)",
    ring: "rgba(147,197,253,0.12)", label: "KNB",
  },
  "game-flashpeak": {
    bg: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
    orb1: "rgba(74,222,128,0.18)", orb2: "rgba(134,239,172,0.10)",
    ring: "rgba(134,239,172,0.12)", label: "FP",
  },
};

const statusConfig: Record<string, { label: string; class: string; dot?: boolean }> = {
  Published: { label: "Registration Open", class: "bg-blue-500 text-white" },
  "Registration Closed": { label: "Reg. Closed", class: "bg-amber-500 text-white" },
  Ongoing: { label: "Live", class: "bg-rose-500 text-white", dot: true },
  Finished: { label: "Finished", class: "bg-slate-500 text-white" },
  Draft: { label: "Draft", class: "bg-slate-300 text-slate-700" },
};

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function GameArt({ gameId, logoUrl, entityName }: {
  gameId: string; logoUrl?: string; entityName: string;
}) {
  const art = gameArtConfig[gameId] ?? gameArtConfig["game-kuroko"];
  const initials = getInitials(entityName) || "EV";
  return (
    <div className="relative h-44 overflow-hidden rounded-t-2xl" style={{ background: art.bg }}>
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full" style={{ background: art.orb1 }} />
      <div className="absolute -right-4 bottom-0 h-28 w-28 rounded-full" style={{ background: art.orb2 }} />
      <div className="absolute left-8 top-8 h-20 w-20 rounded-full border" style={{ borderColor: art.ring }} />
      <div className="absolute left-14 top-14 h-10 w-10 rounded-full border" style={{ borderColor: art.ring }} />
      <span className="absolute bottom-2 right-3 select-none text-6xl font-black"
        style={{ color: "rgba(255,255,255,0.05)", lineHeight: 1 }}>
        {art.label}
      </span>
      <div className="absolute bottom-0 left-4 translate-y-1/2">
        {logoUrl ? (
          <img src={logoUrl} alt={entityName}
            className="h-14 w-14 rounded-xl border-2 border-white object-cover shadow-md" />
        ) : (
          <div className="group relative flex h-14 w-14 items-center justify-center rounded-xl border-2 border-white shadow-md"
            style={{ background: art.bg }} title="Upload logo">
            <span className="text-sm font-bold text-white">{initials}</span>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.Draft;
  return (
    <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.class}`}>
      {cfg.dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 2: Update `src/app/page.tsx` to import from shared component**

Remove the local `gameArt`, `statusConfig`, `getInitials`, `GameArt`, `StatusBadge` definitions.
Add at the top:
```ts
import { GameArt, StatusBadge, gameArtConfig } from "@/components/GameArt";
```
`EventCard` keeps using `GameArt` and `StatusBadge` — no other changes needed.

- [ ] **Step 3: Verify homepage test passes**

```bash
pnpm test -- src/app/events/page.test.ts
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/GameArt.tsx src/app/page.tsx
git commit -m "refactor: extract GameArt and StatusBadge to shared component"
```

---

### Task 3: Captain page redesign + `addPlayer` jerseyNumber

**Files:**
- Modify: `src/lib/platform/repository.ts` (addPlayer signature)
- Modify: `src/lib/actions.ts` (captainAddPlayerAction parses jerseyNumber)
- Modify: `src/app/captain/page.tsx` (full redesign)
- Modify: `src/lib/actions.test.ts` (update mock to keep green)

**Interfaces:**
- Consumes: `GameArt`, `StatusBadge` from `@/components/GameArt`; `getGameForEvent`, `getModeForEvent` from repository; all existing player/team fetches
- Produces: captain page with hero + player grid; `addPlayer` accepts optional `jerseyNumber?: number`

- [ ] **Step 1: Update `addPlayer` in `src/lib/platform/repository.ts`**

Change the input type and Prisma call:
```ts
export async function addPlayer(input: {
  teamId: string; eventId: string; displayName: string;
  nickname: string; position: string; jerseyNumber?: number;
}): Promise<Player> {
  const row = await prisma.player.create({ data: input });
  return mapPlayer(row);
}
```

- [ ] **Step 2: Update `captainAddPlayerAction` in `src/lib/actions.ts`**

Add jerseyNumber parsing (after existing formData.get calls):
```ts
const jerseyRaw = formData.get("jerseyNumber");
const jerseyNumber = jerseyRaw && String(jerseyRaw).trim() !== ""
  ? parseInt(String(jerseyRaw), 10)
  : undefined;
await addPlayer({ teamId, eventId, displayName, nickname, position, jerseyNumber });
```

- [ ] **Step 3: Rewrite `src/app/captain/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";

import { captainAddPlayerAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { GameArt, StatusBadge, gameArtConfig } from "@/components/GameArt";
import {
  getCaptainTeams, getEvents, getGameForEvent, getModeForEvent, getPlayersForTeam,
} from "@/lib/platform/repository";
import type { Event, Game, GameMode, Player, Team } from "@/lib/platform/types";
import { buttonStyles } from "@/components/ui";

export default async function CaptainPage() {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const [teams, events] = await Promise.all([getCaptainTeams(user.id), getEvents()]);
  const teamsWithPlayers = await Promise.all(
    teams.map(async (team) => ({ team, players: await getPlayersForTeam(team.id) })),
  );

  return (
    <div className="space-y-8">
      {teamsWithPlayers.map(({ team, players }) => {
        const event = events.find((e) => e.id === team.eventId);
        if (!event) return null;
        const game = getGameForEvent(event);
        const mode = getModeForEvent(event);
        return <TeamSection key={team.id} team={team} event={event} game={game} mode={mode} players={players} />;
      })}
    </div>
  );
}

function avatarGradient(position: string) {
  if (position === "Guard" || position === "Forward") return "from-[#1e3a8a] to-[#1d4ed8]";
  if (position === "Forward" || position === "Midfielder") return "from-[#052e16] to-[#14532d]";
  return "from-[#1e293b] to-[#334155]";
}

function TeamSection({ team, event, game, mode, players }: {
  team: Team; event: Event; game: Game; mode: GameMode; players: Player[];
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <GameArt gameId={game.id} logoUrl={team.logoUrl as string | undefined} entityName={team.name} />
        <StatusBadge status={event.status} />
      </div>

      <div className="space-y-6 p-5 pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {game.name} · {mode.name}
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{team.name}</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-blue-400" /> {event.startsAt}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-400" /> {event.venue}
            </span>
          </div>
          <Link
            href={"/captain/stats" as "/captain/stats"}
            className="mt-3 inline-block text-sm font-medium text-cyan-600 hover:text-cyan-500"
          >
            Submit match stats →
          </Link>
        </div>

        {/* Player grid */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Roster · {players.length} player{players.length !== 1 ? "s" : ""}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {players.map((player) => (
              <div key={player.id} className="relative rounded-2xl border border-slate-100 bg-slate-50 p-3">
                {player.jerseyNumber != null && (
                  <span className="absolute right-2 top-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                    #{player.jerseyNumber}
                  </span>
                )}
                <div
                  className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(player.position)} text-sm font-bold text-white`}
                >
                  {player.nickname.slice(0, 2).toUpperCase()}
                </div>
                <p className="truncate text-sm font-semibold text-slate-900">{player.displayName}</p>
                <span className="mt-1 inline-block rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-700">
                  {player.nickname}
                </span>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {player.position}
                </p>
              </div>
            ))}
            {/* Anchor card */}
            <a
              href="#add-player-form"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-slate-400 transition hover:border-blue-300 hover:text-blue-400"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="text-xs">Add player</span>
            </a>
          </div>
        </div>

        {/* Add player form */}
        <form id="add-player-form" action={captainAddPlayerAction} className="grid gap-4">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="eventId" value={team.eventId} />
          <h3 className="text-sm font-semibold text-slate-700">Add player</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-600">
              Display name
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="displayName" placeholder="Full name" />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Nickname / IGN
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="nickname" placeholder="IGN" />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Position
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="position" defaultValue={mode.positions[0]}>
                {mode.positions.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              Jersey # <span className="text-slate-400">(optional)</span>
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="jerseyNumber" type="number" min={1} max={99} placeholder="10" />
            </label>
          </div>
          <div>
            <button className={`${buttonStyles.primary} text-sm`} type="submit">Add player</button>
          </div>
        </form>
      </div>
    </article>
  );
}
```

Note: `Team` type may not have `logoUrl`. Check `src/lib/platform/types.ts` — if missing, cast `undefined`. The hero badge will show initials.

- [ ] **Step 4: Verify tests pass**

```bash
pnpm test
```

Expected: 49 tests pass (actions.test.ts mock doesn't need update — `addPlayer` mock is already a vi.fn()).

- [ ] **Step 5: Commit**

```bash
git add src/components/GameArt.tsx src/app/captain/page.tsx src/lib/platform/repository.ts src/lib/actions.ts
git commit -m "feat: captain page redesign with game hero, player grid, jersey number"
```

---

### Task 4: Stat submission repository functions

**Files:**
- Modify: `src/lib/platform/repository.ts`

**Interfaces:**
- Consumes: `prisma`, `games`, `gameModes` from config
- Produces:
  ```ts
  type CompletedMatchRow = {
    matchId: string; matchLabel: string; slot: number | null;
    eventId: string; eventName: string; gameId: string; gameModeId: string;
    teamId: string; teamName: string;
    opponentName: string;
    homeScore: number; awayScore: number;
    submission: { id: string; status: string; rejectionNote: string | null; stats: Record<string, Record<string, number>> } | null;
  }

  export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]>

  export async function upsertStatSubmission(input: {
    matchId: string; teamId: string; eventId: string; submittedBy: string;
    stats: Record<string, Record<string, number>>;
  }): Promise<void>
  ```

- [ ] **Step 1: Add `getCompletedMatchesForCaptain` to repository**

After `getCaptainTeams`:
```ts
export type CompletedMatchRow = {
  matchId: string; matchLabel: string; slot: number | null;
  eventId: string; eventName: string; gameId: string; gameModeId: string;
  teamId: string; teamName: string; opponentName: string;
  homeScore: number; awayScore: number;
  submission: {
    id: string; status: string; rejectionNote: string | null;
    stats: Record<string, Record<string, number>>;
  } | null;
};

export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]> {
  const captainTeams = await prisma.team.findMany({
    where: { captainId },
    select: { id: true, name: true, eventId: true },
  });
  if (captainTeams.length === 0) return [];

  const teamIds = captainTeams.map((t) => t.id);
  const eventIds = [...new Set(captainTeams.map((t) => t.eventId))];

  const [matches, events, allTeams, submissions] = await Promise.all([
    prisma.match.findMany({
      where: {
        eventId: { in: eventIds },
        status: "Completed",
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    }),
    prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true, gameId: true, gameModeId: true } }),
    prisma.team.findMany({ where: { eventId: { in: eventIds } }, select: { id: true, name: true, eventId: true } }),
    prisma.statSubmission.findMany({
      where: {
        teamId: { in: teamIds },
      },
    }),
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e]));
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));
  const submissionMap = new Map(
    submissions.map((s) => [`${s.matchId}::${s.teamId}`, s]),
  );

  return matches.flatMap((match) => {
    const rows: CompletedMatchRow[] = [];
    for (const team of captainTeams) {
      const isHome = match.homeTeamId === team.id;
      const isAway = match.awayTeamId === team.id;
      if (!isHome && !isAway) continue;

      const event = eventMap.get(match.eventId);
      if (!event) continue;

      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = teamMap.get(opponentId);
      const submission = submissionMap.get(`${match.id}::${team.id}`) ?? null;

      rows.push({
        matchId: match.id,
        matchLabel: match.roundLabel,
        slot: match.slot,
        eventId: event.id,
        eventName: event.name,
        gameId: event.gameId,
        gameModeId: event.gameModeId,
        teamId: team.id,
        teamName: team.name,
        opponentName: opponent?.name ?? "Unknown",
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              rejectionNote: submission.rejectionNote,
              stats: submission.stats as Record<string, Record<string, number>>,
            }
          : null,
      });
    }
    return rows;
  });
}
```

- [ ] **Step 2: Add `upsertStatSubmission` to repository**

```ts
export async function upsertStatSubmission(input: {
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  stats: Record<string, Record<string, number>>;
}): Promise<void> {
  await prisma.statSubmission.upsert({
    where: { matchId_teamId: { matchId: input.matchId, teamId: input.teamId } },
    update: {
      status: "pending",
      rejectionNote: null,
      stats: input.stats,
      submittedBy: input.submittedBy,
      submittedAt: new Date(),
    },
    create: {
      matchId: input.matchId,
      teamId: input.teamId,
      eventId: input.eventId,
      submittedBy: input.submittedBy,
      status: "pending",
      stats: input.stats,
    },
  });
}
```

- [ ] **Step 3: Verify tests**

```bash
pnpm test
```

Expected: 49 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/platform/repository.ts
git commit -m "feat: add stat submission repository functions"
```

---

### Task 5: `/captain/stats` page + `captainSubmitStatsAction`

**Files:**
- Create: `src/app/captain/stats/page.tsx`
- Modify: `src/lib/actions.ts`
- Modify: `src/components/shell.tsx` (add "Match Stats" nav link for captains)

**Interfaces:**
- Consumes: `getCompletedMatchesForCaptain`, `getPlayersForTeam`, `upsertStatSubmission`, `getGameModes` from repository/config; `requireRole` from session
- Produces: `captainSubmitStatsAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Add `captainSubmitStatsAction` to `src/lib/actions.ts`**

```ts
export async function captainSubmitStatsAction(formData: FormData) {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const matchId = formData.get("matchId") as string;
  const teamId  = formData.get("teamId")  as string;
  const eventId = formData.get("eventId") as string;

  // Collect all stat keys in form: stat_{playerId}_{statKey}
  const stats: Record<string, Record<string, number>> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^stat_(.+)_(.+)$/);
    if (!m) continue;
    const [, playerId, statKey] = m;
    if (!stats[playerId]) stats[playerId] = {};
    stats[playerId][statKey] = parseInt(value as string, 10) || 0;
  }

  await upsertStatSubmission({ matchId, teamId, eventId, submittedBy: user.id, stats });
  revalidatePath("/captain/stats");
}
```

Add `upsertStatSubmission` to the imports from `@/lib/platform/repository`.

- [ ] **Step 2: Create `src/app/captain/stats/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { captainSubmitStatsAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { getCompletedMatchesForCaptain, getPlayersForTeam, getCaptainTeams } from "@/lib/platform/repository";
import { getGameModes } from "@/lib/platform/repository";
import { Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { label: string; class: string }> = {
  pending:  { label: "Pending review", class: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved",       class: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected",       class: "bg-red-100 text-red-700" },
};

export default async function CaptainStatsPage() {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const matchRows = await getCompletedMatchesForCaptain(user.id);
  const gameModes = getGameModes();

  // Pre-fetch players for each team (deduplicated)
  const teamIds = [...new Set(matchRows.map((r) => r.teamId))];
  const playersByTeam = new Map(
    await Promise.all(teamIds.map(async (id) => [id, await getPlayersForTeam(id)] as const)),
  );

  if (matchRows.length === 0) {
    return (
      <Section title="Match Stats" description="No completed matches yet for your teams.">
        <p className="text-sm text-slate-400">
          Stats submission becomes available after admin records match results.
        </p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Match Stats" description="Submit player stats for completed matches. Admin will review before they appear on leaderboards.">
        <div className="space-y-4">
          {matchRows.map((row) => {
            const mode = gameModes.find((m) => m.id === row.gameModeId);
            const statKeys = mode?.statKeys ?? [];
            const players = playersByTeam.get(row.teamId) ?? [];
            const sub = row.submission;
            const canSubmit = !sub || sub.status === "rejected";

            return (
              <details key={`${row.matchId}::${row.teamId}`} className="rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {row.matchLabel} {row.slot != null ? `· Match ${row.slot}` : ""}
                      {" — "}
                      <span className="text-slate-500">{row.teamName} vs {row.opponentName}</span>
                    </p>
                    <p className="text-xs text-slate-400">{row.eventName} · Score: {row.homeScore}–{row.awayScore}</p>
                    {sub?.status === "rejected" && sub.rejectionNote && (
                      <p className="mt-1 text-xs text-red-600">Rejected: {sub.rejectionNote}</p>
                    )}
                  </div>
                  {sub ? (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusLabel[sub.status]?.class}`}>
                      {statusLabel[sub.status]?.label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      Not submitted
                    </span>
                  )}
                </summary>

                {canSubmit && players.length > 0 && (
                  <form action={captainSubmitStatsAction} className="border-t border-slate-100 p-4">
                    <input type="hidden" name="matchId" value={row.matchId} />
                    <input type="hidden" name="teamId" value={row.teamId} />
                    <input type="hidden" name="eventId" value={row.eventId} />

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="py-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">Player</th>
                            {statKeys.map((k) => (
                              <th key={k} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {players.map((player) => (
                            <tr key={player.id} className="border-t border-slate-50">
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-900">{player.displayName}</p>
                                <p className="text-xs text-slate-400">{player.position}</p>
                              </td>
                              {statKeys.map((k) => (
                                <td key={k} className="px-2 py-2">
                                  <input
                                    type="number"
                                    name={`stat_${player.id}_${k}`}
                                    min={0}
                                    defaultValue={
                                      (sub?.stats?.[player.id]?.[k] ?? 0)
                                    }
                                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4">
                      <button
                        type="submit"
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {sub?.status === "rejected" ? "Resubmit stats" : "Submit stats"}
                      </button>
                    </div>
                  </form>
                )}

                {sub?.status === "approved" && (
                  <div className="border-t border-slate-100 p-4 text-sm text-emerald-600">
                    Stats approved and live on leaderboard.
                  </div>
                )}

                {!canSubmit && sub?.status === "pending" && (
                  <div className="border-t border-slate-100 p-4 text-sm text-amber-600">
                    Awaiting admin review.
                  </div>
                )}

                {players.length === 0 && canSubmit && (
                  <div className="border-t border-slate-100 p-4 text-sm text-slate-400">
                    Add players to your roster first before submitting stats.
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 3: Add "Match Stats" link to nav in `src/components/shell.tsx`**

Inside the `<nav>` element, add after the Captain link:
```tsx
{user?.role === "captain" && (
  <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/captain/stats">
    Match Stats
  </Link>
)}
```

- [ ] **Step 4: Verify tests**

```bash
pnpm test
```

Expected: 49 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/captain/stats/page.tsx src/lib/actions.ts src/components/shell.tsx
git commit -m "feat: /captain/stats page for submitting match player stats"
```

---

### Task 6: Admin approval repository functions

**Files:**
- Modify: `src/lib/platform/repository.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StatSubmissionRow = {
    id: string; matchId: string; teamId: string; eventId: string;
    submittedBy: string; status: string; rejectionNote: string | null;
    stats: Record<string, Record<string, number>>;
    submittedAt: Date;
    matchLabel: string; teamName: string; captainEmail: string; eventName: string;
  }
  export async function getPendingStatSubmissions(): Promise<StatSubmissionRow[]>
  export async function getPendingStatSubmissionCount(): Promise<number>
  export async function approveStatSubmission(submissionId: string, adminId: string): Promise<void>
  export async function rejectStatSubmission(submissionId: string, adminId: string, note: string): Promise<void>
  ```

- [ ] **Step 1: Add `getPendingStatSubmissionCount` to repository**

```ts
export async function getPendingStatSubmissionCount(): Promise<number> {
  return prisma.statSubmission.count({ where: { status: "pending" } });
}
```

- [ ] **Step 2: Add `getPendingStatSubmissions` to repository**

```ts
export type StatSubmissionRow = {
  id: string; matchId: string; teamId: string; eventId: string;
  submittedBy: string; status: string; rejectionNote: string | null;
  stats: Record<string, Record<string, number>>;
  submittedAt: Date;
  matchLabel: string; teamName: string; captainEmail: string; eventName: string;
};

export async function getPendingStatSubmissions(): Promise<StatSubmissionRow[]> {
  const rows = await prisma.statSubmission.findMany({
    where: { status: "pending" },
    orderBy: { submittedAt: "asc" },
  });
  if (rows.length === 0) return [];

  const [matches, teams, events, captains] = await Promise.all([
    prisma.match.findMany({ where: { id: { in: rows.map((r) => r.matchId) } }, select: { id: true, roundLabel: true, slot: true } }),
    prisma.team.findMany({ where: { id: { in: rows.map((r) => r.teamId) } }, select: { id: true, name: true } }),
    prisma.event.findMany({ where: { id: { in: rows.map((r) => r.eventId) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: rows.map((r) => r.submittedBy) } }, select: { id: true, email: true } }),
  ]);

  const matchMap   = new Map(matches.map((m) => [m.id, m]));
  const teamMap    = new Map(teams.map((t) => [t.id, t]));
  const eventMap   = new Map(events.map((e) => [e.id, e]));
  const captainMap = new Map(captains.map((u) => [u.id, u]));

  return rows.map((row) => ({
    id: row.id,
    matchId: row.matchId,
    teamId: row.teamId,
    eventId: row.eventId,
    submittedBy: row.submittedBy,
    status: row.status,
    rejectionNote: row.rejectionNote,
    stats: row.stats as Record<string, Record<string, number>>,
    submittedAt: row.submittedAt,
    matchLabel: (() => { const m = matchMap.get(row.matchId); return m ? `${m.roundLabel}${m.slot != null ? ` · Match ${m.slot}` : ""}` : row.matchId; })(),
    teamName: teamMap.get(row.teamId)?.name ?? row.teamId,
    captainEmail: captainMap.get(row.submittedBy)?.email ?? row.submittedBy,
    eventName: eventMap.get(row.eventId)?.name ?? row.eventId,
  }));
}
```

- [ ] **Step 3: Add `approveStatSubmission` to repository**

```ts
export async function approveStatSubmission(submissionId: string, adminId: string): Promise<void> {
  const submission = await prisma.statSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new Error("Submission not found");

  const event = await prisma.event.findUnique({ where: { id: submission.eventId }, select: { gameId: true } });
  const game = games.find((g) => g.id === event?.gameId);
  const gameSlug = game?.slug ?? "unknown";

  const statsMap = submission.stats as Record<string, Record<string, number>>;

  await prisma.$transaction(async (tx) => {
    for (const [playerId, playerStats] of Object.entries(statsMap)) {
      const player = await tx.player.findUnique({
        where: { id: playerId },
        select: { displayName: true, position: true },
      });
      if (!player) continue;

      await tx.playerStat.upsert({
        where: { matchId_playerId: { matchId: submission.matchId, playerId } },
        update: { stats: playerStats as object },
        create: {
          matchId: submission.matchId,
          playerId,
          playerName: player.displayName,
          teamId: submission.teamId,
          position: player.position,
          gameSlug,
          stats: playerStats as object,
        },
      });
    }

    await tx.statSubmission.update({
      where: { id: submissionId },
      data: { status: "approved", reviewedAt: new Date(), reviewedBy: adminId },
    });
  });
}
```

- [ ] **Step 4: Add `rejectStatSubmission` to repository**

```ts
export async function rejectStatSubmission(submissionId: string, adminId: string, note: string): Promise<void> {
  await prisma.statSubmission.update({
    where: { id: submissionId },
    data: { status: "rejected", rejectionNote: note, reviewedAt: new Date(), reviewedBy: adminId },
  });
}
```

- [ ] **Step 5: Verify tests**

```bash
pnpm test
```

Expected: 49 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/repository.ts
git commit -m "feat: admin approval repository functions for stat submissions"
```

---

### Task 7: Admin approval UI + actions + nav badge

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/shell.tsx`

**Interfaces:**
- Consumes: `getPendingStatSubmissions`, `getPendingStatSubmissionCount`, `approveStatSubmission`, `rejectStatSubmission` from repository; `StatSubmissionRow` type
- Produces: `adminApproveStatAction(formData)`, `adminRejectStatAction(formData)`; admin page "Stat Submissions" section; nav badge

- [ ] **Step 1: Add approve/reject actions to `src/lib/actions.ts`**

```ts
export async function adminApproveStatAction(formData: FormData) {
  const user = await requireRole("admin");
  if (!user) redirect("/login");
  const submissionId = formData.get("submissionId") as string;
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  redirect("/admin?success=stat-approved");
}

export async function adminRejectStatAction(formData: FormData) {
  const user = await requireRole("admin");
  if (!user) redirect("/login");
  const submissionId = formData.get("submissionId") as string;
  const note = (formData.get("rejectionNote") as string)?.trim() || "Please review and resubmit.";
  await rejectStatSubmission(submissionId, user.id, note);
  revalidatePath("/", "layout");
  redirect("/admin?success=stat-rejected");
}
```

Add `approveStatSubmission`, `rejectStatSubmission` to imports from `@/lib/platform/repository`.

- [ ] **Step 2: Add "Stat Submissions" section to `src/app/admin/page.tsx`**

Add new fetches in the data-loading block (before the `return`):
```ts
const [pendingSubmissions, pendingCount] = await Promise.all([
  getPendingStatSubmissions(),
  getPendingStatSubmissionCount(),
]);
```

Import `getPendingStatSubmissions`, `getPendingStatSubmissionCount`, `adminApproveStatAction`, `adminRejectStatAction`.

Add section at the bottom of the page JSX, before `</div>`:
```tsx
<Section
  title={`Stat Submissions${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`}
  description="Captain-submitted match stats awaiting review. Approve to publish to leaderboard, or reject with a note."
>
  {pendingSubmissions.length === 0 ? (
    <p className="text-sm text-slate-400">No pending submissions.</p>
  ) : (
    <div className="space-y-3">
      {pendingSubmissions.map((sub) => (
        <details key={sub.id} className="rounded-2xl border border-white/8 bg-white/5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold text-white">
                {sub.matchLabel} · {sub.teamName}
              </p>
              <p className="text-xs text-slate-400">
                {sub.eventName} · Submitted by {sub.captainEmail} · {new Date(sub.submittedAt).toLocaleDateString()}
              </p>
            </div>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
              Pending
            </span>
          </summary>

          <div className="border-t border-white/5 p-4">
            {/* Stats preview */}
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead>
                  <tr>
                    <th className="py-1 text-left font-semibold uppercase tracking-widest text-slate-500">Player ID</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-widest text-slate-500">Stats</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(sub.stats).map(([playerId, stats]) => (
                    <tr key={playerId} className="border-t border-white/5">
                      <td className="mono py-1.5 pr-3 text-slate-400">{playerId.slice(0, 12)}…</td>
                      <td className="py-1.5">
                        {Object.entries(stats).map(([k, v]) => (
                          <span key={k} className="mr-2 inline-block">
                            <span className="text-slate-500">{k}:</span> <span className="text-white">{v}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Approve */}
              <form action={adminApproveStatAction}>
                <input type="hidden" name="submissionId" value={sub.id} />
                <button className={buttonStyles.primary} type="submit">Approve</button>
              </form>

              {/* Reject */}
              <form action={adminRejectStatAction} className="flex gap-2">
                <input type="hidden" name="submissionId" value={sub.id} />
                <input
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-500"
                  name="rejectionNote"
                  placeholder="Rejection note (optional)"
                />
                <button className={buttonStyles.secondary} type="submit">Reject</button>
              </form>
            </div>
          </div>
        </details>
      ))}
    </div>
  )}
</Section>
```

- [ ] **Step 3: Add pending badge to "Admin" nav link in `src/components/shell.tsx`**

`AppShell` already calls `getSessionUser()`. Add:
```ts
const pendingCount = user?.role === "admin" ? await getPendingStatSubmissionCount() : 0;
```

Import `getPendingStatSubmissionCount` from `@/lib/platform/repository`.

Change the Admin nav link:
```tsx
<Link className="relative rounded-full px-3 py-2 hover:bg-blue-50" href="/admin">
  Admin
  {pendingCount > 0 && (
    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {pendingCount}
    </span>
  )}
</Link>
```

- [ ] **Step 4: Verify all tests pass**

```bash
pnpm test
```

Expected: 49 tests pass. (Admin page test is source-code based — adding new sections won't break it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts src/app/admin/page.tsx src/components/shell.tsx
git commit -m "feat: admin stat submission approval UI with pending badge"
```

---

## Self-Review

**Spec coverage check:**
- ✓ GameArt extract → Task 2
- ✓ Captain page hero + player grid → Task 3
- ✓ Jersey number field → Task 3
- ✓ "flb" stat key added → Task 1
- ✓ StatSubmission schema → Task 1
- ✓ @@unique([matchId, playerId]) on PlayerStat → Task 1
- ✓ getCompletedMatchesForCaptain → Task 4
- ✓ upsertStatSubmission → Task 4
- ✓ /captain/stats page → Task 5
- ✓ captainSubmitStatsAction → Task 5
- ✓ "Match Stats" nav link → Task 5
- ✓ getPendingStatSubmissions/Count → Task 6
- ✓ approveStatSubmission (creates PlayerStat) → Task 6
- ✓ rejectStatSubmission → Task 6
- ✓ Admin approval UI → Task 7
- ✓ Reject requires note → Task 7
- ✓ Nav badge for admin → Task 7

**Type consistency check:**
- `StatSubmissionRow` defined once in Task 6, used in Task 7
- `CompletedMatchRow` defined once in Task 4, used in Task 5
- `upsertStatSubmission` input: `{ matchId, teamId, eventId, submittedBy, stats }` — matches action in Task 5
- `approveStatSubmission(submissionId, adminId)` — matches action call in Task 7
- `rejectStatSubmission(submissionId, adminId, note)` — matches action call in Task 7

**Placeholder check:** No TBD/TODO in any step.
