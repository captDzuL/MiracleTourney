import { expect, test, type Page, type Response } from "@playwright/test";

import { loginAsOrganizer, normalizeReleasePage, waitForReleaseFonts } from "./helpers/auth";
import {
  completionDb,
  prepareCompletionFixture,
  type CompletionFixture,
  type CompletionFixtureReady,
  type CompletionFixtureKind,
} from "./helpers/completion";

test.describe.configure({ mode: "serial" });

function assertCompletionReadHealthy() {
  const errors = test.info().errors;
  expect(errors).toHaveLength(0);
  expect(errors.some(({ message }) => /P2028/.test(message ?? ""))).toBe(false);
}

let fixture: CompletionFixture | undefined;
let fixtureCleanup: CompletionFixtureReady | undefined;
let completionActionResponse: Promise<Response> | undefined;
let completionActionResponsePending = false;
test.afterEach(async () => {
  await test.step("fixture cleanup", async () => {
    if (completionActionResponsePending && completionActionResponse) {
      await completionActionResponse.catch(() => undefined);
    }
    const cleanup = fixtureCleanup ?? fixture;
    await cleanup?.cleanup();
    fixture = undefined;
    fixtureCleanup = undefined;
    completionActionResponse = undefined;
    completionActionResponsePending = false;
  });
});

async function prepareTestCompletionFixture(kind: CompletionFixtureKind) {
  const scenario = await prepareCompletionFixture(kind, undefined, {
    onBaseFixtureReady: (baseFixture) => {
      fixtureCleanup = baseFixture;
    },
  });
  fixture = scenario;
  fixtureCleanup = scenario;
  return scenario;
}

function waitForCompletionActionResponse(page: Page, locale: "en" | "id", eventId: string) {
  const completionPath = `/${locale}/organizer/events/${encodeURIComponent(eventId)}/completion`;
  return page.waitForResponse((response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    const requestData = request.postData() ?? "";
    return request.method() === "POST"
      && responseUrl.pathname === completionPath
      && Boolean(request.headers()["next-action"])
      && requestData.includes(eventId);
  });
}

for (const kind of ["single_elimination", "double_elimination", "round_robin", "group_playoffs"] as const satisfies readonly CompletionFixtureKind[]) {
  test(`completes the authoritative ${kind} release format with an audited tied award`, async ({ page }) => {
    const scenario = await test.step("fixture setup", () => prepareTestCompletionFixture(kind));
    await test.step("organizer authentication", () => loginAsOrganizer(page, "en"));
    await test.step("completion navigation and readiness", async () => {
      await page.goto(`/en/organizer/events/${scenario.id}/completion`);
      await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "ready");
      assertCompletionReadHealthy();
      await page.getByRole("tab", { name: "Awards", exact: true }).click();
      for (const award of ["mvp", "top_scorer", "top_defender", "top_assist"]) {
        await page.locator(`[data-award="${award}"] input[type="radio"]`).first().check();
      }
      await page.getByLabel("Decision reason").fill("Equal assists; selected for decisive final contribution.");
    });

    let completionResponse: Response;
    await test.step("completion action response", async () => {
      const completionResponsePromise = waitForCompletionActionResponse(page, "en", scenario.id);
      completionActionResponse = completionResponsePromise;
      completionActionResponsePending = true;
      void completionResponsePromise.then(
        () => { completionActionResponsePending = false; },
        () => { completionActionResponsePending = false; },
      );
      const completeButton = page.locator("[data-complete-tournament]");
      const startedAt = performance.now();
      [completionResponse] = await Promise.all([completionResponsePromise, completeButton.click()]);
      const responseDurationMs = Math.round(performance.now() - startedAt);
      console.info(`[completion-action] status=${completionResponse.status()} durationMs=${responseDurationMs}`);
      await test.info().attach("completion-action-response", {
        body: `status=${completionResponse.status()}\ndurationMs=${responseDurationMs}\n`,
        contentType: "text/plain",
      });
      expect(completionResponse.status()).toBe(200);
    });

    await test.step("persistence", async () => {
      const persisted = await completionDb.tournamentCompletion.findUniqueOrThrow({
        where: { eventId: scenario.id },
        include: { podiumPlacements: true, awards: { include: { decision: true } }, auditEntries: true },
      });
      assertCompletionReadHealthy();
      expect(persisted.status).toBe("completed");
      expect(persisted.podiumPlacements).toHaveLength(3);
      const expectedSource = kind === "round_robin" ? "locked_standings" : "official_playoff";
      const titleMatchId = kind === "round_robin"
        ? null
        : (() => {
            const source = scenario.graph.placements.find(({ rank }) => rank === 1)?.source;
            return source?.kind === "match" ? source.matchId : null;
          })();
      const thirdMatchId = kind === "round_robin"
        ? null
        : (() => {
            const source = scenario.graph.placements.find(({ rank }) => rank === 3)?.source;
            return source?.kind === "match" ? source.matchId : null;
          })();
      expect(persisted.podiumPlacements.sort((left, right) => left.rank - right.rank).map((row) => ({
        rank: row.rank,
        teamId: row.teamId,
        source: row.source,
        sourceMatchId: row.sourceMatchId,
      }))).toEqual([
        { rank: 1, teamId: scenario.teams[0].id, source: expectedSource, sourceMatchId: titleMatchId },
        { rank: 2, teamId: scenario.teams[1].id, source: expectedSource, sourceMatchId: titleMatchId },
        { rank: 3, teamId: scenario.teams[kind === "double_elimination" ? 3 : 2].id, source: expectedSource, sourceMatchId: thirdMatchId },
      ]);
      expect(persisted.awards).toHaveLength(4);
      expect(persisted.awards.find(({ type }) => type === "top_assist")?.decision?.reason).toContain("Equal assists");
      expect(persisted.auditEntries).toHaveLength(1);
    });

    await test.step("completion refresh", async () => {
      await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "completed");
      assertCompletionReadHealthy();
    });
  });
}

test("completion workspace keeps localized parity and bounded mobile controls", async ({ page }) => {
  test.slow();
  fixture = await prepareCompletionFixture("single_elimination", "release-completion-parity");
  for (const locale of ["id", "en"] as const) {
    await normalizeReleasePage(page);
    await page.setViewportSize({ width: locale === "id" ? 390 : 1440, height: locale === "id" ? 844 : 900 });
    await loginAsOrganizer(page, locale);
    await page.goto(`/${locale}/organizer/events/${fixture.id}/completion`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("[data-completion-workspace]")).toBeVisible();
    await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "ready");
    const geometry = await page.locator("[data-completion-workspace]").evaluate((root) => ({
      clientWidth: (root as HTMLElement).clientWidth,
      scrollWidth: (root as HTMLElement).scrollWidth,
      controls: Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary'))
        .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
        .map((element) => ({ label: element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName, height: element.getBoundingClientRect().height })),
    }));
    expect(geometry.scrollWidth, `${locale} completion workspace overflows`).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.controls.filter(({ height }) => height < 44), `${locale} completion control below 44px`).toEqual([]);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await waitForReleaseFonts(page);
    await page.screenshot({
      path: test.info().outputPath(`completion-${locale}-${locale === "id" ? "390" : "1440"}.png`),
      animations: "disabled",
    });
  }
});
