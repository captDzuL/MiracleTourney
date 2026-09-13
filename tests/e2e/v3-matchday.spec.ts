import { expect, test, type Page } from "@playwright/test";
import { loginAsOrganizer } from "./helpers/auth";
import { matchdayDb, prepareMatchdayFixture, type MatchdayKind } from "./helpers/matchday";
import type { CompetitionWorkspaceState } from "../../src/lib/competition/workspace-types";

type Fixture = Awaited<ReturnType<typeof prepareMatchdayFixture>>;
let fixture: Fixture;
test.afterEach(async () => { if (fixture) await fixture.cleanup(); });
async function state(page: Page) {
  const response = await page.evaluate(async (url) => {
    const result = await fetch(url);
    return { ok: result.ok, body: await result.json() };
  }, `/api/organizer/events/${fixture.id}/competition`);
  expect(response.ok).toBeTruthy();
  return response.body as CompetitionWorkspaceState;
}
async function publicState(page: Page) {
  const response = await page.evaluate(async (url) => {
    const result = await fetch(url);
    return { ok: result.ok, body: await result.json() };
  }, `/api/events/${fixture.slug}/ongoing`);
  expect(response.ok).toBeTruthy();
  return response.body;
}
async function openMatch(page: Page, id: string) { await page.goto(`/en/organizer/events/${fixture.id}/matches/${id}`); await expect(page.getByRole("heading", { name: "Official result", exact: true })).toBeVisible(); }
async function result(page: Page, matchId: string, home = "2", away = "0") {
  const form = page.getByRole("form", { name: "Official result", exact: true });
  const submit = form.getByRole("button", { name: "Submit official result", exact: true });
  await expect(submit).toBeEnabled();
  await form.locator('input[name="home-1"]').fill(home); await form.locator('input[name="away-1"]').fill(away);
  await submit.click();
  await expect.poll(
    async () => (await state(page)).matches.find((match) => match.id === matchId)?.resultVersion,
    { timeout: 15_000 },
  ).toBe(1);
  await expect(form.getByRole("button", { name: "Preview correction", exact: true })).toBeVisible({ timeout: 15_000 });
}

test("generates competition, reviews the initial schedule and publishes explicitly", async ({ page }) => {
  fixture = await prepareMatchdayFixture("single_elimination", "empty");
  await loginAsOrganizer(page, "en"); await page.goto(`/en/organizer/events/${fixture.id}/competition`);
  await page.getByRole("button", { name: "Generate competition", exact: true }).click();
  await expect.poll(async () => (await state(page)).matches.length).toBe(3);
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Window end", { exact: true }).fill("2026-01-02T09:00");
  await page.getByLabel("Rooms (comma separated)", { exact: true }).fill("Arena A, Arena B");
  await page.getByRole("button", { name: "Generate schedule preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible();
  const [organizerPreview, unpublishedPublic] = await Promise.all([state(page), publicState(page)]);
  expect(organizerPreview.publishedSchedule).toBeNull();
  expect(JSON.stringify(unpublishedPublic)).not.toContain("Arena A");
  await page.getByRole("button", { name: "Reload schedule", exact: true }).click();
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await state(page)).publishedSchedule?.draft.assignments.length).toBe(3);
  await expect.poll(async () => JSON.stringify(await publicState(page))).toContain("Arena A");
});

test("marks a delay, reviews downstream impact and publishes a schedule revision", async ({ page }) => {
  fixture = await prepareMatchdayFixture(); const graph = await fixture.graph();
  await loginAsOrganizer(page, "en"); await openMatch(page, graph.matches[0].id);
  const before = (await state(page)).publishedSchedule;
  const form = page.getByRole("form", { name: "Mark delayed and preview impact" });
  await form.getByLabel("Revised estimated end").fill("2026-01-01T10:30");
  await form.getByLabel("Delay reason").fill("Room equipment outage");
  await form.getByRole("button", { name: "Mark delayed and preview impact" }).click();
  await expect.poll(async () => (await state(page)).matches[0].scheduleStatus).toBe("delayed");
  expect((await state(page)).publishedSchedule?.version).toBe(before?.version);
  await page.getByRole("link", { name: "Review schedule impact" }).click();
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible();
  await expect(page.getByText("Before:", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await state(page)).publishedSchedule?.version).not.toBe(before?.version);
  expect(JSON.stringify(await publicState(page))).toContain("2026-01-01T03:30:00.000Z");
});

test("reviews a live overrun without moving the live match or exposing its estimate before publish", async ({ page }) => {
  fixture = await prepareMatchdayFixture(); const id = (await fixture.graph()).matches[0].id;
  await fixture.run({ kind: "match_start", matchId: id, reason: "Both teams at desk" });
  const original = await matchdayDb.match.findUniqueOrThrow({ where: { id } });
  await loginAsOrganizer(page, "en"); await openMatch(page, id);
  const before = (await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id);
  const form = page.getByRole("form", { name: "Mark delayed and preview impact" });
  await form.getByLabel("Revised estimated end").fill("2026-01-01T10:30");
  await form.getByLabel("Delay reason").fill("Live series technical pause");
  await form.getByRole("button", { name: "Mark delayed and preview impact" }).click();
  await expect.poll(async () => (await state(page)).matches.find(m => m.id === id)?.scheduleStatus).toBe("delayed");
  expect((await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id)).toMatchObject({ status: "live", end: before.end });
  await page.getByRole("link", { name: "Review schedule impact" }).click();
  await expect(page.getByRole("heading", { name: /Impact preview/ })).toBeVisible();
  await page.getByRole("button", { name: "Publish schedule", exact: true }).click();
  await expect.poll(async () => (await publicState(page)).liveMatches.find((m: { id: string }) => m.id === id)?.end).toBe("2026-01-01T03:30:00.000Z");
  expect(await matchdayDb.match.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "Live", scheduledAt: original.scheduledAt, scheduleRoom: original.scheduleRoom, actualStartedAt: original.actualStartedAt });
});

test("readiness deadline raises an action without walkover, organizer can override start", async ({ page }) => {
  fixture = await prepareMatchdayFixture(); const graph = await fixture.graph(); const id = graph.matches[0].id;
  await loginAsOrganizer(page, "en"); await openMatch(page, id);
  await page.getByRole("button", { name: "Check readiness deadline" }).click();
  await expect.poll(async () => (await state(page)).actions.length).toBe(2);
  const pending = (await state(page)).matches.find(m => m.id === id)!;
  expect(pending.resultVersion).toBe(0); expect(pending.status).toBe("Scheduled");
  await page.getByRole("button", { name: "Team 1: checked in", exact: true }).click();
  await expect.poll(async () => (await state(page)).readiness[0]?.status).toBe("checked_in");
  const start = page.getByRole("form", { name: "Start match", exact: true });
  const startButton = start.getByRole("button", { name: "Start match", exact: true });
  await expect(startButton).toBeEnabled();
  await start.getByLabel("Override reason (if needed)").fill("Confirmed both captains at desk");
  await startButton.click();
  await expect.poll(async () => (await state(page)).matches.find(m => m.id === id)?.status).toBe("Live");
  expect((await matchdayDb.match.findUniqueOrThrow({ where: { id } })).actualStartedAt).not.toBeNull();
  await page.goto(`/en/events/${fixture.slug}`);
  await expect(page.getByRole("heading", { name: /Live now/i })).toBeVisible();
});

for (const kind of ["single_elimination", "double_elimination", "round_robin", "group_playoffs"] as MatchdayKind[]) {
  test(`official ${kind} result advances the authoritative competition and public state`, async ({ page }) => {
    fixture = await prepareMatchdayFixture(kind); const graph = await fixture.graph(); const match = graph.matches[0];
    await fixture.run({ kind: "match_start", matchId: match.id, reason: "Both teams confirmed at desk" });
    await loginAsOrganizer(page, "en"); await openMatch(page, match.id); await result(page, match.id);
    if (kind === "group_playoffs") {
      for (const groupMatch of graph.matches.filter(m => m.groupId && m.id !== match.id)) {
        await fixture.run({ kind: "match_start", matchId: groupMatch.id, reason: "Group fixture setup" });
        await fixture.run({ kind: "result_submit", matchId: groupMatch.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
      }
    }
    const updated = await state(page); const completed = updated.matches.find(m => m.id === match.id)!;
    if (kind === "group_playoffs") for (const node of graph.matches.filter(m => !m.groupId && m.round === 1)) {
      expect(updated.matches.find(m => m.id === node.id)?.homeTeamId).toBeTruthy();
      expect(updated.matches.find(m => m.id === node.id)?.awayTeamId).toBeTruthy();
    }
    expect(completed).toMatchObject({ status: "Completed", resultVersion: 1, homeScore: 2, awayScore: 0 });
    for (const edge of graph.dependencies.filter(d => d.sourceMatchId === match.id)) {
      expect(updated.matches.find(m => m.id === edge.targetMatchId)?.[`${edge.targetSlot}TeamId`]).toBe(edge.outcome === "winner" ? completed.homeTeamId : completed.awayTeamId);
    }
    if (kind === "round_robin" || kind === "group_playoffs") expect(updated.standings.flatMap(t => t.rows).find(r => r.teamId === completed.homeTeamId)?.points).toBe(3);
    const publicData = JSON.stringify(await publicState(page));
    expect(publicData).toContain(match.id); expect(publicData).not.toContain("Official result submission");
    await page.goto(`/en/events/${fixture.slug}`);
    await expect(page.getByRole("heading", { name: "Recent official results", exact: true })).toBeVisible();
    await expect(page.getByText("2 – 0", { exact: true }).first()).toBeVisible();
  });
}

test("allows a reviewed correction, then rejects correction once its downstream match is live", async ({ page }) => {
  fixture = await prepareMatchdayFixture(); const graph = await fixture.graph(); const first = graph.matches[0];
  await fixture.run({ kind: "match_start", matchId: first.id, reason: "Both teams confirmed at desk" });
  await loginAsOrganizer(page, "en"); await openMatch(page, first.id); await result(page, first.id);
  await page.getByRole("button", { name: "Reload official result", exact: true }).click();
  const form = page.getByRole("form", { name: "Official result", exact: true });
  await form.locator('input[name="home-1"]').fill("0"); await form.locator('input[name="away-1"]').fill("2");
  await form.getByLabel("Correction reason").fill("Confirmed official score sheet");
  await form.getByRole("button", { name: "Preview correction" }).click();
  await expect(form.getByRole("button", { name: "Confirm correction" })).toBeEnabled();
  await form.getByRole("button", { name: "Confirm correction" }).click();
  await expect.poll(async () => (await state(page)).matches.find(m => m.id === first.id)?.resultVersion).toBe(2);
  await fixture.run({ kind: "match_start", matchId: graph.matches[1].id, reason: "Both teams confirmed at desk" });
  await fixture.run({ kind: "result_submit", matchId: graph.matches[1].id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
  await fixture.run({ kind: "match_start", matchId: graph.matches[2].id, reason: "Both finalists confirmed" });
  await page.reload();
  await form.locator('input[name="home-1"]').fill("2"); await form.locator('input[name="away-1"]').fill("0");
  await form.getByLabel("Correction reason").fill("Another review");
  await form.getByRole("button", { name: "Preview correction" }).click();
  await expect(form.getByRole("alert")).toContainText("Blocked by live or completed matches");
  await expect(form.getByRole("button", { name: "Confirm correction" })).toBeDisabled();
  expect((await matchdayDb.match.findUniqueOrThrow({ where: { id: first.id } })).resultVersion).toBe(2);
});

test("public ongoing hides draft/expired announcements and draft schedule on mobile", async ({ page }) => {
  fixture = await prepareMatchdayFixture("round_robin", "showcase");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/id/events/${fixture.slug}`);
  await expect(page.getByText("Active urgent notice", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Private draft notice", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Expired notice", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(JSON.stringify(await publicState(page))).not.toContain("Verified desk correction");
});
