import { expect, test } from "@playwright/test";
import { loginAsCaptain } from "./helpers/auth";

test.describe("captain authentication", () => {
  test("captain can log in and reach captain dashboard", async ({ page }) => {
    await loginAsCaptain(page, "id");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("captain is redirected to /login from protected route when unauthenticated", async ({ page }) => {
    await page.goto("/id/captain");
    await expect(page).toHaveURL(/\/id\/login/);
  });

  test("admin is redirected to /login from /captain when not a captain", async ({ page }) => {
    await page.goto("/id/captain");
    await expect(page).toHaveURL(/\/id\/login/);
  });

  test("login page shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email").fill("notexist@test.com");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: /masuk|sign in/i }).click();
    await expect(page).toHaveURL(/\/en\/login\?error=invalid/);
  });

  test("captain can log out and is redirected to home", async ({ page }) => {
    await loginAsCaptain(page, "id");

    await page.getByRole("button", { name: /keluar|logout/i }).click();
    await expect(page).toHaveURL(/\/(id|en)$/);
  });
});
