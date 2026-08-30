import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

const csvHeader = "event_slug,team_name,team_tag,captain_name,captain_contact,Player 1 Nickname";

function teamImportCsv(slug: string, teamNumbers: number[]) {
  const rows = teamNumbers.map(
    (number) => `${slug},Team ${number},T${String(number).padStart(2, "0")},Captain ${number},captain${number}@team.test,Player ${number}`,
  );
  return Buffer.from([csvHeader, ...rows].join("\n"));
}

function lateTeamImportCsv(slug: string) {
  return Buffer.from(`${csvHeader}\n${slug},Late Team,LTE,Late Captain,late@team.test,Late Player\n`);
}

async function previewRegistrationCsv(page: import("@playwright/test").Page, file: {
  name: string;
  buffer: Buffer;
}) {
  await page.locator('input[name="registrationFile"]').setInputFiles({
    name: file.name,
    mimeType: "text/csv",
    buffer: file.buffer,
  });
  await Promise.all([
    page.waitForURL(
      (url) => url.searchParams.has("registrationBatchId") || url.searchParams.has("error"),
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: /check and preview|cek dan preview/i }).click(),
  ]);

  const previewUrl = new URL(page.url());
  if (previewUrl.searchParams.has("error")) {
    throw new Error(`Registration preview failed: ${previewUrl.searchParams.get("error") || "Unknown error"}`);
  }

  const previewForm = page.locator("form").filter({
    has: page.locator('input[name="batchId"]'),
  });
  await expect(previewForm).toBeVisible({ timeout: 30_000 });
}

async function commitPreviewedRegistration(page: import("@playwright/test").Page, count: number) {
  const previewForm = page.locator("form").filter({
    has: page.locator('input[name="batchId"]'),
  });
  await expect(previewForm.locator('input[name="itemId"]:checked')).toHaveCount(count);

  await Promise.all([
    page.waitForURL(
      (url) => url.searchParams.get("success") === "registration-imported" || url.searchParams.has("error"),
      { timeout: 75_000 },
    ),
    previewForm.getByRole("button", { name: /import selected rows|import baris terpilih/i }).click(),
  ]);

  const importError = new URL(page.url()).searchParams.get("error");
  if (importError) throw new Error(`Registration commit failed: ${importError}`);
  await expect(page).toHaveURL(new RegExp(`success=registration-imported&count=${count}`));
}

test("admin can publish, import, enter a result, and see bracket advancement publicly", async ({ page }) => {
  test.setTimeout(90_000);
  const event = await prisma.event.findUnique({ where: { slug: "kuroko-summer-cup" } });
  expect(event, "Expected the seeded Kuroko event to exist").not.toBeNull();
  if (!event) return;

  await prisma.match.deleteMany({ where: { eventId: event.id } });
  await prisma.eventRoundConfig.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({
    where: {
      eventId: event.id,
      OR: [{ tag: "ST5" }, { name: "Smoke Test Five" }],
    },
  });

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

  await page.goto(`/en/admin?phase=import&activeEventId=${event.id}`);
  await previewRegistrationCsv(page, {
    name: "overnight-smoke.csv",
    buffer: Buffer.from(
      "event_slug,team_name,team_tag,captain_name,captain_contact,Player 1 Nickname\nkuroko-summer-cup,Smoke Test Five,ST5,Smoke Captain,smoke@example.com,Smoke Player\n",
    ),
  });
  await commitPreviewedRegistration(page, 1);

  await page.goto(`/id/admin?phase=run&activeEventId=${event.id}&matchEventId=${event.id}`);
  const firstMatch = page.locator("a[href*='matchId=']").first();
  await expect(firstMatch).toBeVisible();
  await firstMatch.click();
  await expect(page).toHaveURL(/matchId=/);

  const resultForm = page.locator("form").filter({
    has: page.locator('input[name="homeScore"]'),
  });
  await expect(resultForm).toBeVisible();
  await resultForm.locator('input[name="homeScore"]').fill("21");
  await resultForm.locator('input[name="awayScore"]').fill("18");
  await resultForm.getByRole("button", { name: /save match result|simpan hasil match/i }).click();
  await expect(page).toHaveURL(/success=match-result-updated/, { timeout: 30_000 });

  // Bracket page loads publicly regardless of match state
  await page.goto("/id/events/kuroko-summer-cup/bracket");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByRole("main")).toBeVisible();
});

test("admin can rebuild a pre-kickoff bracket and rejects imports after kickoff", async ({ page }) => {
  test.setTimeout(240_000);
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
  await page.goto(`/en/admin?phase=import&activeEventId=${eventId}`);
  await previewRegistrationCsv(page, {
    name: "import-22.csv",
    buffer: teamImportCsv(slug, Array.from({ length: 22 }, (_, index) => index + 1)),
  });
  await commitPreviewedRegistration(page, 22);

  await page.goto(`/id/events/${slug}/bracket`);
  await expect(page.getByText("Final", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/Semifinal|Quarterfinal/i)).not.toBeVisible();

  await page.goto(`/en/admin?phase=import&activeEventId=${eventId}`);
  await previewRegistrationCsv(page, {
    name: "import-2-more.csv",
    buffer: teamImportCsv(slug, [23, 24]),
  });
  await commitPreviewedRegistration(page, 2);

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
  await resultForm.getByRole("button", { name: /save match result|simpan hasil match/i }).click();
  await expect(page).toHaveURL(/success=match-result-updated/, { timeout: 30_000 });

  // Late import should fail — event already has recorded results
  await page.goto(`/en/admin?phase=import&activeEventId=${eventId}`);
  await previewRegistrationCsv(page, {
    name: "late-import-after-lock.csv",
    buffer: lateTeamImportCsv(slug),
  });
  await expect(page.getByText(/sudah memiliki hasil pertandingan|already has recorded match results/i)).toBeVisible();
});
