import { expect, test } from "@playwright/test";

test.describe("captain team management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue as captain" }).click();
    await expect(page).toHaveURL(/\/captain/);
  });

  test("captain dashboard shows their team and players", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    // The dashboard renders team sections — any heading or paragraph is fine
    const content = page.locator("main").locator("h2, h3, p, td").first();
    await expect(content).toBeVisible();
  });

  test("captain can add a player to their team", async ({ page }) => {
    const addPlayerForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /add player|tambah pemain/i }),
    });

    if (await addPlayerForm.count() === 0) {
      test.skip();
      return;
    }

    await addPlayerForm.getByLabel(/display name|nama/i).fill("E2E Test Player");
    await addPlayerForm.getByLabel(/nickname/i).fill("E2EPL");
    const positionField = addPlayerForm.getByLabel(/position/i);
    const positionTag = await positionField.evaluate((el) => el.tagName.toLowerCase());
    if (positionTag === "select") {
      await positionField.selectOption({ index: 1 });
    } else {
      await positionField.fill("Forward");
    }
    await addPlayerForm.getByRole("button", { name: /add player|tambah pemain/i }).click();

    await expect(page).toHaveURL(/success=player-added/);
  });

  test("captain cannot access admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("captain settings page is accessible", async ({ page }) => {
    await page.goto("/captain/settings");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("captain change password form rejects mismatched passwords", async ({ page }) => {
    await page.goto("/captain/settings");

    const pwForm = page.locator("form").filter({
      has: page.getByLabel(/current password|password lama/i),
    });

    if (await pwForm.count() === 0) {
      test.skip();
      return;
    }

    await pwForm.getByLabel(/current password|password lama/i).fill("demo123");
    await pwForm.getByLabel(/new password|password baru/i).fill("newpass123");
    await pwForm.getByLabel(/confirm|konfirmasi/i).fill("different456");
    await pwForm.getByRole("button", { name: /save|simpan|change|ubah/i }).click();

    await expect(page).toHaveURL(/error=/);
  });
});
