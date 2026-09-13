import { expect, test as base, type Page } from "@playwright/test";
import { matchdayDb, prepareMatchdayFixture } from "../e2e/helpers/matchday";
import { Prisma } from "@prisma/client";
import { loginAsOrganizer } from "../e2e/helpers/auth";

type LegacyFixture = Awaited<ReturnType<typeof prepareMatchdayFixture>>;
const test = base.extend<{ legacy: LegacyFixture }>({
  legacy: async ({}, use) => {
    const fixture = await prepareMatchdayFixture("round_robin", "empty");
    try {
      await matchdayDb.event.update({ where: { id: fixture.id }, data: { formatConfig: Prisma.DbNull } });
      await matchdayDb.match.createMany({ data: [1, 2].map(round => ({ id: `${fixture.id}-legacy-${round}`, eventId: fixture.id, round, slot: 1, roundLabel: `Round ${round}`, homeTeamId: fixture.teams[(round - 1) * 2].id, awayTeamId: fixture.teams[(round - 1) * 2 + 1].id, status: "Scheduled" as const })) });
      expect(await matchdayDb.competitionPhase.count({ where: { eventId: fixture.id } })).toBe(0);
      await use(fixture);
    } finally {
      try { expect(await matchdayDb.competitionPhase.count({ where: { eventId: fixture.id } })).toBe(0); }
      finally { await fixture.cleanup(); }
    }
  },
});

async function expectV3Unavailable(page: Page, fixture: LegacyFixture) {
  expect(await page.evaluate(async (url) => (await fetch(url)).status, `/api/events/${fixture.slug}/ongoing`)).toBe(404);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, `/api/organizer/events/${fixture.id}/competition`)).toBe(404);
}

async function openLegacyMatch(page: Page, fixture: LegacyFixture, round: number) {
  await loginAsOrganizer(page, "en");
  const route = `/en/organizer/events/${fixture.id}/legacy-match-day`;
  await page.goto(`${route}?matchId=${fixture.id}-legacy-${round}`);
  await expect(page.getByRole("main")).toContainText(round === 1 ? "Team 1" : "Team 3");
  await expectV3Unavailable(page, fixture);
  return route;
}

test("flags off preserve legacy public rendering and deny V3 APIs", async ({ page, legacy }) => {
  await page.goto(`/en/events/${legacy.slug}`);
  await expect(page.getByRole("heading", { name: /Match Day round_robin/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live now", exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/events/${legacy.slug}/ongoing`)).status()).toBe(404);
  await loginAsOrganizer(page, "en");
  await expectV3Unavailable(page, legacy);
});

test("flags off keep organizer BO1 result feedback on the English legacy route", async ({ page, legacy }) => {
  const route = await openLegacyMatch(page, legacy, 1);
  await page.locator('input[name="homeScore"]').fill("2");
  await page.locator('input[name="awayScore"]').fill("0");
  await page.getByRole("button", { name: "Save match result", exact: true }).click();
  await expect(page).toHaveURL(`${route}?matchId=${legacy.id}-legacy-1&success=match-result-updated`);
  expect(await matchdayDb.match.findUniqueOrThrow({ where: { id: `${legacy.id}-legacy-1` } })).toMatchObject({ status: "Completed", homeScore: 2, awayScore: 0 });
});

test("flags off keep organizer round configuration feedback on the English legacy route", async ({ page, legacy }) => {
  const route = await openLegacyMatch(page, legacy, 2);
  const roundConfig = page.getByRole("combobox", { name: "Round 2", exact: true });
  await expect(roundConfig).toBeVisible();
  await roundConfig.selectOption("3");
  const saveButton = roundConfig.locator("xpath=ancestor::form[1]").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await expect(
    saveButton.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return hitTarget === button || button.contains(hitTarget);
    }),
  ).resolves.toBe(true);
  await saveButton.click();
  await expect(page).toHaveURL(`${route}?success=round-config-saved`);
  expect(await matchdayDb.eventRoundConfig.findFirstOrThrow({ where: { eventId: legacy.id, roundLabel: "Round 2" } })).toMatchObject({ bestOf: 3 });
});

test("flags off keep organizer BO3 series feedback on the English legacy route", async ({ page, legacy }) => {
  // This story starts with a configured series; configuration UI is covered by
  // its own isolated story rather than relying on another test's mutation.
  await matchdayDb.eventRoundConfig.create({ data: { eventId: legacy.id, roundLabel: "Round 2", bestOf: 3 } });
  const route = await openLegacyMatch(page, legacy, 2);
  for (const game of [1, 2]) {
    await page.locator(`input[name="game${game}_home"]`).fill("2");
    await page.locator(`input[name="game${game}_away"]`).fill("0");
  }
  await page.getByRole("button", { name: "Save game results", exact: true }).click();
  await expect(page).toHaveURL(`${route}?matchId=${legacy.id}-legacy-2&success=match-games-saved`);
  expect(await matchdayDb.match.findUniqueOrThrow({ where: { id: `${legacy.id}-legacy-2` } })).toMatchObject({ status: "Completed", homeScore: 2, awayScore: 0 });
});
