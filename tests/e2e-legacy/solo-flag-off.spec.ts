import { expect, test } from "@playwright/test";

import { loginAsSoloPlayer, playerEmail, resetSoloEvent, soloDb, SOLO_EVENT_SLUG } from "../e2e/helpers/solo";

/**
 * Flags-off profile: FEATURE_FLAG_SOLO_TOURNAMENT_V1 is off. Nobody can choose the player role or reach a
 * solo page, the solo event stays closed to joining, and nothing else on the site changes.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

let eventId = "";

test.beforeAll(async () => {
  eventId = await resetSoloEvent();
});

test.afterAll(async () => {
  await soloDb.$disconnect();
});

const notFound = (page: import("@playwright/test").Page) => page.getByRole("heading", { name: "Halaman Tidak Ditemukan" });

test("sign-up offers no player role", async ({ page }) => {
  await page.goto("/id/register");
  await expect(page.getByRole("heading", { name: "Buat Akun Captain" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Kamu mau daftar sebagai apa?")).toHaveCount(0);

  await page.goto("/id/register?as=player");
  await expect(page.getByRole("heading", { name: "Buat Akun Pemain" })).toHaveCount(0);
});

test("the solo sign-up page of the event is not there", async ({ page }) => {
  await page.goto(`/id/events/${SOLO_EVENT_SLUG}/register`);
  await expect(notFound(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Daftar solo" })).toHaveCount(0);
});

test("the public event page does not ask anyone to join solo", async ({ page }) => {
  await page.goto(`/id/events/${SOLO_EVENT_SLUG}`);
  await expect(page.getByRole("heading", { name: "Flashpeak Solo Cup" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Daftar solo" })).toHaveCount(0);
  await expect(page.locator(`a[href$="/events/${SOLO_EVENT_SLUG}/register"]`)).toHaveCount(0);
});

test("a player account reaches no player page", async ({ page }) => {
  await loginAsSoloPlayer(page, playerEmail(1));
  for (const path of ["/id/player", `/id/player/team/${eventId}`, "/id/player/registrations", "/id/player/profile"]) {
    await page.goto(path);
    await expect(notFound(page)).toBeVisible({ timeout: 30_000 });
  }
});
