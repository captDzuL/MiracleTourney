# Overnight MVP Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MiracleTourney operationally usable overnight by adding bracket advancement and admin match-result entry, while polishing the public event surface and reducing manual user-side verification.

**Architecture:** Keep the existing Next.js App Router + demo-store architecture for overnight speed, but extend it with an explicit match-operation layer, advancement-aware bracket projection, lightweight event media fields, and a dedicated testing dataset pack. The admin surface remains the write-entry point, while public pages stay read-only consumers of event-scoped derived state.

**Tech Stack:** Next.js App Router, React Server Components, server actions, TypeScript, Vitest, Playwright, in-memory demo store

## Global Constraints

- Source of truth repository is `E:\dev\MiracleTourney-gitnative`.
- OneDrive workspace is no longer part of active execution.
- Registration remains CSV-driven for launch week.
- Current demo-store architecture is acceptable for overnight implementation speed.
- In-memory persistence is allowed during the sprint, but must be treated as an operational limitation.
- P0 must land before P1 polish work.
- Testing datasets are supporting work, not the main workstream.
- TDD is required for feature and bugfix work.
- Frequent commits are required after each independently testable task.

---

### Task 1: Add match-operation state and result-entry primitives

**Files:**
- Modify: `src/lib/platform/types.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Modify: `src/lib/actions.ts`
- Test: `src/lib/tournament/engine.test.ts`

**Interfaces:**
- Consumes: `type Match`, `getMatchesForEvent(eventId: string): Match[]`, `getBracketPreview(eventId: string): BracketMatch[] | RoundRobinMatch[]`
- Produces:
  - `type Match = { id: string; eventId: string; roundLabel: string; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number; status: "Scheduled" | "Completed"; slot?: number; round?: number; winnerTeamId?: string | null; scheduledLabel?: string }`
  - `setMatchResult(input: { eventId: string; matchId: string; homeScore: number; awayScore: number }): Match | null`
  - `adminUpdateMatchResultAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Write the failing tests for result storage and winner derivation**

```ts
it("stores completed match results with a derived winner", () => {
  const match = setMatchResult({
    eventId: "event-kuroko-summer",
    matchId: "match-kuroko-1",
    homeScore: 21,
    awayScore: 18,
  });

  expect(match).toMatchObject({
    id: "match-kuroko-1",
    status: "Completed",
    homeScore: 21,
    awayScore: 18,
    winnerTeamId: "team-seirin",
  });
});

it("rejects ties for single-elimination result entry", () => {
  expect(() =>
    setMatchResult({
      eventId: "event-kuroko-summer",
      matchId: "match-kuroko-1",
      homeScore: 20,
      awayScore: 20,
    }),
  ).toThrow("Single elimination matches cannot end in a draw.");
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: FAIL because `setMatchResult` and `winnerTeamId` do not exist yet.

- [ ] **Step 3: Extend match types and store helpers with minimal result-entry support**

```ts
export type Match = {
  id: string;
  eventId: string;
  roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: "Scheduled" | "Completed";
  slot?: number;
  round?: number;
  winnerTeamId?: string | null;
  scheduledLabel?: string;
};

export function setMatchResult(input: {
  eventId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}) {
  const event = getStore().events.find((item) => item.id === input.eventId);
  const match = getStore().matches.find(
    (item) => item.id === input.matchId && item.eventId === input.eventId,
  );

  if (!event || !match) return null;
  if (event.format === "Single Elimination" && input.homeScore === input.awayScore) {
    throw new Error("Single elimination matches cannot end in a draw.");
  }

  match.homeScore = input.homeScore;
  match.awayScore = input.awayScore;
  match.status = "Completed";
  match.winnerTeamId =
    input.homeScore > input.awayScore ? match.homeTeamId : match.awayTeamId;

  return match;
}
```

- [ ] **Step 4: Add the server action for admin result entry**

```ts
export async function adminUpdateMatchResultAction(formData: FormData) {
  const input = z.object({
    eventId: z.string().min(1),
    matchId: z.string().min(1),
    homeScore: z.coerce.number().int().min(0),
    awayScore: z.coerce.number().int().min(0),
  }).parse({
    eventId: formData.get("eventId"),
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  try {
    const match = setMatchResult(input);
    if (!match) redirect("/admin?error=Match%20not%20found.");
    revalidatePath("/", "layout");
    redirect(`/admin?success=match-result-updated&match=${match.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match result.";
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
}
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/types.ts src/lib/platform/demo-store.ts src/lib/actions.ts src/lib/tournament/engine.test.ts
git commit -m "feat: add match result entry primitives"
```

### Task 2: Make single-elimination bracket advancement deterministic

**Files:**
- Modify: `src/lib/tournament/types.ts`
- Modify: `src/lib/tournament/engine.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Test: `src/lib/tournament/engine.test.ts`

**Interfaces:**
- Consumes: `generateSingleEliminationBracket(teams: TeamSeed[], slotCount: 8 | 12 | 16 | 24): BracketMatch[]`, `getMatchesForEvent(eventId: string): Match[]`
- Produces:
  - `type BracketMatch = { id: string; round: number; slot: number; homeTeamId: string | null; awayTeamId: string | null; byeForTeamId?: string; sourceMatchIds?: [string | null, string | null]; resolvedWinnerTeamId?: string | null }`
  - `projectSingleEliminationBracket(input: { teams: TeamSeed[]; slotCount: 8 | 12 | 16 | 24; results: Match[] }): BracketMatch[]`

- [ ] **Step 1: Write the failing advancement tests**

```ts
it("auto-advances a bye winner into the next round", () => {
  const projected = projectSingleEliminationBracket({
    teams: teams.slice(0, 7),
    slotCount: 8,
    results: [],
  });

  const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
  expect(semifinal?.homeTeamId).toBe("team-a");
});

it("propagates completed winners into downstream matches", () => {
  const projected = projectSingleEliminationBracket({
    teams: teams.slice(0, 4),
    slotCount: 8,
    results: [
      {
        id: "bracket-r1-m2",
        eventId: "event-kuroko-summer",
        roundLabel: "Quarterfinal",
        homeTeamId: "team-b",
        awayTeamId: "team-c",
        homeScore: 15,
        awayScore: 21,
        status: "Completed",
        round: 1,
        slot: 2,
        winnerTeamId: "team-c",
      },
    ] as Match[],
  });

  const semifinal = projected.find((match) => match.round === 2 && match.slot === 1);
  expect(semifinal).toMatchObject({
    homeTeamId: "team-a",
    awayTeamId: "team-c",
  });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: FAIL because `projectSingleEliminationBracket` and advancement fields do not exist yet.

- [ ] **Step 3: Add bracket provenance fields and minimal projection logic**

```ts
export type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  byeForTeamId?: string;
  sourceMatchIds?: [string | null, string | null];
  resolvedWinnerTeamId?: string | null;
};

function getResolvedWinner(match: BracketMatch, resultsById: Map<string, Match>) {
  if (match.byeForTeamId) return match.byeForTeamId;
  return resultsById.get(match.id)?.winnerTeamId ?? null;
}

export function projectSingleEliminationBracket(input: {
  teams: TeamSeed[];
  slotCount: 8 | 12 | 16 | 24;
  results: Match[];
}) {
  const base = generateSingleEliminationBracket(input.teams, input.slotCount);
  const resultsById = new Map(input.results.map((match) => [match.id, match]));

  for (const match of base) {
    match.resolvedWinnerTeamId = getResolvedWinner(match, resultsById);
  }

  for (const match of base.filter((item) => item.round > 1)) {
    const previousRound = match.round - 1;
    const sourceSlotStart = (match.slot - 1) * 2 + 1;
    const leftSource = base.find((item) => item.round === previousRound && item.slot === sourceSlotStart) ?? null;
    const rightSource = base.find((item) => item.round === previousRound && item.slot === sourceSlotStart + 1) ?? null;
    match.sourceMatchIds = [leftSource?.id ?? null, rightSource?.id ?? null];
    match.homeTeamId = leftSource?.resolvedWinnerTeamId ?? null;
    match.awayTeamId = rightSource?.resolvedWinnerTeamId ?? null;
  }

  return base;
}
```

- [ ] **Step 4: Make event bracket preview consume projected bracket state**

```ts
export function getBracketPreview(eventId: string) {
  const event = getStore().events.find((item) => item.id === eventId);
  if (!event) return [];
  const teamSeeds = getTeamsForEvent(eventId).map((team) => ({ id: team.id, name: team.name }));

  if (event.format === "Single Elimination") {
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount: event.participantCap,
      results: getMatchesForEvent(eventId),
    });
  }

  return generateRoundRobinSchedule(teamSeeds);
}
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/types.ts src/lib/tournament/engine.ts src/lib/platform/demo-store.ts src/lib/tournament/engine.test.ts
git commit -m "feat: project bracket advancement"
```

### Task 3: Add admin match-operations UI

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/ui.tsx`
- Modify: `src/lib/platform/demo-store.ts`
- Test: `src/app/admin/page.test.ts`

**Interfaces:**
- Consumes: `adminUpdateMatchResultAction(formData: FormData): Promise<void>`, `getEvents(): Event[]`, `getMatchesForEvent(eventId: string): Match[]`
- Produces:
  - `getBracketManageableMatches(eventId: string): Match[]`
  - admin form fields `eventId`, `matchId`, `homeScore`, `awayScore`

- [ ] **Step 1: Write the failing admin surface regression test**

```ts
test("shows a match operations section with result entry controls", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

  expect(source).toContain("Match operations");
  expect(source).toContain("Save match result");
  expect(source).toContain("homeScore");
  expect(source).toContain("awayScore");
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `corepack pnpm test -- src/app/admin/page.test.ts`
Expected: FAIL because the match-operations section does not exist yet.

- [ ] **Step 3: Add a store selector for manageable matches**

```ts
export function getBracketManageableMatches(eventId: string) {
  return getMatchesForEvent(eventId)
    .filter((match) => match.round != null && match.slot != null)
    .sort((left, right) => (left.round! - right.round!) || (left.slot! - right.slot!));
}
```

- [ ] **Step 4: Add the result-entry section to the admin page**

```tsx
<Section
  className="h-full"
  title="Match operations"
  description="Record match outcomes and drive bracket advancement from the admin panel."
>
  {events.length ? (
    <form action={adminUpdateMatchResultAction} className="grid h-full content-start gap-4">
      <label className="grid gap-2 text-sm text-slate-300">
        Event
        <select className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="eventId" defaultValue={events[0]?.id}>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Match
        <select className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="matchId" defaultValue={manageableMatches[0]?.id}>
          {manageableMatches.map((match) => (
            <option key={match.id} value={match.id}>
              {match.roundLabel} · Match {match.slot} · {teamName(match.homeTeamId)} vs {teamName(match.awayTeamId)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-300">
          Home score
          <input className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="homeScore" type="number" min="0" defaultValue="0" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          Away score
          <input className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="awayScore" type="number" min="0" defaultValue="0" />
        </label>
      </div>
      <div className="pt-2">
        <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">
          Save match result
        </button>
      </div>
    </form>
  ) : (
    <p className="text-sm text-slate-400">Create or import an event first.</p>
  )}
</Section>
```

- [ ] **Step 5: Run the targeted test to verify it passes**

Run: `corepack pnpm test -- src/app/admin/page.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/components/ui.tsx src/lib/platform/demo-store.ts src/app/admin/page.test.ts
git commit -m "feat: add admin match operations"
```

### Task 4: Synchronize public event detail and bracket views with operational state

**Files:**
- Modify: `src/app/events/[slug]/bracket/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Modify: `src/app/events/[slug]/participants/page.tsx`
- Modify: `src/app/events/[slug]/standings/page.tsx`
- Test: `src/lib/tournament/engine.test.ts`

**Interfaces:**
- Consumes: `getBracketPreview(eventId: string): BracketMatch[] | RoundRobinMatch[]`, `getMatchesForEvent(eventId: string): Match[]`
- Produces:
  - bracket cards that render propagated team names from `projectSingleEliminationBracket`
  - event detail snapshots that surface operational state without stale `TBD` placeholders

- [ ] **Step 1: Write the failing projection-facing test**

```ts
it("returns propagated semifinal teams through the event-facing bracket preview", () => {
  const bracket = getBracketPreview("event-kuroko-summer") as BracketMatch[];
  const semifinal = bracket.find((match) => match.round === 2 && match.slot === 1);

  expect(semifinal?.homeTeamId).toBeTruthy();
  expect(semifinal?.awayTeamId).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted test to verify it fails or reflects stale state**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: FAIL or assertion mismatch against stale `TBD` behavior.

- [ ] **Step 3: Update public bracket rendering to prefer propagated teams and resolved state**

```tsx
const homeName = renderTeamName(teamLookup, match.homeTeamId, "TBD");
const awayName = renderTeamName(
  teamLookup,
  match.awayTeamId,
  match.byeForTeamId ? "BYE" : "TBD",
);

const state = getBracketMatchState(match, event.startsAt, recordedByRound);
```

- [ ] **Step 4: Surface clearer operational summaries on event detail and supporting pages**

```tsx
<StatCard
  label="Bracket / fixtures"
  value={bracket.length}
  hint={
    event.format === "Single Elimination"
      ? "Projected from teams and completed match outcomes"
      : "Generated from event format"
  }
/>
```

```tsx
<p className="text-sm text-slate-400">
  Player stats will appear after roster and match-stat entry is recorded.
</p>
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/events/[slug]/bracket/page.tsx src/app/events/[slug]/page.tsx src/app/events/[slug]/participants/page.tsx src/app/events/[slug]/standings/page.tsx src/lib/tournament/engine.test.ts
git commit -m "feat: sync public bracket operations state"
```

### Task 5: Add P1 event media editing and public visual hooks

**Files:**
- Modify: `src/lib/platform/types.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/events/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Test: `src/app/events/page.test.ts`

**Interfaces:**
- Consumes: `type Event`, `getEvents(): Event[]`, `getEventBySlug(slug: string): Event | undefined`
- Produces:
  - `updateEventMedia(input: { eventId: string; logoUrl: string; gameImageUrl: string }): Event | null`
  - `adminUpdateEventMediaAction(formData: FormData): Promise<void>`
  - `type Event = { ...; logoUrl?: string; gameImageUrl?: string }`

- [ ] **Step 1: Write the failing event-card regression test**

```ts
test("renders event naming with media placeholders or configured URLs", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

  expect(source).toContain("Event logo");
  expect(source).toContain("Game art");
  expect(source).toContain("{event.name}");
});
```

- [ ] **Step 2: Run the targeted test to verify the current expectation gap**

Run: `corepack pnpm test -- src/app/events/page.test.ts`
Expected: FAIL if the file or assertions are missing in the active branch state.

- [ ] **Step 3: Add event media update primitives**

```ts
export function updateEventMedia(input: {
  eventId: string;
  logoUrl: string;
  gameImageUrl: string;
}) {
  const event = getStore().events.find((item) => item.id === input.eventId);
  if (!event) return null;
  event.logoUrl = input.logoUrl || undefined;
  event.gameImageUrl = input.gameImageUrl || undefined;
  return event;
}
```

```ts
export async function adminUpdateEventMediaAction(formData: FormData) {
  const input = z.object({
    eventId: z.string().min(1),
    logoUrl: z.string().url().or(z.literal("")),
    gameImageUrl: z.string().url().or(z.literal("")),
  }).parse({
    eventId: formData.get("eventId"),
    logoUrl: formData.get("logoUrl"),
    gameImageUrl: formData.get("gameImageUrl"),
  });

  const event = updateEventMedia(input);
  if (!event) redirect("/admin?error=Event%20not%20found.");
  revalidatePath("/", "layout");
  redirect(`/admin?success=event-media-updated&event=${event.slug}`);
}
```

- [ ] **Step 4: Add the admin media form and render media on public pages**

```tsx
<Section title="Event media" description="Attach optional visual identity to help the public recognize each event quickly.">
  <form action={adminUpdateEventMediaAction} className="grid gap-4">
    <select name="eventId" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
      {events.map((event) => (
        <option key={event.id} value={event.id}>{event.name}</option>
      ))}
    </select>
    <input name="logoUrl" placeholder="https://..." className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" />
    <input name="gameImageUrl" placeholder="https://..." className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" />
    <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">Save event media</button>
  </form>
</Section>
```

- [ ] **Step 5: Run targeted tests and type-check**

Run: `corepack pnpm test -- src/app/events/page.test.ts`
Expected: PASS

Run: `corepack pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/types.ts src/lib/platform/demo-store.ts src/lib/actions.ts src/app/admin/page.tsx src/app/events/page.tsx src/app/events/[slug]/page.tsx src/app/events/page.test.ts
git commit -m "feat: add event media controls and hooks"
```

### Task 6: Create overnight testing datasets and usage notes

**Files:**
- Create: `public/templates/testing/master-multievent-teams.csv`
- Create: `public/templates/testing/miracle-league-8.csv`
- Create: `public/templates/testing/miracle-league-12.csv`
- Create: `public/templates/testing/miracle-league-16.csv`
- Create: `public/templates/testing/miracle-league-24.csv`
- Create: `public/templates/testing/kuroko-summer-cup-8.csv`
- Create: `docs/operations/testing-datasets.md`

**Interfaces:**
- Consumes: current import schema `event_slug,team_name,team_tag,captain_name,captain_contact`
- Produces:
  - reusable master CSV for import realism
  - deterministic scenario CSVs for bracket testing
  - operator note explaining when to use each file

- [ ] **Step 1: Create the master multi-event CSV**

```csv
event_slug,team_name,team_tag,captain_name,captain_contact
miracle-league,NTL,NTL,NTL.Sphero,85136864822
miracle-league,BLAZING FALCONS,BF,AanJR2,85137829047
kuroko-summer-cup,Seirin Reloaded,SR,Riko Aida,08123456789
kuroko-summer-cup,Kaijo Prime,KP,Kise☆R,08198765432
```

- [ ] **Step 2: Create deterministic scenario CSVs for bracket sizes**

```csv
event_slug,team_name,team_tag,captain_name,captain_contact
miracle-league,NTL,NTL,NTL.Sphero,85136864822
miracle-league,76 Apel,76A,Elrond.Jr,89522975196
miracle-league,War4Win,W4W,W4WㅤB4YYㅤツ,88991333343
miracle-league,The BroTher's 2,TB2,Xenn.,895334441843
miracle-league,The BroTher's 4,TB4,Bro丨Coly`☠️,82283220950
miracle-league,EVOS Thunder,EVT,EVT.Skywalker⚡,81234567890
miracle-league,Rex Regum Pro,RRP,RRP丨Lemonade,81398765432
```

- [ ] **Step 3: Write the dataset usage guide**

```md
# Testing datasets

- `master-multievent-teams.csv`: realism import rehearsal for admins
- `miracle-league-8.csv`: fastest single-elimination regression for bye propagation
- `miracle-league-12.csv`: custom-preset bracket generation check
- `miracle-league-16.csv`: full visual bracket regression
- `miracle-league-24.csv`: larger participant and bracket stress pass
- `kuroko-summer-cup-8.csv`: second-game regression so testing is not Flashpeak-only
```

- [ ] **Step 4: Verify files are in place and readable**

Run: `Get-ChildItem public/templates/testing, docs/operations | Select-Object FullName`
Expected: All dataset CSV files and `testing-datasets.md` are listed.

- [ ] **Step 5: Commit**

```bash
git add public/templates/testing docs/operations/testing-datasets.md
git commit -m "docs: add overnight testing datasets"
```

### Task 7: Add browser-driven smoke coverage and final overnight verification

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/overnight-smoke.spec.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/events/[slug]/bracket/page.tsx`

**Interfaces:**
- Consumes: local app at `http://127.0.0.1:3000`, admin login flow, CSV import flow, match result flow
- Produces:
  - `pnpm test:e2e`
  - `pnpm test:e2e:headed`
  - smoke scenario covering admin and public P0 flow

- [ ] **Step 1: Write the failing E2E smoke spec**

```ts
import { expect, test } from "@playwright/test";

test("admin can publish, import, enter a result, and see bracket advancement publicly", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as admin" }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/events/kuroko-summer-cup/bracket");
  await expect(page.getByText("Semifinal")).toBeVisible();
});
```

- [ ] **Step 2: Add Playwright config and scripts**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
  },
});
```

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

- [ ] **Step 3: Run the smoke test to verify it fails before the full flow is complete**

Run: `corepack pnpm test:e2e`
Expected: FAIL before selectors or match-result flow are fully aligned.

- [ ] **Step 4: Align selectors and assertions with the completed overnight flow**

```ts
await page.getByRole("button", { name: "Save match result" }).click();
await page.goto("/events/kuroko-summer-cup/bracket");
await expect(page.getByText("Seirin")).toBeVisible();
await expect(page.getByText("Shutoku")).toBeVisible();
```

- [ ] **Step 5: Run final overnight verification**

Run: `corepack pnpm lint`
Expected: PASS

Run: `corepack pnpm test`
Expected: PASS

Run: `corepack pnpm test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json playwright.config.ts tests/e2e/overnight-smoke.spec.ts src/app/admin/page.tsx src/app/events/[slug]/bracket/page.tsx
git commit -m "test: add overnight smoke coverage"
```
