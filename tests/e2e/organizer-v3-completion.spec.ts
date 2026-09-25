import { expect, test, type BrowserContext, type Page, type Request, type Response } from "@playwright/test";

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
let activeCompletionContext: BrowserContext | undefined;

async function cleanupCompletionResources() {
  if (completionActionResponsePending && completionActionResponse) {
    await completionActionResponse.catch(() => undefined);
  }
  if (activeCompletionContext) {
    await activeCompletionContext.close().catch(() => undefined);
    activeCompletionContext = undefined;
  }
  const cleanup = fixtureCleanup ?? fixture;
  await cleanup?.cleanup();
  fixture = undefined;
  fixtureCleanup = undefined;
  completionActionResponse = undefined;
  completionActionResponsePending = false;
}

test.afterEach(async () => {
  await test.step("fixture cleanup", cleanupCompletionResources);
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

function completionPath(locale: "en" | "id", eventId: string) {
  return `/${locale}/organizer/events/${encodeURIComponent(eventId)}/completion`;
}

function isCompletionActionRequest(request: Request, locale: "en" | "id", eventId: string) {
  const requestUrl = new URL(request.url());
  return request.method() === "POST"
    && requestUrl.pathname === completionPath(locale, eventId)
    && Boolean(request.headers()["next-action"])
    && (request.postData() ?? "").includes(eventId);
}

function waitForCompletionActionResponse(page: Page, locale: "en" | "id", eventId: string) {
  const expectedPath = completionPath(locale, eventId);
  return page.waitForResponse((response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    return responseUrl.pathname === expectedPath && isCompletionActionRequest(request, locale, eventId);
  });
}

async function runCompletionJourney(
  page: Page,
  scenario: CompletionFixture,
  kind: CompletionFixtureKind,
  options: { holdTerminalRefresh?: boolean } = {},
) {
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

  const expectedPath = completionPath("en", scenario.id);
  const matchingActionPosts: Request[] = [];
  const actionRequestListener = (request: Request) => {
    if (isCompletionActionRequest(request, "en", scenario.id)) matchingActionPosts.push(request);
  };
  let releaseTerminalRefresh: (() => void) | undefined;
  let terminalRefreshStartedResolve!: () => void;
  let terminalRefreshFinishedResolve!: () => void;
  const terminalRefreshStarted = new Promise<void>((resolve) => { terminalRefreshStartedResolve = resolve; });
  const terminalRefreshFinished = new Promise<void>((resolve) => { terminalRefreshFinishedResolve = resolve; });
  const terminalRefreshGate = new Promise<void>((resolve) => { releaseTerminalRefresh = resolve; });
  let heldTerminalRefreshCount = 0;
  let pendingTerminalRefreshCount = 0;
  let terminalRefreshRouteInstalled = false;
  const terminalRefreshRouteMatcher = (url: URL) => url.pathname === expectedPath;
  const terminalRefreshRouteHandler = async (route: { request: () => Request; continue: () => Promise<void> }) => {
    const request = route.request();
    const headers = request.headers();
    const isAuthoritativeRefresh = request.method() === "GET"
      && new URL(request.url()).pathname === expectedPath
      && headers.rsc === "1"
      && Boolean(headers["next-router-state-tree"]);
    if (!options.holdTerminalRefresh || !isAuthoritativeRefresh) {
      await route.continue();
      return;
    }
    heldTerminalRefreshCount += 1;
    pendingTerminalRefreshCount += 1;
    terminalRefreshStartedResolve();
    try {
      await terminalRefreshGate;
      await route.continue();
    } finally {
      pendingTerminalRefreshCount -= 1;
      if (pendingTerminalRefreshCount === 0) terminalRefreshFinishedResolve();
    }
  };

  page.on("request", actionRequestListener);
  try {
    if (options.holdTerminalRefresh) {
      await page.route(terminalRefreshRouteMatcher, terminalRefreshRouteHandler);
      terminalRefreshRouteInstalled = true;
    }

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
      console.info(`[completion-action] kind=${kind} status=${completionResponse.status()} durationMs=${responseDurationMs}`);
      await test.info().attach(`completion-action-response-${kind}`, {
        body: `status=${completionResponse.status()}\ndurationMs=${responseDurationMs}\n`,
        contentType: "text/plain",
      });
      expect(completionResponse.status()).toBe(200);
      expect(matchingActionPosts).toHaveLength(1);
    });

    if (options.holdTerminalRefresh) {
      await test.step("terminal projection before authoritative refresh", async () => {
        await terminalRefreshStarted;
        expect(heldTerminalRefreshCount).toBe(1);
        await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "completed");
        const reopenButton = page.locator("[data-reopen-tournament]");
        await expect(reopenButton).toBeDisabled();
        expect(await reopenButton.isEnabled()).toBe(false);
        await test.info().attach("completion-terminal-projection", {
          body: `matchingActionPostCount=${matchingActionPosts.length}\nheldAuthoritativeRefreshCount=${heldTerminalRefreshCount}\nstatus=completed\nreopenDisabled=true\n`,
          contentType: "text/plain",
        });
      });
      releaseTerminalRefresh?.();
      await terminalRefreshFinished;
      await page.unroute(terminalRefreshRouteMatcher, terminalRefreshRouteHandler);
      terminalRefreshRouteInstalled = false;
    }

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
  } finally {
    releaseTerminalRefresh?.();
    if (heldTerminalRefreshCount > 0) await terminalRefreshFinished;
    if (terminalRefreshRouteInstalled) await page.unroute(terminalRefreshRouteMatcher, terminalRefreshRouteHandler).catch(() => undefined);
    page.off("request", actionRequestListener);
  }
}

let singleEliminationStorageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

test.describe("single-elimination Completion budget", () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const startedAt = performance.now();
    const scenario = await prepareTestCompletionFixture("single_elimination");
    const prewarmContext = await browser.newContext();
    try {
      const prewarmPage = await prewarmContext.newPage();
      await loginAsOrganizer(prewarmPage, "en");
      const completionUrl = `/en/organizer/events/${scenario.id}/completion`;
      await prewarmPage.goto(completionUrl);
      await expect(prewarmPage.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "ready");
      assertCompletionReadHealthy();
      singleEliminationStorageState = await prewarmContext.storageState();
    } finally {
      await prewarmContext.close();
    }
    const durationMs = Math.round(performance.now() - startedAt);
    console.info(`[completion-prerequisites] kind=single_elimination durationMs=${durationMs}`);
    await testInfo.attach("completion-single-elimination-prerequisites", {
      body: `durationMs=${durationMs}\nfixture=before-timed-test\nauthentication=prewarm-context\nroute=exact-event-completion\n`,
      contentType: "text/plain",
    });
  });

  test.afterAll(async () => {
    await cleanupCompletionResources();
  });

  test("completes the authoritative single_elimination release format with an audited tied award", async ({ browser }) => {
    const timedBodyStartedAt = performance.now();
    const scenario = fixture;
    const storageState = singleEliminationStorageState;
    if (!scenario || !storageState) throw new Error("Single-elimination Completion prerequisites were not prepared.");

    const completionContext = await browser.newContext({ storageState: singleEliminationStorageState });
    activeCompletionContext = completionContext;
    try {
      const page = await completionContext.newPage();
      await runCompletionJourney(page, scenario, "single_elimination", { holdTerminalRefresh: true });
    } finally {
      if (!completionActionResponsePending) {
        await completionContext.close();
        activeCompletionContext = undefined;
      }
    }
    const testBodyDurationMs = Math.round(performance.now() - timedBodyStartedAt);
    console.info(`[completion-test-body] kind=single_elimination measuredFrom=first-test-line attachment=excluded durationMs=${testBodyDurationMs}`);
    await test.info().attach("completion-single-elimination-test-body", {
      body: `testBodyDurationMs=${testBodyDurationMs}\nmeasuredFrom=first-test-line\nattachment=excluded\nfixture=pre-created\nauthentication=prewarmed-storage-state\n`,
      contentType: "text/plain",
    });
  });
});

for (const kind of ["double_elimination", "round_robin", "group_playoffs"] as const satisfies readonly CompletionFixtureKind[]) {
  test(`completes the authoritative ${kind} release format with an audited tied award`, async ({ page }) => {
    const scenario = await test.step("fixture setup", () => prepareTestCompletionFixture(kind));
    await test.step("organizer authentication", () => loginAsOrganizer(page, "en"));
    await runCompletionJourney(page, scenario, kind);
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
