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

test("admin can rebuild a pre-kickoff bracket and rejects imports after kickoff", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as admin" }).click();
  await expect(page).toHaveURL(/\/admin/);

  const createEventForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create draft event" }),
  });
  await createEventForm.getByLabel("Event name").fill("Flashpeak 24");
  await createEventForm.getByLabel("Slug").fill("flashpeak-24");
  await createEventForm.getByLabel("Game mode").selectOption("mode-flashpeak-5v5");
  await createEventForm.getByLabel("Format").selectOption("Single Elimination");
  await createEventForm.getByLabel("Participant cap").selectOption("24");
  await createEventForm.getByRole("button", { name: "Create draft event" }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-created/);

  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save event status" }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: "Flashpeak 24" });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await eventStatusForm.getByRole("button", { name: "Save event status" }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/);

  await page.setInputFiles('input[name="csv"]', "tests/fixtures/import-22.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=teams-imported&count=22/);

  await page.goto("/events/flashpeak-24/bracket");
  await expect(page.getByText("Final", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Semifinal|Quarterfinal/i)).not.toBeVisible();

  await page.goto("/admin");
  await page.setInputFiles('input[name="csv"]', "tests/fixtures/import-2-more.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=teams-imported&count=2/);

  await page.goto("/events/flashpeak-24/bracket");
  await expect(page.getByText("Team 23", { exact: true })).toBeVisible();
  await expect(page.getByText("Team 24", { exact: true })).toBeVisible();
  await expect(page.getByText("Final", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Semifinal|Quarterfinal/i)).not.toBeVisible();

  await page.goto("/admin");
  const matchOperationsForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Load event matches" }),
  });
  await matchOperationsForm.getByLabel("Choose event").selectOption("event-flashpeak-24");
  await matchOperationsForm.getByRole("button", { name: "Load event matches" }).click();

  const matchResultForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save match result" }),
  });
  await matchResultForm.getByLabel("Home score").fill("21");
  await matchResultForm.getByLabel("Away score").fill("18");
  await matchResultForm.getByRole("button", { name: "Save match result" }).click();
  await expect(page).toHaveURL(/\/admin\?success=match-result-updated/);

  await page.goto("/admin");
  await page.setInputFiles('input[name="csv"]', "tests/fixtures/late-import-after-lock.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await expect(page.getByText(/already has recorded match results/i)).toBeVisible();
});

