import { expect, test } from "@playwright/test";

import { loginAsOrganizer } from "./helpers/auth";
import {
  completionDb,
  prepareCompletionFixture,
  type CompletionFixture,
  type CompletionFixtureKind,
} from "./helpers/completion";

test.describe.configure({ mode: "serial" });

function assertCompletionReadHealthy() {
  const errors = test.info().errors;
  expect(errors).toHaveLength(0);
  expect(errors.some(({ message }) => /P2028/.test(message ?? ""))).toBe(false);
}

let fixture: CompletionFixture | undefined;
test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

for (const kind of ["single_elimination", "double_elimination", "round_robin", "group_playoffs"] as const satisfies readonly CompletionFixtureKind[]) {
  test(`completes the authoritative ${kind} release format with an audited tied award`, async ({ page }) => {
    fixture = await prepareCompletionFixture(kind);
    await loginAsOrganizer(page, "en");
    await page.goto(`/en/organizer/events/${fixture.id}/completion`);

    await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "ready");
    assertCompletionReadHealthy();
    await page.getByRole("tab", { name: "Awards", exact: true }).click();
    for (const award of ["mvp", "top_scorer", "top_defender", "top_assist"]) {
      await page.locator(`[data-award="${award}"] input[type="radio"]`).first().check();
    }
    await page.getByLabel("Decision reason").fill("Equal assists; selected for decisive final contribution.");
    await page.locator("[data-complete-tournament]").click();

    await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "completed");
    assertCompletionReadHealthy();
    const persisted = await completionDb.tournamentCompletion.findUniqueOrThrow({
      where: { eventId: fixture.id },
      include: { podiumPlacements: true, awards: { include: { decision: true } }, auditEntries: true },
    });
    assertCompletionReadHealthy();
    expect(persisted.podiumPlacements).toHaveLength(3);
    const expectedSource = kind === "round_robin" ? "locked_standings" : "official_playoff";
    const titleMatchId = kind === "round_robin"
      ? null
      : (() => {
          const source = fixture.graph.placements.find(({ rank }) => rank === 1)?.source;
          return source?.kind === "match" ? source.matchId : null;
        })();
    const thirdMatchId = kind === "round_robin"
      ? null
      : (() => {
          const source = fixture.graph.placements.find(({ rank }) => rank === 3)?.source;
          return source?.kind === "match" ? source.matchId : null;
        })();
    expect(persisted.podiumPlacements.sort((left, right) => left.rank - right.rank).map((row) => ({
      rank: row.rank,
      teamId: row.teamId,
      source: row.source,
      sourceMatchId: row.sourceMatchId,
    }))).toEqual([
      { rank: 1, teamId: fixture.teams[0].id, source: expectedSource, sourceMatchId: titleMatchId },
      { rank: 2, teamId: fixture.teams[1].id, source: expectedSource, sourceMatchId: titleMatchId },
      { rank: 3, teamId: fixture.teams[kind === "double_elimination" ? 3 : 2].id, source: expectedSource, sourceMatchId: thirdMatchId },
    ]);
    expect(persisted.awards).toHaveLength(4);
    expect(persisted.awards.find(({ type }) => type === "top_assist")?.decision?.reason).toContain("Equal assists");
    expect(persisted.auditEntries).toHaveLength(1);
  });
}
