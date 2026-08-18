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

    // Use the "Selesai" badge to uniquely identify the completed match card,
    // avoiding the sidebar step link which also carries matchId in its href.
    const matchCard = page
      .locator(`a[href*="matchId=${fixture.matchId}"]`)
      .filter({ has: page.getByText("Selesai") });
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
      await expect(page.getByText(p.displayName, { exact: true }).first()).toBeVisible();
    }
    for (const p of fixture.awayPlayers) {
      await expect(page.getByText(p.displayName, { exact: true }).first()).toBeVisible();
    }
  });

  test("stats form shows dynamic stat keys for Flashpeak game mode", async ({ page }) => {
    await expect(page.getByText("Statistik Pemain", { exact: true })).toBeVisible({ timeout: 15_000 });

    const pillSummary = page.locator("span").filter({ hasText: /goals/ }).first();
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

  test("no stats form without a selected match", async ({ page }) => {
    await page.goto(`/id/admin?phase=run&activeEventId=${fixture.eventId}`);
    await expect(page).toHaveURL(new RegExp(`activeEventId=${fixture.eventId}`), { timeout: 15_000 });

    await expect(page.getByText("Statistik Pemain", { exact: true })).not.toBeVisible({ timeout: 5_000 });
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
