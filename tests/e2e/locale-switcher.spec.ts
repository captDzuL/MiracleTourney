import { expect, test } from "@playwright/test";

test("language switcher keeps the V3 homepage localized", async ({ page }) => {
  await page.goto("/id");
  const localeSwitcher = page.getByLabel(/pilih bahasa \/ select language/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await localeSwitcher.getByRole("button", { name: "en" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(localeSwitcher.getByRole("button", { name: "en" })).toHaveAttribute("aria-pressed", "true");
  await localeSwitcher.getByRole("button", { name: "id" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
});

test("homepage shell keeps the V3 desktop grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/id");
  const headerRow = page.locator("header > div").first();
  await expect(headerRow).toBeVisible();
  await expect(headerRow.evaluate((element) => window.getComputedStyle(element).display)).resolves.toBe("grid");
});