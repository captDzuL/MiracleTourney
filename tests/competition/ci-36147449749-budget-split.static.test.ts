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

function assertOvernightPreparationBudgetContract(source: string) {
  const preparationHook = sliceBetween(
    source,
    "test.beforeAll(async ({}, testInfo) => {",
    '\ntest("admin can publish',
  );
  const resultCase = sliceBetween(
    source,
    'test("admin can publish, import, enter a result, and see bracket advancement publicly"',
    '\novernightTest("registration order stays private',
  );

  expect(source).toContain("const OVERNIGHT_PREPARATION_TIMEOUT = 120_000;");
  expect(preparationHook).toContain("testInfo.setTimeout(OVERNIGHT_PREPARATION_TIMEOUT);");
  expect(countLiteral(preparationHook, "testInfo.setTimeout(OVERNIGHT_PREPARATION_TIMEOUT);")).toBe(1);
  const hookWithoutBudget = preparationHook.replace("testInfo.setTimeout(OVERNIGHT_PREPARATION_TIMEOUT);", "");
  expect(hookWithoutBudget).not.toMatch(/\btest\.(?:setTimeout|slow|skip|fixme)\b|\b(?:setTimeout|waitForTimeout|sleep)\s*\(|\bretr(?:y|ies)\b/i);
  expect(resultCase).toContain("test.setTimeout(90_000);");
  expect(resultCase).not.toContain("OVERNIGHT_PREPARATION_TIMEOUT");
}

function assertAdaptiveLifecycleLoadBearing(source: string) {
  const registration = sliceBetween(
    source,
    'test("keeps one permanent URL through registration and drawing"',
    '\n  test("keeps the same permanent URL through ongoing and result"',
  );
  const ongoing = sliceBetween(
    source,
    'test("keeps the same permanent URL through ongoing and result"',
    '\n  test("keeps the same permanent URL through finished and certificates"',
  );
  const finished = sliceBetween(
    source,
    'test("keeps the same permanent URL through finished and certificates"',
    "\n});",
  );

  expect(countLiteral(source, 'test("keeps one permanent URL through registration and drawing"')).toBe(1);
  expect(countLiteral(source, 'test("keeps the same permanent URL through ongoing and result"')).toBe(1);
  expect(countLiteral(source, 'test("keeps the same permanent URL through finished and certificates"')).toBe(1);
  expect(registration).toContain("const url = `/id/events/${slug}`;");
  expect(countLiteral(registration, "await page.goto(url);")).toBe(3);
  expect(countLiteral(ongoing, "await page.goto(url);")).toBe(1);
  expect(countLiteral(finished, "await page.goto(url);")).toBe(2);
  expect(countLiteral(source, "await page.goto(url);")).toBe(6);
  expect(countLiteral(source, "await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));")).toBe(5);
  expect(registration).toContain('await expect(page.getByRole("heading", { level: 1, name: `Public Lifecycle ${namespace}` })).toBeVisible();');
  expect(countLiteral(registration, 'getByRole("region", { name: "Template bracket" })')).toBe(2);
  expect(countLiteral(registration, 'getByText("TBD", { exact: true })).toHaveCount(4)')).toBe(2);
  expect(countLiteral(registration, 'getByText(teams[0].name, { exact: true })).toHaveCount(0)')).toBe(2);
  expect(registration).toContain('await updateStatus(page, "Registration Closed");');
  expect(registration).toContain('await expect(page.getByText("Drawing resmi", { exact: true })).toBeVisible();');
  expect(registration).toContain('await expect(page.getByText(teams[0].name, { exact: true }).first()).toBeVisible();');
  expect(registration).toContain('await expect(page.getByText(teams[1].name, { exact: true }).first()).toBeVisible();');

  expect(ongoing).toContain('await updateStatus(page, "Ongoing");');
  expect(ongoing).toContain('await expect(page.getByText("Event berlangsung", { exact: true })).toBeVisible();');
  expect(ongoing).toContain('await expect(page.getByRole("heading", { name: "Pertandingan berikutnya" })).toBeVisible();');
  expect(ongoing).toContain('expect(await prisma.match.count({ where: { eventId, resultVersion: 0 } })).toBe(0);');
  expect(ongoing).toContain("completionId = completion.id;");
  expect(ongoing).toContain("completionVersion = event.competitionVersion;");

  expect(finished).toContain('await updateStatus(page, "Finished");');
  expect(finished).toContain('await loginAsAdmin(page, "en");');
  expect(finished).toContain('await expect(page.getByText("Hasil akhir resmi", { exact: true })).toBeVisible();');
  expect(finished).toContain('await expect(page.getByRole("heading", { name: "Podium akhir" })).toBeVisible();');
  expect(finished).toContain('await expect(page.getByText(winner.name, { exact: true }).first()).toBeVisible();');
  expect(finished).toContain('await expect(page.getByText("2 - 0", { exact: true }).first()).toBeVisible();');
  expect(finished).toContain('await expect(page.getByText(/Certificate sedang disiapkan organizer/)).toBeVisible();');
  expect(finished).toContain('await expect(page.getByText("Tujuh certificate resmi telah diterbitkan.")).toBeVisible();');
  expect(finished).toContain('await expect(page.getByRole("link", { name: /Lihat certificate/ })).toHaveCount(7);');
}

function assertAdaptiveLifecycleOrdering(source: string) {
  const run = sliceBetween(source, "const run = async", "const updateStatus = async");
  const addIndex = run.indexOf("inFlightOperations.add(operation);");
  const awaitIndex = run.indexOf("const receipt = await operation;");
  const finallyIndex = run.indexOf("} finally {");
  const deleteIndex = run.indexOf("inFlightOperations.delete(operation);");
  expect(addIndex).toBeGreaterThanOrEqual(0);
  expect(awaitIndex).toBeGreaterThan(addIndex);
  expect(finallyIndex).toBeGreaterThan(awaitIndex);
  expect(deleteIndex).toBeGreaterThan(finallyIndex);

  const afterAll = sliceBetween(source, "test.afterAll(async () => {", '  test("');
  const drainLoopIndex = afterAll.indexOf("while (inFlightOperations.size > 0) {");
  const drainIndex = afterAll.indexOf("await Promise.allSettled([...inFlightOperations]);");
  const eventDeleteIndex = afterAll.indexOf("await prisma.event.deleteMany({ where: { id: eventId } });");
  const userDeleteIndex = afterAll.indexOf("await prisma.user.deleteMany({ where: { id: organizerId } });");
  expect(drainLoopIndex).toBeGreaterThanOrEqual(0);
  expect(drainIndex).toBeGreaterThan(drainLoopIndex);
  expect(eventDeleteIndex).toBeGreaterThan(drainIndex);
  expect(userDeleteIndex).toBeGreaterThan(eventDeleteIndex);
}

function assertAdaptiveLifecycleContract(source: string) {
  expect(source).toContain('test.describe.serial("Adaptive public event lifecycle", () => {');
  expect(source).toContain("test.describe.configure({ timeout: 120_000 });");
  const lifecycleDescribe = sliceBetween(
    source,
    'test.describe.serial("Adaptive public event lifecycle", () => {',
    "\n});",
  );
  const lifecycleBody = lifecycleDescribe.slice(lifecycleDescribe.indexOf("{") + 1);
  const declarations = [...lifecycleBody.matchAll(/\btest\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g)];
  const declaredTests = declarations.map(([, doubleQuoted, singleQuoted, templateQuoted]) => doubleQuoted ?? singleQuoted ?? templateQuoted);
  expect(declaredTests).toEqual([
    "keeps one permanent URL through registration and drawing",
    "keeps the same permanent URL through ongoing and result",
    "keeps the same permanent URL through finished and certificates",
  ]);
  const approvedDescribeTimeouts = lifecycleBody.match(/test\.describe\.configure\(\{\s*timeout:\s*120_000\s*\}\);/g) ?? [];
  expect(approvedDescribeTimeouts).toHaveLength(1);
  const approvedBudgets = lifecycleBody.match(/test\.setTimeout\(120_000\);/g) ?? [];
  expect(approvedBudgets).toHaveLength(3);
  const bodyWithoutApprovedTimeouts = lifecycleBody
    .replace(/test\.describe\.configure\(\{\s*timeout:\s*120_000\s*\}\);/g, "")
    .replace(/test\.setTimeout\(120_000\);/g, "");
  expect(bodyWithoutApprovedTimeouts).not.toMatch(/\btest\.describe\.configure\s*\(/);
  expect(bodyWithoutApprovedTimeouts).not.toMatch(/\b(?:timeout|actionTimeout|navigationTimeout|globalTimeout|testTimeout)\s*:/i);
  expect(bodyWithoutApprovedTimeouts).not.toMatch(/\btest\.(?:setTimeout|slow|skip|fixme)\s*\(/);
  expect(bodyWithoutApprovedTimeouts).not.toMatch(/\b(?:setTimeout|waitForTimeout|sleep)\s*\(/);
  expect(bodyWithoutApprovedTimeouts).not.toMatch(/\bretr(?:y|ies)\b|retries\s*:/i);
  for (const marker of ["Template bracket", "Drawing resmi", "Event berlangsung", "Hasil akhir resmi"]) {
    expect(source).toContain(marker);
  }

  expect(source).toContain("let operationVersion = 0;");
  expect(source).toContain("operationVersion = (await prisma.event.findUniqueOrThrow({");
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
  assertAdaptiveLifecycleLoadBearing(source);
  assertAdaptiveLifecycleOrdering(source);
}

function assertCiProfileContract(configSource: string, e2eCiSource: string) {
  expect(configSource).toContain('testDir: "./tests/e2e"');
  expect(configSource).toContain("workers: 1");
  expect(configSource).toContain("retries: 0");
  expect(countLiteral(configSource, "workers:")).toBe(1);
  expect(countLiteral(configSource, "retries:")).toBe(1);
  expect(countLiteral(configSource, "testIgnore:")).toBe(1);
  const ignoreStart = configSource.indexOf("testIgnore:");
  const ignoreEnd = configSource.indexOf("],", ignoreStart) + 2;
  expect(configSource.slice(ignoreStart, ignoreEnd).replace(/\s+/g, " ").trim()).toBe(
    "testIgnore: [/v3-matchday\\.spec\\.ts$/, /public-visual-v2\\.smoke\\.spec\\.ts$/],",
  );
  expect(configSource).not.toMatch(/\b(?:timeout|actionTimeout|navigationTimeout|globalTimeout|testTimeout)\s*:/i);
  expect(e2eCiSource).not.toMatch(/\b(?:timeout|actionTimeout|navigationTimeout|globalTimeout|testTimeout)\s*[:=]|--(?:timeout|action-timeout|navigation-timeout)/i);
  expect(e2eCiSource).not.toMatch(/\bretries\b|--retries|--workers(?:=|\s)/);

  const shardStart = e2eCiSource.indexOf('"Default profile shard 2/2"');
  const argsStart = e2eCiSource.indexOf("[", shardStart);
  const argsEnd = e2eCiSource.indexOf("]", argsStart);
  const normalizedArgs = e2eCiSource.slice(argsStart, argsEnd + 1).replace(/\s+/g, " ").trim();
  expect(normalizedArgs).toBe(
    '[ "exec", "playwright", "test", "--config", "playwright.ci-default.config.ts", "--shard=2/2", "--fail-on-flaky-tests", ]',
  );
}

describe("CI 36147449749 shard-2 budget split contracts", () => {
  it("moves seeded overnight result preparation into a browser-independent hook", () => {
    const resultCase = sliceBetween(
      overnight,
      'test("admin can publish, import, enter a result, and see bracket advancement publicly"',
      '\novernightTest("registration order stays private',
    );
    const preparationHook = sliceBetween(overnight, "test.beforeAll(async ({}, testInfo) => {", '\ntest("admin can publish');

    assertOvernightPreparationBudgetContract(overnight);
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

  it("rejects missing, body-scoped, blanket, retry, skip, and sleep preparation-budget mutations", () => {
    const hookBudget = "  testInfo.setTimeout(OVERNIGHT_PREPARATION_TIMEOUT);";
    const resultTitle = 'test("admin can publish, import, enter a result, and see bracket advancement publicly", async ({ page }) => {';
    const mutations = [
      overnight.replace(`${hookBudget}\n`, ""),
      overnight.replace(`${hookBudget}\n`, "").replace(resultTitle, `${resultTitle}\n${hookBudget}`),
      overnight.replace(hookBudget, "  test.setTimeout(OVERNIGHT_PREPARATION_TIMEOUT);"),
      overnight.replace(hookBudget, `${hookBudget}\n  test.describe.configure({ retries: 1 });`),
      overnight.replace(hookBudget, `${hookBudget}\n  test.skip();`),
      overnight.replace(hookBudget, `${hookBudget}\n  await new Promise((resolve) => setTimeout(resolve, 1_000));`),
    ];

    expect(() => assertOvernightPreparationBudgetContract(overnight)).not.toThrow();
    for (const mutation of mutations) {
      expect(mutation).not.toBe(overnight);
      expect(() => assertOvernightPreparationBudgetContract(mutation)).toThrow();
    }
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
    for (const title of [
      'test("keeps one permanent URL through registration and drawing"',
      'test("keeps the same permanent URL through ongoing and result"',
      'test("keeps the same permanent URL through finished and certificates"',
    ]) {
      expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(title, ""))).toThrow();
    }
    const describeEnd = lifecycle.lastIndexOf("\n});");
    const extraTest = `${lifecycle.slice(0, describeEnd)}\n  test("unexpected fourth lifecycle phase", async () => {});${lifecycle.slice(describeEnd)}`;
    expect(() => assertAdaptiveLifecycleContract(extraTest)).toThrow();
    const extraSingleQuotedTest = `${lifecycle.slice(0, describeEnd)}\n  test('unexpected fourth lifecycle phase', async () => {});${lifecycle.slice(describeEnd)}`;
    expect(() => assertAdaptiveLifecycleContract(extraSingleQuotedTest)).toThrow();
    const extraTemplateQuotedTest = `${lifecycle.slice(0, describeEnd)}\n  test(\`unexpected fourth lifecycle phase\`, async () => {});${lifecycle.slice(describeEnd)}`;
    expect(() => assertAdaptiveLifecycleContract(extraTemplateQuotedTest)).toThrow();
    const extraTimeout = lifecycle.replace(
      "test.setTimeout(120_000);",
      "test.setTimeout(120_000);\n    test.setTimeout(180_000);",
    );
    expect(() => assertAdaptiveLifecycleContract(extraTimeout)).toThrow();
    const extraDescribeTimeout = lifecycle.replace(
      "test.describe.configure({ timeout: 120_000 });",
      "test.describe.configure({ timeout: 120_000 });\n  test.describe.configure({ timeout: 180_000 });",
    );
    expect(() => assertAdaptiveLifecycleContract(extraDescribeTimeout)).toThrow();
    const extraSlow = lifecycle.replace(
      "test.setTimeout(120_000);",
      "test.setTimeout(120_000);\n    test.slow();",
    );
    expect(() => assertAdaptiveLifecycleContract(extraSlow)).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace("operationVersion = receipt.version;", "operationVersion = operationVersion;"))).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace("await Promise.allSettled([...inFlightOperations]);", "await Promise.all([]);"))).toThrow();
    for (const removedAssertion of [
      "const url = `/id/events/${slug}`;",
      'await expect(page.getByRole("heading", { level: 1, name: `Public Lifecycle ${namespace}` })).toBeVisible();',
      'await expect(template.getByText("TBD", { exact: true })).toHaveCount(4);',
      'await expect(privateDrawing.getByText("TBD", { exact: true })).toHaveCount(4);',
      'await updateStatus(page, "Registration Closed");',
      'await expect(page.getByText("Drawing resmi", { exact: true })).toBeVisible();',
      'await expect(page.getByText("Event berlangsung", { exact: true })).toBeVisible();',
      'await expect(page.getByRole("heading", { name: "Pertandingan berikutnya" })).toBeVisible();',
      'expect(await prisma.match.count({ where: { eventId, resultVersion: 0 } })).toBe(0);',
      'await expect(page.getByText("Hasil akhir resmi", { exact: true })).toBeVisible();',
      'await expect(page.getByRole("heading", { name: "Podium akhir" })).toBeVisible();',
      'await expect(page.getByText(teams[0].name, { exact: true }).first()).toBeVisible();',
      'await expect(page.getByText(teams[1].name, { exact: true }).first()).toBeVisible();',
      'await expect(page.getByText("2 - 0", { exact: true }).first()).toBeVisible();',
      'await expect(page.getByText(/Certificate sedang disiapkan organizer/)).toBeVisible();',
      'await expect(page.getByRole("link", { name: /Lihat certificate/ })).toHaveCount(7);',
    ]) {
      expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(removedAssertion, ""))).toThrow();
    }
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(
      'expect(await prisma.match.count({ where: { eventId, resultVersion: 0 } })).toBe(0);',
      'expect(await prisma.match.count({ where: { eventId, resultVersion: 1 } })).toBe(0);',
    ))).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(
      "inFlightOperations.add(operation);\n    try {\n      const receipt = await operation;",
      "try {\n      const receipt = await operation;\n      inFlightOperations.add(operation);",
    ))).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(
      "const receipt = await operation;\n      operationVersion = receipt.version;",
      "inFlightOperations.delete(operation);\n      const receipt = await operation;\n      operationVersion = receipt.version;",
    ))).toThrow();
    expect(() => assertAdaptiveLifecycleContract(lifecycle.replace(
      "while (inFlightOperations.size > 0) {\n      await Promise.allSettled([...inFlightOperations]);\n    }\n    await prisma.event.deleteMany({ where: { id: eventId } });",
      "await prisma.event.deleteMany({ where: { id: eventId } });\n    while (inFlightOperations.size > 0) {\n      await Promise.allSettled([...inFlightOperations]);\n    }",
    ))).toThrow();
    for (const label of ["registration and drawing", "ongoing and result", "finished and certificates"]) {
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
      "await runAndSettleServerActionUi(page, {",
      'requestUrl.searchParams.get("view") === "import"',
      'requestUrl.search === "?view=import"',
      'trigger: () => page.locator("[data-preview]").click(),',
      "uiReady: async () => {",
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
    assertCiProfileContract(playwrightConfig, e2eCi);
    expect(() => assertCiProfileContract(playwrightConfig.replace("workers: 1", "workers: 2"), e2eCi)).toThrow();
    expect(() => assertCiProfileContract(
      playwrightConfig.replace(
        "testIgnore: [/v3-matchday\\.spec\\.ts$/, /public-visual-v2\\.smoke\\.spec\\.ts$/]",
        "testIgnore: [/v3-matchday\\.spec\\.ts$/, /public-visual-v2\\.smoke\\.spec\\.ts$/, /extra.spec.ts$/]",
      ),
      e2eCi,
    )).toThrow();
    expect(() => assertCiProfileContract(playwrightConfig.replace("retries: 0", "retries: 2"), e2eCi)).toThrow();
    expect(() => assertCiProfileContract(`${playwrightConfig}\n  timeout: 300_000,`, e2eCi)).toThrow();
    expect(() => assertCiProfileContract(
      playwrightConfig,
      e2eCi.replace(
        '      "--shard=2/2",\n      "--fail-on-flaky-tests",',
        '      "--fail-on-flaky-tests",\n      "--shard=2/2",',
      ),
    )).toThrow();
    expect(() => assertCiProfileContract(
      playwrightConfig,
      e2eCi.replace(
        '      "--shard=2/2",',
        '      "--shard=2/2",\n      "--workers=2",',
      ),
    )).toThrow();
  });
});
