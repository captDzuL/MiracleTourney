import { expect, test } from "@playwright/test";

test("seeded ongoing event renders from the authoritative public V3 lifecycle", async ({ page }) => {
  await page.goto("/en/events/flashpeak-rising-64");

  const publicEvent = page.locator("[data-public-v3-event]");
  await expect(publicEvent).toHaveCount(1);
  await expect(publicEvent).toHaveAttribute("data-public-source", "authoritative");
  await expect(page.locator(".public-visual-v2")).toHaveCount(0);
});
