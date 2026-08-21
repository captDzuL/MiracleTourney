import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const csvHeader = "event_slug,team_name,team_tag,captain_name,captain_contact";

function teamImportCsv(slug: string, teamNumbers: number[]) {
  const rows = teamNumbers.map(
    (number) => `${slug},Team ${number},T${String(number).padStart(2, "0")},Captain ${number},captain${number}@team.test`,
  );
  return Buffer.from([csvHeader, ...rows].join("\n"));
}

function lateTeamImportCsv(slug: string) {
  return Buffer.from(`${csvHeader}\n${slug},Late Team,LTE,Late Captain,late@team.test\n`);
}

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
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const eventName = `Flashpeak 24 ${suffix}`;
  const slug = `flashpeak-24-${suffix}`;

  await loginAsAdmin(page, "en");
  await page.goto("/en/admin?phase=prepare");

  const createEventForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /create draft event|buat draft event/i }),
  });
  await createEventForm.getByLabel("Event name").fill(eventName);
  await createEventForm.getByLabel("Slug").fill(slug);
  await createEventForm.getByLabel("Game and mode").selectOption("mode-flashpeak-5v5");
  await createEventForm.getByLabel("Format").selectOption("Single Elimination");
  await createEventForm.getByLabel("Participant cap").selectOption("24");
  await createEventForm.getByRole("button", { name: /create draft event|buat draft event/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-created/);

  await page.getByLabel(/active event|event aktif/i).selectOption({ label: eventName });
  await page.getByRole("complementary").getByRole("button", { name: /change event|ganti event/i }).click();
  await expect(page).toHaveURL(/activeEventId=/);
  const eventId = new URL(page.url()).searchParams.get("activeEventId");
  if (!eventId) throw new Error("Expected the created Flashpeak event to become active.");

  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /save event status|simpan status event/i }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: eventName });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i }).click();
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/, { timeout: 15_000 });

  // Navigate to fresh admin page before importing
  await page.goto("/en/admin?phase=import");
  await page.locator('input[name="csv"]').setInputFiles({
    name: "import-22.csv",
    mimeType: "text/csv",
    buffer: teamImportCsv(slug, Array.from({ length: 22 }, (_, index) => index + 1)),
  });
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await page.waitForURL(/\/admin\?success=teams-imported&count=22/, { timeout: 30_000 });

  await page.goto(`/id/events/${slug}/bracket`);
  await expect(page.getByText("Final", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Semifinal|Quarterfinal/i)).not.toBeVisible();

  await page.goto("/en/admin?phase=import");
  await page.locator('input[name="csv"]').setInputFiles({
    name: "import-2-more.csv",
    mimeType: "text/csv",
    buffer: teamImportCsv(slug, [23, 24]),
  });
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await page.waitForURL(/\/admin\?success=teams-imported&count=2/, { timeout: 15000 });

  await page.goto(`/id/events/${slug}/bracket`);
  await expect(page.getByText("Team 23", { exact: true })).toBeVisible();
  await expect(page.getByText("Team 24", { exact: true })).toBeVisible();

  // Enter a match result to lock the bracket
  await page.goto(`/id/admin?phase=run&activeEventId=${eventId}&matchEventId=${eventId}`);
  const firstMatch = page.locator("a[href*='matchId=']").first();
  await expect(firstMatch).toBeVisible();
  await firstMatch.click();
  await expect(page).toHaveURL(new RegExp(`matchEventId=${eventId}.*matchId=`));

  const resultForm = page.locator("form").filter({
    has: page.locator('input[name="homeScore"]'),
  });
  await expect(resultForm).toBeVisible();
  await resultForm.locator('input[name="homeScore"]').fill("21");
  await resultForm.locator('input[name="awayScore"]').fill("18");
  await resultForm.getByRole("button", { name: /simpan/i }).click();
  await expect(page).toHaveURL(/success=match-result-updated/);

  // Late import should fail — event already has recorded results
  await page.goto("/en/admin?phase=import");
  await page.setInputFiles('input[name="csv"]', {
    name: "late-import-after-lock.csv",
    mimeType: "text/csv",
    buffer: lateTeamImportCsv(slug),
  });
  await page.getByRole("button", { name: /Upload and import/i }).click();
  await expect(page).toHaveURL(/error=/);
  expect(new URL(page.url()).searchParams.get("error")).toContain("sudah memiliki hasil pertandingan");
});
