import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const completionSpec = readFileSync(resolve(root, "tests/e2e/organizer-v3-completion.spec.ts"), "utf8");
const completionHelper = readFileSync(resolve(root, "tests/e2e/helpers/completion.ts"), "utf8");

function extractBracedBlock(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  const openBraceIndex = source.indexOf("{", markerIndex + marker.length - 1);
  if (openBraceIndex < 0) return "";
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }
  return "";
}

describe("Completion action settlement contract", () => {
  it("waits for the exact event-bound server action before persistence and refresh assertions", () => {
    expect(completionSpec).toContain("function waitForCompletionActionResponse");
    expect(completionSpec).toContain('request.method() === "POST"');
    expect(completionSpec).toContain("responseUrl.pathname === completionPath");
    expect(completionSpec).toContain('Boolean(request.headers()["next-action"])');
    expect(completionSpec).toContain("requestData.includes(eventId)");
    expect(completionSpec).toContain("await Promise.all([completionResponsePromise, completeButton.click()])");

    const responseStatusIndex = completionSpec.indexOf("expect(completionResponse.status()).toBe(200)");
    const persistenceStepIndex = completionSpec.indexOf('test.step("persistence"');
    const refreshStepIndex = completionSpec.indexOf('test.step("completion refresh"');
    expect(responseStatusIndex).toBeGreaterThan(-1);
    expect(persistenceStepIndex).toBeGreaterThan(responseStatusIndex);
    expect(refreshStepIndex).toBeGreaterThan(persistenceStepIndex);
  });

  it("installs exact fixture cleanup before authentication and holds it behind response settlement", () => {
    expect(completionHelper).toContain("onBaseFixtureReady");
    expect(completionSpec).toContain("onBaseFixtureReady");
    expect(completionSpec).toContain("completionActionResponsePending");
    expect(completionSpec).toContain('test.step("fixture cleanup"');
  });

  it("keeps focused fixtures uniquely scoped and cleans parity fixtures without double deletion", () => {
    expect(completionSpec).toContain("prepareCompletionFixture(kind, undefined, {");
    expect(completionSpec).not.toContain("completion-action-${kind");
    expect(completionSpec).toContain("const cleanup = fixtureCleanup ?? fixture;");
    expect(completionSpec).toContain("await cleanup?.cleanup();");
  });

  it("keeps single-elimination prerequisites outside the timed Completion contract", () => {
    const singleDescribe = extractBracedBlock(completionSpec, 'test.describe("single-elimination Completion budget", () => {');
    const beforeAll = extractBracedBlock(singleDescribe, "test.beforeAll(async ({ browser }, testInfo) => {");
    const timedCase = extractBracedBlock(
      singleDescribe,
      'test("completes the authoritative single_elimination release format with an audited tied award", async ({ browser }) => {',
    );
    const cleanupResources = extractBracedBlock(completionSpec, "async function cleanupCompletionResources() {");
    const responseWaiter = extractBracedBlock(completionSpec, "function waitForCompletionActionResponse(");
    const completionJourney = extractBracedBlock(completionSpec, "async function runCompletionJourney(");
    const cleanupDefinition = extractBracedBlock(completionHelper, "const cleanup: CompletionFixtureReady = {");
    expect(singleDescribe).not.toBe("");
    expect(beforeAll).not.toBe("");
    expect(timedCase).not.toBe("");
    expect(cleanupResources).not.toBe("");
    expect(responseWaiter).not.toBe("");
    expect(completionJourney).not.toBe("");
    expect(cleanupDefinition).not.toBe("");

    expect(beforeAll).toContain('prepareTestCompletionFixture("single_elimination")');
    expect(beforeAll).toContain('await loginAsOrganizer(prewarmPage, "en")');
    expect(beforeAll).toContain("await prewarmPage.goto(completionUrl)");
    expect(beforeAll).toContain("singleEliminationStorageState = await prewarmContext.storageState()");
    expect(beforeAll).toContain("await prewarmContext.close()");
    expect(timedCase).toContain("browser.newContext({ storageState: singleEliminationStorageState })");
    expect(timedCase).toContain("await completionContext.close()");

    expect(timedCase).not.toMatch(/\b(?:prepareTestCompletionFixture|prepareCompletionFixture)\s*\(/);
    expect(timedCase).not.toMatch(/\blogin[A-Za-z]*\s*\(/);
    expect(completionJourney).not.toMatch(/\b(?:prepareTestCompletionFixture|prepareCompletionFixture)\s*\(/);
    expect(completionJourney).not.toMatch(/\b(?:login|auth)[A-Za-z]*\s*\(/);
    expect(completionJourney).not.toMatch(/\btest\.setTimeout\s*\(/);
    expect(completionJourney).not.toMatch(/\btest\.slow\s*\(/);
    expect(completionJourney).not.toMatch(/\bretries\b/);
    expect(completionJourney).not.toMatch(/\btimeout\s*:/);
    expect(singleDescribe).not.toMatch(/\btest\.setTimeout\s*\(/);
    expect(singleDescribe).not.toMatch(/\btest\.slow\s*\(/);
    expect(singleDescribe).not.toMatch(/\bretries\b/);
    expect(completionSpec).not.toMatch(/\btest\.setTimeout\s*\(/);
    expect(completionSpec).not.toMatch(/\btest\.slow\s*\(/);
    expect(completionSpec).not.toMatch(/\bretries\b/);

    const callbackOpen = timedCase.indexOf("=> {");
    expect(callbackOpen).toBeGreaterThan(-1);
    expect(timedCase.slice(callbackOpen + "=> {".length).trimStart()).toMatch(/^const timedBodyStartedAt = performance\.now\(\);/);
    expect(timedCase).toContain("testBodyDurationMs");
    expect(timedCase).toContain("measuredFrom=first-test-line");
    expect(timedCase).toContain("attachment=excluded");

    expect(responseWaiter).toContain('request.method() === "POST"');
    expect(responseWaiter).toContain("responseUrl.pathname === completionPath");
    expect(responseWaiter).toContain('Boolean(request.headers()["next-action"])');
    expect(responseWaiter).toContain("requestData.includes(eventId)");
    expect(completionJourney).toContain("await Promise.all([completionResponsePromise, completeButton.click()])");
    expect(completionJourney).toContain("expect(completionResponse.status()).toBe(200)");
    expect(cleanupResources).toContain("completionActionResponsePending");
    expect(cleanupResources).toContain("await completionActionResponse.catch(() => undefined)");
    expect(cleanupResources).toContain("await cleanup?.cleanup();");
    const settlementAwaitIndex = cleanupResources.indexOf("await completionActionResponse.catch(() => undefined)");
    const contextCloseIndex = cleanupResources.indexOf("await activeCompletionContext.close().catch(() => undefined)");
    const fixtureCleanupIndex = cleanupResources.indexOf("await cleanup?.cleanup();");
    expect(settlementAwaitIndex).toBeGreaterThan(-1);
    expect(contextCloseIndex).toBeGreaterThan(-1);
    expect(fixtureCleanupIndex).toBeGreaterThan(-1);
    expect(settlementAwaitIndex).toBeLessThan(contextCloseIndex);
    expect(contextCloseIndex).toBeLessThan(fixtureCleanupIndex);
    expect(cleanupDefinition).toContain("where: { id, slug: id }");
    const eventCreateIndex = completionHelper.indexOf("await completionDb.event.create({");
    const cleanupRegistrationIndex = completionHelper.indexOf("await options.onBaseFixtureReady?.(cleanup)");
    const firstDependentWriteIndex = completionHelper.indexOf("await completionDb.team.createMany({", eventCreateIndex);
    expect(eventCreateIndex).toBeGreaterThan(-1);
    expect(cleanupRegistrationIndex).toBeGreaterThan(eventCreateIndex);
    expect(cleanupRegistrationIndex).toBeLessThan(firstDependentWriteIndex);
  });
});
