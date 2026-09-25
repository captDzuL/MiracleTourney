import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { runAndSettleServerActionRedirect } from "./helpers/server-action";
import { waitForServerActionResult } from "./helpers/server-action";
import { TOURNAMENT_FORMAT_PRESETS } from "../../src/lib/tournament/formats/types";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

const OVERNIGHT_INITIAL_DESCRIPTION = "New event created from admin panel.";
const OVERNIGHT_FINAL_DESCRIPTION = "Ready legacy admin event for V3 publish readiness coverage.";
const OVERNIGHT_ORGANIZER_EMAIL = "organizer-a@miraclefc.gg";
const OVERNIGHT_CLEANUP_TIMEOUT = 30_000;

type OvernightEventIdentity = { name: string; slug: string };
type OvernightEventTracker = (event: OvernightEventIdentity) => void;

async function cleanupCreatedOvernightEvent(event: OvernightEventIdentity) {
  const rows = await prisma.event.findMany({
    where: { slug: event.slug, name: event.name },
    select: { id: true, slug: true, name: true, description: true, organizerUserId: true },
  });
  if (rows.length === 0) return;
  if (rows.length > 1) {
    throw new Error(`Refusing to clean ${event.slug}: found ${rows.length} exact name/slug matches`);
  }

  const created = rows[0];
  if (!created) throw new Error(`Refusing to clean ${event.slug}: exact event row was not readable`);
  const organizer = await prisma.user.findUnique({
    where: { email: OVERNIGHT_ORGANIZER_EMAIL },
    select: { id: true },
  });
  const isInitialState =
    created.description === OVERNIGHT_INITIAL_DESCRIPTION && created.organizerUserId === null;
  const isFinalState =
    organizer !== null &&
    created.description === OVERNIGHT_FINAL_DESCRIPTION &&
    created.organizerUserId === organizer.id;
  if (!isInitialState && !isFinalState) {
    throw new Error(`Refusing to clean ${event.slug}: unexpected description/owner lifecycle state`);
  }

  const exactWhere = {
    id: created.id,
    slug: event.slug,
    name: event.name,
    description: created.description,
    organizerUserId: created.organizerUserId,
  };
  const result = await prisma.event.deleteMany({ where: exactWhere });
  if (result.count !== 1) {
    throw new Error(`Expected to clean exactly one overnight event, deleted ${result.count}`);
  }
  const remaining = await prisma.event.count({ where: exactWhere });
  if (remaining !== 0) throw new Error(`Overnight event ${event.slug} remained after cleanup`);
}

const overnightTest = test.extend<{ trackOvernightEvent: OvernightEventTracker }>({
  trackOvernightEvent: [async ({}, use) => {
    let trackedEvent: OvernightEventIdentity | undefined;
    const trackOvernightEvent: OvernightEventTracker = (event) => {
      trackedEvent = event;
    };
    await use(trackOvernightEvent);
    if (trackedEvent) await cleanupCreatedOvernightEvent(trackedEvent);
  }, { timeout: OVERNIGHT_CLEANUP_TIMEOUT }],
});

let seededKurokoEventId: string;

test.beforeAll(async () => {
  const event = await prisma.event.findUnique({ where: { slug: "kuroko-summer-cup" } });
  expect(event, "Expected the seeded Kuroko event to exist").not.toBeNull();
  if (!event) throw new Error("Expected the seeded Kuroko event to exist");
  seededKurokoEventId = event.id;

  await prisma.match.deleteMany({ where: { eventId: event.id } });
  await prisma.eventRoundConfig.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({
    where: {
      eventId: event.id,
      OR: [{ tag: "ST5" }, { name: "Smoke Test Five" }],
    },
  });
});

const csvHeader = "event_slug,team_name,team_tag,captain_name,captain_contact,captain_ign,captain_uid,Player 1 Nickname,Player 2 Nickname";

function teamImportCsv(slug: string, teamNumbers: number[]) {
  const teamCsvHeader = `${csvHeader},Player 3 Nickname,Player 4 Nickname`;
  const rows = teamNumbers.map(
    (number) => `${slug},Team ${number},T${String(number).padStart(2, "0")},Captain ${number},captain${number}@team.test,Captain${number},UID-${number},Player ${number},Player ${number}B,Player ${number}C,Player ${number}D`,
  );
  return Buffer.from([teamCsvHeader, ...rows].join("\n"));
}

function lateTeamImportCsv(slug: string) {
  return Buffer.from(`${csvHeader}\n${slug},Late Team,LTE,Late Captain,late@team.test,LateCaptain,UID-LATE,Late Player,Late Player 2\n`);
}

async function previewRegistrationCsv(page: import("@playwright/test").Page, file: {
  name: string;
  buffer: Buffer;
}) {
  const previewButton = page.getByRole("button", { name: /check and preview|cek dan preview/i });
  await expect(previewButton).toBeEnabled();
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
    previewButton.click(),
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
  await expect(previewForm.getByRole("button", { name: /import selected rows|import baris terpilih/i })).toBeEnabled();
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

  await loginAsAdmin(page, "en");
  await page.goto("/en/admin?phase=prepare");

  // Publish the demo event
  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /save event status|simpan status event/i }),
  });
  await expect(eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i })).toBeEnabled();
  await eventStatusForm.getByLabel("Event").selectOption({ label: "Kuroko Street Rival Summer Cup" });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await runAndSettleServerActionRedirect(page, {
    request: (request) => {
      const requestUrl = new URL(request.url());
      return requestUrl.pathname === "/en/admin"
        && requestUrl.searchParams.get("phase") === "prepare"
        && requestUrl.search === "?phase=prepare";
    },
    expectedActionRedirect: "/en/admin?success=event-status-updated&event=kuroko-summer-cup;push",
    destination: (url) => url.pathname === "/en/admin"
      && url.searchParams.get("success") === "event-status-updated"
      && url.searchParams.get("event") === "kuroko-summer-cup"
      && url.search === "?success=event-status-updated&event=kuroko-summer-cup",
    trigger: () => eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i }).click(),
  });
  await expect(page).toHaveURL(/\/admin\?success=event-status-updated/);

  await page.goto(`/en/admin?phase=import&activeEventId=${seededKurokoEventId}`);
  await previewRegistrationCsv(page, {
    name: "overnight-smoke.csv",
    buffer: Buffer.from(
      "event_slug,team_name,team_tag,captain_name,captain_contact,captain_ign,captain_uid,Player 1 Nickname,Player 2 Nickname\nkuroko-summer-cup,Smoke Test Five,KS1,Smoke Captain,smoke@example.com,SmokeCaptain,UID-SMOKE,Smoke Player,Smoke Player 2\n",
    ),
  });
  await commitPreviewedRegistration(page, 1);

  await page.goto(`/id/admin?phase=run&activeEventId=${seededKurokoEventId}&matchEventId=${seededKurokoEventId}`);
  const firstMatch = page.locator("a[href*='matchId=']").first();
  await expect(firstMatch).toBeVisible();
  await firstMatch.click();
  await expect(page).toHaveURL(/matchId=/);

  const resultForm = page.locator("form").filter({
    has: page.locator('input[name="homeScore"]'),
  });
  await expect(resultForm).toBeVisible();
  const saveResultButton = resultForm.getByRole("button", { name: /save match result|simpan hasil match/i });
  await expect(saveResultButton).toBeEnabled();
  await resultForm.locator('input[name="homeScore"]').fill("21");
  await resultForm.locator('input[name="awayScore"]').fill("18");
  await saveResultButton.click();
  await expect(page).toHaveURL(/success=match-result-updated/, { timeout: 30_000 });

  // Bracket page loads publicly regardless of match state
  await page.goto("/id/events/kuroko-summer-cup/bracket");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByRole("main")).toBeVisible();
});

overnightTest("registration order stays private and imports stop after drawing publication", async ({ page, trackOvernightEvent }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const eventName = `Flashpeak 24 ${suffix}`;
  const slug = `flashpeak-24-${suffix}`;

  await loginAsAdmin(page, "en");
  await page.goto("/en/admin?phase=prepare");

  const createEventForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /create draft event|buat draft event/i }),
  });
  await expect(createEventForm.getByRole("button", { name: /create draft event|buat draft event/i })).toBeEnabled();
  await createEventForm.getByLabel("Event name").fill(eventName);
  await createEventForm.getByLabel("Slug").fill(slug);
  await createEventForm.getByLabel("Game and mode").selectOption("mode-flashpeak-5v5");
  await createEventForm.getByLabel("Format").selectOption("Single Elimination");
  await createEventForm.getByLabel("Participant cap").selectOption("24");
  trackOvernightEvent({ name: eventName, slug });
  await runAndSettleServerActionRedirect(page, {
    request: (request) => {
      const requestUrl = new URL(request.url());
      return requestUrl.pathname === "/en/admin"
        && requestUrl.searchParams.get("phase") === "prepare"
        && requestUrl.search === "?phase=prepare";
    },
    expectedActionRedirect: "/en/admin?success=event-created;push",
    destination: (url) => url.pathname === "/en/admin"
      && url.searchParams.get("success") === "event-created"
      && url.search === "?success=event-created",
    trigger: () => createEventForm.getByRole("button", { name: /create draft event|buat draft event/i }).click(),
  });
  await expect(page).toHaveURL(/\/admin\?success=event-created/);

  await page.getByLabel(/active event|event aktif/i).selectOption({ label: eventName });
  await page.getByRole("complementary").getByRole("button", { name: /switch event|ganti event/i }).click();
  await expect(page).toHaveURL(/activeEventId=/);
  const eventId = new URL(page.url()).searchParams.get("activeEventId");
  if (!eventId) throw new Error("Expected the created Flashpeak event to become active.");

  const organizer = await prisma.user.findUniqueOrThrow({ where: { email: "organizer-a@miraclefc.gg" } });
  await prisma.organizerProfile.upsert({
    where: { userId: organizer.id },
    update: { organizationName: organizer.name, contactChannel: "WhatsApp", contactValue: "+62 812 0000 0000" },
    create: { userId: organizer.id, organizationName: organizer.name, contactChannel: "WhatsApp", contactValue: "+62 812 0000 0000" },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: {
      description: OVERNIGHT_FINAL_DESCRIPTION,
      formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      registrationOpensAt: new Date("2026-10-01T02:00:00.000Z"),
      registrationClosesAt: new Date("2026-10-07T14:00:00.000Z"),
      eventStartsAt: new Date("2026-10-10T03:00:00.000Z"),
      timezone: "Asia/Jakarta", venue: "Miracle Test Arena", registrationFeeRequired: false,
      organizerUserId: organizer.id, organizerName: organizer.name,
    },
  });
  const eventStatusForm = page.locator("form").filter({
    has: page.getByRole("button", { name: /save event status|simpan status event/i }),
  });
  await eventStatusForm.getByLabel("Event").selectOption({ label: eventName });
  await eventStatusForm.getByLabel("Status").selectOption("Published");
  await expect(eventStatusForm.getByRole("button", { name: /save event status|simpan status event/i })).toBeEnabled();
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
  await expect(page.getByText("TBD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Team 23", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Team 24", { exact: true })).not.toBeVisible();

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "Registration Closed" },
  });
  await page.goto(`/en/organizer/events/${eventId}/competition`);
  const drawingResponsePromise = waitForServerActionResult<{ status: string; code?: string; correlationId?: string }>(page, (request, requestUrl) => {
    const postData = request.postData() ?? "";
    return request.method() === "POST"
      && requestUrl.pathname === `/en/organizer/events/${encodeURIComponent(eventId)}/competition`
      && Boolean(request.headers()["next-action"])
      && postData.includes(eventId)
      && postData.includes('"drawing_save"');
  });
  await page.getByRole("button", { name: "Save drawing draft", exact: true }).click();
  const drawingResponse = await drawingResponsePromise;
  if (drawingResponse.result.status !== "saved") {
    throw new Error(`Save drawing failed with ${drawingResponse.result.code ?? "unknown"} (correlation ${drawingResponse.result.correlationId ?? "missing"}).`);
  }
  expect(drawingResponse.result.status, "Save drawing action result").toBe("saved");
  await expect.poll(
    async () => (await prisma.competitionPhase.findFirst({ where: { eventId, sequence: 1 } }))?.status,
    { timeout: 60_000 },
  ).toBe("draft");
  await page.getByRole("button", { name: "Publish drawing", exact: true }).click();
  await expect.poll(
    async () => (await prisma.competitionPhase.findFirst({ where: { eventId, sequence: 1 } }))?.status,
    { timeout: 60_000 },
  ).toBe("active");

  await page.goto(`/id/events/${slug}/bracket`);
  await expect(page.getByText("Team 23", { exact: true })).toBeVisible();
  await expect(page.getByText("Team 24", { exact: true })).toBeVisible();

  // Late import must fail once the authoritative drawing locks the roster.
  await page.goto(`/en/admin?phase=import&activeEventId=${eventId}`);
  await previewRegistrationCsv(page, {
    name: "late-import-after-lock.csv",
    buffer: lateTeamImportCsv(slug),
  });
  const lockedPreview = page.locator("form").filter({
    has: page.locator('input[name="batchId"]'),
  });
  await expect(lockedPreview.locator('input[name="itemId"]:checked')).toHaveCount(0);
  await expect(lockedPreview.getByRole("button", { name: /import selected rows|import baris terpilih/i })).toBeDisabled();
  await expect(page.getByText(/drawing|roster|hasil pertandingan/i).first()).toBeVisible();
});
