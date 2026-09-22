import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildRegistrationPreview, suggestRegistrationMapping } from "../../src/lib/imports/registration-intake";

const root = resolve(import.meta.dirname, "../..");
const config = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
const releaseConfig = readFileSync(resolve(root, "playwright.release.config.ts"), "utf8");
const lifecycle = readFileSync(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"), "utf8");
const matchday = readFileSync(resolve(root, "tests/e2e/v3-matchday.spec.ts"), "utf8");
const auth = readFileSync(resolve(root, "tests/e2e/helpers/auth.ts"), "utf8");
const fixtures = readFileSync(resolve(root, "tests/e2e/helpers/fixtures.ts"), "utf8");
const releaseFixture = fixtures.match(
  /export async function prepareOrganizerReleaseFixture[\s\S]*?export async function preparePublishedEventRevisionFixture/,
)?.[0] ?? "";
const completionFixtures = readFileSync(resolve(root, "tests/e2e/helpers/completion.ts"), "utf8");
const registrationIntake = readFileSync(resolve(root, "src/lib/imports/registration-intake.ts"), "utf8");
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

  it("uses explicit release metadata and derives the ordinary CI profile from the actual flag", () => {
    const matrixTest = lifecycle.match(
      /test\(`@task11-release-matrix[\s\S]*?\n\s*}\);/,
    )?.[0] ?? "";

    expect(matrixTest).toContain("const configuredMode = test.info().project.metadata.releaseFlagMode");
    expect(matrixTest).toContain(
      'configuredMode ?? (process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true" ? "on" : "off")',
    );
    expect(matrixTest).toContain("expect(FEATURE_FLAG_MODES).toContain(mode)");
  });

  it("derives the ordinary CI release journey mode from the actual flag without a hardcoded-on fallback", () => {
    expect(journeyTest).toContain("const configuredMode = test.info().project.metadata.releaseFlagMode");
    expect(journeyTest).toContain(
      'configuredMode ?? (process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true" ? "on" : "off")',
    );
    expect(journeyTest).toContain("expect(FEATURE_FLAG_MODES).toContain(mode)");
    expect(journeyTest).not.toContain('?? "on"');
  });

  it("asserts the V3 and localized legacy Match Day roots on competition and schedule", () => {
    const rootHelper = lifecycle.match(
      /async function expectFlagSpecificOperationsRoot[\s\S]*?async function expectFlagSpecificMatchSurface/,
    )?.[0] ?? "";
    const competitionSurface = releaseJourney.slice(
      releaseJourney.indexOf('/competition`'),
      releaseJourney.indexOf('/schedule`'),
    );
    const scheduleSurface = releaseJourney.slice(
      releaseJourney.indexOf('/schedule`'),
      releaseJourney.indexOf("await fixture.resetMatchForReleaseJourney()"),
    );

    expect(rootHelper).toContain('mode === "on"');
    expect(rootHelper).toContain('page.locator("[data-operations]")');
    expect(rootHelper).toContain('locale === "id" ? "Ruang kerja Match Day" : "Match Day workspace"');
    expect(rootHelper).toContain("await expect(operationsRoot).toBeVisible()");
    expect(competitionSurface).toContain("expectFlagSpecificOperationsRoot(page, locale, mode)");
    expect(scheduleSurface).toContain("expectFlagSpecificOperationsRoot(page, locale, mode)");
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

  it("creates the release-journey match pending without deleting append-only result history", () => {
    expect(fixtures).toContain(
      'prepareCompletionFixture("single_elimination", namespace, { pendingFirstPlayerMatch: true })',
    );
    expect(fixtures).not.toContain("matchResultRevision.deleteMany");
    expect(completionFixtures).toContain("pendingFirstPlayerMatch?: boolean");
    expect(completionFixtures).toContain('status: isPendingFirstPlayerMatch ? "Scheduled" : "Completed"');
    expect(completionFixtures).toContain("resultVersion: isPendingFirstPlayerMatch ? 0 : 1");
    expect(completionFixtures).toContain("if (!isPendingFirstPlayerMatch)");
    expect(completionFixtures).toContain("pendingFirstPlayerMatchId,");
    expect(fixtures).toContain("const releaseMatchId = base.pendingFirstPlayerMatchId");
    expect(fixtures).not.toContain("prisma.match.findFirst");
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

  it("uses importer-supported human-readable headers for the release journey CSV", () => {
    const csvFixture = releaseJourney.match(/const csv = \[[\s\S]*?\]\.join\("\\n"\);/)?.[0] ?? "";
    const supportedHeaders = [
      "team name",
      "team tag",
      "captain name",
      "captain contact",
      "captain email",
      "captain ign",
      "captain uid",
      "captain is player",
    ];
    const playerHeaders = Array.from({ length: 4 }, (_, index) => [
      `Player ${index + 1} IGN`,
      `Player ${index + 1} UID`,
    ]).flat();

    expect(csvFixture).toContain(`"${[...supportedHeaders, ...playerHeaders].join(",")}"`);
    expect(csvFixture).not.toMatch(/\b(?:teamName|teamTag|captainName|captainContact|captainEmail|captainIgn|captainUid|captainIsPlayer)\b/);
    for (const header of supportedHeaders) expect(registrationIntake).toContain(`"${header}"`);

    const headers = [...supportedHeaders, ...playerHeaders];
    const mapping = suggestRegistrationMapping(headers, { maxRosterSize: 8 });
    const preview = buildRegistrationPreview({
      event: { id: "event-release", name: "Release", slug: "release", participantCap: 16, bracketLocked: false, maxRosterSize: 8, minRosterSize: 5 },
      existingTeams: [],
      existingUsers: [],
      rows: [{
        sourceRow: 2,
        cells: [
          "Release Import Team",
          "RIMP",
          "Release Import Captain",
          "",
          "release-import@example.test",
          "ReleaseImport",
          "UID-CAPTAIN",
          "true",
          ...Array.from({ length: 4 }, (_, index) => [`ReleaseImport${index + 1}`, `UID-PLAYER-${index + 1}`]).flat(),
        ],
      }],
      mapping,
    });

    expect(mapping.unmappedColumns).toEqual([]);
    expect(preview.items).toMatchObject([{ status: "new", selected: true, normalized: { players: [{}, {}, {}, {}, {}] } }]);
    expect(preview.summary).toMatchObject({ new: 1, error: 0 });
  });

  it("isolates registration from the locked lifecycle event and keeps both receipts explicit", () => {
    const registrationCreate = releaseFixture.match(
      /const registrationEvent = await prisma\.event\.create\([\s\S]*?\n\s+\}\);/,
    )?.[0] ?? "";
    const cleanup = releaseFixture.match(/cleanup: async \(\) => \{[\s\S]*?\n\s+\},/)?.[0] ?? "";
    const importSurface = releaseJourney.slice(
      releaseJourney.indexOf('expectLocalizedRegistrationSurface(page, registrationFixture, locale, "queue")'),
      releaseJourney.indexOf('/competition`'),
    );
    const schedule = releaseJourney.indexOf('/schedule`');
    const resetMatch = releaseJourney.indexOf("await fixture.resetMatchForReleaseJourney()");
    const matchControl = releaseJourney.indexOf('/match-control`');
    const registrationIds = [
      "e2e-release-registration-release-journey-id",
      "e2e-release-registration-release-journey-en",
    ];
    const importTeamNames = registrationIds.map((id) => `Release Import ${id.slice(-48)}`);

    expect(registrationCreate, "the release fixture must create an unlocked registration event").not.toBe("");
    expect(registrationCreate).toContain("id: deterministicRegistrationEventId");
    expect(registrationCreate).toContain('status: "Published"');
    expect(registrationCreate).toContain('gameModeId: "mode-flashpeak-5v5"');
    expect(registrationCreate).toContain("organizerUserId: base.actor.id");
    expect(releaseFixture).toContain("registrationEventId: registrationEvent.id");
    expect(cleanup.indexOf("prisma.event.deleteMany({ where: { id: registrationEvent.id, slug: registrationEvent.slug } })")).toBeGreaterThanOrEqual(0);
    expect(releaseJourney).toContain("const registrationFixture = { ...fixture, id: fixture.registrationEventId }");
    for (const view of ["queue", "import", "payments", "qris"]) {
      expect(importSurface).toContain(`registrationFixture, locale, "${view}"`);
    }
    expect(releaseJourney).toContain("eventId: fixture.registrationEventId");
    expect(releaseJourney).toContain('expect(receipt.match).toMatchObject({ id: matchId, eventId: fixture.id');
    expect(schedule).toBeGreaterThan(0);
    expect(resetMatch).toBeGreaterThan(schedule);
    expect(resetMatch).toBeLessThan(matchControl);
    expect(releaseJourney).toContain('const importTeamName = `Release Import ${fixture.registrationEventId.slice(-48)}`;');
    expect(importTeamNames.every((name) => name.length <= 64)).toBe(true);
    expect(new Set(importTeamNames).size).toBe(importTeamNames.length);
  });

  it("cleans up only the deterministic captain user created by registration import", () => {
    const cleanup = releaseFixture.match(/cleanup: async \(\) => \{[\s\S]*?\n\s+\},/)?.[0] ?? "";
    const setupRollback = releaseFixture.slice(releaseFixture.indexOf("} catch (error) {"));

    expect(releaseFixture).toContain("const deterministicRegistrationEventId = `e2e-release-registration-${namespace}`;");
    expect(releaseFixture).toContain("const importCaptainEmail = `release-import-${deterministicRegistrationEventId}@example.test`;");
    expect(releaseJourney).toContain("${fixture.importCaptainEmail}");
    const eventCleanup = cleanup.indexOf("prisma.event.deleteMany({ where: { id: registrationEvent.id, slug: registrationEvent.slug } })");
    const importCaptainCleanup = cleanup.indexOf("prisma.user.deleteMany({ where: { email: importCaptainEmail } })");
    expect(eventCleanup).toBeGreaterThanOrEqual(0);
    expect(importCaptainCleanup).toBeGreaterThan(eventCleanup);
    expect(cleanup.indexOf("await base.cleanup()")).toBeGreaterThan(importCaptainCleanup);
    expect(cleanup).toContain("if (createdCaptainId) await prisma.user.delete({ where: { id: createdCaptainId } }).catch(() => undefined);");

    const rollbackEventCleanup = setupRollback.indexOf("prisma.event.deleteMany({ where: { id: registrationEventId } })");
    const rollbackImportCaptainCleanup = setupRollback.indexOf("prisma.user.deleteMany({ where: { email: importCaptainEmail } })");
    expect(rollbackEventCleanup).toBeGreaterThanOrEqual(0);
    expect(rollbackImportCaptainCleanup).toBeGreaterThan(rollbackEventCleanup);
    expect(setupRollback).toContain("if (createdCaptainId) await prisma.user.delete({ where: { id: createdCaptainId } }).catch(() => undefined);");
  });

  it("allows import completion to settle before checking its committed batch receipt", () => {
    const localizedTextHelper = lifecycle.slice(
      lifecycle.indexOf("async function expectLocalizedText"),
      lifecycle.indexOf("async function expectLocalizedHeading"),
    );
    const completed = releaseJourney.indexOf(
      "await expectLocalizedText(page, copy.importCompleted, copy.opposite.importCompleted, 15_000);",
    );
    const captureBatch = releaseJourney.indexOf("await fixture.captureImportBatchId();");
    const persistedReceipt = releaseJourney.indexOf(
      'expect(receipt.importBatch).toMatchObject({ id: fixture.importBatchId, eventId: fixture.registrationEventId, status: "committed" });',
    );

    expect(localizedTextHelper).toContain("visibleTimeout?: number");
    expect(localizedTextHelper).toContain("toBeVisible({ timeout: visibleTimeout })");
    expect(completed).toBeGreaterThan(0);
    expect(captureBatch).toBeGreaterThan(completed);
    expect(persistedReceipt).toBeGreaterThan(captureBatch);
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

  it("checks focus occlusion at the midpoint of the visible element intersection", () => {
    const contractBody = lifecycle.match(
      /export async function expectReleaseAccessibilityContract[\s\S]*?const contract = await page\.evaluate/,
    )?.[0] ?? "";

    expect(contractBody).toContain("const visibleLeft = Math.max(box.left, 0)");
    expect(contractBody).toContain("const visibleRight = Math.min(box.right, window.innerWidth)");
    expect(contractBody).toContain("const visibleTop = Math.max(box.top, 0)");
    expect(contractBody).toContain("const visibleBottom = Math.min(box.bottom, window.innerHeight)");
    expect(contractBody).toContain("const intersectsViewport = visibleRight > visibleLeft && visibleBottom > visibleTop");
    expect(contractBody).toContain("const hit = intersectsViewport");
    expect(contractBody).toContain("active.contains(hit)");
    expect(contractBody).not.toContain("window.innerWidth / 2");
    expect(contractBody).not.toContain("window.innerHeight / 2");
  });

  it("assigns accessibility focus markers in filtered DOM order", () => {
    const contractBody = lifecycle.match(
      /export async function expectReleaseAccessibilityContract[\s\S]*?export async function expectNavigationEscapeRestoresFocus/,
    )?.[0] ?? "";
    const markerAssignment = contractBody.slice(
      contractBody.indexOf("const focusables ="),
      contractBody.indexOf("return focusables.map"),
    );

    expect(markerAssignment).toContain("Array.from(document.querySelectorAll<HTMLElement>(selector))");
    expect(markerAssignment).toContain(".filter((element) => visible(element)");
    expect(markerAssignment).not.toContain(".sort(");
    expect(contractBody).toContain("return focusables.map((element, index) =>");
    expect(contractBody).toContain('page.keyboard.press("Tab")');
    expect(contractBody).toContain('page.keyboard.press("Shift+Tab")');
  });

  it("selects the Match Day parity root for both master-shell flag modes", () => {
    expect(matchday).toContain('process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true"');
    expect(matchday).toContain('page.locator("[data-operations]")');
    expect(matchday).toContain('locale === "id" ? "Ruang kerja Match Day" : "Match Day workspace"');
    expect(matchday).toContain("await expect(operationsRoot).toBeVisible()");
    expect(matchday).toContain("operationsRoot.evaluate");
  });
});
