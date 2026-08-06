# Design Spec: Captain Self Sign-Up + Best of N Brackets

**Date:** 2026-08-06  
**Status:** Approved  
**Deadline:** Friday, 2026-08-14

---

## Overview

Two new MVP features to broaden platform adoption:

1. **Captain Self Sign-Up** — open registration flow for captains: account + team in one flow, limited to Published events
2. **Best of N Brackets** — admin configures BO per round-label; admin enters game-by-game scores; bracket shows series result

---

## Feature 1: Captain Self Sign-Up

### Problem

Currently, captains can only be onboarded by admin CSV import. Open registration lets new captains join Published events without admin involvement.

### User Flow

1. Captain visits `/register` (linked from login page)
2. **Step 1 (Account):** enters fullName, email, password, confirmPassword — client-side validation (passwords match, min 8 chars)
3. **Step 2 (Team):** selects a Published event from dropdown, enters teamName and teamTag (2–4 chars)
4. On submit: `captainSignUpAction` creates User + Team atomically in a Prisma transaction, sets JWT cookie, redirects to `/captain?success=registered`

### Constraints

- Email must be unique across all users
- teamTag must be 2–4 chars, unique per event (uppercase)
- teamName must be unique per event (min 2 chars)
- Only Published events appear in the dropdown
- Transaction: either both User + Team are created, or neither (no orphaned accounts)

### Architecture

**Route:** `src/app/register/page.tsx`
- Server component: fetches Published events, passes to client wizard
- Reads `searchParams.error` for error display

**Client component:** `RegisterWizard`
- Two-step UI with `useState` for step tracking
- Step 1 data held in state; passed as hidden inputs in the step 2 form
- Step 2 form uses `action={captainSignUpAction}`

**Server action:** `captainSignUpAction` in `src/lib/actions.ts`
- Validates all inputs (Zod + manual checks)
- Checks email uniqueness and team uniqueness
- Bcrypt-hashes password (cost 10)
- Prisma `$transaction`: create User (role: "captain") → create Team (source: "registration", captainId: user.id, logoText: teamTag)
- Calls `signIn(email, password)` to issue JWT cookie
- Redirects to `/captain?success=registered`

**Repository functions added:**
- `getPublishedEvents()` — `Event.findMany({ where: { status: "Published" } })`
- `createCaptainWithTeam(data)` — `$transaction` creating User + Team

---

## Feature 2: Best of N Brackets

### Problem

Currently all matches use single-game scoring (homeScore/awayScore). Semifinals and Finals should support Best of 3 / Best of 5 series with game-by-game score entry.

### Admin Flow

1. On admin page, new "Konfigurasi Round BO" section per event
2. Admin sets bestOf (1/3/5) per distinct roundLabel present in the event's matches
3. Saves via `adminSetRoundConfigAction` (upserts `EventRoundConfig`)
4. To enter match results: admin selects a match from the match list, clicks "Enter result" link
5. Page loads with `?matchId=xxx`. If that match's roundLabel has bestOf > 1, shows game-by-game form (Game 1…N rows)
6. Admin enters home + away score per game; system auto-determines series winner
7. For BO1 matches, the existing homeScore/awayScore form remains

### Winner Determination

Series winner = first team to reach `ceil(bestOf / 2)` game wins.  
Game winner = higher score in that game.  
`Match.homeScore` = home team series wins; `Match.awayScore` = away team series wins.  
`Match.winnerTeamId` set when series is decided.

### Bracket Display

Bracket fetches `EventRoundConfig` for the event. If match's roundLabel has `bestOf > 1`:
- Shows `"2 - 1 (BO3)"` instead of raw game score

### Schema

```prisma
model EventRoundConfig {
  id         String @id @default(cuid())
  eventId    String
  roundLabel String
  bestOf     Int    @default(1)
  event      Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, roundLabel])
}

model MatchGame {
  id         String @id @default(cuid())
  matchId    String
  gameNumber Int
  homeScore  Int
  awayScore  Int
  match      Match  @relation(fields: [matchId], references: [id], onDelete: Cascade)
  @@unique([matchId, gameNumber])
}
```

### Repository functions added

- `getEventRoundConfigs(eventId)` → `EventRoundConfig[]`
- `upsertRoundConfig(eventId, roundLabel, bestOf)` → upsert
- `getMatchGames(matchId)` → `MatchGame[]` ordered by gameNumber
- `setMatchGames(matchId, games, bestOf)` → delete + create MatchGame rows, update Match scores + winnerTeamId

### Actions added

- `adminSetRoundConfigAction` — admin sets BO per roundLabel
- `adminSetMatchGamesAction` — admin enters game-by-game results

### Backward Compatibility

- All existing matches with homeScore/awayScore are treated as BO1 (unchanged)
- `EventRoundConfig` defaults to bestOf=1; unset roundLabels = BO1
- Existing `adminUpdateMatchResultAction` unchanged; still used for BO1 matches

---

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `EventRoundConfig`, `MatchGame` models |
| `src/lib/platform/types.ts` | Add `EventRoundConfig`, `MatchGame` types |
| `src/lib/platform/repository.ts` | Add 6 new functions |
| `src/lib/actions.ts` | Add `captainSignUpAction`, `adminSetRoundConfigAction`, `adminSetMatchGamesAction` |
| `src/app/register/page.tsx` | NEW: registration wizard |
| `src/app/login/page.tsx` | Add register link |
| `src/app/admin/page.tsx` | Add round config section + BO match result flow |
| `src/app/events/[slug]/bracket/page.tsx` | Update score display for BO matches |
