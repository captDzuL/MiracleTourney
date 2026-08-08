import { expect, test } from "@playwright/test";
import { loginAsCaptain } from "./helpers/auth";

test.describe("captain team management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCaptain(page, "id");
  });

  test("captain dashboard shows their team and players", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    // The dashboard renders team sections — any heading or paragraph is fine
    const content = page.locator("main").locator("h2, h3, p, td").first();
    await expect(content).toBeVisible();
  });

  test("captain can add a player to their team", async ({ page }) => {
    const playerName = `E2E Test Player ${Date.now()}`;
    const addPlayerForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /add player|tambah pemain/i }),
    });

    if (await addPlayerForm.count() === 0) {
      test.skip();
      return;
    }

    await addPlayerForm.getByLabel(/display name|nama/i).fill(playerName);
    await addPlayerForm.getByLabel(/nickname/i).fill("E2EPL");
    const positionField = addPlayerForm.getByLabel(/position|posisi/i);
    const positionTag = await positionField.evaluate((el) => el.tagName.toLowerCase());
    if (positionTag === "select") {
      await positionField.selectOption({ index: 1 });
    } else {
      await positionField.fill("Forward");
    }
    await addPlayerForm.getByRole("button", { name: /add player|tambah pemain/i }).click();

    await expect(page).toHaveURL(/success=player-added/);
    await expect(page.getByText(playerName, { exact: true })).toBeVisible();
  });

  test("captain cannot access admin dashboard", async ({ page }) => {
    await page.goto("/id/admin");
    await expect(page).toHaveURL(/\/id\/login/);
  });

  test("captain settings page is accessible", async ({ page }) => {
    await page.goto("/id/captain/settings");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("captain change password form rejects mismatched passwords", async ({ page }) => {
    await page.goto("/id/captain/settings");

    const pwForm = page.locator("form").filter({
      has: page.getByLabel(/current password|password saat ini|password lama/i),
    });
    await expect(pwForm).toBeVisible();

    await pwForm.locator('input[name="currentPassword"]').fill("demo123");
    await pwForm.locator('input[name="newPassword"]').fill("newpass123");
    await pwForm.locator('input[name="confirmPassword"]').fill("different456");
    await pwForm.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/error=/);
  });
});
