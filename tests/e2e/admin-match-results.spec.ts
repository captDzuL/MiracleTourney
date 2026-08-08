import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { prepareAdminMatchEvent } from "./helpers/fixtures";

let currentEvent: Awaited<ReturnType<typeof prepareAdminMatchEvent>>;

async function selectFirstMatch(page: import("@playwright/test").Page) {
  // Match cards are <a> links with href containing matchId=
  const firstMatchCard = page.locator("a[href*='matchId=']").first();
  await expect(firstMatchCard).toBeVisible();
  await firstMatchCard.click();
  await expect(page).toHaveURL(/matchId=/);
}

async function setRoundBestOf(page: import("@playwright/test").Page, bestOf: "1" | "3" | "5") {
  const roundConfigForm = page.locator("form").filter({ has: page.locator('select[name="bestOf"]') }).first();
  await expect(roundConfigForm).toBeVisible();
  await roundConfigForm.locator('select[name="bestOf"]').selectOption(bestOf);
  await roundConfigForm.getByRole("button").click();
  await expect(page).toHaveURL(/success=round-config-saved/);
}

test.describe("admin match result entry", () => {
  test.beforeEach(async ({ page }) => {
    currentEvent = await prepareAdminMatchEvent();
    await loginAsAdmin(page, "id");
    await page.goto(`/id/admin?matchEventId=${currentEvent.eventId}`);
    await expect(page).toHaveURL(new RegExp(`/id/admin\\?matchEventId=${currentEvent.eventId}`));
  });

  test("draw is rejected for single-elimination match", async ({ page }) => {
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();

    await resultForm.locator('input[name="homeScore"]').fill("10");
    await resultForm.locator('input[name="awayScore"]').fill("10");
    await resultForm.getByRole("button", { name: /simpan/i }).click();

    await expect(page).toHaveURL(/error=/);
  });

  test("admin can save a BO1 match result and see bracket update", async ({ page }) => {
    await setRoundBestOf(page, "1");
    await page.goto(`/id/admin?matchEventId=${currentEvent.eventId}`);
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();

    await resultForm.locator('input[name="homeScore"]').fill("21");
    await resultForm.locator('input[name="awayScore"]').fill("18");
    await resultForm.getByRole("button", { name: /simpan/i }).click();

    await expect(page).toHaveURL(/success=match-result-updated/);
    await page.goto(`/id/events/${currentEvent.slug}/bracket`);
    await expect(page.getByText(/21\s*-\s*18/).first()).toBeVisible();
  });

  test("event auto-transitions to Ongoing after first match result", async ({ page }) => {
    await setRoundBestOf(page, "1");
    await page.goto(`/id/admin?matchEventId=${currentEvent.eventId}`);
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();

    await resultForm.locator('input[name="homeScore"]').fill("15");
    await resultForm.locator('input[name="awayScore"]').fill("21");
    await resultForm.getByRole("button", { name: /simpan/i }).click();
    await expect(page).toHaveURL(/success=match-result-updated/);

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

  test("bracket shows completed match score", async ({ page }) => {
    const { eventId, slug } = await prepareAdminMatchEvent();
    await loginAsAdmin(page, "id");
    await page.goto(`/id/admin?matchEventId=${eventId}`);
    await setRoundBestOf(page, "1");
    await page.goto(`/id/admin?matchEventId=${eventId}`);
    await selectFirstMatch(page);
    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });
    await expect(resultForm).toBeVisible();
    await resultForm.locator('input[name="homeScore"]').fill("19");
    await resultForm.locator('input[name="awayScore"]').fill("17");
    await resultForm.getByRole("button", { name: /simpan/i }).click();

    await page.goto(`/id/events/${slug}/bracket`);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(/19\s*-\s*17/).first()).toBeVisible();
  });

  test("events list page is publicly accessible", async ({ page }) => {
    await prepareAdminMatchEvent();
    await page.goto("/id/events");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });
});
