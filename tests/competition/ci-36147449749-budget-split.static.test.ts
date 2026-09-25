import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const overnight = read("tests/e2e/overnight-smoke.spec.ts");
const globalSetup = read("tests/e2e/global-setup.ts");
const discovery = read("tests/e2e/v3-public-discovery.spec.ts");
const lifecycle = read("tests/e2e/v3-public-event-lifecycle.spec.ts");
const organizer = read("tests/e2e/v3-organizer-lifecycle.spec.ts");
const serverAction = read("tests/e2e/helpers/server-action.ts");
const playwrightConfig = read("playwright.ci-default.config.ts");
const e2eCi = read("scripts/e2e-ci.mjs");

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate contract block: ${startMarker}`);
  return source.slice(start, end);
}

function countLiteral(source: string, literal: string) {
  return source.split(literal).length - 1;
}

function assertAdaptiveLifecycleContract(source: string) {
  expect(source).toContain('test.describe.serial("Adaptive public event lifecycle", () => {');
  expect(source).toContain("test.describe.configure({ timeout: 120_000 });");
  expect(source).toContain('test("keeps one permanent URL across registration, drawing, ongoing, and finished"');
  for (const marker of ["Template bracket", "Drawing resmi", "Event berlangsung", "Hasil akhir resmi"]) {
    expect(source).toContain(marker);
  }

  expect(source).toContain("let operationVersion = (await prisma.event.findUniqueOrThrow({");
  expect(source).toContain("expectedVersion: operationVersion");
  expect(source).toContain("operationVersion = receipt.version;");
  expect(source).toContain("const inFlightOperations = new Set<Promise<unknown>>();");
  expect(source).toContain("inFlightOperations.add(operation);");
  expect(source).toContain("inFlightOperations.delete(operation);");
  expect(source).toContain("while (inFlightOperations.size > 0)");
  expect(source).toContain("await Promise.allSettled([...inFlightOperations]);");

  const run = sliceBetween(source, "const run = async", "const updateStatus = async");
  expect(run).not.toContain("findUniqueOrThrow");
  expect(run).not.toContain("competitionVersion");
  const afterAll = sliceBetween(source, "test.afterAll(async () => {", '  test("');
  expect(afterAll.indexOf("await Promise.allSettled([...inFlightOperations]);")).toBeGreaterThanOrEqual(0);
  expect(afterAll.indexOf("await Promise.allSettled([...inFlightOperations]);")).toBeLessThan(
    afterAll.indexOf("await prisma.event.deleteMany({ where: { id: eventId } });"),
  );
}

describe("CI 36147449749 shard-2 budget split contracts", () => {
  it("moves seeded overnight result preparation into a browser-independent hook", () => {
    const resultCase = sliceBetween(
      overnight,
      'test("admin can publish, import, enter a result, and see bracket advancement publicly"',
      '\novernightTest("registration order stays private',
    );
    const preparationHook = sliceBetween(overnight, "test.beforeAll(async () => {", '\ntest("admin can publish');

    expect(resultCase).toContain("test.setTimeout(90_000);");
    expect(resultCase).not.toContain('prisma.event.findUnique({ where: { slug: "kuroko-summer-cup" } });');
    expect(resultCase).not.toMatch(/prisma\.(?:match|eventRoundConfig|team)\.deleteMany/);
    expect(preparationHook).toContain('where: { slug: "kuroko-summer-cup" }');
    expect(preparationHook).toContain("prisma.match.deleteMany({ where: { eventId: event.id } });");
    expect(preparationHook).toContain("prisma.eventRoundConfig.deleteMany({ where: { eventId: event.id } });");
    expect(preparationHook).toContain("tag: \"ST5\"");
    expect(preparationHook).toContain("name: \"Smoke Test Five\"");

    const eventLookup = preparationHook.indexOf('prisma.event.findUnique({ where: { slug: "kuroko-summer-cup" } });');
    const matchCleanup = preparationHook.indexOf("prisma.match.deleteMany({ where: { eventId: event.id } });");
    const roundCleanup = preparationHook.indexOf("prisma.eventRoundConfig.deleteMany({ where: { eventId: event.id } });");
    const teamCleanup = preparationHook.indexOf("prisma.team.deleteMany({");
    expect(eventLookup).toBeGreaterThanOrEqual(0);
    expect(eventLookup).toBeLessThan(matchCleanup);
    expect(matchCleanup).toBeLessThan(roundCleanup);
    expect(roundCleanup).toBeLessThan(teamCleanup);
  });

  it("keeps the overnight result journey load-bearing and rejects budget bypasses", () => {
    const resultCase = sliceBetween(
      overnight,
      'test("admin can publish, import, enter a result, and see bracket advancement publicly"',
      '\novernightTest("registration order stays private',
    );

    for (const marker of [
      'expectedActionRedirect: "/en/admin?success=event-status-updated&event=kuroko-summer-cup;push"',
      "await previewRegistrationCsv(page,",
      "await commitPreviewedRegistration(page, 1);",
      'success=match-result-updated',
      'id/events/kuroko-summer-cup/bracket',
      'await expect(page.getByRole("main")).toBeVisible();',
      'await expect(page).not.toHaveURL(/login/);',
    ]) expect(resultCase).toContain(marker);
    for (const forbidden of [/test\.(?:slow|skip|fixme)/, /waitForTimeout/, /\bretry\b/, /force\s*:/]) {
      expect(resultCase).not.toMatch(forbidden);
    }
  });

  it("keeps public discovery identities, route/sort coverage, and explicit read outcomes", () => {
    const homepage = sliceBetween(discovery, 'test("homepage geometry remains stable without overflow"', '\ntest("Event Center');
    const detail = sliceBetween(discovery, 'test("public detail routes remain reachable and leaderboard sorts all six parameters"', "\n});");

    expect(countLiteral(discovery, 'test("homepage geometry remains stable without overflow"')).toBe(1);
    expect(countLiteral(discovery, 'test("public detail routes remain reachable and leaderboard sorts all six parameters"')).toBe(1);
    expect(detail).toContain('for (const route of ["participants", "schedule", "bracket", "leaderboards"])');
    expect(detail).toContain('for (const key of ["game", "score", "goal", "assist", "passing", "defense"])');

    const gotoIndex = homepage.indexOf('const homeResponse = await page.goto("/id");');
    const statusIndex = homepage.indexOf("expect(homeResponse?.status()).toBeLessThan(400);");
    const countIndex = homepage.indexOf('await expect(page.locator("[data-public-v3-event]")).toHaveCount(1);');
    const sourceIndex = homepage.indexOf('toHaveAttribute("data-public-source", /authoritative|compatible/)');
    expect(gotoIndex).toBeGreaterThanOrEqual(0);
    expect(gotoIndex).toBeLessThan(statusIndex);
    expect(statusIndex).toBeLessThan(countIndex);
    expect(countIndex).toBeLessThan(sourceIndex);
    expect(discovery).not.toMatch(/test\.(?:setTimeout|slow|skip|fixme)|waitForTimeout|retries\s*:/);
  });

  it("prewarms every cold shard-2 route and consumes each discarded response body", () => {
    const paths = [
      "/id",
      "/id/events/flashpeak-champions-32/participants",
      "/id/events/flashpeak-champions-32/schedule",
      "/id/events/flashpeak-champions-32/bracket",
      "/id/events/flashpeak-champions-32/leaderboards",
      "/en/admin?phase=prepare",
      "/en/admin?phase=import&activeEventId=__e2e_prewarm__",
      "/id/admin?phase=run&activeEventId=__e2e_prewarm__&matchEventId=__e2e_prewarm__",
      "/id/events/__e2e_prewarm__/bracket",
      "/id/organizer/events/__e2e_prewarm__/registration?view=import",
      "/en/organizer/events/__e2e_prewarm__/registration?view=import",
      "/id/events/__e2e_prewarm__",
    ];
    for (const path of paths) expect(globalSetup).toContain(`"${path}"`);
    expect(globalSetup).toContain("maxRedirects: 0");
    const bodyIndex = globalSetup.indexOf("await response.body();");
    const statusIndex = globalSetup.indexOf("if (![200, 301, 302, 303, 307, 308, 401, 403, 404].includes(response.status()))");
    expect(bodyIndex).toBeGreaterThanOrEqual(0);
    expect(bodyIndex).toBeLessThan(statusIndex);
    expect(countLiteral(globalSetup, "await response.body();")).toBe(1);
  });

  it("caches lifecycle receipts and drains in-flight operations before exact teardown", () => {
    assertAdaptiveLifecycleContract(lifecycle);
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace("operationVersion = receipt.version;", "operationVersion = operationVersion;"))).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace("await Promise.allSettled([...inFlightOperations]);", "await Promise.all([]);"))).toThrow();
    for (const label of ["registration and drawing", "ongoing and result", "finished and public verification"]) {
      expect(lifecycle).toContain(`test.step("${label}"`);
    }
  });

  it("preserves both localized organizer part-A contracts and response settlement", () => {
    const partA = sliceBetween(
      organizer,
      "async function runOrganizerReleaseJourneyPartA",
      "async function runOrganizerReleaseJourneyPartB",
    );
    expect(organizer).toContain('for (const locale of ["id", "en"] as const)');
    expect(organizer).toContain("@task11-release-journey-part-a organizer release journey ${locale} covers registration through Completion");
    for (const marker of [
      "const previewResponse = waitForServerActionResponse(page, (request) => {",
      'requestUrl.searchParams.get("view") === "import"',
      'requestUrl.search === "?view=import"',
      "await previewResponse;",
      'await expect(page.locator("[data-commit]")).toBeEnabled();',
      "await fixture.captureImportBatchId();",
      'expect(receipt.importBatch).toMatchObject({ id: fixture.importBatchId, eventId: fixture.registrationEventId, status: "committed" });',
      'await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);',
    ]) expect(organizer).toContain(marker);
    expect(serverAction).toContain("await response.finished() !== null");
    expect(serverAction).toContain("response.finished() !== null");
    expect(partA).not.toMatch(/test\.(?:setTimeout|slow|skip|fixme)|waitForTimeout|\bretry\b|force\s*:/);
  });

  it("preserves the serial worker, shard command, and fail-closed profile contract", () => {
    expect(playwrightConfig).toContain('testDir: "./tests/e2e"');
    expect(playwrightConfig).toContain("workers: 1");
    expect(playwrightConfig).toContain("retries: 0");
    expect(playwrightConfig).toContain("/v3-matchday\\.spec\\.ts$/");
    expect(playwrightConfig).toContain("/public-visual-v2\\.smoke\\.spec\\.ts$/");
    expect(e2eCi).toContain('"Default profile shard 2/2"');
    const shard2 = sliceBetween(e2eCi, '"Default profile shard 2/2"', '"Visual profile"');
    for (const marker of [
      '"--config",',
      '"playwright.ci-default.config.ts",',
      '"--shard=2/2",',
      '"--fail-on-flaky-tests",',
    ]) expect(shard2).toContain(marker);
    for (const source of [playwrightConfig, e2eCi]) {
      expect(source).not.toMatch(/(?:test\.)?(?:setTimeout|slow|skip|fixme)|waitForTimeout|retries\s*:\s*[1-9]/);
    }
  });
});
