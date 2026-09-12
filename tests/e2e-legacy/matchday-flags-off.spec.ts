import { expect, test } from "@playwright/test";
import { prepareMatchdayFixture } from "../e2e/helpers/matchday";
import { loginAsOrganizer } from "../e2e/helpers/auth";
test("competition flags off preserve legacy public rendering and organizer operations", async ({ page }) => {
  const fixture = await prepareMatchdayFixture("single_elimination", "published");
  try {
    await page.goto(`/en/events/${fixture.slug}`);
    await expect(page.getByRole("heading", { name: /Match Day single_elimination/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live now", exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/events/${fixture.slug}/ongoing`)).status()).toBe(404);
    await loginAsOrganizer(page, "en");
    await page.goto(`/en/organizer/events/${fixture.id}/legacy-match-day`);
    await expect(page.getByRole("main")).toContainText("Team 1");
    expect((await page.request.get(`/api/organizer/events/${fixture.id}/competition`)).status()).toBe(404);
  } finally { await fixture.cleanup(); }
});
