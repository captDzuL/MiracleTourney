# Captain Dashboard + Stat Submission

**Date:** 2026-08-02  
**Status:** Approved  
**Scope:** Captain page redesign + `/captain/stats` page + admin stat approval

---

## Overview

Two features combined into one implementation cycle to avoid revisiting captain pages twice:

1. **Captain Page Redesign** — team hero card, player grid, add-player form with jersey number
2. **Stat Submission Flow** — captain submits per-match player stats → admin approves/rejects → leaderboard populates

---

## Feature 1: Captain Page Redesign

### Shared `GameArt` component

Extract from `src/app/page.tsx` into `src/components/GameArt.tsx`:

```ts
export interface GameArtTheme {
  bg: string; orb1: string; orb2: string; ring: string; label: string;
}

export const gameArtConfig: Record<string, GameArtTheme>  // keyed by gameId

export function GameArt({ gameId, logoUrl, entityName }: {
  gameId: string; logoUrl?: string; entityName: string;
})   // 176px hero div with orbs + logo badge overlapping bottom-left

export function StatusBadge({ status }: { status: string })
// absolute top-right pill, pulse dot for "Ongoing"
```

`src/app/page.tsx` imports from this file instead of local definitions. No behaviour change.

### `src/app/captain/page.tsx` layout

```
<div class="space-y-8">
  {teams.map(team => <TeamSection team event game players />)}
</div>
```

**`TeamSection`** (inline component):
- `<article class="rounded-2xl border overflow-hidden">` — matches EventCard style
- Hero area: `<GameArt gameId={game.id} entityName={team.name} />` + `<StatusBadge status={event.status} />`
- Card body (`p-5 pt-10 space-y-6`):
  - Game name + mode label (xs uppercase slate-400)
  - Team name (xl font-black)
  - Event name · venue (sm slate-400)
  - Link `href="/captain/stats"` → "Submit Match Stats →" (cyan, sm)
  - `<PlayerGrid players={players} teamId={team.id} eventId={event.id} />`

**`PlayerGrid`** (inline component):
- Heading: "Roster · N players"
- Grid: `grid-cols-2 sm:grid-cols-3 gap-3`
- Each `PlayerCard`:
  - Jersey badge top-right (if `jerseyNumber` set): `#12` format, bg-slate-700 text-xs
  - Avatar circle 40px: gradient by position
    - Guard → blue `from-[#1e3a8a] to-[#1d4ed8]`
    - Forward → green `from-[#052e16] to-[#14532d]`
    - Goalkeeper/other → slate `from-[#1e293b] to-[#334155]`
    - Initials: 2 chars of nickname
  - `displayName` font-semibold text-white
  - Nickname: cyan pill `bg-cyan-400/15 text-cyan-300`
  - Position: xs uppercase tracking-widest text-slate-400
- Last slot: `AddPlayerCard` — dashed border, `+` icon, "Add player", scrolls to `#add-player-form`

**`AddPlayerForm`** (inline, `id="add-player-form"`):
- Fields: Display name, Nickname, Position, Jersey # (optional, type=number min=1 max=99)
- Jersey number parsed as optional integer in `captainAddPlayerAction`
- Submits to `captainAddPlayerAction`

### `addPlayer` and action changes

`src/lib/platform/repository.ts` — `addPlayer()` input type:
```ts
{ teamId, eventId, displayName, nickname, position, jerseyNumber?: number }
```
Prisma create includes `jerseyNumber` when present.

`src/lib/actions.ts` — `captainAddPlayerAction`:
```ts
const jerseyRaw = formData.get("jerseyNumber");
const jerseyNumber = jerseyRaw ? parseInt(jerseyRaw as string, 10) : undefined;
await addPlayer({ ..., jerseyNumber });
```

---

## Feature 2: Stat Submission Flow

### DB schema addition — `StatSubmission`

```prisma
model StatSubmission {
  id             String    @id @default(cuid())
  matchId        String
  match          Match     @relation(fields: [matchId], references: [id], onDelete: Cascade)
  teamId         String
  eventId        String
  event          Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  submittedBy    String                        // captain User.id
  status         String    @default("pending") // "pending" | "approved" | "rejected"
  rejectionNote  String?
  stats          Json      // { [playerId]: { goal?: n, assist?: n, ... } }
  submittedAt    DateTime  @default(now())
  reviewedAt     DateTime?
  reviewedBy     String?                       // admin User.id
}
```

Add back-references to `Match` and `Event`:
```prisma
model Match {
  statSubmissions StatSubmission[]
}
model Event {
  statSubmissions StatSubmission[]
}
```

Run `pnpm prisma db push` after schema changes.

### Stat fields per game (stored as keys in `stats` JSON)

| Game | Fields |
|---|---|
| `game-flashpeak` | `goal`, `assist`, `block`, `tackle` |
| `game-kuroko` | `point`, `assist`, `block`, `rebound`, `flb`, `steal` |

Defined in `src/lib/platform/config.ts` as `statFields: string[]` on each `Game` object so the form renders dynamically.

### `/captain/stats` page — `src/app/captain/stats/page.tsx`

Data flow:
```ts
const user = await requireRole("captain");
const teams = await getCaptainTeams(user.id);
const events = await getEvents();

// For each team: get completed matches where team participated
const matchRows = await getCompletedMatchesForCaptain(user.id);
// Returns: Match + eventId + opponent team name + existing StatSubmission (if any)
```

**New repository function** `getCompletedMatchesForCaptain(captainId)`:
```ts
// Find teams captained by this user
// Find matches (status=Completed) where homeTeamId or awayTeamId is in captain's teams
// Left-join StatSubmission on (matchId, teamId)
// Return array of { match, event, team, opponentName, submission? }
```

**Page layout:**
```
<Section title="Match Stats">
  {matchRows.map(row => <MatchStatRow ... />)}
</Section>
```

**`MatchStatRow`** per completed match:
- Match label (roundLabel · slot), event name, opponent team name, score
- Status badge:
  - No submission → "Not submitted" (slate) + "Submit Stats" button
  - `pending` → "Pending review" (amber) — no action
  - `approved` → "Approved" (emerald) — read-only view link
  - `rejected` → "Rejected: {rejectionNote}" (red) + "Resubmit" button
- Clicking Submit/Resubmit expands an inline stat form below the row

**Stat form** (inline expand, not page navigation):
- Lists all players in captain's team for this event
- Per player: name label + one number input per stat field (0 default)
- Submit → `captainSubmitStatsAction(matchId, teamId, statsData)`

### `captainSubmitStatsAction` (new in `actions.ts`)

```ts
export async function captainSubmitStatsAction(formData: FormData) {
  const user = await requireRole("captain");
  if (!user) redirect("/login");

  const matchId = formData.get("matchId") as string;
  const teamId = formData.get("teamId") as string;
  const eventId = formData.get("eventId") as string;
  // Parse per-player stats from formData keys like "stat_{playerId}_{field}"
  
  await upsertStatSubmission({
    matchId, teamId, eventId,
    submittedBy: user.id,
    stats: parsedStats,
  });
  revalidatePath("/captain/stats");
}
```

**New repository function** `upsertStatSubmission(input)`:
- `prisma.statSubmission.upsert({ where: { matchId_teamId unique }, ... })`
- On re-submit (rejected → pending again): reset status to "pending", clear rejectionNote
- Add `@@unique([matchId, teamId])` to schema

### Admin approval — new section in `/admin`

**Badge counter** on the "Admin" nav link:
```tsx
// In layout.tsx nav, fetch count server-side
const pendingCount = await getPendingStatSubmissionCount();
// Render: <Link href="/admin">Admin {pendingCount > 0 && <Badge>{pendingCount}</Badge>}</Link>
```

**New section in `src/app/admin/page.tsx`** (below existing sections):
```
<Section title="Stat Submissions" description="Captain-submitted match stats pending review.">
  {pendingSubmissions.length === 0
    ? <p>No pending submissions.</p>
    : <SubmissionTable submissions={pendingSubmissions} />
  }
</Section>
```

**SubmissionTable** columns: Event · Match · Team · Captain · Submitted · Status · Actions

**Expand row** → shows stats per player in a `DataTable`.

**Approve action** `adminApproveStatSubmissionAction(submissionId)`:
1. Load `StatSubmission` with its `stats` JSON
2. For each `playerId` in stats:
   - `prisma.playerStat.upsert` — creates or overwrites the PlayerStat record
   - Fields mapped from submission stats JSON to PlayerStat stats Json
3. `prisma.statSubmission.update({ status: "approved", reviewedAt, reviewedBy })`
4. `revalidatePath("/admin")` + `revalidatePath("/events/[slug]/standings")`

**Reject action** `adminRejectStatSubmissionAction(submissionId, note)`:
1. `prisma.statSubmission.update({ status: "rejected", rejectionNote: note })`
2. `revalidatePath("/admin")`
- No PlayerStat records created.
- Captain sees rejection with note on `/captain/stats`.

### New repository functions (summary)

| Function | Description |
|---|---|
| `getCompletedMatchesForCaptain(captainId)` | Matches + submission status for captain's teams |
| `upsertStatSubmission(input)` | Create or update a StatSubmission (pending) |
| `getPendingStatSubmissions()` | All pending submissions for admin view |
| `getPendingStatSubmissionCount()` | Count for badge |
| `approveStatSubmission(submissionId, adminId)` | Creates PlayerStats, marks approved |
| `rejectStatSubmission(submissionId, adminId, note)` | Marks rejected with note |

---

## Navigation changes

`src/components/layout/Navbar.tsx` (or wherever nav is):
- "Admin" link gets pending badge: `<span class="ml-1 ... rounded-full bg-red-500 text-white text-xs px-1.5">{count}</span>`
- Captain nav: add "Match Stats" link → `/captain/stats`

---

## Files to create / modify

| File | Change |
|---|---|
| `src/components/GameArt.tsx` | New — extracted from page.tsx |
| `src/app/page.tsx` | Import GameArt from shared component |
| `src/app/captain/page.tsx` | Redesign: hero + player grid + add-player form |
| `src/app/captain/stats/page.tsx` | New — match list + stat submission |
| `src/app/admin/page.tsx` | Add stat submissions section + badge counter |
| `src/lib/platform/repository.ts` | New stat-submission functions + addPlayer jerseyNumber |
| `src/lib/actions.ts` | captainSubmitStatsAction, approve/reject actions, jersey in addPlayer |
| `src/lib/platform/config.ts` | Add statFields per game |
| `prisma/schema.prisma` | StatSubmission model + @@unique([matchId, teamId]) |
| Nav component | Admin badge + captain stats link |

---

## Out of scope

- Deadline enforcement for stat submission (TBD with team)
- Email/WhatsApp notification on rejection (manual for now — captain checks /captain/stats)
- Player stat editing after approval (new feature if needed)
- Stats for League format (only Single Elimination for now)

---

## Verification

1. `pnpm prisma db push` applies without errors
2. `pnpm test` — 49 tests pass (no regression)
3. Captain logs in → sees hero card + player grid on `/captain`
4. Jersey number shows on player card after adding via form
5. Captain navigates to `/captain/stats` → sees completed matches with "Not submitted" status
6. Captain submits stats → status changes to "Pending review"
7. Admin sees badge on "Admin" nav link + submission in "Stat Submissions" section
8. Admin approves → `PlayerStat` records created → leaderboard shows data
9. Admin rejects with note → captain sees "Rejected: {note}" + can resubmit
10. Homepage event cards still render correctly (shared GameArt component)
