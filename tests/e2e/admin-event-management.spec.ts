import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();

async function uploadRegistrationFile(page: import("@playwright/test").Page, file: {
  name: string;
  mimeType: string;
  buffer: Buffer;
}) {
  await page.locator('input[name="registrationFile"]').setInputFiles(file);
  await page.getByRole("button", { name: /check and preview|cek dan preview/i }).click();
  await expect(page).toHaveURL(/registrationBatchId=/, { timeout: 30_000 });
}

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
    const events = await prisma.event.findMany({ select: { id: true } });
    let unlockedEventId: string | null = null;
    for (const event of events) {
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      if (completedMatches === 0) {
        unlockedEventId = event.id;
        break;
      }
    }
    if (!unlockedEventId) {
      test.skip();
      return;
    }
    await prisma.team.deleteMany({ where: { eventId: unlockedEventId, tag: "ETA" } });

    await page.goto(`/en/admin?phase=import&activeEventId=${unlockedEventId}`);
    await uploadRegistrationFile(page, {
      name: "test-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "event_slug,team_name,team_tag,captain_name,captain_contact,Player 1 Nickname\nkuroko-summer-cup,E2E Team Alpha,ETA,E2E Captain,e2ecap@test.com,E2EPlayer\n",
      ),
    });
    await page.getByRole("button", { name: /import selected rows/i }).click();

    await expect(page).toHaveURL(/success=registration-imported&count=1/);
  });

  test("admin sees error when importing CSV after bracket is locked", async ({ page }) => {
    const events = await prisma.event.findMany({ select: { id: true } });
    let lockedEventId: string | null = null;
    for (const event of events) {
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      if (completedMatches > 0) {
        lockedEventId = event.id;
        break;
      }
    }
    if (!lockedEventId) {
      test.skip();
      return;
    }

    await page.goto(`/en/admin?phase=import&activeEventId=${lockedEventId}`);
    const lateImportFile = "tests/fixtures/late-import-after-lock.csv";
    await page.locator('input[name="registrationFile"]').setInputFiles(lateImportFile);
    await page.getByRole("button", { name: /check and preview|cek dan preview/i }).click();

    await expect(page).toHaveURL(/registrationBatchId=/, { timeout: 30_000 });
    await expect(page.getByText(/sudah memiliki hasil pertandingan|already has recorded match results/i)).toBeVisible();
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
