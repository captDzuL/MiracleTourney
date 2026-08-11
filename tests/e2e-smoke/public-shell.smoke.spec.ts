import { expect, test } from "@playwright/test";

test("localized login shell renders without requiring database access", async ({ page }) => {
  await page.goto("/id/login");

  await expect(page).toHaveURL(/\/id\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("admin page redirects unauthenticated visitors to localized login", async ({ page }) => {
  await page.goto("/id/admin");

  await expect(page).toHaveURL(/\/id\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
});

test("public session endpoint stays database-free when no cookie is present", async ({ request }) => {
  const response = await request.get("/api/me");

  await expect(response).toBeOK();
  expect(response.headers()["content-type"]).toMatch(/application\/json/);
  expect(await response.json()).toEqual({ user: null });
});

test("security headers are present on public pages", async ({ request }) => {
  const response = await request.get("/id/login");

  await expect(response).toBeOK();
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("login page tolerates a small concurrent smoke load", async ({ request }) => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => request.get("/id/login")),
  );

  for (const response of responses) {
    await expect(response).toBeOK();
  }
});
