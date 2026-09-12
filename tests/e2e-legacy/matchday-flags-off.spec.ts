import { expect, test } from "@playwright/test";
import { matchdayDb, prepareMatchdayFixture } from "../e2e/helpers/matchday";
import { Prisma } from "@prisma/client";
import { loginAsOrganizer } from "../e2e/helpers/auth";
test("competition flags off preserve legacy public rendering and organizer operations", async ({ page }) => {
  const fixture = await prepareMatchdayFixture("round_robin", "empty");
  try {
    await matchdayDb.event.update({ where: { id: fixture.id }, data: { formatConfig: Prisma.DbNull } });
    await matchdayDb.match.createMany({ data: [1, 2].map(round => ({ id: `${fixture.id}-legacy-${round}`, eventId: fixture.id, round, slot: 1, roundLabel: `Round ${round}`, homeTeamId: fixture.teams[(round - 1) * 2].id, awayTeamId: fixture.teams[(round - 1) * 2 + 1].id, status: "Scheduled" as const })) });
    expect(await matchdayDb.competitionPhase.count({ where: { eventId: fixture.id } })).toBe(0);
    await page.goto(`/en/events/${fixture.slug}`);
    await expect(page.getByRole("heading", { name: /Match Day round_robin/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live now", exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/events/${fixture.slug}/ongoing`)).status()).toBe(404);
    await loginAsOrganizer(page, "en");
    const route = `/en/organizer/events/${fixture.id}/legacy-match-day`;
    await page.goto(`${route}?matchId=${fixture.id}-legacy-1`);
    await expect(page.getByRole("main")).toContainText("Team 1");
    expect((await page.request.get(`/api/organizer/events/${fixture.id}/competition`)).status()).toBe(404);
    await page.locator('input[name="homeScore"]').fill("2"); await page.locator('input[name="awayScore"]').fill("0");
    await page.getByRole("button", { name: "Save match result", exact: true }).click();
    await expect(page).toHaveURL(`${route}?matchId=${fixture.id}-legacy-1&success=match-result-updated`);
    expect(await matchdayDb.match.findUniqueOrThrow({ where: { id: `${fixture.id}-legacy-1` } })).toMatchObject({ status: "Completed", homeScore: 2, awayScore: 0 });
    const config = page.locator("form").filter({ has: page.getByLabel("Round 2", { exact: true }) });
    await config.getByLabel("Round 2", { exact: true }).selectOption("3");
    await config.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(`${route}?success=round-config-saved`);
    expect(await matchdayDb.eventRoundConfig.findFirstOrThrow({ where: { eventId: fixture.id, roundLabel: "Round 2" } })).toMatchObject({ bestOf: 3 });
    await page.goto(`${route}?matchId=${fixture.id}-legacy-2`);
    for (const game of [1, 2]) { await page.locator(`input[name="game${game}_home"]`).fill("2"); await page.locator(`input[name="game${game}_away"]`).fill("0"); }
    await page.getByRole("button", { name: "Save game results", exact: true }).click();
    await expect(page).toHaveURL(`${route}?matchId=${fixture.id}-legacy-2&success=match-games-saved`);
    expect(await matchdayDb.match.findUniqueOrThrow({ where: { id: `${fixture.id}-legacy-2` } })).toMatchObject({ status: "Completed", homeScore: 2, awayScore: 0 });
    expect(await matchdayDb.competitionPhase.count({ where: { eventId: fixture.id } })).toBe(0);
  } finally { await fixture.cleanup(); }
});
