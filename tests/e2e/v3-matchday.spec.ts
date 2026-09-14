import { expect, test, type Page } from "@playwright/test";
import { loginAsOrganizer } from "./helpers/auth";
import { matchdayDb, prepareMatchdayFixture, type MatchdayKind } from "./helpers/matchday";
import type { CompetitionWorkspaceState } from "../../src/lib/competition/workspace-types";
import type { PublicOngoingEventViewModel } from "../../src/lib/events/public-ongoing-types";

type Fixture = Awaited<ReturnType<typeof prepareMatchdayFixture>>;
let fixture: Fixture;

test.setTimeout(120_000);

const POLL_TIMEOUT_MS = 60_000;
const ASSERT_TIMEOUT_MS = 20_000;
const NAV_TIMEOUT_MS = 60_000;
const API_TIMEOUT_MS = 20_000;
const API_RETRY_COUNT = 3;

test.afterEach(async () => {
  if (fixture) await fixture.cleanup();
});

async function requestJson<T>(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= API_RETRY_COUNT; attempt += 1) {
    try {
      const response = await page.request.fetch(path, {
        maxRedirects: 0,
        timeout: API_TIMEOUT_MS,
      });
      if (!response.ok()) {
        const body = await response.text().catch(() => "");
        throw new Error(`Request failed for ${path}: ${response.status()} ${response.statusText()}\n${body}`.trim());
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= API_RETRY_COUNT) {
        throw error instanceof Error ? error : new Error(`Request failed for ${path}: ${String(error)}`);
      }
      await page.waitForTimeout(500 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${path}`);
}

async function state(page: Page) {
  return requestJson<CompetitionWorkspaceState>(page, `/api/organizer/events/${fixture.id}/competition`);
}

async function publicState(page: Page) {
  return requestJson<PublicOngoingEventViewModel>(page, `/api/events/${fixture.slug}/ongoing`);
}
async function openMatch(page: Page, id: string) {
  const response = await page.goto(`/en/organizer/events/${fixture.id}/matches/${id}`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT_MS,
  });
  if (!response) {
    throw new Error(`No response while opening /en/organizer/events/${fixture.id}/matches/${id}`);
  }
  if (!response.ok()) {
    throw new Error(`openMatch failed: ${response.status()} ${response.statusText()} for match ${id}`);
  }
  await expect(page.getByRole("heading", { name: "Official result", exact: true })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
}

async function openSchedule(page: Page, linkName: "Schedule" | "Review schedule impact") {
  await page.getByRole("link", { name: linkName, exact: true }).click();
  await page.waitForURL(/\/schedule$/, { timeout: NAV_TIMEOUT_MS });
  await expect(page.getByRole("heading", { name: "Schedule generation", exact: true })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
}

async function result(page: Page, matchId: string, home = "2", away = "0") {
  const form = page.getByRole("form", { name: "Official result", exact: true });
  const submit = form.getByRole("button", { name: "Submit official result", exact: true });
  await expect(submit).toBeEnabled({ timeout: ASSERT_TIMEOUT_MS });
  await form.locator('input[name="home-1"]').fill(home);
  await form.locator('input[name="away-1"]').fill(away);
  await submit.click();
  await expect.poll(
    async () => (await matchdayDb.match.findUnique({ where: { id: matchId }, select: { resultVersion: true } }))?.resultVersion,
    { timeout: POLL_TIMEOUT_MS },
  ).toBe(1);
  await expect(form.getByRole("button", { name: "Preview correction", exact: true })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
}

test("generates competition, reviews the initial schedule and publishes explicitly", async ({ page }) => {
  fixture = await prepareMatchdayFixture("single_elimination", "empty");
  await loginAsOrganizer(page, "en");
  await page.goto(`/en/organizer/events/${fixture.id}/competition`);
  await page.getByRole("button", { name: "Save drawing draft", exact: true }).click();
  await expect.poll(async () => (await state(page)).drawing?.status, { timeout: POLL_TIMEOUT_MS }).toBe("draft");
  await page.getByRole("button", { name: "Publish drawing", exact: true }).click();
  await expect.poll(async () => (await state(page)).drawing?.status, { timeout: POLL_TIMEOUT_MS }).toBe("published");
  await expect.poll(async () => (await state(page)).matches.length, { timeout: POLL_TIMEOUT_MS }).toBe(3);
  await matchdayDb.event.update({
    where: { id: fixture.id },
    data: { status: "Ongoing" },
  });
  await openSchedule(page, "Schedule");
  await page.getByLabel("Window end", { exact: true }).fill("2026-01-02T09:00");
  await page.getByLabel("Rooms (comma separated)", { exact: true }).fill("Arena A, Arena B");
  await page.getByRole("button", { name: "Generate schedule preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });

  const [organizerPreview, unpublishedPublic] = await Promise.all([state(page), publicState(page)]);
  expect(organizerPreview.publishedSchedule).toBeNull();
  expect(JSON.stringify(unpublishedPublic)).not.toContain("Arena A");

  await page.getByRole("button", { name: "Reload schedule", exact: true }).click();
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await state(page)).publishedSchedule?.draft.assignments.length, { timeout: POLL_TIMEOUT_MS }).toBe(3);
  await expect.poll(async () => JSON.stringify(await publicState(page)), { timeout: POLL_TIMEOUT_MS }).toContain("Arena A");
});

test("marks a delay, reviews downstream impact and publishes a schedule revision", async ({ page }) => {
  fixture = await prepareMatchdayFixture();
  const graph = await fixture.graph();
  await loginAsOrganizer(page, "en");
  await openMatch(page, graph.matches[0].id);

  const before = (await state(page)).publishedSchedule;
  const form = page.getByRole("form", { name: "Mark delayed and preview impact" });
  await form.getByLabel("Revised estimated end").fill("2026-01-01T10:30");
  await form.getByLabel("Delay reason").fill("Room equipment outage");
  await form.getByRole("button", { name: "Mark delayed and preview impact" }).click();
  await expect.poll(async () => (await state(page)).matches[0].scheduleStatus, { timeout: POLL_TIMEOUT_MS }).toBe("delayed");
  expect((await state(page)).publishedSchedule?.version).toBe(before?.version);

  await openSchedule(page, "Review schedule impact");
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
  await expect(page.getByText("Before:", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await state(page)).publishedSchedule?.version, { timeout: POLL_TIMEOUT_MS }).not.toBe(before?.version);
  expect(JSON.stringify(await publicState(page))).toContain("2026-01-01T03:30:00.000Z");
});

test("reviews a live overrun without moving the live match or exposing its estimate before publish", async ({ page }) => {
  fixture = await prepareMatchdayFixture();
  const id = (await fixture.graph()).matches[0].id;
  await fixture.run({ kind: "match_start", matchId: id, reason: "Both teams at desk" });
  const original = await matchdayDb.match.findUniqueOrThrow({ where: { id } });

  await loginAsOrganizer(page, "en");
  await openMatch(page, id);

  const before = (await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id);
  if (!before) {
    throw new Error(`Expected match ${id} to be present in public live state`);
  }
  const form = page.getByRole("form", { name: "Mark delayed and preview impact" });
  await form.getByLabel("Revised estimated end").fill("2026-01-01T10:30");
  await form.getByLabel("Delay reason").fill("Live series technical pause");
  await form.getByRole("button", { name: "Mark delayed and preview impact" }).click();

  await expect.poll(async () => (await state(page)).matches.find(m => m.id === id)?.scheduleStatus, { timeout: POLL_TIMEOUT_MS }).toBe("delayed");
  expect((await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id)).toMatchObject({ status: "live", end: before.end });

  await openSchedule(page, "Review schedule impact");
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id)?.end, { timeout: POLL_TIMEOUT_MS }).toBe("2026-01-01T03:30:00.000Z");

  const persisted = await matchdayDb.match.findUniqueOrThrow({ where: { id } });
  expect(persisted).toMatchObject({
    status: "Live",
    scheduledAt: original.scheduledAt,
    scheduleRoom: original.scheduleRoom,
    actualStartedAt: original.actualStartedAt,
  });
});

test("readiness deadline raises an action without walkover, organizer can override start", async ({ page }) => {
  fixture = await prepareMatchdayFixture();
  const graph = await fixture.graph();
  const id = graph.matches[0].id;

  await loginAsOrganizer(page, "en");
  await openMatch(page, id);

  await page.getByRole("button", { name: "Check readiness deadline" }).click();
  await expect.poll(async () => (await state(page)).actions.length, { timeout: POLL_TIMEOUT_MS }).toBe(2);
  const pending = (await state(page)).matches.find(m => m.id === id)!;
  expect(pending.resultVersion).toBe(0);
  expect(pending.status).toBe("Scheduled");

  await page.getByRole("button", { name: "Team 1: checked in", exact: true }).click();
  await expect.poll(async () => (await state(page)).readiness[0]?.status, { timeout: POLL_TIMEOUT_MS }).toBe("checked_in");

  const start = page.getByRole("form", { name: "Start match", exact: true });
  const startButton = start.getByRole("button", { name: "Start match", exact: true });
  await expect(startButton).toBeEnabled();
  await start.getByLabel("Override reason (if needed)").fill("Confirmed both captains at desk");
  await startButton.click();
  await expect.poll(async () => (await state(page)).matches.find(m => m.id === id)?.status, { timeout: POLL_TIMEOUT_MS }).toBe("Live");
  expect((await matchdayDb.match.findUniqueOrThrow({ where: { id } })).actualStartedAt).not.toBeNull();

  await page.goto(`/en/events/${fixture.slug}`);
  await expect(page.getByRole("heading", { name: /Live now/i })).toBeVisible();
});

for (const kind of ["single_elimination", "double_elimination", "round_robin", "group_playoffs"] as MatchdayKind[]) {
  test(`official ${kind} result advances the authoritative competition and public state`, async ({ page }) => {
    fixture = await prepareMatchdayFixture(kind);
    const graph = await fixture.graph();
    const match = graph.matches[0];

    await fixture.run({ kind: "match_start", matchId: match.id, reason: "Both teams confirmed at desk" });
    await loginAsOrganizer(page, "en");
    await openMatch(page, match.id);
    await result(page, match.id);
    if (kind === "group_playoffs") {
      for (const groupMatch of graph.matches.filter(m => m.groupId && m.id !== match.id)) {
        await fixture.run({ kind: "match_start", matchId: groupMatch.id, reason: "Group fixture setup" });
        await fixture.run({ kind: "result_submit", matchId: groupMatch.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
      }
    }

    const updated = await state(page);
    const completed = updated.matches.find(m => m.id === match.id)!;

    if (kind === "group_playoffs") {
      for (const node of graph.matches.filter(m => !m.groupId && m.round === 1)) {
        expect(updated.matches.find(m => m.id === node.id)?.homeTeamId).toBeTruthy();
        expect(updated.matches.find(m => m.id === node.id)?.awayTeamId).toBeTruthy();
      }
    }

    expect(completed).toMatchObject({ status: "Completed", resultVersion: 1, homeScore: 2, awayScore: 0 });
    for (const edge of graph.dependencies.filter(d => d.sourceMatchId === match.id)) {
      expect(updated.matches.find(m => m.id === edge.targetMatchId)?.[`${edge.targetSlot}TeamId`]).toBe(edge.outcome === "winner" ? completed.homeTeamId : completed.awayTeamId);
    }
    if (kind === "round_robin" || kind === "group_playoffs") {
      expect(updated.standings.flatMap(t => t.rows).find(r => r.teamId === completed.homeTeamId)?.points).toBe(3);
    }

    const publicData = JSON.stringify(await publicState(page));
    expect(publicData).toContain(match.id);
    expect(publicData).not.toContain("Official result submission");

    await page.goto(`/en/events/${fixture.slug}`);
    await expect(page.getByRole("heading", { name: "Recent official results", exact: true })).toBeVisible();
    await expect(page.getByText(/2\s(?:-|–)\s0/, { exact: true }).first()).toBeVisible();
  });
}

test("allows a reviewed correction, then rejects correction once its downstream match is live", async ({ page }) => {
  fixture = await prepareMatchdayFixture();
  const graph = await fixture.graph();
  const first = graph.matches[0];

  await fixture.run({ kind: "match_start", matchId: first.id, reason: "Both teams confirmed at desk" });
  await loginAsOrganizer(page, "en");
  await openMatch(page, first.id);
  await result(page, first.id);
  await page.getByRole("button", { name: "Reload official result", exact: true }).click();
  const form = page.getByRole("form", { name: "Official result", exact: true });
  await form.locator('input[name="home-1"]').fill("0");
  await form.locator('input[name="away-1"]').fill("2");
  await form.getByLabel("Correction reason").fill("Confirmed official score sheet");
  await form.getByRole("button", { name: "Preview correction" }).click();

  await expect(form.getByRole("button", { name: "Confirm correction" })).toBeEnabled();
  await form.getByRole("button", { name: "Confirm correction" }).click();
  await expect.poll(async () => (await state(page)).matches.find(m => m.id === first.id)?.resultVersion, { timeout: POLL_TIMEOUT_MS }).toBe(2);

  await fixture.run({ kind: "match_start", matchId: graph.matches[1].id, reason: "Both teams confirmed at desk" });
  await fixture.run({ kind: "result_submit", matchId: graph.matches[1].id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
  await fixture.run({ kind: "match_start", matchId: graph.matches[2].id, reason: "Both finalists confirmed" });

  await page.reload();
  await form.locator('input[name="home-1"]').fill("2");
  await form.locator('input[name="away-1"]').fill("0");
  await form.getByLabel("Correction reason").fill("Another review");
  await form.getByRole("button", { name: "Preview correction" }).click();

  await expect(form.getByRole("alert")).toContainText("Blocked by live or completed matches");
  await expect(form.getByRole("button", { name: "Confirm correction" })).toBeDisabled();
  expect((await matchdayDb.match.findUniqueOrThrow({ where: { id: first.id } })).resultVersion).toBe(2);
});

test("public ongoing hides draft/expired announcements and draft schedule on mobile", async ({ page }) => {
  fixture = await prepareMatchdayFixture("round_robin", "showcase");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/id/events/${fixture.slug}`);

  await expect(page.getByText("Active urgent notice", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Private draft notice", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Expired notice", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(JSON.stringify(await publicState(page))).not.toContain("Verified desk correction");
});
