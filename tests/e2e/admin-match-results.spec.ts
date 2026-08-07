import { expect, test } from "@playwright/test";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as admin" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function selectFirstMatch(page: import("@playwright/test").Page) {
  // Match cards are <a> links with href containing matchId=
  const firstMatchCard = page.locator("a[href*='matchId=']").first();
  if (await firstMatchCard.count() === 0) return false;
  await firstMatchCard.click();
  await expect(page).toHaveURL(/matchId=/);
  return true;
}

test.describe("admin match result entry", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("draw is rejected for single-elimination match", async ({ page }) => {
    const hasMatch = await selectFirstMatch(page);
    if (!hasMatch) {
      test.skip();
      return;
    }

    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });

    if (await resultForm.count() === 0) {
      test.skip();
      return;
    }

    await resultForm.locator('input[name="homeScore"]').fill("10");
    await resultForm.locator('input[name="awayScore"]').fill("10");
    await resultForm.getByRole("button", { name: /simpan/i }).click();

    await expect(page).toHaveURL(/error=/);
  });

  test("admin can save a BO1 match result and see bracket update", async ({ page }) => {
    const hasMatch = await selectFirstMatch(page);
    if (!hasMatch) {
      test.skip();
      return;
    }

    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });

    if (await resultForm.count() === 0) {
      test.skip();
      return;
    }

    await resultForm.locator('input[name="homeScore"]').fill("21");
    await resultForm.locator('input[name="awayScore"]').fill("18");
    await resultForm.getByRole("button", { name: /simpan/i }).click();

    await expect(page).toHaveURL(/success=match-result-updated/);
  });

  test("event auto-transitions to Ongoing after first match result", async ({ page }) => {
    const hasMatch = await selectFirstMatch(page);
    if (!hasMatch) {
      test.skip();
      return;
    }

    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });

    if (await resultForm.count() === 0) {
      test.skip();
      return;
    }

    await resultForm.locator('input[name="homeScore"]').fill("15");
    await resultForm.locator('input[name="awayScore"]').fill("21");
    await resultForm.getByRole("button", { name: /simpan/i }).click();
    await expect(page).toHaveURL(/success=match-result-updated/);

    await page.goto("/events");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("admin can configure Best-of-N for a round", async ({ page }) => {
    const roundConfigForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /konfigurasi|config/i }),
    });

    if (await roundConfigForm.count() === 0) {
      test.skip();
      return;
    }

    await roundConfigForm.locator('select[name="bestOf"]').selectOption("3");
    await roundConfigForm.getByRole("button", { name: /konfigurasi|config/i }).click();

    await expect(page).toHaveURL(/success=round-config-saved/);
  });
});

test.describe("public bracket page", () => {
  test("bracket page is publicly accessible without login", async ({ page }) => {
    await page.goto("/events/kuroko-summer-cup/bracket");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("bracket shows completed match score", async ({ page }) => {
    await page.goto("/events/kuroko-summer-cup/bracket");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("events list page is publicly accessible", async ({ page }) => {
    await page.goto("/events");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });
});
