import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { generateCompetitionGraph, type GroupPlayoffsConfig } from "../../src/lib/tournament/competition";
import { loginWithCredentials } from "./helpers/auth";

/**
 * Limited roster changes in the group stage, through the real UI:
 * organizer sets the limit -> captain files a request -> organizer decides.
 * Screenshots go to test-results/roster-change-shots so the screens can be reviewed.
 */
const prisma = new PrismaClient();
const SHOTS = path.resolve("test-results", "roster-change-shots");
const PASSWORD = "RosterE2e!2026";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const config: GroupPlayoffsConfig = {
  version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2,
  groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference", "head_to_head"] },
  playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, avoidImmediateGroupRematches: true },
};
const POSITIONS = ["Forward", "Midfielder", "Defender", "Goalkeeper", "Forward"];

let eventId = "";
let eventSlug = "";
let captainTeamId = "";
const userIds: string[] = [];

const emails = { organizer: `organizer-${suffix}@example.test`, captain: `captain-${suffix}@example.test` };

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function signedIn(browser: Browser, baseURL: string | undefined, who: "organizer" | "captain") {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginWithCredentials(page, {
    locale: "id",
    email: emails[who],
    password: PASSWORD,
    destination: who === "captain" ? /\/(id|en)\/captain/ : /\/(id|en)\/organizer/,
  });
  return { context, page };
}

async function fileRequest(page: Page, args: { leavingLabel: string; uid: string; ign: string; position: string }) {
  await page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });
  await page.locator('select[name="outPlayerId"]').selectOption({ label: args.leavingLabel });
  await page.locator('section form input[name="displayName"]').fill(args.uid);
  await page.locator('section form input[name="nickname"]').fill(args.ign);
  await page.locator('section form select[name="position"]').selectOption(args.position);
  const submit = page.getByRole("button", { name: "Ajukan ke organizer" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Permintaan terkirim. Tunggu organizer.")).toBeVisible({ timeout: 30_000 });
}

test.describe.serial("limited roster changes", () => {
  test.beforeAll(async () => {
    await mkdir(SHOTS, { recursive: true });
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const organizer = await prisma.user.create({ data: { email: emails.organizer, name: "Organizer E2E", role: "organizer", passwordHash } });
    const captain = await prisma.user.create({ data: { email: emails.captain, name: "Captain E2E", role: "captain", passwordHash } });
    userIds.push(organizer.id, captain.id);

    eventSlug = `roster-e2e-${suffix}`;
    const event = await prisma.event.create({
      data: {
        slug: eventSlug, name: "Roster Change Cup", description: "Fixture for the roster change e2e",
        gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "League", formatConfig: config as never,
        status: "Registration Closed", participantCap: 8, registrationWindow: "Sep 1 - Sep 8", startsAt: "2026-10-20", venue: "Online",
        organizerUserId: organizer.id, organizerName: "Organizer E2E", publishedAt: new Date("2026-09-01T00:00:00Z"), rosterChangeLimit: 0,
      },
    });
    eventId = event.id;

    const teamIds: string[] = [];
    for (let t = 1; t <= 8; t += 1) {
      const team = await prisma.team.create({
        data: {
          eventId, name: t === 1 ? "Redclover" : `Team ${t}`, logoText: `T${t}`, tag: `T${t}${suffix.slice(0, 2)}`.toUpperCase(),
          captainId: t === 1 ? captain.id : null, captainName: `UID-${t}-1`, captainUid: `UID-${t}-1`, captainIgn: `Nick-${t}-1`, captainIsPlayer: true,
        },
      });
      teamIds.push(team.id);
      await prisma.player.createMany({
        data: POSITIONS.map((position, index) => ({
          teamId: team.id, eventId, displayName: `UID-${t}-${index + 1}`, nickname: `Nick-${t}-${index + 1}`, position,
        })),
      });
    }
    captainTeamId = teamIds[0];

    const graph = generateCompetitionGraph({ eventId, config, teams: teamIds.map((id, index) => ({ id, seed: index + 1 })) });
    await prisma.competitionPhase.create({ data: { eventId, label: "Groups", sequence: 1, status: "active", configuration: { graph } as never } });
    await prisma.competitionPhase.create({ data: { eventId, label: "Playoffs", sequence: 2, status: "active" } });
  });

  test.afterAll(async () => {
    if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  test("1. organizer sets how many changes each team may make", async ({ browser, baseURL }) => {
    const { context, page } = await signedIn(browser, baseURL, "organizer");
    await page.goto(`/id/organizer/events/${eventId}/settings`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Ganti Roster", exact: true })).toBeVisible();
    await expect(page.getByText("Tidak ada permintaan yang menunggu.")).toBeVisible();
    await shot(page, "01-organizer-settings-before");

    const limit = page.locator('input[name="limit"]');
    await expect(limit).toHaveValue("0");
    await limit.fill("2");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Jatah ganti disimpan.")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[name="limit"]')).toHaveValue("2");
    await shot(page, "02-organizer-limit-saved");
    await context.close();
  });

  test("2. captain cannot edit directly, and files a swap request", async ({ browser, baseURL }) => {
    const { context, page } = await signedIn(browser, baseURL, "captain");
    await page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Ganti Roster", exact: true })).toBeVisible();
    await expect(page.getByText("Roster terkunci. Ganti pemain lewat permintaan ke organizer.")).toBeVisible();
    await expect(page.getByText("Sisa jatah ganti: 2 dari 2")).toBeVisible();
    await expect(page.locator("#add-player-form")).toHaveCount(0);
    await expect(page.locator('a[href*="edit="]')).toHaveCount(0);
    await shot(page, "03-captain-roster-limited");

    await fileRequest(page, { leavingLabel: "Nick-1-2 (UID-1-2)", uid: "UID-new-1", ign: "NewGuy1", position: "Defender" });
    await expect(page.getByText("Menunggu organizer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();
    await shot(page, "04-captain-request-pending");

    // The roster itself did not change yet.
    expect(await prisma.player.count({ where: { teamId: captainTeamId, removedAt: null } })).toBe(5);
    await context.close();
  });

  test("3. organizer sees the request; Enter in the note never approves; approve changes the roster", async ({ browser, baseURL }) => {
    const { context, page } = await signedIn(browser, baseURL, "organizer");
    await page.goto(`/id/organizer/events/${eventId}/overview`, { waitUntil: "domcontentloaded" });
    const blocker = page.getByText("Permintaan ganti roster perlu diputuskan.");
    test.info().annotations.push({ type: "overview-blocker-visible", description: String(await blocker.isVisible().catch(() => false)) });
    await shot(page, "05-organizer-overview-blocker");

    await page.goto(`/id/organizer/events/${eventId}/settings`, { waitUntil: "domcontentloaded" });
    const card = page.locator("li").filter({ hasText: "Redclover" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("NewGuy1");
    await expect(card).toContainText("Nick-1-2");
    await expect(card).toContainText("Jatah terpakai: 0 dari 2");
    await shot(page, "06-organizer-queue");

    const note = card.locator('textarea[name="note"]');
    await note.click();
    await note.pressSequentially("Cek UID dulu");
    await page.keyboard.press("Enter");
    await expect(note).toHaveValue("Cek UID dulu\n");
    await expect(page).not.toHaveURL(/rcResult=/);
    expect(await prisma.player.count({ where: { teamId: captainTeamId, removedAt: null } })).toBe(5);

    await note.fill("Silakan");
    await card.getByRole("button", { name: "Setujui" }).click();
    await expect(page.getByText("Disetujui. Roster tim sudah berubah.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Setujui", exact: true })).toHaveCount(0);
    await shot(page, "07-organizer-approved");

    const left = await prisma.player.findFirstOrThrow({ where: { teamId: captainTeamId, displayName: "UID-1-2" } });
    expect(left.removedAt).not.toBeNull();
    expect(await prisma.player.count({ where: { teamId: captainTeamId, displayName: "UID-new-1", removedAt: null } })).toBe(1);
    await context.close();
  });

  test("4. captain sees the new roster, and the public page follows", async ({ browser, baseURL }) => {
    const { context, page } = await signedIn(browser, baseURL, "captain");
    await page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Sisa jatah ganti: 1 dari 2")).toBeVisible();
    const rosterGrid = page.locator("article").first();
    await expect(rosterGrid).toContainText("NewGuy1");
    await expect(rosterGrid).not.toContainText("Nick-1-2");
    await expect(page.getByText("Disetujui").first()).toBeVisible();
    await shot(page, "08-captain-after-approval");

    const publicPage = await context.newPage();
    await publicPage.goto(`/id/events/${eventSlug}/participants`, { waitUntil: "domcontentloaded" });
    await publicPage.getByRole("button", { name: /Lihat roster/ }).first().click();
    await expect(publicPage.getByText("NewGuy1")).toBeVisible();
    await expect(publicPage.getByText("Nick-1-2")).toHaveCount(0);
    await shot(publicPage, "09-public-participants");
    await context.close();
  });

  test("5. a former player comes back; the allowance is then used up", async ({ browser, baseURL }) => {
    const captain = await signedIn(browser, baseURL, "captain");
    await fileRequest(captain.page, { leavingLabel: "Nick-1-3 (UID-1-3)", uid: "uid-1-2", ign: "Nick-1-2", position: "Forward" });
    await captain.context.close();

    const organizer = await signedIn(browser, baseURL, "organizer");
    await organizer.page.goto(`/id/organizer/events/${eventId}/settings`, { waitUntil: "domcontentloaded" });
    // The waiting request is the card with an Approve button; decided ones only appear in the history list.
    const card = organizer.page.locator("li").filter({ has: organizer.page.getByRole("button", { name: "Setujui", exact: true }) });
    await expect(card).toContainText("Redclover");
    await expect(card).toContainText("Pemain lama kembali");
    await shot(organizer.page, "10-organizer-returning-player");
    await card.getByRole("button", { name: "Setujui" }).click();
    await expect(organizer.page.getByText("Disetujui. Roster tim sudah berubah.")).toBeVisible({ timeout: 30_000 });
    await organizer.context.close();

    const back = await prisma.player.findFirstOrThrow({ where: { teamId: captainTeamId, displayName: "UID-1-2" } });
    expect(back.removedAt).toBeNull();
    expect(Array.isArray(back.rosterGaps) ? back.rosterGaps : []).toHaveLength(1);
    expect(await prisma.player.count({ where: { teamId: captainTeamId, displayName: { equals: "UID-1-2", mode: "insensitive" } } })).toBe(1);

    const again = await signedIn(browser, baseURL, "captain");
    await again.page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });
    await expect(again.page.getByText("Jatah ganti habis.")).toBeVisible();
    await expect(again.page.locator('select[name="kind"]')).toHaveCount(0);
    await shot(again.page, "11-captain-allowance-used-up");

    await again.page.setViewportSize({ width: 390, height: 844 });
    await again.page.goto("/id/captain?tab=roster", { waitUntil: "domcontentloaded" });
    await shot(again.page, "12-captain-mobile");
    await again.context.close();
  });
});
