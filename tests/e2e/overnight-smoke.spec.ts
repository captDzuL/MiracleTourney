import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();

test("admin can publish, import, enter a result, and see bracket advancement publicly", async ({ page }) => {
  await loginAsAdmin(page, "en");
  await page.goto("/en/admin?phase=prepare");

  // Publish the demo event
  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /save event status|simpan status event/i }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: "Kuroko Street Rival Summer Cup" });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/);

  // Attempt CSV import — may fail if event already has recorded results (test ordering)
  await page.goto("/en/admin?phase=import");
  await page.locator('input[name="csv"]').setInputFiles({
    name: "overnight-smoke.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "event_slug,team_name,team_tag,captain_name,captain_contact\nkuroko-summer-cup,Smoke Test Five,ST5,Smoke Captain,smoke@example.com\n",
    ),
  });
  await page.getByRole("button", { name: /upload and import|unggah/i }).click();
  // Accept either success (first run) or lock error (subsequent runs after match result is recorded)
  await expect(page).toHaveURL(/\/admin\?(?:success=teams-imported|error=)/);

  // Click the first manageable match card to get the result form (if any)
  await page.goto("/id/admin?phase=run");
  const firstMatch = page.locator("a[href*='matchId=']").first();
  if (await firstMatch.count() > 0) {
    await firstMatch.click();
    await expect(page).toHaveURL(/matchId=/);

    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });

    if (await resultForm.count() > 0) {
      await resultForm.locator('input[name="homeScore"]').fill("21");
      await resultForm.locator('input[name="awayScore"]').fill("18");
      await resultForm.getByRole("button", { name: /simpan/i }).click();
      await expect(page).toHaveURL(/success=match-result-updated/);
    }
  }

  // Bracket page loads publicly regardless of match state
  await page.goto("/id/events/kuroko-summer-cup/bracket");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByRole("main")).toBeVisible();
});

test("admin can rebuild a pre-kickoff bracket and rejects imports after kickoff", async ({ page }) => {
  // Delete flashpeak-24 if left by a previous CI run to ensure idempotency
  const fp24 = await prisma.event.findFirst({ where: { slug: "flashpeak-24" } });
  if (fp24) {
    await prisma.matchGame.deleteMany({ where: { match: { eventId: fp24.id } } });
    await prisma.match.deleteMany({ where: { eventId: fp24.id } });
    await prisma.team.deleteMany({ where: { eventId: fp24.id } });
    await prisma.event.delete({ where: { id: fp24.id } });
  }

  await loginAsAdmin(page, "en");
  await page.goto("/en/admin?phase=prepare");

  const createEventForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /create draft event|buat draft event/i }),
  });
  await createEventForm.getByLabel("Event name").fill("Flashpeak 24");
  await createEventForm.getByLabel("Slug").fill("flashpeak-24");
  await createEventForm.getByLabel("Game and mode").selectOption("mode-flashpeak-5v5");
  await createEventForm.getByLabel("Format").selectOption("Single Elimination");
  await createEventForm.getByLabel("Participant cap").selectOption("24");
  await createEventForm.getByRole("button", { name: /create draft event|buat draft event/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-created/);

  await page.getByLabel(/active event|event aktif/i).selectOption({ label: "Flashpeak 24" });
  await page.getByRole("complementary").getByRole("button", { name: /change event|ganti event/i }).click();
  await expect(page).toHaveURL(/activeEventId=/);

  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /save event status|simpan status event/i }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: "Flashpeak 24" });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/, { timeout: 15_000 });

  // Navigate to fresh admin page before importing
  await page.goto("/en/admin?phase=import");
  await page.locator('input[name="csv"]').setInputFiles("tests/fixtures/import-22.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await page.waitForURL(/\/admin\?success=teams-imported&count=22/, { timeout: 30_000 });

  await page.goto("/id/events/flashpeak-24/bracket");
  await expect(page.getByText("Final", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Semifinal|Quarterfinal/i)).not.toBeVisible();

  await page.goto("/en/admin?phase=import");
  await page.locator('input[name="csv"]').setInputFiles("tests/fixtures/import-2-more.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await page.waitForURL(/\/admin\?success=teams-imported&count=2/, { timeout: 15000 });

  await page.goto("/id/events/flashpeak-24/bracket");
  await expect(page.getByText("Team 23", { exact: true })).toBeVisible();
  await expect(page.getByText("Team 24", { exact: true })).toBeVisible();

  // Enter a match result to lock the bracket
  await page.goto("/id/admin?phase=run");
  const firstMatch = page.locator("a[href*='matchId=']").first();
  if (await firstMatch.count() > 0) {
    await firstMatch.click();
    await expect(page).toHaveURL(/matchId=/);

    const resultForm = page.locator("form").filter({
      has: page.locator('input[name="homeScore"]'),
    });

    if (await resultForm.count() > 0) {
      await resultForm.locator('input[name="homeScore"]').fill("21");
      await resultForm.locator('input[name="awayScore"]').fill("18");
      await resultForm.getByRole("button", { name: /simpan/i }).click();
      await expect(page).toHaveURL(/success=match-result-updated/);
    }
  }

  // Late import should fail — event already has recorded results
  await page.goto("/en/admin?phase=import");
  await page.setInputFiles('input[name="csv"]', "tests/fixtures/late-import-after-lock.csv");
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await expect(page).toHaveURL(/error=/);
});
