import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const config = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
const releaseConfig = readFileSync(resolve(root, "playwright.release.config.ts"), "utf8");
const lifecycle = readFileSync(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"), "utf8");
const auth = readFileSync(resolve(root, "tests/e2e/helpers/auth.ts"), "utf8");
const fixtures = readFileSync(resolve(root, "tests/e2e/helpers/fixtures.ts"), "utf8");
const releaseJourney = lifecycle.match(
  /async function runOrganizerReleaseJourney[\s\S]*?function eventIdentity/,
)?.[0] ?? "";
const journeyTest = lifecycle.match(
  /test\("@task11-release-journey[\s\S]*?\n\}\);\n\ntest\("admin can use/,
)?.[0] ?? "";

describe("Task 11 release verification contracts", () => {
  it("declares two real flag profiles with separate servers and 20 baseline names", () => {
    expect(config).toMatch(/webServer:\s*\{/);
    expect(config).not.toMatch(/organizer-release-on|organizer-release-off|FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3/);
    expect(releaseConfig).toMatch(/organizer-release-on/);
    expect(releaseConfig).toMatch(/organizer-release-off/);
    expect(releaseConfig).toMatch(/FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3.*true/);
    expect(releaseConfig).toMatch(/FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3.*false/);
    expect(releaseConfig).toMatch(/3101/);
    expect(releaseConfig).toMatch(/3102/);
    expect(releaseConfig).toMatch(/organizer-release-on[\s\S]*testMatch[\s\S]*releaseTestMatch/);
    expect(releaseConfig).toMatch(/organizer-release-off[\s\S]*grep[\s\S]*releaseMatrixGrep/);
    expect(lifecycle).toMatch(/release-accessibility-\$\{mode\}-\$\{locale\}-\$\{viewport\.name\}/);
    expect(lifecycle).toMatch(/VIEWPORTS\.length \* LOCALES\.length \* FEATURE_FLAG_MODES\.length/);
  });

  it("drives non-vacuous keyboard, dialog, aria-sort, and deterministic journey contracts", () => {
    expect(lifecycle).toMatch(/page\.keyboard\.press\("Tab"\)/);
    expect(lifecycle).toMatch(/page\.keyboard\.press\("Shift\+Tab"\)/);
    expect(lifecycle).toMatch(/aria-modal/);
    expect(lifecycle).toMatch(/toHaveAccessibleName\(/);
    expect(lifecycle).toMatch(/toHaveCount\(1\)/);
    expect(auth).toMatch(/document\.fonts\.ready/);
    expect(auth).toMatch(/suppressAnimationsForScreenshot/);
    const normalizeBody = auth.match(
      /export async function normalizeReleasePage[\s\S]*?export async function waitForReleaseFonts/,
    )?.[0] ?? "";
    const screenshotSuppressionBody = auth.match(
      /export async function suppressAnimationsForScreenshot[\s\S]*?export async function loginWithCredentials/,
    )?.[0] ?? "";
    expect(normalizeBody).not.toContain("animation-duration");
    expect(screenshotSuppressionBody).toContain("animation-duration");
    expect(lifecycle).toMatch(/paymentRequestId/);
    expect(lifecycle).toMatch(/importBatchId/);
    expect(lifecycle).toMatch(/qrisVersion/);
    expect(lifecycle).toMatch(/revisionBefore/);
  });

  it("requires UI transitions and persisted receipts for the shared serial event", () => {
    expect(releaseJourney, "the shared journey must be present").not.toBe("");
    const initialState = releaseJourney.indexOf("const initialState = await fixture.readState()");
    const firstImportAction = releaseJourney.indexOf("setInputFiles");
    expect(initialState).toBeGreaterThanOrEqual(0);
    expect(firstImportAction).toBeGreaterThan(initialState);
    for (const contract of [
      "setInputFiles",
      "data-preview",
      "data-commit",
      "data-approve",
      "data-save",
      "data-publish",
      "copy.submitResult",
      "copy.saveStatistics",
      "copy.approveSubmission",
      "data-complete-tournament",
      "data-publish-certificate-set",
    ]) expect(releaseJourney).toContain(contract);
    expect(releaseJourney).toMatch(/receipt|transition|afterImport|afterPayment|afterQris|afterResult|afterStats|afterCompletion|afterPublication/);
    expect(fixtures).toContain("paymentRequestId: paymentRequest.id");
    expect(fixtures).toContain("importBatchId: undefined as string | undefined");
    expect(fixtures).toContain("qrisVersion: 1");
    expect(fixtures).toMatch(/importBatchState[\s\S]*paymentRequestState[\s\S]*qris/);
  });

  it("uses an exact per-locale copy table and rejects opposite-language sentinels", () => {
    expect(lifecycle).toMatch(/LOCALE_COPY/);
    expect(releaseJourney).toMatch(/name:.*exact: true/);
    expect(releaseJourney).toMatch(/not\.toContainText/);
    expect(releaseJourney).not.toMatch(/name:\s*\/.*\|.*\//);
    expect(releaseJourney).toContain("copy.oppositeSentinel");
  });

  it("requires a runnable Live match receipt and a full transition journey for both locales", () => {
    expect(fixtures).toMatch(/status:\s*"Live"/);
    expect(fixtures).toMatch(/scheduleStatus:\s*"live"/);
    expect(fixtures).toContain("actualStartedAt: RELEASE_FIXTURE_NOW");
    expect(journeyTest).toContain("prepareOrganizerReleaseFixture");
    expect(journeyTest).toContain("runOrganizerReleaseJourney(page, fixture, locale, mode)");
    expect(journeyTest).not.toContain("expectReleaseLocaleReadback");
    expect(releaseJourney).toMatch(/receipt\.match[\s\S]*resultVersion/);
  });

  it("uses an exact localized import feedback locator", () => {
    expect(releaseJourney).toContain("copy.importCompleted");
    expect(releaseJourney).not.toMatch(/getByRole\("status"\)\.toContainText\(locale === "id"/);
  });

  it("asserts exact current and absent opposite result forms in the on-mode journey", () => {
    const resultSurface = releaseJourney.slice(
      releaseJourney.indexOf("const matchId = fixture.releaseMatchId"),
      releaseJourney.indexOf("?view=statistics"),
    );
    const localizedHeading = resultSurface.indexOf(
      "expectLocalizedHeading(page, copy.matchWorkspaceHeading, copy.opposite.matchWorkspaceHeading)",
    );
    const currentForm = resultSurface.indexOf("await expect(resultForm).toBeVisible()");
    const oppositeForm = resultSurface.indexOf(
      'page.getByRole("form", { name: copy.opposite.officialResultHeading, exact: true })',
    );
    const submit = resultSurface.indexOf("copy.submitResult");
    expect(localizedHeading).toBeGreaterThanOrEqual(0);
    expect(currentForm).toBeGreaterThan(localizedHeading);
    expect(oppositeForm).toBeGreaterThan(currentForm);
    expect(submit).toBeGreaterThan(oppositeForm);
  });

  it("asserts exact current and absent opposite statistics headings in the on-mode journey", () => {
    const statisticsSurface = releaseJourney.slice(
      releaseJourney.indexOf("?view=statistics"),
      releaseJourney.indexOf("?view=history"),
    );
    expect(statisticsSurface).toContain(
      "expectLocalizedHeading(page, copy.statisticsHeading, copy.opposite.statisticsHeading)",
    );
  });

  it("asserts the rendered localized saved feedback before the captain-stat approval receipt", () => {
    const approval = releaseJourney.indexOf(
      'getByRole("button", { name: copy.approveSubmission, exact: true }).click()',
    );
    const persistedReceipt = releaseJourney.indexOf(
      "expect(receipt.match?.statSubmissions.find",
    );
    expect(approval).toBeGreaterThanOrEqual(0);
    expect(persistedReceipt).toBeGreaterThan(approval);
    const approvalBlock = releaseJourney.slice(approval, persistedReceipt);
    expect(approvalBlock).toContain(
      "expectLocalizedText(page, copy.statisticsSaved, copy.opposite.statisticsSaved)",
    );
    expect(approvalBlock).not.toContain("reviewDecisionSaved");
  });

  it("runs the strict localized on-mode journey for both declared locales", () => {
    expect(lifecycle).toContain('export const LOCALES = ["id", "en"] as const');
    expect(journeyTest).toContain("for (const locale of LOCALES)");
    expect(journeyTest).toContain("runOrganizerReleaseJourney(page, fixture, locale, mode)");
    expect(releaseConfig).toMatch(/name:\s*"organizer-release-on"[\s\S]*releaseJourneyGrep[\s\S]*releaseFlagMode:\s*"on"/);
  });

  it("probes reduced motion on the loaded surface before clock, fonts, and screenshot CSS", () => {
    expect(auth).toContain("probeReleaseReducedMotion");
    expect(auth).toContain("installReleaseClock");
    const loginBody = auth.match(/export async function loginWithCredentials[\s\S]*?export async function loginAsAdmin/)?.[0] ?? "";
    expect(loginBody.indexOf("page.goto")).toBeGreaterThanOrEqual(0);
    expect(loginBody.indexOf("probeReleaseReducedMotion")).toBeGreaterThan(loginBody.indexOf("page.goto"));
    expect(loginBody.indexOf("installReleaseClock")).toBeGreaterThan(loginBody.indexOf("probeReleaseReducedMotion"));
    const contractBody = lifecycle.match(/export async function expectReleaseAccessibilityContract[\s\S]*?export async function expectNavigationEscapeRestoresFocus/)?.[0] ?? "";
    expect(contractBody.indexOf("probeReleaseReducedMotion")).toBeGreaterThanOrEqual(0);
    expect(contractBody.indexOf("waitForReleaseFonts")).toBeGreaterThan(contractBody.indexOf("probeReleaseReducedMotion"));
  });
});
