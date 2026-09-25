import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const completionSpec = readFileSync(resolve(root, "tests/e2e/organizer-v3-completion.spec.ts"), "utf8");
const completionHelper = readFileSync(resolve(root, "tests/e2e/helpers/completion.ts"), "utf8");

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
    const singleCaseStart = completionSpec.indexOf(
      'test("completes the authoritative single_elimination release format with an audited tied award"',
    );
    const remainingCasesStart = completionSpec.indexOf("for (const kind of", singleCaseStart);
    expect(singleCaseStart).toBeGreaterThan(-1);
    expect(remainingCasesStart).toBeGreaterThan(singleCaseStart);
    const singleCase = completionSpec.slice(singleCaseStart, remainingCasesStart);

    expect(completionSpec).toContain("test.beforeAll(async ({ browser }, testInfo) => {");
    expect(completionSpec).toContain("prepareCompletionFixture(\"single_elimination\"");
    expect(completionSpec).toContain('await loginAsOrganizer(prewarmPage, "en")');
    expect(completionSpec).toContain("await prewarmPage.goto(completionUrl)");
    expect(completionSpec).toContain("singleEliminationStorageState = await prewarmContext.storageState()");
    expect(completionSpec).toContain("await prewarmContext.close()");
    expect(completionSpec).toContain("browser.newContext({ storageState: singleEliminationStorageState })");
    expect(completionSpec).toContain("await completionContext.close()");

    expect(singleCase).not.toContain("test.step(\"fixture setup\"");
    expect(singleCase).not.toContain("loginAsOrganizer(page, \"en\")");
    expect(singleCase).not.toContain("test.setTimeout(");
    expect(singleCase).not.toContain("test.slow(");
    expect(singleCase).not.toContain("retries");

    expect(completionSpec).toContain("completionActionResponsePending");
    expect(completionSpec).toContain("await completionActionResponse.catch(() => undefined)");
    expect(completionSpec).toContain("expect(completionResponse.status()).toBe(200)");
    expect(completionSpec).toContain("await cleanup?.cleanup();");
    const eventCreateIndex = completionHelper.indexOf("await completionDb.event.create({");
    const cleanupRegistrationIndex = completionHelper.indexOf("await options.onBaseFixtureReady?.(cleanup)");
    const firstDependentWriteIndex = completionHelper.indexOf("await completionDb.team.createMany({", eventCreateIndex);
    expect(eventCreateIndex).toBeGreaterThan(-1);
    expect(cleanupRegistrationIndex).toBeGreaterThan(eventCreateIndex);
    expect(cleanupRegistrationIndex).toBeLessThan(firstDependentWriteIndex);
  });
});
