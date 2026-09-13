import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { prepareAdminMatchEvent } from "./helpers/fixtures";
import { prepareMatchdayFixture } from "./helpers/matchday";

let currentEvent: Awaited<ReturnType<typeof prepareAdminMatchEvent>>;
const prisma = new PrismaClient();

async function selectFirstMatch(page: import("@playwright/test").Page) {
  // Match cards are <a> links with href containing matchId=
  const firstMatchCard = page.locator("a[href*='matchId=']").first();
  await expect(firstMatchCard).toBeVisible();
  await firstMatchCard.click();
  await expect(page).toHaveURL(/matchId=/);
  const matchId = new URL(page.url()).searchParams.get("matchId");
  if (!matchId) throw new Error("Expected the selected match ID in the URL.");
  return matchId;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setRoundBestOf(page: import("@playwright/test").Page, bestOf: "1" | "3" | "5") {
  const roundConfigForm = page.locator("form").filter({ has: page.locator('select[name="bestOf"]') }).first();
  await expect(roundConfigForm).toBeVisible();
  const saveButton = roundConfigForm.getByRole("button");
  await expect(saveButton).toBeEnabled();
  await roundConfigForm.locator('select[name="bestOf"]').selectOption(bestOf);
  await saveButton.click();
  await expect(page).toHaveURL(/success=round-config-saved/, { timeout: 15_000 });
}

test.describe("admin match result entry", () => {
  test.beforeEach(async ({ page }) => {
    currentEvent = await prepareAdminMatchEvent();
    await loginAsAdmin(page, "id");
    await page.goto(`/id/admin?phase=run&matchEventId=${currentEvent.eventId}`);
    await expect(page).toHaveURL(new RegExp(`/id/admin\\?phase=run&matchEventId=${currentEvent.eventId}`));
  });

  test("draw is rejected for single-elimination match", async ({ page }) => {
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();
    const saveButton = resultForm.getByRole("button", { name: /simpan hasil match/i });
    await expect(saveButton).toBeEnabled();

    await resultForm.locator('input[name="homeScore"]').fill("10");
    await resultForm.locator('input[name="awayScore"]').fill("10");
    await saveButton.click();

    await expect(page).toHaveURL(/error=/, { timeout: 15_000 });
  });

  test("admin can save a BO1 match result and see the authoritative admin state", async ({ page }) => {
    test.setTimeout(60_000);
    await setRoundBestOf(page, "1");
    await page.goto(`/id/admin?phase=run&matchEventId=${currentEvent.eventId}`);
    const selectedMatchId = await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();
    const saveButton = resultForm.getByRole("button", { name: /save match result|simpan hasil match/i });
    await expect(saveButton).toBeEnabled();

    await resultForm.locator('input[name="homeScore"]').fill("21");
    await resultForm.locator('input[name="awayScore"]').fill("18");
    await saveButton.click();

    await expect(page).toHaveURL(/success=match-result-updated/, { timeout: 15_000 });
    await expect.poll(() => prisma.match.findFirst({
      where: { id: selectedMatchId, eventId: currentEvent.eventId },
      select: { homeScore: true, awayScore: true, status: true },
    }), { timeout: 15_000 }).toEqual({ homeScore: 21, awayScore: 18, status: "Completed" });
  });

  test("event auto-transitions to Ongoing after first match result", async ({ page }) => {
    test.setTimeout(60_000);
    await setRoundBestOf(page, "1");
    await page.goto(`/id/admin?phase=run&matchEventId=${currentEvent.eventId}`);
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();
    const saveButton = resultForm.getByRole("button", { name: /save match result|simpan hasil match/i });
    await expect(saveButton).toBeEnabled();

    await resultForm.locator('input[name="homeScore"]').fill("15");
    await resultForm.locator('input[name="awayScore"]').fill("21");
    await saveButton.click();
    await expect(page).toHaveURL(/success=match-result-updated/, { timeout: 15_000 });

    await page.goto(`/id/events/${currentEvent.slug}`);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("admin can configure Best-of-N for a round", async ({ page }) => {
    await setRoundBestOf(page, "3");
  });
});

test.describe("public bracket page", () => {
  test("bracket page is publicly accessible without login", async ({ page }) => {
    const { slug } = await prepareAdminMatchEvent();
    await page.goto(`/id/events/${slug}/bracket`);
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("bracket shows an official V3 completed match score", async ({ page }) => {
    test.setTimeout(90_000);
    const fixture = await prepareMatchdayFixture("single_elimination", "published");
    try {
      const graph = await fixture.graph();
      const firstMatch = graph.matches.find((match) => match.home.kind === "team" && match.away.kind === "team");
      if (!firstMatch) throw new Error("Expected a playable official match.");
      await fixture.run({ kind: "match_start", matchId: firstMatch.id, reason: "Public bracket score E2E" });
      await fixture.run({
        kind: "result_submit",
        matchId: firstMatch.id,
        games: [{ gameNumber: 1, homeScore: 19, awayScore: 17 }],
      });

      await page.goto(`/id/events/${fixture.slug}/bracket`);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByText(/19\s*[\u2013-]\s*17/).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await fixture.cleanup();
    }
  });

  test("events list page is publicly accessible", async ({ page }) => {
    await prepareAdminMatchEvent();
    await page.goto("/id/events");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });
});
