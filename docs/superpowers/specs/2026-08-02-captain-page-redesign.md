# Captain Page Redesign

**Date:** 2026-08-02  
**Status:** Approved  
**Scope:** Visual redesign of `/captain` — team hero card + player grid

---

## Problem

The captain page is a visual placeholder: a plain card with team name and a data-table for the roster. It does not match the visual language of the homepage (gradient hero, logo badges, game art). Captains need a polished dashboard that reflects their team identity.

---

## Goals

1. Team Hero Banner — same `GameArt` pattern as homepage event cards
2. Team Logo Badge — initials + hover-upload placeholder (no actual file upload)
3. Player Grid — card-per-player matching the homepage's card aesthetic
4. Add Player Form — stays inline below grid, gains optional `jerseyNumber` field
5. Visual consistency — same gradients, orbs, pills, and badge patterns site-wide

---

## Architecture

### Shared `GameArt` component

The `GameArt`, `gameArtConfig`, and `StatusBadge` functions are currently inlined in `src/app/page.tsx`. Extract them to `src/components/GameArt.tsx` so captain page can import without duplication.

Exported from `src/components/GameArt.tsx`:
- `gameArtConfig: Record<string, GameArtTheme>` — color/label map keyed by `gameId`
- `GameArt({ gameId, logoUrl, teamName })` — 176px tall hero with orbs + logo badge overlapping bottom
- `TeamLogoBadge({ initials, bg })` — 56×56 badge with inisial + hover `ImagePlus` overlay

`src/app/page.tsx` imports from the shared component instead of local definitions.

### `src/app/captain/page.tsx`

Replace the current layout with:

```
<div class="space-y-8">
  <!-- Per-team section (captain may captain multiple teams) -->
  <TeamSection team event game players />
</div>
```

**`TeamSection` sub-component** (inline in captain/page.tsx):

```
<article class="rounded-2xl border overflow-hidden">
  <!-- Hero: GameArt + TeamLogoBadge + StatusBadge -->
  <div class="relative">
    <GameArt gameId={game.id} teamName={team.name} />
    <StatusBadge status={event.status} />  <!-- top-right overlay, reused from GameArt.tsx -->
  </div>

  <!-- Card body: offset for logo badge (pt-10) -->
  <div class="p-5 pt-10 space-y-6">
    <!-- Team meta -->
    <div>
      <p class="text-xs uppercase tracking-widest text-slate-400">{game.name} · {mode}</p>
      <h2 class="text-xl font-black text-white">{team.name}</h2>
      <p class="text-sm text-slate-400">{event.name} · {event.venue}</p>
    </div>

    <!-- Player grid -->
    <PlayerGrid players={players} teamId={team.id} eventId={team.eventId} />
  </div>
</article>
```

**`PlayerGrid` sub-component** (inline):

```
<section>
  <h3>Roster · {players.length} players</h3>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
    {players.map(PlayerCard)}
    <AddPlayerCard />  <!-- always last, dashed border -->
  </div>
  <!-- Add Player Form (always visible below grid) -->
  <AddPlayerForm teamId eventId />
</section>
```

**`PlayerCard`** (inline):
- Relative container, border, rounded-2xl, bg-white/5
- Top-right badge: jerseyNumber if present (`#12` format)
- Avatar circle (40px): position-color gradient, 2-char nickname initials
  - Guard → blue (`#1e3a8a` → `#1d4ed8`)
  - Forward → green (`#052e16` → `#14532d`)
  - Goalkeeper / other → slate (`#1e293b` → `#334155`)
- displayName (font-semibold)
- nickname as cyan pill badge
- position as xs uppercase label

**`AddPlayerCard`** (inline):
- Same size as PlayerCard, dashed border, bg transparent
- Centered `+` icon + "Add player" label (slate-400)
- `onClick` scrolls to the Add Player form below (anchor link `#add-player-form`)

**`AddPlayerForm`** (inline):
- id="add-player-form"
- Same glassmorphism input style as admin panel
- Fields: Display name, Nickname, Position (text input), Jersey # (optional number input)
- Submit → `captainAddPlayerAction`

### Data flow

```
captain/page.tsx
  └── requireRole("captain")
  └── getCaptainTeams(user.id)           // existing
  └── getEvents()                         // existing
  └── Promise.all(teams.map(
        getPlayersForTeam(team.id)        // existing
      ))
  └── renders TeamSection per team
```

No new repository queries needed — all data already fetched.

### `addPlayer` + `captainAddPlayerAction` updates

Add `jerseyNumber?: number` to:
- `addPlayer()` input type in `src/lib/platform/repository.ts`
- `prisma.player.create({ data: { ...input } })` — already accepted by schema
- `captainAddPlayerAction` in `src/lib/actions.ts` — parse `jerseyNumber` from formData (optional)

---

## Components To Extract → `src/components/GameArt.tsx`

```ts
export interface GameArtTheme {
  bg: string; orb1: string; orb2: string; ring: string; label: string;
}

export const gameArtConfig: Record<string, GameArtTheme> = {
  "game-kuroko": { bg: "...", orb1: "...", orb2: "...", ring: "...", label: "KNB" },
  "game-flashpeak": { bg: "...", orb1: "...", orb2: "...", ring: "...", label: "FP" },
};

export function GameArt({ gameId, logoUrl, entityName }: {
  gameId: string; logoUrl?: string; entityName: string;
}) { ... }  // same as current page.tsx GameArt but uses entityName for initials

export function StatusBadge({ status }: { status: string }) { ... }
```

`src/app/page.tsx` replaces its inline `GameArt`/`StatusBadge`/`gameArt` with imports from this file.

---

## Visual Language

| Token | Value |
|---|---|
| Card background | `bg-slate-900` (dark) / `bg-white` (light) |
| Card border | `border-slate-800` / `border-slate-200` |
| Avatar Guard | gradient blue `#1e3a8a→#1d4ed8` |
| Avatar Forward | gradient green `#052e16→#14532d` |
| Avatar Other | gradient slate `#1e293b→#334155` |
| Nickname pill | `bg-cyan-400/15 text-cyan-300` |
| Position label | `text-slate-400 uppercase text-xs tracking-widest` |
| Jersey badge | `bg-slate-700 text-slate-200 text-xs` |

---

## What Is NOT In Scope

- Actual logo file upload (just placeholder UI)
- Player stats or editing
- Team settings / rename
- Multiple-event view (all teams rendered, no filter needed since typically 1-2)

---

## Verification

1. Captain login (with auto-created account from CSV import) → sees team hero card
2. Hero art matches the correct game gradient (Kuroko = blue, Flashpeak = green)
3. Logo badge shows initials + hover `ImagePlus` icon
4. Player grid shows all players with avatar, name, nickname badge, position
5. Jersey number badge appears if set
6. "Add Player" form accepts jerseyNumber (optional); player appears in grid after submit
7. Homepage event cards still render correctly (shared `GameArt` component)
8. `pnpm test` → 49 tests pass
