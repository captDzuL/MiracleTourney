# Bracket Visibility and Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single-elimination brackets update safely before kickoff, lock safely after the first recorded result, and hide future rounds from the public until matchups are actually ready.

**Architecture:** Keep one internal single-elimination projection for advancement logic, then derive a second public-facing visible projection that filters out unresolved future rounds. Use existing event teams plus completed matches as the source of truth, and derive bracket lock state from recorded completed match results rather than introducing a persisted bracket snapshot.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, in-memory demo store tournament engine

## Global Constraints

- Scope is single-elimination MVP behavior only.
- Public bracket must show only rounds that are ready to be understood by the public.
- Before the first recorded result, CSV imports may rebuild bracket projection from the latest entrants.
- After the first recorded result, the bracket is locked and additional imports to that event must fail clearly.
- Bye paths must not expose downstream unresolved rounds.
- Do not add a manual regenerate-bracket control in MVP.
- Follow TDD for every behavior change.

---

## File Structure

- `src/lib/tournament/types.ts`
  - Extend bracket match projection types with explicit readiness and public visibility metadata.
- `src/lib/tournament/engine.ts`
  - Own full internal bracket generation and new public-visible bracket filtering logic.
- `src/lib/tournament/engine.test.ts`
  - Cover readiness, auto-advance, hidden future rounds, and rebuild behavior at the engine layer.
- `src/lib/platform/demo-store.ts`
  - Derive event lock state from completed matches, expose public-visible bracket readers, and guard late imports.
- `src/lib/platform/demo-store.test.ts`
  - Reproduce late-import rebuilds and post-result locking at the store level.
- `src/lib/imports/team-import.ts`
  - Add target-event lock validation in CSV parsing.
- `src/lib/imports/team-import.test.ts`
  - Cover clear operator-facing rejection when importing into a locked event.
- `src/app/events/[slug]/bracket/page.tsx`
  - Render only public-visible bracket rounds, not the raw full projection.
- `src/app/events/[slug]/bracket/page.test.ts`
  - Assert the page relies on the public-visible bracket path and hides future unresolved rounds.
- `tests/e2e/overnight-smoke.spec.ts`
  - Extend browser coverage for pre-kickoff rebuild and post-kickoff import rejection.

## Task 1: Add public bracket visibility metadata in the tournament engine

**Files:**
- Modify: `src/lib/tournament/types.ts`
- Modify: `src/lib/tournament/engine.ts`
- Modify: `src/lib/tournament/engine.test.ts`
- Test: `src/lib/tournament/engine.test.ts`

**Interfaces:**
- Consumes:
  - `generateSingleEliminationBracket(teams: TeamSeed[], slotCount: 8 | 12 | 16 | 24): BracketMatch[]`
  - `projectSingleEliminationBracket(input: { teams: TeamSeed[]; slotCount: 8 | 12 | 16 | 24; results: Match[] }): BracketMatch[]`
- Produces:
  - `type BracketVisibility = "hidden" | "ready" | "auto-advance"`
  - `type BracketMatch = { ...; visibility?: BracketVisibility; isPublicVisible?: boolean }`
  - `getPublicVisibleSingleEliminationBracket(input: { teams: TeamSeed[]; slotCount: 8 | 12 | 16 | 24; results: Match[] }): BracketMatch[]`

- [ ] **Step 1: Write the failing tests**

```ts
it("hides downstream rounds until both sides are known", () => {
  const teams = [
    { id: "team-1", name: "One" },
    { id: "team-2", name: "Two" },
    { id: "team-3", name: "Three" },
    { id: "team-4", name: "Four" },
    { id: "team-5", name: "Five" },
    { id: "team-6", name: "Six" },
  ];

  const visible = getPublicVisibleSingleEliminationBracket({
    teams,
    slotCount: 8,
    results: [],
  });

  expect(visible.every((match) => match.round === 1)).toBe(true);
});

it("shows a semifinal only after both quarterfinal winners are known", () => {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
  }));

  const visible = getPublicVisibleSingleEliminationBracket({
    teams,
    slotCount: 8,
    results: [
      {
        id: "bracket-r1-m1",
        eventId: "event-1",
        roundLabel: "Quarterfinal",
        homeTeamId: "team-1",
        awayTeamId: "team-8",
        homeScore: 21,
        awayScore: 10,
        status: "Completed",
        round: 1,
        slot: 1,
        winnerTeamId: "team-1",
      },
    ],
  });

  expect(visible.some((match) => match.round === 2)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`

Expected: FAIL because `getPublicVisibleSingleEliminationBracket` does not exist and current projection still exposes future rounds.

- [ ] **Step 3: Write minimal implementation**

```ts
export type BracketVisibility = "hidden" | "ready" | "auto-advance";

export function getPublicVisibleSingleEliminationBracket(input: {
  teams: TeamSeed[];
  slotCount: 8 | 12 | 16 | 24;
  results: Match[];
}) {
  return projectSingleEliminationBracket(input)
    .map((match) => {
      const bothTeamsKnown = Boolean(match.homeTeamId && match.awayTeamId);
      const autoAdvance = Boolean(match.byeForTeamId);
      const isPublicVisible = bothTeamsKnown;

      return {
        ...match,
        visibility: autoAdvance ? "auto-advance" : bothTeamsKnown ? "ready" : "hidden",
        isPublicVisible,
      };
    })
    .filter((match) => match.isPublicVisible);
}
```

- [ ] **Step 4: Refine implementation for correct bye behavior**

Update `getPublicVisibleSingleEliminationBracket` so it:

- keeps first-round playable matches visible
- marks bye-source matches as `auto-advance`
- hides downstream rounds until both upstream winners are known
- never emits a future round with only one resolved side

The helper should return only matches where:

```ts
const bothTeamsKnown = Boolean(match.homeTeamId && match.awayTeamId);
const isAutoAdvanceLeaf = Boolean(match.byeForTeamId && match.round === 1);
const isPublicVisible = bothTeamsKnown || isAutoAdvanceLeaf;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm test -- src/lib/tournament/engine.test.ts`

Expected: PASS, including new readiness tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/types.ts src/lib/tournament/engine.ts src/lib/tournament/engine.test.ts
git commit -m "feat: add public visible bracket projection"
```

## Task 2: Lock single-elimination events after the first completed result

**Files:**
- Modify: `src/lib/platform/demo-store.ts`
- Modify: `src/lib/platform/demo-store.test.ts`
- Modify: `src/lib/imports/team-import.ts`
- Modify: `src/lib/imports/team-import.test.ts`
- Test: `src/lib/platform/demo-store.test.ts`
- Test: `src/lib/imports/team-import.test.ts`

**Interfaces:**
- Consumes:
  - `getMatchesForEvent(eventId: string): Match[]`
  - `importTeams(rows: ImportRow[]): Team[]`
  - `getImportSnapshot(): { events: Array<{ id: string; slug: string; participantCap: number }>; teams: Array<{ eventId: string; name: string; tag: string }> }`
- Produces:
  - `isEventBracketLocked(eventId: string): boolean`
  - `getImportSnapshot(): { events: Array<{ id: string; slug: string; participantCap: number; bracketLocked: boolean }>; teams: Array<{ eventId: string; name: string; tag: string }> }`
  - locked-event import rejection: `Event "<event_slug>" already has recorded match results, so additional teams cannot be imported.`

- [ ] **Step 1: Write the failing tests**

```ts
it("treats a single-elimination event as locked after the first completed result", () => {
  resetDemoStore();

  const lockedBefore = isEventBracketLocked("event-kuroko-summer");
  expect(lockedBefore).toBe(true);
});

it("rejects CSV import when the target event already has completed match results", () => {
  resetStore();

  const result = parseAndValidateTeamImport(
    [
      "event_slug,team_name,team_tag,captain_name,captain_contact",
      "kuroko-summer-cup,Late Arrival,LAR,Hanamichi,0800001",
    ].join("\\n"),
    getImportSnapshot(),
  );

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected failed result");
  expect(result.message).toBe(
    'Event "kuroko-summer-cup" already has recorded match results, so additional teams cannot be imported.',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- src/lib/platform/demo-store.test.ts src/lib/imports/team-import.test.ts`

Expected: FAIL because lock state is not exposed in the snapshot and locked-event imports still pass.

- [ ] **Step 3: Write minimal implementation**

```ts
export function isEventBracketLocked(eventId: string) {
  const event = getEventById(eventId);
  if (!event || event.format !== "Single Elimination") return false;

  return getMatchesForEvent(eventId).some((match) => match.status === "Completed");
}
```

Add `bracketLocked` to `getImportSnapshot().events`, then reject locked events near the `event_slug` validation branch:

```ts
if (event.bracketLocked) {
  return fail(`Event "${eventSlug}" already has recorded match results, so additional teams cannot be imported.`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- src/lib/platform/demo-store.test.ts src/lib/imports/team-import.test.ts`

Expected: PASS, including locked-event rejection.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform/demo-store.ts src/lib/platform/demo-store.test.ts src/lib/imports/team-import.ts src/lib/imports/team-import.test.ts
git commit -m "feat: lock single elimination brackets after kickoff"
```

## Task 3: Rebuild bracket projection from late imports before kickoff

**Files:**
- Modify: `src/lib/platform/demo-store.test.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Modify: `src/lib/tournament/engine.test.ts`
- Test: `src/lib/platform/demo-store.test.ts`

**Interfaces:**
- Consumes:
  - `importTeams(rows: ImportRow[]): Team[]`
  - `getBracketPreview(eventId: string): BracketMatch[]`
  - `isEventBracketLocked(eventId: string): boolean`
- Produces:
  - pre-kickoff bracket projection that changes when more teams are imported into the same event

- [ ] **Step 1: Write the failing test**

```ts
it("rebuilds the projected bracket when more teams are imported before kickoff", () => {
  resetDemoStore();

  const created = createEvent({
    name: "Flashpeak 24",
    slug: "flashpeak-24",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    participantCap: 24,
  });

  importTeams(Array.from({ length: 22 }, (_, index) => ({
    eventId: created.id,
    teamName: `Team ${index + 1}`,
    teamTag: `T${String(index + 1).padStart(2, "0")}`,
    captainName: `Captain ${index + 1}`,
    captainContact: `08${index + 1}`,
  })));

  const before = getBracketPreview(created.id);

  importTeams([
    {
      eventId: created.id,
      teamName: "Team 23",
      teamTag: "T23",
      captainName: "Captain 23",
      captainContact: "0823",
    },
    {
      eventId: created.id,
      teamName: "Team 24",
      teamTag: "T24",
      captainName: "Captain 24",
      captainContact: "0824",
    },
  ]);

  const after = getBracketPreview(created.id);

  expect(after).not.toEqual(before);
  expect(after.filter((match) => match.round === 1).length).toBeGreaterThanOrEqual(
    before.filter((match) => match.round === 1).length,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- src/lib/platform/demo-store.test.ts`

Expected: FAIL because current projection behavior is not asserted around pre-kickoff reshaping.

- [ ] **Step 3: Write minimal implementation**

No new persisted bracket state is required. Keep `getBracketPreview(eventId)` derived from current teams plus matches:

```ts
if (event.format === "Single Elimination") {
  return projectSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: event.participantCap,
    results: getMatchesForEvent(eventId),
  });
}
```

Refactor only enough to ensure:

- completed-result lock prevents post-kickoff entrants
- pre-kickoff team imports naturally change the derived projection
- no stale cached shape survives between imports

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- src/lib/platform/demo-store.test.ts`

Expected: PASS, proving the late-import projection actually reshapes before kickoff.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform/demo-store.ts src/lib/platform/demo-store.test.ts src/lib/tournament/engine.test.ts
git commit -m "test: cover pre-kickoff bracket rebuild behavior"
```

## Task 4: Switch the public bracket page to the visible-round projection

**Files:**
- Modify: `src/app/events/[slug]/bracket/page.tsx`
- Modify: `src/app/events/[slug]/bracket/page.test.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Test: `src/app/events/[slug]/bracket/page.test.ts`

**Interfaces:**
- Consumes:
  - `getEventBySlug(slug: string): Event | null`
  - `getTeamsForEvent(eventId: string): Team[]`
  - `getPublicVisibleBracketPreview(eventId: string): BracketMatch[]`
- Produces:
  - `getPublicVisibleBracketPreview(eventId: string): BracketMatch[]`
  - public bracket page rendering only ready rounds

- [ ] **Step 1: Write the failing test**

```ts
test("reads public-visible bracket data instead of the raw full projection", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

  expect(source).toContain("getPublicVisibleBracketPreview");
  expect(source).not.toContain("getBracketPreview(event.id)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- src/app/events/[slug]/bracket/page.test.ts`

Expected: FAIL because the page still reads the raw full bracket projection.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/platform/demo-store.ts`, add:

```ts
export function getPublicVisibleBracketPreview(eventId: string) {
  const event = getEventById(eventId);
  if (!event || event.format !== "Single Elimination") return getBracketPreview(eventId);

  const teamSeeds = getTeamsForEvent(eventId).map((team) => ({ id: team.id, name: team.name }));

  return getPublicVisibleSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: event.participantCap,
    results: getMatchesForEvent(eventId),
  });
}
```

Then switch the page to:

```ts
const bracket = getPublicVisibleBracketPreview(event.id);
```

Render only returned rounds; do not rebuild hidden future groups in the page component itself.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- src/app/events/[slug]/bracket/page.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/events/[slug]/bracket/page.tsx src/app/events/[slug]/bracket/page.test.ts src/lib/platform/demo-store.ts
git commit -m "feat: hide unresolved future rounds on public bracket page"
```

## Task 5: Extend browser smoke coverage for late imports and lock behavior

**Files:**
- Modify: `tests/e2e/overnight-smoke.spec.ts`
- Test: `tests/e2e/overnight-smoke.spec.ts`

**Interfaces:**
- Consumes:
  - current admin login flow
  - current CSV import flow
  - public bracket page
  - admin match result flow
- Produces:
  - browser proof that pre-kickoff import changes bracket behavior
  - browser proof that post-kickoff import is rejected clearly

- [ ] **Step 1: Write the failing E2E steps**

Add a scenario segment that:

```ts
await page.goto("/admin");
await page.setInputFiles('input[name="csv"]', "tests/fixtures/import-22.csv");
await page.getByRole("button", { name: /Upload and import/i }).click();

await page.goto("/events/flashpeak-24/bracket");
await expect(page.getByText(/Quarterfinal/i)).not.toBeVisible();

await page.goto("/admin");
await page.setInputFiles('input[name="csv"]', "tests/fixtures/import-2-more.csv");
await page.getByRole("button", { name: /Upload and import/i }).click();

await page.goto("/events/flashpeak-24/bracket");
await expect(page.getByText(/Round of 16|Quarterfinal/i)).toBeVisible();
```

Then, after recording the first result:

```ts
await page.goto("/admin");
await page.setInputFiles('input[name="csv"]', "tests/fixtures/late-import-after-lock.csv");
await page.getByRole("button", { name: /Upload and import/i }).click();
await expect(page.getByText(/already has recorded match results/i)).toBeVisible();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test:e2e`

Expected: FAIL because current bracket page still exposes future rounds too early and import remains allowed after kickoff.

- [ ] **Step 3: Add the minimal fixtures and assertions**

Create or adapt fixture CSV files under `tests/fixtures/` so they match:

```csv
event_slug,team_name,team_tag,captain_name,captain_contact
flashpeak-24,Team 1,T01,Captain 1,0801
```

Use one file with the first 22 teams, one file with teams 23-24, and one locked-event file aimed at an event with a recorded result.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test:e2e`

Expected: PASS with clear late-import rejection after the first recorded result.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/overnight-smoke.spec.ts tests/fixtures
git commit -m "test: cover bracket rebuild and lock flows in browser smoke"
```

## Self-Review

### Spec coverage

- Public users no longer see future unresolved rounds: covered by Tasks 1 and 4.
- Late imports before kickoff rebuild the bracket: covered by Task 3 and Task 5.
- First recorded result locks the bracket: covered by Task 2 and Task 5.
- Byes stop leaking empty later rounds: covered by Task 1 and Task 4.

No spec gaps remain.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation placeholders remain.
- Every task includes file targets, tests, commands, and commit message guidance.

### Type consistency

- Public projection function name is consistently `getPublicVisibleSingleEliminationBracket`.
- Store-facing wrapper function name is consistently `getPublicVisibleBracketPreview`.
- Lock helper is consistently `isEventBracketLocked`.

