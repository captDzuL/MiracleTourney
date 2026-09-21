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
  /async function runOrganizerReleaseJourney[\s\S]*?async function expectReleaseLocaleReadback/,
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
});
