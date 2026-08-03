# Launch Operations CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the launch-week operating flow where admins import team registrations from Google Form CSV, public event pages show only public-ready event data, and tournament views project from imported teams.

**Architecture:** Keep launch work inside the existing Next.js app and demo-store architecture, but carve out a dedicated CSV import pipeline with parser, validator, and atomic write entrypoint. Public pages become read-only consumers of event-scoped data, while admin pages own event creation, stream updates, and CSV import.

**Tech Stack:** Next.js App Router, React Server Components, server actions, TypeScript, Zod, Vitest, in-memory demo store for current launch path

## Global Constraints

- Registration remains outside the app through Google Form for the launch week.
- CSV import is the official admin ingestion path for team registrations.
- Each CSV row represents one team.
- Required CSV columns are exactly `event_slug`, `team_name`, `captain_name`, and `captain_contact`.
- Optional CSV column is exactly `team_tag`.
- Empty `team_tag` values must auto-generate from the team name.
- CSV import must validate the full file before writing anything.
- Invalid `event_slug` values reject the entire file.
- Duplicate `team_name` values in the same event reject the entire file.
- Validation must report all detected errors in one pass with clear row-level messages.
- Draft events are not shown publicly.
- Imported participants affect only the intended event.
- Launch deployment stays on Vercel plus Neon; Docker is not part of the launch path.

---

### Task 1: Correct event visibility and event-scoped reads

**Files:**
- Modify: `src/lib/platform/demo-store.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/events/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Modify: `src/app/events/[slug]/leaderboards/page.tsx`
- Modify: `src/app/events/[slug]/standings/page.tsx`
- Test: `src/lib/tournament/engine.test.ts`

**Interfaces:**
- Consumes: `getEvents(): Event[]`, `getEventBySlug(slug: string): Event | undefined`, `getMatchesForEvent(eventId: string): Match[]`
- Produces: `getPublicEvents(): Event[]`, `getLeaderboardForEvent(eventId: string): AggregatedPlayerLeaderboardEntry[]`, `getTeamStandings(eventId: string): TeamStanding[]`

- [ ] **Step 1: Write the failing tests for public visibility and event scoping**

```ts
describe("launch visibility", () => {
  it("hides draft events from public lists", () => {
    const events = getPublicEvents();
    expect(events.some((event) => event.status === "Draft")).toBe(false);
  });

  it("keeps leaderboard scoped to the selected event", () => {
    const leaderboard = getLeaderboardForEvent("event-flashpeak-open");
    expect(leaderboard.every((entry) => ["player-rin", "player-bima", "player-dino", "player-eko", "player-faris"].includes(entry.playerId))).toBe(true);
  });

  it("awards one point each for a draw in league standings", () => {
    const standings = getTeamStandings("event-flashpeak-open");
    const vortex = standings.find((team) => team.teamName === "Vortex");
    const scorch = standings.find((team) => team.teamName === "Scorch FC");
    expect(vortex?.points).toBe(1);
    expect(scorch?.points).toBe(1);
  });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `corepack pnpm vitest run src/lib/tournament/engine.test.ts`
Expected: FAIL because `getPublicEvents` does not exist yet and standings or leaderboard assertions do not match current behavior.

- [ ] **Step 3: Implement public-only event selectors and event-scoped aggregation**

```ts
export function getPublicEvents() {
  return getStore().events.filter((event) => event.status !== "Draft");
}

export function getLeaderboardForEvent(eventId: string) {
  const matchIds = new Set(getMatchesForEvent(eventId).map((match) => match.id));
  const event = getStore().events.find((item) => item.id === eventId);
  if (!event) return [];
  const game = getGameForEvent(event);
  const metric = game.slug === "flashpeak" ? "goals" : "points";
  return aggregatePlayerLeaderboard(
    getStore().playerStats.filter((stat) => matchIds.has(stat.matchId)),
    metric,
  );
}
```

- [ ] **Step 4: Update public pages to consume the new selector**

```ts
const events = getPublicEvents();

if (!event || event.status === "Draft") {
  notFound();
}
```

- [ ] **Step 5: Adjust league standings for draws and rerun tests**

```ts
if (result.homeScore === result.awayScore) {
  home.draws += 1;
  away.draws += 1;
  home.points += 1;
  away.points += 1;
} else if (result.homeScore > result.awayScore) {
  home.wins += 1;
  away.losses += 1;
  home.points += 3;
} else {
  away.wins += 1;
  home.losses += 1;
  away.points += 3;
}
```

Run: `corepack pnpm vitest run src/lib/tournament/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/demo-store.ts src/app/page.tsx src/app/events/page.tsx src/app/events/[slug]/page.tsx src/app/events/[slug]/leaderboards/page.tsx src/app/events/[slug]/standings/page.tsx src/lib/tournament/engine.test.ts
git commit -m "fix: scope public events and event aggregations"
```

### Task 2: Add launch-ready team import domain types and CSV validation pipeline

**Files:**
- Modify: `src/lib/platform/types.ts`
- Create: `src/lib/imports/team-import.ts`
- Create: `src/lib/imports/team-import.test.ts`
- Modify: `src/lib/platform/demo-store.ts`

**Interfaces:**
- Consumes: `getEvents(): Event[]`, `getTeamsForEvent(eventId: string): Team[]`
- Produces: `type TeamImportRow`, `type TeamImportError`, `parseTeamImportCsv(csvText: string): TeamImportRow[]`, `validateTeamImportRows(rows: TeamImportRow[], events: Event[], teams: Team[]): TeamImportError[]`, `importTeamsFromRows(rows: TeamImportRow[]): { importedCount: number }`

- [ ] **Step 1: Write failing tests for CSV parsing, validation, and atomic import**

```ts
it("collects all CSV validation errors in one pass", () => {
  const csv = [
    "event_slug,team_name,team_tag,captain_name,captain_contact",
    "missing-event,Miracle Wolves,MW,Riko,08123",
    "flashpeak-open-league,,,Dino,",
    "flashpeak-open-league,Scorch FC,,Faris,08999",
  ].join("\n");

  const result = parseAndValidateTeamImport(csv, seedStore());
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual([
    expect.stringContaining('Row 2: event_slug "missing-event" was not found'),
    expect.stringContaining('Row 3: team_name is required'),
    expect.stringContaining('Row 3: captain_contact is required'),
    expect.stringContaining('Row 4: team_name "Scorch FC" is already registered for event "flashpeak-open-league"'),
  ]);
});

it("auto-generates a team tag when team_tag is empty", () => {
  const csv = [
    "event_slug,team_name,team_tag,captain_name,captain_contact",
    "flashpeak-open-league,Vortex Prime,,Eko,08111",
  ].join("\n");

  const result = parseAndValidateTeamImport(csv, seedStore());
  expect(result.ok).toBe(true);
  expect(result.rows[0].teamTag).toBe("VP");
});
```

- [ ] **Step 2: Run the new import tests to verify they fail**

Run: `corepack pnpm vitest run src/lib/imports/team-import.test.ts`
Expected: FAIL because the import module does not exist yet.

- [ ] **Step 3: Add import-specific types and parsing helpers**

```ts
export type TeamImportRow = {
  eventSlug: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
};

export type TeamImportError = {
  rowNumber: number;
  message: string;
};

export function buildTeamTag(teamName: string) {
  return teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || teamName.slice(0, 2).toUpperCase();
}
```

- [ ] **Step 4: Implement whole-file CSV validation with duplicate detection**

```ts
const requiredHeaders = ["event_slug", "team_name", "captain_name", "captain_contact"] as const;

export function validateTeamImportRows(rows: TeamImportRow[], events: Event[], teams: Team[]) {
  const errors: TeamImportError[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const event = events.find((item) => item.slug === row.eventSlug);
    if (!event) {
      errors.push({ rowNumber, message: `Row ${rowNumber}: event_slug "${row.eventSlug}" was not found` });
      return;
    }

    if (!row.teamName) errors.push({ rowNumber, message: `Row ${rowNumber}: team_name is required` });
    if (!row.captainName) errors.push({ rowNumber, message: `Row ${rowNumber}: captain_name is required` });
    if (!row.captainContact) errors.push({ rowNumber, message: `Row ${rowNumber}: captain_contact is required` });

    const key = `${event.id}::${row.teamName.toLowerCase()}`;
    if (seenKeys.has(key) || teams.some((team) => team.eventId === event.id && team.name.toLowerCase() === row.teamName.toLowerCase())) {
      errors.push({ rowNumber, message: `Row ${rowNumber}: team_name "${row.teamName}" is already registered for event "${row.eventSlug}"` });
    }
    seenKeys.add(key);
  });

  return errors;
}
```

- [ ] **Step 5: Add atomic import writer into the store layer and rerun tests**

```ts
export function importTeamsFromRows(rows: TeamImportRow[]) {
  const store = getStore();
  const importedTeams = rows.map((row) => {
    const event = store.events.find((item) => item.slug === row.eventSlug)!;
    return {
      id: `team-${event.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eventId: event.id,
      captainId: `imported-${Date.now()}`,
      name: row.teamName,
      logoText: row.teamTag.slice(0, 2).toUpperCase(),
      tag: row.teamTag,
      captainName: row.captainName,
      captainContact: row.captainContact,
    };
  });

  store.teams.push(...importedTeams);
  return { importedCount: importedTeams.length };
}
```

Run: `corepack pnpm vitest run src/lib/imports/team-import.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/types.ts src/lib/imports/team-import.ts src/lib/imports/team-import.test.ts src/lib/platform/demo-store.ts
git commit -m "feat: add launch csv team import pipeline"
```

### Task 3: Wire admin CSV upload into server actions and admin UI

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Create: `public/templates/team-import-template.csv`
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Consumes: `parseAndValidateTeamImport(csvText: string, storeSnapshot: DemoStateLike): ParseResult`, `importTeamsFromRows(rows: TeamImportRow[]): { importedCount: number }`
- Produces: `adminImportTeamsCsvAction(formData: FormData): Promise<void>`, `ImportResultBanner` UI behavior via query params

- [ ] **Step 1: Write a failing action-level test or harness for CSV upload handling**

```ts
it("rejects CSV uploads with validation errors and preserves store state", async () => {
  const formData = new FormData();
  formData.set("csvFile", new File([
    "event_slug,team_name,team_tag,captain_name,captain_contact\nmissing-event,New Team,,Ari,0812"
  ], "teams.csv", { type: "text/csv" }));

  await expect(adminImportTeamsCsvAction(formData)).rejects.toThrow();
  expect(getTeamsForEvent("event-flashpeak-open")).toHaveLength(4);
});
```

- [ ] **Step 2: Run the targeted test or local harness to verify failure**

Run: `corepack pnpm vitest run src/lib/imports/team-import.test.ts`
Expected: FAIL or missing action integration.

- [ ] **Step 3: Implement the server action that reads file text and redirects with success or errors**

```ts
export async function adminImportTeamsCsvAction(formData: FormData) {
  const file = formData.get("csvFile");
  if (!(file instanceof File)) {
    redirect("/admin?error=csv-file-required");
  }

  const csvText = await file.text();
  const result = parseAndValidateTeamImport(csvText, getImportSnapshot());

  if (!result.ok) {
    redirect(`/admin?importError=${encodeURIComponent(result.errors.join(" | "))}`);
  }

  const imported = importTeamsFromRows(result.rows);
  redirect(`/admin?success=teams-imported&count=${imported.importedCount}`);
}
```

- [ ] **Step 4: Add admin upload form, CSV template download, and clear feedback UI**

```tsx
<form action={adminImportTeamsCsvAction} className="grid gap-4" encType="multipart/form-data">
  <label className="grid gap-2 text-sm text-slate-300">
    Team CSV
    <input type="file" name="csvFile" accept=".csv,text/csv" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" />
  </label>
  <a href="/templates/team-import-template.csv" className="text-sm text-cyan-300 underline">Download CSV template</a>
  <button type="submit" className="rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950">Import teams</button>
</form>
```

- [ ] **Step 5: Add human-readable error rendering and manually verify in the browser**

Run: `corepack pnpm dev`
Expected: `/admin` shows a dedicated import section, template link works, invalid uploads redirect with readable messages, and valid uploads redirect with imported count.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions.ts src/app/admin/page.tsx src/components/ui.tsx public/templates/team-import-template.csv
git commit -m "feat: add admin csv upload workflow"
```

### Task 4: Update participant-facing views to reflect imported team and PIC data

**Files:**
- Modify: `src/app/events/[slug]/participants/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Modify: `src/lib/platform/types.ts`
- Modify: `src/lib/platform/demo-store.ts`
- Test: `src/lib/imports/team-import.test.ts`

**Interfaces:**
- Consumes: `Team` with captain metadata, `getTeamsForEvent(eventId: string): Team[]`
- Produces: participants table rows showing team and PIC data, public event summary counts derived from imported teams

- [ ] **Step 1: Write the failing test for imported team metadata visibility**

```ts
it("stores imported captain metadata on the created team record", () => {
  const result = importTeamsFromRows([
    {
      eventSlug: "flashpeak-open-league",
      teamName: "Skyline FC",
      teamTag: "SF",
      captainName: "Raka",
      captainContact: "08123",
    },
  ]);

  expect(result.importedCount).toBe(1);
  const importedTeam = getTeamsForEvent("event-flashpeak-open").find((team) => team.name === "Skyline FC");
  expect(importedTeam).toMatchObject({ captainName: "Raka", captainContact: "08123" });
});
```

- [ ] **Step 2: Run the relevant tests to verify they fail**

Run: `corepack pnpm vitest run src/lib/imports/team-import.test.ts`
Expected: FAIL because `Team` does not yet carry imported PIC metadata.

- [ ] **Step 3: Extend the `Team` type and seed data with optional captain metadata fields**

```ts
export type Team = {
  id: string;
  eventId: string;
  captainId: string;
  name: string;
  logoText: string;
  tag: string;
  captainName?: string;
  captainContact?: string;
};
```

- [ ] **Step 4: Update the participants page to show PIC information instead of empty roster-only cells**

```tsx
<DataTable
  columns={["Team", "Tag", "PIC", "Contact", "Roster"]}
  rows={teams.map((team) => [
    team.name,
    team.tag,
    team.captainName ?? "Not assigned",
    team.captainContact ?? "Not assigned",
    getPlayersForTeam(team.id).length > 0
      ? getPlayersForTeam(team.id).map((player) => `${player.nickname} (${player.position})`).join(", ")
      : "Roster will be completed after launch",
  ])}
/>
```

- [ ] **Step 5: Manually verify event detail and participants pages with imported teams**

Run: `corepack pnpm dev`
Expected: imported teams increase participant counts on `/events/[slug]`, and `/events/[slug]/participants` shows PIC name and contact clearly.

- [ ] **Step 6: Commit**

```bash
git add src/app/events/[slug]/participants/page.tsx src/app/events/[slug]/page.tsx src/lib/platform/types.ts src/lib/platform/demo-store.ts src/lib/imports/team-import.test.ts
git commit -m "feat: expose imported pic data on public event views"
```

### Task 5: Reframe captain flow out of the launch path and add launch documentation aids

**Files:**
- Modify: `src/app/captain/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/page.tsx`
- Create: `docs/operations/team-import-template-notes.md`
- Test: manual browser verification notes in the operations doc

**Interfaces:**
- Consumes: existing captain routes and launch strategy from the approved spec
- Produces: copy and UI that clearly position captain features as post-launch follow-up, plus admin-facing docs for valid CSV usage

- [ ] **Step 1: Write the failing copy expectations as a simple review checklist in the operations doc stub**

```md
- Home page must not imply that in-app captain registration is the primary launch path.
- Login page must explain that demo captain access is a later-stage workflow.
- Captain dashboard must describe roster completion as post-launch follow-up.
- Operations notes must list the exact CSV headers and sample event_slug values.
```

- [ ] **Step 2: Create the operations notes document with exact CSV guidance**

```md
# Team import template notes

Required headers:
- event_slug
- team_name
- captain_name
- captain_contact

Optional headers:
- team_tag

Sample event_slug values:
- kuroko-summer-cup
- flashpeak-open-league
```

- [ ] **Step 3: Update launch copy in the public home, login, and captain pages**

```tsx
<p>Registration remains in Google Form for this launch week. Admins publish approved teams through CSV import.</p>
```

```tsx
<p>This captain area is reserved for roster completion after the site is live.</p>
```

- [ ] **Step 4: Manually verify launch copy in the browser**

Run: `corepack pnpm dev`
Expected: home page, login page, and captain page all reflect the launch-week operating model and do not mislead admins into expecting in-app registration.

- [ ] **Step 5: Commit**

```bash
git add src/app/captain/page.tsx src/app/login/page.tsx src/app/page.tsx docs/operations/team-import-template-notes.md
git commit -m "docs: align launch copy with csv import operations"
```

### Task 6: Full verification sweep and merge-readiness report

**Files:**
- Modify: `docs/operations/team-import-template-notes.md`
- Modify: `docs/superpowers/specs/2026-07-31-launch-ops-csv-import-design.md`
- Modify: `docs/superpowers/plans/2026-07-31-launch-ops-csv-import.md`

**Interfaces:**
- Consumes: completed Tasks 1-5
- Produces: verified evidence log for launch readiness, updated docs where verification reveals wording gaps

- [ ] **Step 1: Run the focused automated checks**

Run: `corepack pnpm vitest run src/lib/tournament/engine.test.ts src/lib/imports/team-import.test.ts`
Expected: PASS

- [ ] **Step 2: Run the typecheck and production build**

Run: `corepack pnpm lint`
Expected: PASS

Run: `corepack pnpm build`
Expected: PASS

- [ ] **Step 3: Manually verify the launch-critical flows**

Run: `corepack pnpm dev`
Expected:
- `/admin` can download the CSV template
- invalid CSV upload reports all row-level errors
- valid CSV upload imports teams
- `/events` hides draft events
- `/events/[slug]/participants` shows imported teams and PIC data
- `/events/[slug]/bracket` reflects imported team count
- `/events/[slug]/standings` remains stable
- livestream rendering still works on the event detail page

- [ ] **Step 4: Record final verification notes in the operations doc if needed**

```md
## Dry-run checklist
- Import a CSV with one invalid event_slug and confirm the whole file is rejected.
- Import a valid CSV with one blank team_tag and confirm the generated tag appears publicly.
- Verify the public event list hides draft events.
```

- [ ] **Step 5: Commit**

```bash
git add docs/operations/team-import-template-notes.md docs/superpowers/specs/2026-07-31-launch-ops-csv-import-design.md docs/superpowers/plans/2026-07-31-launch-ops-csv-import.md
git commit -m "chore: record launch verification guidance"
```
