import { expect, test } from "@playwright/test";

test("language switcher toggles localized copy on the homepage", async ({ page }) => {
  await page.goto("/id");
  await expect(page).toHaveURL(/\/id$/);

  await expect(page.getByRole("heading", { name: "Temukan Kemenangan Berikutnya" })).toBeVisible();

  const localeSwitcher = page.getByLabel(/pilih bahasa \/ select language/i);

  await localeSwitcher.getByRole("button", { name: "en" }).click();
  await expect(page).toHaveURL(/\/en$/);

  await expect(page.getByRole("heading", { name: "Discover Your Next Victory" })).toBeVisible();
  await expect(localeSwitcher.getByRole("button", { name: "en" })).toHaveAttribute("aria-pressed", "true");

  await localeSwitcher.getByRole("button", { name: "id" }).click();
  await expect(page).toHaveURL(/\/id$/);

  await expect(page.getByRole("heading", { name: "Temukan Kemenangan Berikutnya" })).toBeVisible();
  await expect(localeSwitcher.getByRole("button", { name: "id" })).toHaveAttribute("aria-pressed", "true");
});

test("homepage shell keeps desktop layout styling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/id");

  const headerRow = page.locator("header > div").first();
  await expect(headerRow).toBeVisible();

  const display = await headerRow.evaluate((element) => window.getComputedStyle(element).display);
  expect(display).toBe("flex");
});
