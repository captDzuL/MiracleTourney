import { expect, test } from "@playwright/test";

test("admin can publish, import, enter a result, and see bracket advancement publicly", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as admin" }).click();
  await expect(page).toHaveURL(/\/admin/);

  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save event status" }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: "Kuroko Street Rival Summer Cup" });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await eventStatusForm.getByRole("button", { name: "Save event status" }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/);

  await page.locator('input[name="csv"]').setInputFiles({
    name: "overnight-smoke.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "event_slug,team_name,team_tag,captain_name,captain_contact\nflashpeak-open-league,Smoke Test Five,ST5,Smoke Captain,smoke@example.com\n",
    ),
  });
  await page.getByRole("button", { name: "Upload and import" }).click();
  await expect(page).toHaveURL(/\/admin\?success=teams-imported&count=1/);

  const matchResultForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save match result" }),
  });
  await matchResultForm.getByLabel("Home score").fill("21");
  await matchResultForm.getByLabel("Away score").fill("18");
  await matchResultForm.getByRole("button", { name: "Save match result" }).click();
  await expect(page).toHaveURL(/\/admin\?success=match-result-updated/);

  await page.goto("/events/kuroko-summer-cup/bracket");
  await expect(
    page.getByRole("row", {
      name: /Semifinal Match 1 Seirin vs Shutoku 21 - 18 Semifinal/,
    }),
  ).toBeVisible();
});

