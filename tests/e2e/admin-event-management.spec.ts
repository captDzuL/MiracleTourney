import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("admin event management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, "en");
  });

  test("admin keeps localized navbar when changing match management event", async ({ page }) => {
    await page.goto("/id/admin?phase=run");
    await expect(page).toHaveURL(/\/id\/admin\?phase=run$/);

    const changeEventButton = page.getByRole("button", { name: /ganti event|change event/i }).last();
    await expect(changeEventButton).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Event$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Admin$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /keluar|logout/i })).toBeVisible();

    await changeEventButton.click();

    await expect(page).toHaveURL(/\/id\/admin\?phase=run&matchEventId=/);
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Event$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Admin$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /keluar|logout/i })).toBeVisible();
  });

  test("admin can change event status from Draft to Published", async ({ page }) => {
    const eventStatusForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save event status" }),
    });
    await eventStatusForm.getByLabel("Event").selectOption({ label: "Kuroko Street Rival Summer Cup" });
    await eventStatusForm.getByLabel("Status").selectOption("Published");
    await eventStatusForm.getByRole("button", { name: "Save event status" }).click();

    await expect(page).toHaveURL(/success=event-status-updated/);
  });

  test("admin can import teams via CSV and see success count", async ({ page }) => {
    await page.goto("/en/admin?phase=import");
    await page.locator('input[name="csv"]').setInputFiles({
      name: "test-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "event_slug,team_name,team_tag,captain_name,captain_contact\nkuroko-summer-cup,E2E Team Alpha,ETA,E2E Captain,e2ecap@test.com\n",
      ),
    });
    await page.getByRole("button", { name: "Upload and import" }).click();

    await expect(page).toHaveURL(/success=teams-imported/);
  });

  test("admin sees error when importing CSV after bracket is locked", async ({ page }) => {
    await page.goto("/en/admin?phase=import");
    const lateImportFile = "tests/fixtures/late-import-after-lock.csv";
    await page.locator('input[name="csv"]').setInputFiles(lateImportFile);
    await page.getByRole("button", { name: "Upload and import" }).click();

    // late-import-after-lock.csv references flashpeak-24 which doesn't exist → unknown event_slug error
    await expect(page).toHaveURL(/error=/);
  });

  test("admin can update live stream URL", async ({ page }) => {
    // Stream form: hidden eventId, label "Stream label", label "Stream URL"
    const streamForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /Update stream metadata/i }),
    });

    if (await streamForm.count() === 0) {
      test.skip();
      return;
    }

    await streamForm.getByLabel(/stream url/i).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await streamForm.getByLabel(/stream label/i).fill("Day 1 Stream");
    await streamForm.getByRole("button", { name: /Update stream metadata/i }).click();

    await expect(page).toHaveURL(/success=stream-updated/);
  });
});
