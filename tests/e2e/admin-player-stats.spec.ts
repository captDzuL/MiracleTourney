import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { prepareCompletedMatchWithPlayers } from "./helpers/fixtures";

const prisma = new PrismaClient();

// Use timestamp-based slugs so each test run creates events with FRESH cache keys.
// getMatchesForEvent uses unstable_cache (30s TTL keyed by eventId); reusing a slug
// from a previous run means the server may return stale (empty) match data until
// the TTL expires. A unique slug avoids that entirely.
const RUN_ID = Date.now();

let fixture: Awaited<ReturnType<typeof prepareCompletedMatchWithPlayers>>;

test.describe("admin player stats entry", () => {
  test.beforeAll(async () => {
    fixture = await prepareCompletedMatchWithPlayers(`admin-stats-e2e-${RUN_ID}`);
  });

  test.beforeEach(async ({ page }) => {
    // Reset only stats — keep the match/teams/players stable
    await prisma.playerStat.deleteMany({ where: { matchId: fixture.matchId } });
    await prisma.statSubmission.deleteMany({ where: { matchId: fixture.matchId } });

    await loginAsAdmin(page, "id");
    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`), { timeout: 15_000 });
  });

  test.afterAll(async () => {
    // Clean up timestamp-prefixed events created by this run
    await prisma.event.deleteMany({ where: { slug: { startsWith: "admin-stats-e2e-" } } });
    await prisma.$disconnect();
  });

  test("completed match appears in Hasil & Statistik section", async ({ page }) => {
    const sectionHeading = page.getByRole("heading", { name: /hasil & statistik/i });
    await expect(sectionHeading).toBeVisible({ timeout: 15_000 });

    // Use the recording badge to uniquely identify the completed match card,
    // avoiding the sidebar step link which also carries matchId in its href.
    const matchCard = page
      .locator(`a[href*="matchId=${fixture.matchId}"]`)
      .filter({ has: page.getByText("Belum dicatat", { exact: true }) });
    await expect(matchCard).toBeVisible();
    await expect(matchCard.getByText("Stats Home", { exact: false })).toBeVisible();
    await expect(matchCard.getByText("Stats Away", { exact: false })).toBeVisible();
  });

  test("clicking a completed match preserves activeEventId in URL", async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`));

    // Stats editor rendered means the page already loaded with matchId in URL
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    // activeEventId must still be present — this was the original bug
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`));
  });

  test("stats form renders with roster players for both teams", async ({ page }) => {
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    for (const p of fixture.homePlayers) {
      await expect(page.getByText(p.nickname, { exact: true }).first()).toBeVisible();
    }
    for (const p of fixture.awayPlayers) {
      await expect(page.getByText(p.nickname, { exact: true }).first()).toBeVisible();
    }
  });

  test("stats form shows dynamic stat keys for Flashpeak game mode", async ({ page }) => {
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const pillSummary = page.locator("span").filter({ hasText: /goal/ }).first();
    await expect(pillSummary).toBeVisible();
  });

  test("admin can save home team stats and see success redirect", async ({ page }) => {
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const homeForm = page.locator("form").filter({
      has: page.locator(`input[name="teamId"][value="${fixture.homeTeamId}"]`),
    });
    await expect(homeForm).toBeVisible();

    await homeForm.locator('input[type="number"]').first().fill("3");
    await homeForm.getByRole("button", { name: /simpan statistik/i }).click();

    await expect(page).toHaveURL(/success=player-stats-saved/, { timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`));
  });

  test("saved stats are pre-filled when returning to the match", async ({ page }) => {
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const homeForm = page.locator("form").filter({
      has: page.locator(`input[name="teamId"][value="${fixture.homeTeamId}"]`),
    });
    await homeForm.locator('input[type="number"]').first().fill("7");
    await homeForm.getByRole("button", { name: /simpan statistik/i }).click();
    await expect(page).toHaveURL(/success=player-stats-saved/, { timeout: 15_000 });

    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const homeFormAgain = page.locator("form").filter({
      has: page.locator(`input[name="teamId"][value="${fixture.homeTeamId}"]`),
    });
    await expect(homeFormAgain.locator('input[type="number"]').first()).toHaveValue("7");
  });

  test("editing stats replaces, not accumulates (upsert safety)", async ({ page }) => {
    test.setTimeout(60_000);
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const getHomeForm = () =>
      page.locator("form").filter({
        has: page.locator(`input[name="teamId"][value="${fixture.homeTeamId}"]`),
      });

    await getHomeForm().locator('input[type="number"]').first().fill("4");
    await getHomeForm().getByRole("button", { name: /simpan statistik/i }).click();
    await expect(page).toHaveURL(/success=player-stats-saved/, { timeout: 15_000 });

    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(getHomeForm().locator('input[type="number"]').first()).toHaveValue("4");

    await getHomeForm().locator('input[type="number"]').first().fill("3");
    await getHomeForm().getByRole("button", { name: /simpan statistik/i }).click();
    await expect(page).toHaveURL(/success=player-stats-saved/, { timeout: 15_000 });

    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(getHomeForm().locator('input[type="number"]').first()).toHaveValue("3");
  });

  test("recording status follows both saved teams, reload, edits, and locale", async ({ page }) => {
    test.setTimeout(90_000);
    const card = page.locator(`a[href*="matchId=${fixture.matchId}"]`).filter({ hasText: "Stats Home" });
    const teamForm = (teamId: string) => page.locator("form").filter({
      has: page.locator(`input[name="teamId"][value="${teamId}"]`),
    });
    await expect(card.getByText("Belum dicatat", { exact: true })).toBeVisible();
    await expect(card.getByText("Input statistik", { exact: true })).toBeVisible();
    await teamForm(fixture.homeTeamId).getByRole("button", { name: /simpan statistik/i }).click();
    await expect(card.getByText("Sebagian tercatat", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(teamForm(fixture.homeTeamId).getByText("Tercatat", { exact: true })).toBeVisible();
    await expect(teamForm(fixture.awayTeamId).getByText("Belum dicatat", { exact: true })).toBeVisible();
    await teamForm(fixture.awayTeamId).getByRole("button", { name: /simpan statistik/i }).click();
    await expect(card.getByText("Tercatat", { exact: true })).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(card.getByText("Lihat / edit statistik", { exact: true })).toBeVisible();
    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await teamForm(fixture.homeTeamId).locator('input[type="number"]').first().fill("5");
    await Promise.all([
      page.waitForURL(/success=player-stats-saved/, { waitUntil: "load" }),
      teamForm(fixture.homeTeamId).getByRole("button", { name: /simpan statistik/i }).click(),
    ]);
    await page.reload();
    await expect(teamForm(fixture.homeTeamId).locator('input[type="number"]').first()).toHaveValue("5");
    await expect(card.getByText("Tercatat", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(card.getByText("Tercatat", { exact: true })).toBeVisible();
    const cardBox = await card.boundingBox();
    const badgeBox = await card.getByText("Tercatat", { exact: true }).boundingBox();
    expect(cardBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(badgeBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    await page.goto(`/en/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(card.getByText("Recorded", { exact: true })).toBeVisible();
    await expect(card.getByText("View / edit statistics", { exact: true })).toBeVisible();
    await card.screenshot({ path: "tmp/stat-recording/recorded-mobile-en.png" });
    const savedMatch = await prisma.match.findUniqueOrThrow({ where: { id: fixture.matchId } });
    expect(savedMatch.status).toBe("Completed");
  });

  test("captain submissions count only after approval", async ({ page }) => {
    // Includes login, multiple dashboard loads, and the approval write against Neon.
    test.setTimeout(90_000);
    const card = page.locator(`a[href*="matchId=${fixture.matchId}"]`).filter({ hasText: "Stats Home" });
    const stats = Object.fromEntries(fixture.homePlayers.map((player) => [player.id, { goal: 0, assist: 0, passing: 0, defense: 0 }]));
    const submission = await prisma.statSubmission.create({ data: {
      eventId: fixture.eventId, matchId: fixture.matchId, teamId: fixture.homeTeamId,
      submittedBy: "captain-recording-e2e", status: "pending", stats,
    } });
    await page.reload();
    await expect(card.getByText("Belum dicatat", { exact: true })).toBeVisible();
    await prisma.statSubmission.update({ where: { id: submission.id }, data: { status: "rejected" } });
    await page.reload();
    await expect(card.getByText("Belum dicatat", { exact: true })).toBeVisible();
    await prisma.statSubmission.update({ where: { id: submission.id }, data: { status: "pending" } });
    await page.goto(`/id/admin?phase=review&activeEventId=${fixture.eventId}`);
    const review = page.locator('details').filter({ has: page.locator(`input[name="submissionId"][value="${submission.id}"]`) });
    await review.locator('summary').click();
    await Promise.all([
      page.waitForURL(/success=stat-approved/, { waitUntil: "load", timeout: 15_000 }),
      review.getByRole('button', { name: 'Setujui', exact: true }).click(),
    ]);
    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}&matchId=${fixture.matchId}`);
    await expect(card.getByText("Sebagian tercatat", { exact: true })).toBeVisible();
    const homeForm = page.locator('form').filter({ has: page.locator(`input[name="teamId"][value="${fixture.homeTeamId}"]`) });
    await expect(homeForm.getByText("Tercatat", { exact: true })).toBeVisible();
    const savedRows = await prisma.playerStat.findMany({ where: { matchId: fixture.matchId } });
    expect(savedRows).toHaveLength(fixture.homePlayers.length);
    expect(savedRows.every((row) => row.source === 'captain')).toBe(true);
  });

  test("no stats form without a selected match", async ({ page }) => {
    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}`);
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`), { timeout: 15_000 });

    await expect(page.getByText("Statistik Pemain", { exact: true })).not.toBeVisible({ timeout: 5_000 });
  });
  test("empty roster remains unrecorded and explains how to complete it", async ({ page }) => {
    await prisma.player.deleteMany({ where: { teamId: { in: [fixture.homeTeamId, fixture.awayTeamId] } } });
    await page.reload();
    const card = page.locator(`a[href*="matchId=${fixture.matchId}"]`).filter({ hasText: "Stats Home" });
    await expect(card.getByText("Belum dicatat", { exact: true })).toBeVisible();
    await expect(card.getByText("Lengkapi roster", { exact: true })).toBeVisible();
    await expect(page.getByText("Tambahkan pemain ke roster tim terlebih dahulu agar statistik dapat dicatat.")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /simpan statistik/i })).toHaveCount(0);
  });
});

// Separate describe with its OWN slug so the unstable_cache key doesn't collide
// with the main describe block's event data.
test.describe("admin completed match navigation", () => {
  test("switching active event scopes Hasil & Statistik to that event only", async ({ page }) => {
    await loginAsAdmin(page, "id");
    const navFixture = await prepareCompletedMatchWithPlayers(`admin-stats-nav-e2e-${RUN_ID}`);

    await page.goto(`/id/admin?phase=run&activeEventId=${navFixture.eventId}`);

    await expect(page.getByRole("heading", { name: /hasil & statistik/i })).toBeVisible({ timeout: 15_000 });

    const completedCard = page.locator(`a[href*="matchId=${navFixture.matchId}"]`);
    await expect(completedCard).toBeVisible({ timeout: 10_000 });

    // Card's href must carry activeEventId (original bug regression test)
    const href = await completedCard.getAttribute("href");
    expect(href).toContain(`activeEventId=${navFixture.eventId}`);
  });
});
