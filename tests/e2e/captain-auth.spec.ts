import { expect, test } from "@playwright/test";

test.describe("captain authentication", () => {
  test("captain can log in and reach captain dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue as captain" }).click();
    await expect(page).toHaveURL(/\/captain/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("captain is redirected to /login from protected route when unauthenticated", async ({ page }) => {
    await page.goto("/captain");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin is redirected to /login from /captain when not a captain", async ({ page }) => {
    await page.goto("/captain");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("notexist@test.com");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login\?error=invalid/);
  });

  test("captain can log out and is redirected to home", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue as captain" }).click();
    await expect(page).toHaveURL(/\/captain/);

    await page.getByRole("button", { name: /keluar/i }).click();
    await expect(page).toHaveURL("/");
  });
});
