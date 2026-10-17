import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsOrganizer, normalizeReleasePage, probeReleaseReducedMotion } from "./helpers/auth";
import { createCompetitionOperations } from "../../src/lib/tournament/operations";
import {
  NEW_PLAYER_PASSWORD,
  PROOF_PNG,
  SEED_PASSWORD,
  SOLO_EVENT_SLUG,
  addRegistration,
  loginAsSoloPlayer,
  playerEmail,
  resetSoloEvent,
  soloDb,
  soloRegistrationStatus,
} from "./helpers/solo";

/**
 * One solo event, start to finish: players join, the extras queue, a slot reopens, the organizer approves,
 * closes, draws and locks, and the locked teams run like any other. The event is the seeded
 * flashpeak-solo-cup (2 teams: 2 goalkeepers, 8 field players), put back to its starting point first.
 */
// Pages compile on first visit and the reset reseeds 14 accounts, so every test and hook gets a long budget.
test.describe.configure({ mode: "serial", timeout: 180_000 });

const NEWBIE_EMAIL = `solo-newbie-${Date.now().toString(36)}@example.test`;
const eventPath = `/id/events/${SOLO_EVENT_SLUG}/register`;
const HOUR = 60 * 60 * 1000;
let eventId = "";

async function fillRegistration(page: Page, input: { ign: string; uid: string; position: string; secondary?: string }) {
  await page.getByLabel("IGN").fill(input.ign);
  await page.getByLabel("UID").fill(input.uid);
  await page.getByLabel("Posisi utama").selectOption(input.position);
  if (input.secondary) await page.getByLabel("Posisi cadangan").selectOption(input.secondary);
  await page.getByLabel("Boleh dilihat teman satu tim setelah tim dikunci").check();
  await page.getByRole("button", { name: "Daftar solo" }).click();
}

test.beforeAll(async () => {
  eventId = await resetSoloEvent();
  await soloDb.user.deleteMany({ where: { email: { startsWith: "solo-newbie-" } } });
  const base = Date.now() - 10 * HOUR;
  // player-01 holds the second goalkeeper slot and will withdraw; the eight field slots are paid and approved.
  await addRegistration(eventId, { email: playerEmail(1), ign: "Keeper01", uid: "SK-001", position: "Goalkeeper", status: "pending_payment", createdAt: new Date(base) });
  const fieldPositions = ["Forward", "Midfielder", "Defender", "Forward", "Midfielder", "Defender", "Forward", "Midfielder"] as const;
  for (let index = 0; index < 8; index += 1) {
    await addRegistration(eventId, {
      email: playerEmail(index + 3), ign: `Field${String(index + 3).padStart(2, "0")}`, uid: `SF-${String(index + 3).padStart(3, "0")}`,
      position: fieldPositions[index], status: "approved", createdAt: new Date(base + (index + 1) * 1000), willingCaptain: index === 0,
    });
  }
  // player-11 asks for a field slot after they are gone and waits in the queue.
  await addRegistration(eventId, { email: playerEmail(11), ign: "Field11", uid: "SF-011", position: "Forward", status: "queued", createdAt: new Date(base + 60_000) });
});

test.afterAll(async () => {
  // The proofs the players uploaded are real files under public/. Remove them with the rows that point at them.
  const proofs = await soloDb.soloRegistration.findMany({ where: { eventId, proofImageUrl: { startsWith: "/payment-proofs/" } }, select: { proofImageUrl: true } });
  await Promise.all(proofs.map(({ proofImageUrl }) => fs.rm(path.join(process.cwd(), "public", proofImageUrl!), { force: true })));
  await soloDb.user.deleteMany({ where: { email: { startsWith: "solo-newbie-" } } });
  await resetSoloEvent();
  await soloDb.$disconnect();
});

test.describe("solo tournament, main path", () => {
  test("a new player makes an account, gets a goalkeeper slot and sends the proof of payment", async ({ page }) => {
    // Sign-up is limited per address. A test-net address that is new on every run keeps repeated runs from hitting that limit.
    const run = Date.now();
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.19.${(run >> 8) % 250}.${(run % 250) + 1}` });
    await page.goto(`/id/register?as=player&returnTo=${encodeURIComponent(`/events/${SOLO_EVENT_SLUG}/register`)}`);
    // The form is a client component. Typing before it has hydrated is wiped when it does, so try again until it takes.
    await expect(async () => {
      await page.getByLabel("Nama lengkap").fill("Solo Newbie");
      await page.getByLabel("Email").fill(NEWBIE_EMAIL);
      await page.getByLabel("Nomor WhatsApp").fill("0812 5500 9001");
      await page.getByLabel("Password", { exact: true }).fill(NEW_PLAYER_PASSWORD);
      await page.getByLabel("Konfirmasi password").fill(NEW_PLAYER_PASSWORD);
      await page.getByRole("button", { name: "Buat Akun" }).click();
      await expect(page).toHaveURL(new RegExp(`/id/events/${SOLO_EVENT_SLUG}/register`), { timeout: 15_000 });
    }).toPass({ timeout: 75_000 });
    await expect(page.getByRole("heading", { name: "Flashpeak Solo Cup" })).toBeVisible();
    await fillRegistration(page, { ign: "NewKeeper", uid: "SK-100", position: "Goalkeeper" });

    await expect(page.getByText("Bayar untuk mengamankan slot")).toBeVisible({ timeout: 20_000 });
    await page.locator('input[name="paymentProof"]').setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: PROOF_PNG });
    await page.getByRole("button", { name: "Kirim bukti bayar" }).click();
    await expect(page.getByText("Bukti bayar sedang dicek")).toBeVisible({ timeout: 20_000 });
    expect((await soloRegistrationStatus(eventId, NEWBIE_EMAIL))?.status).toBe("pending_review");
  });

  test("a third goalkeeper waits in the queue and is not asked to pay", async ({ page }) => {
    await loginAsSoloPlayer(page, playerEmail(2));
    await page.goto(eventPath);
    await fillRegistration(page, { ign: "Keeper02", uid: "SK-002", position: "Goalkeeper" });

    await expect(page.getByRole("heading", { name: "Kamu di antrean" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Antrean ke-1 untuk Kiper")).toBeVisible();
    await expect(page.locator('input[name="paymentProof"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kirim bukti bayar" })).toHaveCount(0);
    expect((await soloRegistrationStatus(eventId, playerEmail(2)))?.status).toBe("queued");
  });

  test("when a goalkeeper withdraws, the queued one gets the slot and a payment deadline", async ({ browser }) => {
    const leaver = await browser.newPage();
    await loginAsSoloPlayer(leaver, playerEmail(1));
    await leaver.goto(eventPath);
    await expect(leaver.getByText("Bayar untuk mengamankan slot")).toBeVisible();
    await leaver.getByRole("button", { name: "Batalkan pendaftaran" }).click();
    await expect.poll(async () => (await soloRegistrationStatus(eventId, playerEmail(1)))?.status, { timeout: 20_000 }).toBe("withdrawn");
    await leaver.close();

    const next = await browser.newPage();
    await loginAsSoloPlayer(next, playerEmail(2));
    await next.goto(eventPath);
    await expect(next.getByText("Bayar untuk mengamankan slot")).toBeVisible({ timeout: 20_000 });
    await expect(next.getByText(/Bayar sebelum .+/)).toBeVisible();
    const promoted = await soloRegistrationStatus(eventId, playerEmail(2));
    expect(promoted?.status).toBe("pending_payment");
    expect(promoted?.expiresAt && promoted.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await next.locator('input[name="paymentProof"]').setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: PROOF_PNG });
    await next.getByRole("button", { name: "Kirim bukti bayar" }).click();
    await expect(next.getByText("Bukti bayar sedang dicek")).toBeVisible({ timeout: 20_000 });
    expect((await soloRegistrationStatus(eventId, playerEmail(2)))?.status).toBe("pending_review");
    await next.close();
  });

  test("the organizer approves both payments, closes the registration, draws the teams and locks them", async ({ page }) => {
    await loginAsOrganizer(page);
    const registration = `/id/organizer/events/${eventId}/registration`;

    await page.goto(`${registration}?view=payments`);
    for (const ign of ["NewKeeper", "Keeper02"]) {
      await page.getByRole("button", { name: new RegExp(ign) }).click();
      await page.getByRole("button", { name: "Setujui pembayaran" }).click();
      await expect(page.getByText("Keputusan pemeriksaan disimpan.")).toBeVisible({ timeout: 20_000 });
    }
    expect((await soloRegistrationStatus(eventId, NEWBIE_EMAIL))?.status).toBe("approved");
    expect((await soloRegistrationStatus(eventId, playerEmail(2)))?.status).toBe("approved");

    await page.goto(`${registration}?view=draw`);
    await expect(page.getByText("Tim yang jadi")).toBeVisible();
    const closeButton = page.getByRole("button", { name: "Tutup pendaftaran", exact: true });
    await closeButton.click();
    const closeDialog = page.getByRole("dialog", { name: "Tutup pendaftaran?" });
    await expect(closeDialog).toBeVisible();
    await expect(closeDialog.getByText("1 pemain di antrean akan dilepas tanpa bayar.")).toBeVisible();

    // Escape leaves nothing changed and hands the focus back to the button that opened the dialog.
    await page.keyboard.press("Escape");
    await expect(closeDialog).toBeHidden();
    await expect(closeButton).toBeFocused();
    expect((await soloDb.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true } })).status).toBe("Published");

    await closeButton.click();
    await closeDialog.getByRole("button", { name: "Tutup pendaftaran", exact: true }).click();
    await expect(page.getByText("Pendaftaran ditutup.")).toBeVisible({ timeout: 30_000 });
    expect((await soloDb.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true } })).status).toBe("Registration Closed");
    expect((await soloRegistrationStatus(eventId, playerEmail(11)))?.status).toBe("withdrawn");

    await page.getByRole("button", { name: "Acak tim", exact: true }).click();
    await expect(page.getByText("Hasil acak versi 1")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Tim 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Tim 2", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Kunci tim", exact: true }).click();
    await page.getByRole("dialog", { name: "Kunci tim?" }).getByRole("button", { name: "Kunci tim", exact: true }).click();
    await expect(page.getByText("Tim sudah dikunci")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("2 tim dibuat dari hasil acak versi 1.")).toBeVisible();
    expect(await soloDb.team.count({ where: { eventId, source: "solo-draw" } })).toBe(2);
    expect(await soloDb.player.count({ where: { eventId } })).toBe(10);
  });

  test("a player sees the team and its teammates' WhatsApp numbers, and nobody else does", async ({ page, browser }) => {
    const mine = await soloDb.player.findFirstOrThrow({ where: { eventId, user: { email: playerEmail(2) } }, select: { teamId: true } });
    const members = await soloDb.player.findMany({ where: { eventId }, select: { teamId: true, user: { select: { email: true, playerProfile: { select: { whatsapp: true } } } } } });
    const digits = (value: string | undefined) => (value ?? "").replace(/\D/g, "");
    const teammates = members.filter((member) => member.teamId === mine.teamId);
    const others = members.filter((member) => member.teamId !== mine.teamId);
    expect(teammates).toHaveLength(5);

    await loginAsSoloPlayer(page, playerEmail(2));
    await page.goto(`/id/player/team/${eventId}`);
    await expect(page.getByRole("heading", { name: /^Tim [12]/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anggota tim" })).toBeVisible();
    await expect(page.getByText("Nomor WhatsApp hanya terlihat oleh teman satu tim.")).toBeVisible();
    const links = await page.locator('a[href^="https://wa.me/"]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href.replace("https://wa.me/", "")));
    for (const teammate of teammates) expect(links).toContain(digits(teammate.user?.playerProfile?.whatsapp));
    for (const stranger of others) expect(links).not.toContain(digits(stranger.user?.playerProfile?.whatsapp));
    expect(await page.content()).not.toContain(digits(others[0].user?.playerProfile?.whatsapp));

    // The dashboard points at the same team.
    await page.goto("/id/player");
    await expect(page.getByRole("heading", { name: /^Tim [12]/ })).toBeVisible();
    await expect(page.getByLabel("Tim kamu").getByRole("link", { name: "Lihat tim" })).toHaveAttribute("href", `/id/player/team/${eventId}`);

    // Somebody who withdrew, somebody who never joined, and a visitor who is signed out see no team and no number.
    for (const email of [playerEmail(11), playerEmail(12)]) {
      const outsider = await browser.newPage();
      await loginAsSoloPlayer(outsider, email);
      await outsider.goto(`/id/player/team/${eventId}`);
      // The page streams in behind a loading state, so the not-found page can arrive with status 200; what matters is its content.
      await expect(outsider.getByRole("heading", { name: "Halaman Tidak Ditemukan" })).toBeVisible({ timeout: 20_000 });
      await expect(outsider.getByText("Anggota tim")).toHaveCount(0);
      expect(await outsider.locator('a[href^="https://wa.me/"]').count()).toBe(0);
      await outsider.close();
    }
    const visitor = await browser.newPage();
    await visitor.goto(`/id/player/team/${eventId}`);
    await expect(visitor).toHaveURL(/\/id\/login/);
    await visitor.close();
  });

  test("the captain the draw chose runs their own team's page and cannot register a team elsewhere", async ({ page }) => {
    const team = await soloDb.team.findFirstOrThrow({ where: { eventId }, orderBy: { createdAt: "asc" }, select: { name: true, captain: { select: { email: true } } } });
    const email = team.captain!.email;
    await loginAsSoloPlayer(page, email, email === NEWBIE_EMAIL ? NEW_PLAYER_PASSWORD : SEED_PASSWORD);

    await page.goto("/id/captain");
    await expect(page.getByText(team.name).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Pemain tim ini dari hasil acak. Hubungi organizer kalau ada yang perlu diganti.")).toBeVisible();
    // The draw is the roster: no way to add, rename or remove a player from here.
    await expect(page.locator('a[href*="edit="], a[href*="confirm="]')).toHaveCount(0);
    await expect(page.locator('input[name="nickname"]')).toHaveCount(0);

    // Registering a team is for captains who made an account as one. This one is a player account.
    await page.goto("/id/events/flashpeak-revision-published/register");
    // The page must have rendered before "nothing there" means anything.
    await expect(page.getByRole("heading", { name: "Flashpeak Revision Published" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[name="teamName"], input[name="teamTag"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Daftarkan timmu" })).toHaveCount(0);
  });

  test("the organizer's group and bracket draw works on the locked teams without any other change", async ({ page }) => {
    const event = await soloDb.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerUserId: true } });
    const teams = await soloDb.team.findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const operations = createCompetitionOperations(soloDb);
    let sequence = 0;
    const run = async (command: Parameters<typeof operations.execute>[0]["command"]) => {
      const { competitionVersion } = await soloDb.event.findUniqueOrThrow({ where: { id: eventId }, select: { competitionVersion: true } });
      return operations.execute({ eventId, actor: { id: event.organizerUserId!, role: "organizer" }, expectedVersion: competitionVersion, idempotencyKey: `solo-e2e-${Date.now()}-${++sequence}`, command });
    };
    const config = { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 1, final: 1, thirdPlace: 1 } } as const;

    await run({ kind: "drawing_save", config, teams: teams.map((team, index) => ({ id: team.id, seed: index + 1 })) });
    await run({ kind: "drawing_publish" });
    expect(await soloDb.match.count({ where: { eventId } })).toBeGreaterThan(0);
    expect(await soloDb.team.count({ where: { eventId } })).toBe(2);

    await loginAsOrganizer(page);
    await page.goto(`/id/organizer/events/${eventId}/competition`);
    await expect(page.getByRole("heading", { name: "Kompetisi" })).toBeVisible({ timeout: 30_000 });
  });

  test("a solo player cannot join a team event, running or not, and the organizer sees how each event takes players", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsSoloPlayer(page, playerEmail(12));

    // A team event that is open for registration, and one that is already being played.
    for (const [slug, name] of [["flashpeak-revision-published", "Flashpeak Revision Published"], ["flashpeak-rising-64", "Flashpeak Rising 64"]] as const) {
      await page.goto(`/id/events/${slug}`);
      await expect(page.getByRole("heading", { name }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: "Daftar solo" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Daftar solo" })).toHaveCount(0);

      await page.goto(`/id/events/${slug}/register`);
      await expect(page.getByRole("heading", { name }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('input[name="ign"], input[name="uid"], select[name="primaryPosition"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Daftar solo" })).toHaveCount(0);
    }
    expect(await soloDb.soloRegistration.count({ where: { user: { email: playerEmail(12) } } })).toBe(0);

    // The organizer's locked event page says how that event takes players.
    const running = await soloDb.event.findUniqueOrThrow({ where: { slug: "flashpeak-rising-64" }, select: { id: true } });
    const organizerPage = await page.context().browser()!.newPage();
    await loginAsOrganizer(organizerPage);
    await organizerPage.goto(`/id/organizer/events/${running.id}/edit`);
    await expect(organizerPage.locator("[data-entry-mode-fact]")).toHaveText("Cara daftar: Hanya tim", { timeout: 30_000 });
    await organizerPage.close();
  });

  const VIEWPORTS = [
    { name: "360", width: 360, height: 800 },
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 900 },
    { name: "1024", width: 1024, height: 900 },
    { name: "1440", width: 1440, height: 900 },
  ] as const;

  test("the new pages fit every screen width, keep targets reachable and stay still under reduced motion", async ({ page }) => {
    await normalizeReleasePage(page);
    const check = async (url: string) => {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${url} at ${viewport.name}px must not scroll sideways`).toBeLessThanOrEqual(0);
        const small = await page.evaluate(() => [...document.querySelectorAll("main a[href], main button")].filter((el) => {
          const box = el.getBoundingClientRect();
          const inline = el.closest("p, li > p, span.inline") !== null;
          return box.width > 0 && box.height > 0 && !inline && Math.min(box.height, box.width) < 44;
        }).map((el) => (el.textContent ?? "").trim().slice(0, 40)));
        expect(small, `${url} at ${viewport.name}px has targets under 44px`).toEqual([]);
      }
    };

    await check("/id/register");
    await check(`/id/events/${SOLO_EVENT_SLUG}/register`);
    await loginAsSoloPlayer(page, playerEmail(2));
    for (const url of ["/id/player", "/id/player/registrations", `/id/player/team/${eventId}`, "/id/player/profile", "/id/player/settings"]) {
      await check(url);
      await probeReleaseReducedMotion(page);
    }
  });
});

