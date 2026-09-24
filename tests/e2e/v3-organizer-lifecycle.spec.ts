import { PrismaClient } from "@prisma/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { loginAsOrganizer, loginWithCredentials, probeReleaseReducedMotion, suppressAnimationsForScreenshot, waitForReleaseFonts } from "./helpers/auth";
import { prepareOrganizerReleaseFixture } from "./helpers/fixtures";

export const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export const LOCALES = ["id", "en"] as const;
export const FEATURE_FLAG_MODES = ["on", "off"] as const;
export const RELEASE_BASELINE_CASE_COUNT = VIEWPORTS.length * LOCALES.length * FEATURE_FLAG_MODES.length;
const VALID_ARIA_SORT_VALUES = new Set(["ascending", "descending", "none", "other"]);
const FOCUSABLE_SELECTOR = 'main button, main a[href], main input, main select, main textarea, main summary, main [tabindex]:not([tabindex="-1"])';
const EXPECTED_CERTIFICATE_TYPES = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"] as const;
type RequiredCertificateAssetKind = "team_logo_hero" | "team_logo_badge";
const REQUIRED_CERTIFICATE_ASSET_KIND: Record<(typeof EXPECTED_CERTIFICATE_TYPES)[number], RequiredCertificateAssetKind> = {
  champion: "team_logo_hero",
  runner_up: "team_logo_hero",
  third_place: "team_logo_hero",
  mvp: "team_logo_badge",
  top_scorer: "team_logo_badge",
  top_defender: "team_logo_badge",
  top_assist: "team_logo_badge",
};
const CERTIFICATE_ASSET_SELECTOR: Record<RequiredCertificateAssetKind, string> = {
  team_logo_hero: '[data-certificate-assets] select#certificate-placement-error-asset',
  team_logo_badge: '[data-certificate-assets] select#certificate-placement-error-team_logo_badge-asset',
};

async function selectReleaseCertificateAsset(page: Page, certificateType: (typeof EXPECTED_CERTIFICATE_TYPES)[number], assetId: string) {
  const assetKind = REQUIRED_CERTIFICATE_ASSET_KIND[certificateType];
  await page.locator(CERTIFICATE_ASSET_SELECTOR[assetKind]).selectOption(assetId);
}

const LOCALE_COPY = {
  id: {
    registrationHeading: "Registrasi peserta",
    queueHeading: "Pendaftaran tim",
    importHeading: "Impor peserta",
    paymentHeading: "Antrean pembayaran",
    qrisHeading: "QRIS pembayaran acara",
    qrisDialog: "Pratinjau QRIS pembayaran acara",
    competitionHeading: "Kompetisi",
    scheduleHeading: "Jadwal",
    matchControlHeading: "Kontrol Pertandingan",
    matchWorkspaceHeading: "Hasil & statistik pertandingan",
    officialResultHeading: "Hasil resmi",
    statisticsLink: "Statistik pemain",
    historyHeading: "Riwayat",
    history: "Riwayat",
    submitResult: "Kirim hasil resmi",
    saveStatistics: "Simpan statistik pemain",
    approveSubmission: "Setujui kiriman",
    awardsTab: "Penghargaan",
    decisionReason: "Alasan keputusan audit",
    decisionSaved: "Keputusan pemeriksaan disimpan.",
    qrisDraftSaved: "Draf QRIS disimpan.",
    qrisPublished: "QRIS diterbitkan.",
    statisticsSaved: "Tersimpan. Memuat data terbaru.",
    completionHeading: "Penyelesaian Turnamen",
    completionStatus: "completed",
    completionFeedback: "Turnamen berhasil diselesaikan. Muat ulang untuk melihat versi yang tercatat.",
    certificatePublished: "Set tujuh sertifikat diterbitkan dengan aman.",
    certificateHeading: "Studio Sertifikat",
    certificateGenerated: "Versi sertifikat baru berhasil dibuat.",
    verificationTitle: "Sertifikat terverifikasi",
    supersededStatus: "Valid · Versi terdahulu",
    currentStatus: "Valid · Versi terkini",
    historyFeedback: "Riwayat peninjauan statistik",
    importCompleted: "Impor selesai: 1 peserta.",
    oppositeSentinel: "Participant registration",
    opposite: {
      registrationHeading: "Participant registration",
      queueHeading: "Team registration",
      importHeading: "Import participants",
      paymentHeading: "Payment queue",
      qrisHeading: "Event payment QRIS",
      qrisDialog: "Event payment QRIS preview",
      competitionHeading: "Competition",
      scheduleHeading: "Schedule",
      matchControlHeading: "Match Control",
      matchWorkspaceHeading: "Match results & statistics",
      officialResultHeading: "Official result",
      statisticsLink: "Player statistics",
      historyHeading: "History",
      history: "History",
      submitResult: "Submit official result",
      saveStatistics: "Save player statistics",
      approveSubmission: "Approve submission",
      awardsTab: "Awards",
      decisionReason: "Audit decision reason",
      decisionSaved: "Review decision saved.",
      qrisDraftSaved: "QRIS draft saved.",
      qrisPublished: "QRIS published.",
      statisticsSaved: "Saved. Refreshing authoritative data.",
      completionHeading: "Tournament Completion",
      completionStatus: "ready",
      completionFeedback: "Tournament completed successfully. Refresh to view the committed version.",
      certificatePublished: "The seven-certificate set was published safely.",
      certificateHeading: "Certificate Studio",
      certificateGenerated: "A new certificate version was generated.",
      verificationTitle: "Certificate verified",
      supersededStatus: "Valid · Superseded version",
      currentStatus: "Valid · Current version",
      historyFeedback: "Statistics review history",
      importCompleted: "Import completed: 1 participants.",
    },
  },
  en: {
    registrationHeading: "Participant registration",
    queueHeading: "Team registration",
    importHeading: "Import participants",
    paymentHeading: "Payment queue",
    qrisHeading: "Event payment QRIS",
    qrisDialog: "Event payment QRIS preview",
    competitionHeading: "Competition",
    scheduleHeading: "Schedule",
    matchControlHeading: "Match Control",
    matchWorkspaceHeading: "Match results & statistics",
    officialResultHeading: "Official result",
    statisticsLink: "Player statistics",
    historyHeading: "History",
    history: "History",
    submitResult: "Submit official result",
    saveStatistics: "Save player statistics",
    approveSubmission: "Approve submission",
    awardsTab: "Awards",
    decisionReason: "Audit decision reason",
    decisionSaved: "Review decision saved.",
    qrisDraftSaved: "QRIS draft saved.",
    qrisPublished: "QRIS published.",
    statisticsSaved: "Saved. Refreshing authoritative data.",
    completionHeading: "Tournament Completion",
    completionStatus: "completed",
    completionFeedback: "Tournament completed successfully. Refresh to view the committed version.",
    certificatePublished: "The seven-certificate set was published safely.",
    certificateHeading: "Certificate Studio",
    certificateGenerated: "A new certificate version was generated.",
    verificationTitle: "Certificate verified",
    supersededStatus: "Valid · Superseded version",
    currentStatus: "Valid · Current version",
    historyFeedback: "Statistics review history",
    importCompleted: "Import completed: 1 participants.",
    oppositeSentinel: "Registrasi peserta",
    opposite: {
      registrationHeading: "Registrasi peserta",
      queueHeading: "Pendaftaran tim",
      importHeading: "Impor peserta",
      paymentHeading: "Antrean pembayaran",
      qrisHeading: "QRIS pembayaran acara",
      qrisDialog: "Pratinjau QRIS pembayaran acara",
      competitionHeading: "Kompetisi",
      scheduleHeading: "Jadwal",
      matchControlHeading: "Kontrol Pertandingan",
      matchWorkspaceHeading: "Hasil & statistik pertandingan",
      officialResultHeading: "Hasil resmi",
      statisticsLink: "Statistik pemain",
      historyHeading: "Riwayat",
      history: "Riwayat",
      submitResult: "Kirim hasil resmi",
      saveStatistics: "Simpan statistik pemain",
      approveSubmission: "Setujui kiriman",
      awardsTab: "Penghargaan",
      decisionReason: "Alasan keputusan audit",
      decisionSaved: "Keputusan pemeriksaan disimpan.",
      qrisDraftSaved: "Draf QRIS disimpan.",
      qrisPublished: "QRIS diterbitkan.",
      statisticsSaved: "Tersimpan. Memuat data terbaru.",
      completionHeading: "Penyelesaian Turnamen",
      completionStatus: "ready",
      completionFeedback: "Turnamen berhasil diselesaikan. Muat ulang untuk melihat versi yang tercatat.",
      certificatePublished: "Set tujuh sertifikat diterbitkan dengan aman.",
      certificateHeading: "Studio Sertifikat",
      certificateGenerated: "Versi sertifikat baru berhasil dibuat.",
      verificationTitle: "Sertifikat terverifikasi",
      supersededStatus: "Valid · Versi terdahulu",
      currentStatus: "Valid · Versi terkini",
      historyFeedback: "Riwayat peninjauan statistik",
      importCompleted: "Impor selesai: 1 peserta.",
    },
  },
} as const;
type ReleaseLocale = (typeof LOCALES)[number];

async function expectLocalizedText(page: Page, expected: string, opposite: string, visibleTimeout?: number) {
  const expectedText = page.getByText(expected, { exact: true });
  if (visibleTimeout === undefined) {
    await expect(expectedText).toBeVisible();
  } else {
    await expect(expectedText).toBeVisible({ timeout: visibleTimeout });
  }
  await expect(page.getByText(opposite, { exact: true })).toHaveCount(0);
}

async function expectLocalizedHeading(page: Page, expected: string, opposite: string) {
  await expect(page.getByRole("heading", { name: expected, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: opposite, exact: true })).toHaveCount(0);
}

function waitForCertificateRegenerationResponse(page: Page, locale: ReleaseLocale, eventId: string) {
  const certificatePath = `/${locale}/organizer/events/${encodeURIComponent(eventId)}/certificates`;
  return page.waitForResponse((response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    return request.method() === "POST" && responseUrl.pathname === certificatePath;
  });
}

/**
 * Shared release contract: keep the assertions in one place so every locale and
 * viewport exercises the same keyboard, focus, control-size, and overflow rules.
 */
export async function expectReleaseAccessibilityContract(page: Page) {
  await probeReleaseReducedMotion(page);
  await waitForReleaseFonts(page);
  const focusMarkers = await page.evaluate((selector) => {
    const visible = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const focusables = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => visible(element) && !element.hasAttribute("disabled") && element.tabIndex >= 0);
    return focusables.map((element, index) => {
      const marker = `task11-focus-${index}`;
      element.dataset.task11Focus = marker;
      return marker;
    });
  }, FOCUSABLE_SELECTOR);
  expect(focusMarkers.length, "release surfaces must expose focusable controls").toBeGreaterThan(0);

  const expectFocusStop = async (marker: string) => {
    const focus = await page.evaluate(() => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active) return null;
      const box = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const visibleLeft = Math.max(box.left, 0);
      const visibleRight = Math.min(box.right, window.innerWidth);
      const visibleTop = Math.max(box.top, 0);
      const visibleBottom = Math.min(box.bottom, window.innerHeight);
      const intersectsViewport = visibleRight > visibleLeft && visibleBottom > visibleTop;
      const hit = intersectsViewport
        ? document.elementFromPoint((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2)
        : null;
      return {
        marker: active.dataset.task11Focus,
        focusVisible: active.matches(":focus-visible"),
        visible: box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none",
        inViewport: intersectsViewport,
        unobscured: hit === active || Boolean(hit && active.contains(hit)),
      };
    });
    expect(focus?.marker).toBe(marker);
    expect(focus?.focusVisible, `focus ring missing for ${marker}`).toBe(true);
    expect(focus?.visible, `focused control hidden for ${marker}`).toBe(true);
    expect(focus?.inViewport, `focused control outside viewport for ${marker}`).toBe(true);
    expect(focus?.unobscured, `focused control obscured for ${marker}`).toBe(true);
  };

  try {
    await page.locator(`[data-task11-focus="${focusMarkers[0]}"]`).focus();
    await expectFocusStop(focusMarkers[0]);
    for (const marker of focusMarkers.slice(1)) {
      await page.keyboard.press("Tab");
      await expectFocusStop(marker);
    }
    for (const marker of focusMarkers.slice(0, -1).reverse()) {
      await page.keyboard.press("Shift+Tab");
      await expectFocusStop(marker);
    }
  } finally {
    await page.evaluate(() => document.querySelectorAll<HTMLElement>("[data-task11-focus]").forEach((element) => delete element.dataset.task11Focus));
  }

  const contract = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const visible = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      'main button, main a[href], main input, main select, main textarea, main summary',
    )).filter(visible);
    const ariaSort = Array.from(document.querySelectorAll<HTMLElement>("[aria-sort]"), (element) => element.getAttribute("aria-sort"));
    const undersizedControls = controls
      .map((element) => ({ element: element.tagName, label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.tagName, height: element.getBoundingClientRect().height }))
      .filter(({ height }) => height < 44);
    return {
      viewport,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ariaSort,
      undersizedControls,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    };
  });

  expect(contract.overflow, `horizontal overflow at ${contract.viewport.width}px`).toBe(false);
  expect(contract.ariaSort.every((value) => value !== null && VALID_ARIA_SORT_VALUES.has(value)), "aria-sort values must be valid").toBe(true);
  expect(contract.undersizedControls, `controls below 44px at ${contract.viewport.width}px`).toEqual([]);
  expect(contract.reducedMotion).toBe(true);
  expect(contract.runningAnimations, "reduced-motion mode must not leave animations running").toBe(0);
}

export async function expectNavigationEscapeRestoresFocus(page: Page, locale: ReleaseLocale) {
  const copy = LOCALE_COPY[locale];
  await expectDialogEscapeRestoresFocus(page, page.getByRole("button", { name: locale === "id" ? "Buka navigasi" : "Open navigation", exact: true }), copy.qrisDialog, copy.opposite.qrisDialog);
}

export async function expectDialogEscapeRestoresFocus(page: Page, trigger: ReturnType<Page["getByRole"]>, accessibleName: string, oppositeAccessibleName?: string) {
  await expect(trigger, "release surface must expose a dialog trigger").toBeVisible();
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName(accessibleName);
  if (oppositeAccessibleName) await expect(page.getByRole("dialog", { name: oppositeAccessibleName, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

export async function expectAriaSortTransition(page: Page) {
  const sortable = page.locator("[aria-sort]");
  await expect(sortable, "sortable release surface must expose an aria-sort target").toHaveCount(1);
  const button = sortable.locator("button");
  await expect(button).toHaveCount(1);
  const before = await sortable.getAttribute("aria-sort");
  await button.click();
  const afterFirst = await sortable.getAttribute("aria-sort");
  expect(afterFirst).not.toBe(before);
  expect(afterFirst).toMatch(/ascending|descending|none|other/);
  await button.click();
  const afterSecond = await sortable.getAttribute("aria-sort");
  expect(afterSecond).not.toBe(afterFirst);
}

type ReleaseFixture = Awaited<ReturnType<typeof prepareOrganizerReleaseFixture>>;

async function expectLocalizedRegistrationSurface(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number], view: "queue" | "import" | "payments" | "qris") {
  const copy = LOCALE_COPY[locale];
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=${view}`);
  await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main")).toBeVisible();
  await expectLocalizedHeading(page, copy.registrationHeading, copy.opposite.registrationHeading);
  await expect(page.locator("main")).not.toContainText(copy.oppositeSentinel);
  if (view === "import") {
    await expectLocalizedHeading(page, copy.importHeading, copy.opposite.importHeading);
    await expect(page.locator('input[type="file"][accept*=".csv"]')).toBeVisible();
    await expect(page.locator("[data-preview]")).toBeVisible();
  }
  if (view === "payments") {
    await expectLocalizedHeading(page, copy.paymentHeading, copy.opposite.paymentHeading);
    await expect(page.locator("[data-approve], [data-reject]").first()).toBeVisible();
  }
  if (view === "qris") {
    await expectLocalizedHeading(page, copy.qrisHeading, copy.opposite.qrisHeading);
    await expect(page.locator("[data-save]")).toBeVisible();
    await expect(page.locator("[data-publish]")).toBeVisible();
    await expect(page.locator('img[alt*="QRIS" i]')).toBeVisible();
  }
  if (view === "queue") await expectLocalizedHeading(page, copy.queueHeading, copy.opposite.queueHeading);
}

async function expectFlagSpecificOperationsRoot(page: Page, locale: ReleaseLocale, mode: (typeof FEATURE_FLAG_MODES)[number]) {
  const operationsRoot = mode === "on"
    ? page.locator("[data-operations]")
    : page.getByRole("region", { name: locale === "id" ? "Ruang kerja Match Day" : "Match Day workspace", exact: true });
  await expect(operationsRoot).toBeVisible();
}

async function expectFlagSpecificRouteHeading(
  page: Page,
  mode: (typeof FEATURE_FLAG_MODES)[number],
  currentV3Heading: string,
  oppositeV3Heading: string,
) {
  if (mode === "off") {
    await expect(page.getByRole("heading", { name: "Match Day", exact: true, level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: oppositeV3Heading, exact: true })).toHaveCount(0);
    return;
  }
  await expectLocalizedHeading(page, currentV3Heading, oppositeV3Heading);
}

async function expectFlagSpecificMatchSurface(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number], mode: (typeof FEATURE_FLAG_MODES)[number]) {
  const copy = LOCALE_COPY[locale];
  const matchId = fixture.releaseMatchId;
  expect(matchId, "release fixture must expose a deterministic match").toBeTruthy();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}`);
  if (mode === "on") {
    await expect(page.locator("[data-match-workspace]")).toHaveCount(1);
  } else {
    await expect(page.getByRole("heading", { name: copy.officialResultHeading, exact: true })).toBeVisible();
    await expect(page.locator("[data-match-workspace]")).toHaveCount(0);
  }
  return matchId!;
}

async function runOrganizerReleaseJourneyPartA(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number], mode: (typeof FEATURE_FLAG_MODES)[number]) {
  const copy = LOCALE_COPY[locale];
  const initialState = await fixture.readState();
  expect(initialState.event).toMatchObject({ id: fixture.id, status: "Ongoing" });
  expect(initialState.registrationEvent).toMatchObject({ id: fixture.registrationEventId, status: "Published" });
  expect(initialState.registrationEvent?.organizerUserId).toBe(initialState.event?.organizerUserId);
  expect(initialState.paymentRequest).toMatchObject({ eventId: fixture.registrationEventId, status: "pending_review" });
  expect(initialState.paymentRequest?.id).toBe(fixture.paymentRequestId);
  expect(initialState.importBatch).toBeNull();
  expect(initialState.qris).toMatchObject({ eventId: fixture.registrationEventId, version: fixture.qrisVersion, status: "draft" });
  expect(initialState.match).toMatchObject({ id: fixture.releaseMatchId, eventId: fixture.id, resultVersion: 0, status: "Scheduled" });
  expect(initialState.match?.resultRevisions).toHaveLength(0);
  if (mode === "on") {
    expect(initialState.match?.playerStats).toHaveLength(0);
    expect(initialState.match?.statSubmissions.some(({ id, status }) => id === fixture.statSubmissionId && status === "pending")).toBe(true);
  } else {
    expect(initialState.match?.playerStats.some(({ id, source }) => Boolean(id) && source === "admin")).toBe(true);
    expect(initialState.match?.statSubmissions).toHaveLength(0);
    expect(fixture.statSubmissionId).toBeUndefined();
  }
  expect(initialState.completion).toBeNull();
  const registrationFixture = { ...fixture, id: fixture.registrationEventId };

  await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "queue");
  const importTeamName = `Release Import ${fixture.registrationEventId.slice(-48)}`;
  expect(importTeamName.length).toBeLessThanOrEqual(64);
  const csv = [
    "team name,team tag,captain name,captain contact,captain email,captain ign,captain uid,captain is player,Player 1 IGN,Player 1 UID,Player 2 IGN,Player 2 UID,Player 3 IGN,Player 3 UID,Player 4 IGN,Player 4 UID",
    `${importTeamName},RIMP,Release Import Captain,,${fixture.importCaptainEmail},ReleaseImport,UID-${fixture.registrationEventId},true,${Array.from(
      { length: 4 },
      (_, index) => `ReleaseImport${index + 1},UID-${fixture.registrationEventId}-P${index + 1}`,
    ).join(",")}`,
  ].join("\n");
  await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "import");
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: fixture.importSourceLabel, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator("[data-preview]").click();
  await expect(page.locator("[data-commit]")).toBeEnabled();
  await page.locator("[data-commit]").click();
  await expectLocalizedText(page, copy.importCompleted, copy.opposite.importCompleted, 15_000);
  await fixture.captureImportBatchId();
  expect(fixture.importBatchId).toBeTruthy();
  let receipt = await fixture.readState();
  expect(receipt.importBatch).toMatchObject({ id: fixture.importBatchId, eventId: fixture.registrationEventId, status: "committed" });

  await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "payments");
  const paymentRow = page.getByRole("button").filter({ hasText: "Release Fixture Team" }).first();
  await expect(paymentRow).toBeVisible();
  await paymentRow.click();
  const paymentReviewPath = `/${locale}/organizer/events/${encodeURIComponent(registrationFixture.id)}/registration`;
  const paymentReviewResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    return request.method() === "POST"
      && responseUrl.pathname === paymentReviewPath
      && responseUrl.searchParams.get("view") === "payments";
  });
  await page.locator("[data-approve]").click();
  const paymentReviewResponse = await paymentReviewResponsePromise;
  expect(paymentReviewResponse.status()).toBeLessThan(400);
  await expect.poll(async () => (await fixture.readState()).paymentRequest?.status).toBe("approved");
  receipt = await fixture.readState();
  expect(receipt.paymentRequest).toMatchObject({ id: fixture.paymentRequestId, eventId: fixture.registrationEventId, status: "approved" });
  await expectLocalizedText(page, copy.decisionSaved, copy.opposite.decisionSaved);

  await expectLocalizedRegistrationSurface(page, registrationFixture, locale, "qris");
  await page.locator("textarea").fill(locale === "id" ? "Gunakan QRIS rilis deterministik." : "Use the deterministic release QRIS.");
  await page.locator("[data-save]").click();
  await expectLocalizedText(page, copy.qrisDraftSaved, copy.opposite.qrisDraftSaved);
  await expect.poll(async () => (await fixture.readState()).qris?.status).toBe("draft");
  const savedQris = await fixture.readState();
  expect(savedQris.qris?.version).toBe(fixture.qrisVersion + 1);
  await page.locator("[data-publish]").click();
  await expectLocalizedText(page, copy.qrisPublished, copy.opposite.qrisPublished);
  await expect.poll(async () => (await fixture.readState()).qris?.status).toBe("published");
  receipt = await fixture.readState();
  expect(receipt.qris).toMatchObject({ eventId: fixture.registrationEventId, status: "published", version: fixture.qrisVersion + 2 });
  await expectDialogEscapeRestoresFocus(page, page.getByRole("button", { name: locale === "id" ? "Perbesar QRIS" : "Enlarge QRIS", exact: true }), copy.qrisDialog, copy.opposite.qrisDialog);

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/competition`);
  await expectFlagSpecificOperationsRoot(page, locale, mode);
  await expectFlagSpecificRouteHeading(page, mode, copy.competitionHeading, copy.opposite.competitionHeading);
  await expect(page.locator("main")).not.toContainText(copy.oppositeSentinel);
  await expectReleaseAccessibilityContract(page);
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/schedule`);
  await expectFlagSpecificRouteHeading(page, mode, copy.scheduleHeading, copy.opposite.scheduleHeading);
  await expectFlagSpecificOperationsRoot(page, locale, mode);

  await fixture.resetMatchForReleaseJourney();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/match-control`);
  await expectFlagSpecificRouteHeading(page, mode, copy.matchControlHeading, copy.opposite.matchControlHeading);
  const matchId = fixture.releaseMatchId;
  expect(matchId, "release fixture must expose a deterministic match").toBeTruthy();
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}`);
  if (mode === "on") {
    await expect(page.locator("[data-match-workspace]")).toBeVisible();
    await expectLocalizedHeading(page, copy.matchWorkspaceHeading, copy.opposite.matchWorkspaceHeading);
  } else {
    await expectLocalizedHeading(page, copy.officialResultHeading, copy.opposite.officialResultHeading);
  }
  const liveReceipt = await fixture.readState();
  expect(liveReceipt.match).toMatchObject({ status: "Live", scheduleStatus: "live" });
  expect(liveReceipt.match?.actualStartedAt).toBeTruthy();
  const resultForm = page.getByRole("form", { name: copy.officialResultHeading, exact: true });
  await expect(resultForm).toBeVisible();
  await expect(page.getByRole("form", { name: copy.opposite.officialResultHeading, exact: true })).toHaveCount(0);
  await resultForm.locator('input[name="home-1"]').fill("2");
  await resultForm.locator('input[name="away-1"]').fill("1");
  await resultForm.getByRole("button", { name: copy.submitResult, exact: true }).click();
  await expect.poll(async () => (await fixture.readState()).match?.resultVersion).toBe(1);
  receipt = await fixture.readState();
  expect(receipt.match).toMatchObject({ id: matchId, eventId: fixture.id, resultVersion: 1, status: "Completed", homeScore: 2, awayScore: 1 });
  expect(receipt.match?.resultRevisions.map(({ version }) => version)).toContain(1);

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}?view=statistics`);
  if (mode === "on") {
    await expect(page.locator("[data-match-workspace]")).toBeVisible();
    await expect(page.getByRole("link", { name: copy.statisticsLink, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: copy.opposite.statisticsLink, exact: true })).toHaveCount(0);
    const playerForm = page.locator(`[data-player-form="${fixture.releasePlayerTeamId}"]`);
    await playerForm.locator(`input[name="score_${fixture.releasePlayerId}_1"]`).fill("8.7");
    await playerForm.locator(`input[name="stat_${fixture.releasePlayerId}_goal"]`).fill("4");
    await playerForm.getByRole("button", { name: copy.saveStatistics, exact: true }).click();
    await expectLocalizedText(page, copy.statisticsSaved, copy.opposite.statisticsSaved);
    await expect.poll(async () => (await fixture.readState()).match?.playerStats.length).toBeGreaterThan(0);
    receipt = await fixture.readState();
    expect(receipt.match?.playerStats.some(({ id, source }) => Boolean(id) && source === "admin")).toBe(true);
    const submission = page.locator(`[data-submission="${fixture.statSubmissionId}"]`);
    await submission.getByRole("button", { name: copy.approveSubmission, exact: true }).click();
    await expectLocalizedText(page, copy.statisticsSaved, copy.opposite.statisticsSaved);
    await expect.poll(async () => (await fixture.readState()).match?.statSubmissions.find(({ id }) => id === fixture.statSubmissionId)?.status).toBe("approved");
    receipt = await fixture.readState();
    expect(receipt.match?.statSubmissions.find(({ id }) => id === fixture.statSubmissionId)).toMatchObject({ id: fixture.statSubmissionId, status: "approved" });
  } else {
    await expectLocalizedHeading(page, copy.officialResultHeading, copy.opposite.officialResultHeading);
    receipt = await fixture.readState();
    expect(receipt.match?.playerStats.some(({ id, source }) => Boolean(id) && source === "admin")).toBe(true);
    expect(receipt.match?.statSubmissions).toHaveLength(0);
  }
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/matches/${encodeURIComponent(matchId!)}?view=history`);
  if (mode === "on") {
    await expect(page.getByRole("link", { name: copy.history, exact: true })).toHaveAttribute("aria-current", "page");
    await expectLocalizedHeading(page, copy.matchWorkspaceHeading, copy.opposite.matchWorkspaceHeading);
    await expectLocalizedText(page, copy.historyFeedback, copy.opposite.historyFeedback);
  }

  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/completion`);
  await expectLocalizedHeading(page, copy.completionHeading, copy.opposite.completionHeading);
  await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", "ready");
  await page.getByRole("tab", { name: copy.awardsTab, exact: true }).click();
  for (const award of ["mvp", "top_scorer", "top_defender", "top_assist"]) {
    const selected = page.locator(`[data-award="${award}"] input[type="radio"]`).first();
    await selected.check();
    await expect(selected).toBeChecked();
  }
  const decisionReason = page.getByLabel(copy.decisionReason, { exact: true });
  await expect(page.getByLabel(copy.opposite.decisionReason, { exact: true })).toHaveCount(0);
  if (await decisionReason.count()) {
    await decisionReason.fill(locale === "id" ? "Pemilihan berdasarkan performa turnamen." : "Selected based on tournament performance.");
    await expect(decisionReason).toHaveValue(locale === "id" ? "Pemilihan berdasarkan performa turnamen." : "Selected based on tournament performance.");
  }
  await page.locator("[data-complete-tournament]").click();
  await expectLocalizedText(page, copy.completionFeedback, copy.opposite.completionFeedback);
  await expect(page.locator("[data-completion-status]")).toHaveAttribute("data-completion-status", copy.completionStatus);
  await expect.poll(async () => (await fixture.readState()).completion?.status).toBe("completed");
  receipt = await fixture.readState();
  expect(receipt.completion).toMatchObject({ status: "completed" });
}

async function runOrganizerReleaseJourneyPartB(page: Page, fixture: ReleaseFixture, locale: (typeof LOCALES)[number]) {
  const copy = LOCALE_COPY[locale];
  await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.id)}/certificates`);
  await expectLocalizedHeading(page, copy.certificateHeading, copy.opposite.certificateHeading);
  await expect(page.locator("[data-certificate-type]")).toHaveCount(EXPECTED_CERTIFICATE_TYPES.length);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  const certificateTypes = await page.locator("[data-certificate-type]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-certificate-type")));
  expect(certificateTypes.sort()).toEqual([...EXPECTED_CERTIFICATE_TYPES].sort());
  for (const certificateType of EXPECTED_CERTIFICATE_TYPES) {
    await page.locator(`[data-certificate-type="${certificateType}"]`).click();
    await selectReleaseCertificateAsset(page, certificateType, fixture.certificateLogoAssetId);
    const certificateRegenerationResponsePromise = waitForCertificateRegenerationResponse(page, locale, fixture.id);
    await page.locator("[data-regenerate-certificate]").click();
    const certificateRegenerationResponse = await certificateRegenerationResponsePromise;
    expect(certificateRegenerationResponse.status()).toBeLessThan(400);
    await expectLocalizedText(page, copy.certificateGenerated, copy.opposite.certificateGenerated);
    await expect.poll(async () => (await fixture.readState()).certificates.filter(({ type }) => type === certificateType).length).toBeGreaterThan(0);
  }
  const firstPublication = await fixture.readState();
  const revisionBefore = firstPublication.publicationVersion;
  expect(revisionBefore).toBe(0);
  const publish = page.locator("[data-publish-certificate-set]");
  await expect(publish).toBeEnabled();
  await publish.click();
  await expectLocalizedText(page, copy.certificatePublished, copy.opposite.certificatePublished);
  await expect.poll(async () => (await fixture.readState()).publicationVersion).toBe(revisionBefore + 1);
  await page.locator('[data-certificate-type="champion"]').click();
  await selectReleaseCertificateAsset(page, "champion", fixture.certificateLogoAssetId);
  const certificateRegenerationResponsePromise = waitForCertificateRegenerationResponse(page, locale, fixture.id);
  await page.locator("[data-regenerate-certificate]").click();
  const certificateRegenerationResponse = await certificateRegenerationResponsePromise;
  expect(certificateRegenerationResponse.status()).toBeLessThan(400);
  await expectLocalizedText(page, copy.certificateGenerated, copy.opposite.certificateGenerated);
  await expect.poll(async () => (await fixture.readState()).certificates.filter(({ type, version }) => type === "champion" && version === 2).length).toBe(1);
  await expect(publish).toBeEnabled();
  await publish.click();
  await expectLocalizedText(page, copy.certificatePublished, copy.opposite.certificatePublished);
  const revisionAfter = (await fixture.readState()).publicationVersion;
  expect(revisionAfter).toBe(revisionBefore + 2);
  const receipt = await fixture.readState();
  const historicalVerificationCode = receipt.certificates.find(({ type, version }) => type === "champion" && version === 1)?.verificationCode;
  const currentVerificationCode = receipt.certificates.find(({ type, version }) => type === "champion" && version === 2)?.verificationCode;
  expect(historicalVerificationCode).toBeTruthy();
  expect(currentVerificationCode).toBeTruthy();
  await page.goto(`/${locale}/certificates/verify/${encodeURIComponent(historicalVerificationCode!)}`);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expectLocalizedHeading(page, copy.verificationTitle, copy.opposite.verificationTitle);
  await expectLocalizedText(page, copy.supersededStatus, copy.opposite.supersededStatus);
  await expect(page.getByText(copy.currentStatus, { exact: true })).toHaveCount(0);
  await page.goto(`/${locale}/certificates/verify/${encodeURIComponent(currentVerificationCode!)}`);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expectLocalizedHeading(page, copy.verificationTitle, copy.opposite.verificationTitle);
  await expectLocalizedText(page, copy.currentStatus, copy.opposite.currentStatus);
  await expect(page.getByText(copy.supersededStatus, { exact: true })).toHaveCount(0);
}

function eventIdentity() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `V3 Lifecycle ${suffix}`,
    slug: `v3-lifecycle-${suffix}`,
  };
}

const organizerMasterShellEnabled = process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true";
const eventEditorRoute = organizerMasterShellEnabled ? "edit" : "overview";

const lifecycleDb = new PrismaClient();
const LIFECYCLE_ORGANIZER_EMAIL = "organizer-a@miraclefc.gg";

async function cleanupCreatedOrganizerEvent(event: ReturnType<typeof eventIdentity>) {
  const organizer = await lifecycleDb.user.findUniqueOrThrow({
    where: { email: LIFECYCLE_ORGANIZER_EMAIL },
    select: { id: true },
  });
  const created = await lifecycleDb.event.findUnique({
    where: { slug: event.slug },
    select: { id: true, organizerUserId: true },
  });
  if (!created) return;
  if (created.organizerUserId !== organizer.id) {
    throw new Error(`Refusing to clean event ${event.slug}: ownership did not match ${LIFECYCLE_ORGANIZER_EMAIL}`);
  }
  const result = await lifecycleDb.event.deleteMany({
    where: { id: created.id, slug: event.slug, organizerUserId: organizer.id },
  });
  if (result.count !== 1) throw new Error(`Expected to clean exactly one lifecycle event, deleted ${result.count}`);
  const remaining = await lifecycleDb.event.count({
    where: { id: created.id, slug: event.slug, organizerUserId: organizer.id },
  });
  if (remaining !== 0) throw new Error(`Lifecycle event ${event.slug} remained after cleanup`);
}

type LifecycleEvent = ReturnType<typeof eventIdentity>;
type LifecycleEventTracker = (event: LifecycleEvent) => void;
const LIFECYCLE_CLEANUP_TIMEOUT = 30_000;

const lifecycleTest = test.extend<{ trackLifecycleEvent: LifecycleEventTracker }>({
  trackLifecycleEvent: [async ({}, use) => {
    let trackedEvent: LifecycleEvent | undefined;
    const trackLifecycleEvent: LifecycleEventTracker = (event) => {
      trackedEvent = event;
    };
    await use(trackLifecycleEvent);
    if (trackedEvent) await cleanupCreatedOrganizerEvent(trackedEvent);
  }, { timeout: LIFECYCLE_CLEANUP_TIMEOUT }],
});

test.afterAll(async () => {
  await lifecycleDb.$disconnect();
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`@task11-release-matrix organizer release accessibility matrix ${locale} ${viewport.name}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const configuredMode = test.info().project.metadata.releaseFlagMode as (typeof FEATURE_FLAG_MODES)[number] | undefined;
      const mode = configuredMode ?? (process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true" ? "on" : "off");
      expect(FEATURE_FLAG_MODES).toContain(mode);
      const fixture = await prepareOrganizerReleaseFixture(`release-a11y-${mode}-${locale}-${viewport.name}`, mode);
      try {
        await loginWithCredentials(page, {
          locale,
          email: "organizer-a@miraclefc.gg",
          password: "Miracle2026!",
          destination: /organizer/,
        });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expectFlagSpecificMatchSurface(page, fixture, locale, mode);
        await page.goto(`/${locale}/organizer/events/${encodeURIComponent(fixture.registrationEventId)}/registration?view=qris`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expectReleaseAccessibilityContract(page);
        const copy = LOCALE_COPY[locale];
        await expectDialogEscapeRestoresFocus(page, page.getByRole("button", { name: locale === "id" ? "Perbesar QRIS" : "Enlarge QRIS", exact: true }), copy.qrisDialog);
        expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
        await waitForReleaseFonts(page);
        await suppressAnimationsForScreenshot(page);
        await page.screenshot({
          path: test.info().outputPath(`release-accessibility-${mode}-${locale}-${viewport.name}.png`),
          animations: "disabled",
        });
        await page.goto(`/${locale}/events/flashpeak-champions-32/leaderboards`);
        await expectAriaSortTransition(page);
        const bodyText = await page.locator("body").innerText();
        expect(bodyText).not.toMatch(/Miracle2026!|organizer-a@miraclefc\.gg/i);
      } finally {
        await fixture.cleanup();
      }
    });
  }
}

for (const locale of ["id", "en"] as const) {
  test(`@task11-public-leaderboard-tail seeded public leaderboard ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/events/flashpeak-champions-32/leaderboards`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expectAriaSortTransition(page);
    const artifactText = await page.locator("body").innerText();
    expect(artifactText).not.toMatch(/Miracle2026!|organizer-a@miraclefc\.gg|captain@miraclefc\.gg/i);
  });
}

for (const locale of ["id", "en"] as const) {
  test.describe(`@task11-release-journey organizer release journey ${locale}`, () => {
    test.describe.configure({ mode: "serial" });
    let fixture: ReleaseFixture | undefined;
    let mode: (typeof FEATURE_FLAG_MODES)[number];

    test.beforeAll(async ({}, testInfo) => {
      const configuredMode = testInfo.project.metadata.releaseFlagMode as (typeof FEATURE_FLAG_MODES)[number] | undefined;
      mode = configuredMode ?? (process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true" ? "on" : "off");
      expect(FEATURE_FLAG_MODES).toContain(mode);
      fixture = await prepareOrganizerReleaseFixture(`release-journey-${locale}`, mode);
    });

    test.afterAll(async () => {
      if (fixture) await fixture.cleanup();
    });

    test(`@task11-release-journey-part-a organizer release journey ${locale} covers registration through Completion`, async ({ page }) => {
      test.setTimeout(180_000);
      expect(fixture).toBeDefined();
      const currentFixture = fixture!;
      await loginWithCredentials(page, {
        locale,
        email: "organizer-a@miraclefc.gg",
        password: "Miracle2026!",
        destination: /organizer/,
      });
      await runOrganizerReleaseJourneyPartA(page, currentFixture, locale, mode);
    });

    test(`@task11-release-journey-part-b organizer release journey ${locale} covers certificates and publication`, async ({ page }) => {
      test.setTimeout(180_000);
      expect(fixture).toBeDefined();
      const currentFixture = fixture!;
      await loginWithCredentials(page, {
        locale,
        email: "organizer-a@miraclefc.gg",
        password: "Miracle2026!",
        destination: /organizer/,
      });
      await runOrganizerReleaseJourneyPartB(page, currentFixture, locale);
    });
  });
}

test("admin can use the shared workspace while a non-owner is denied", async ({ browser }) => {
  test.setTimeout(120_000);
  const fixture = await prepareOrganizerReleaseFixture("release-roles");
  const adminPage = await browser.newPage();
  const nonOwnerPage = await browser.newPage();
  try {
    await loginWithCredentials(adminPage, {
      locale: "en",
      email: "admin@miraclefc.gg",
      password: "Miracle2026!",
      destination: /admin|organizer/,
    });
    await adminPage.goto(`/en/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=queue`);
    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage.locator('[data-view="queue"]')).toHaveAttribute("aria-current", "page");

    await loginWithCredentials(nonOwnerPage, {
      locale: "en",
      email: "organizer-b@miraclefc.gg",
      password: "Miracle2026!",
      destination: /organizer/,
    });
    const response = await nonOwnerPage.goto(`/en/organizer/events/${encodeURIComponent(fixture.id)}/registration?view=queue`);
    expect(response?.status() ?? 404).toBeGreaterThanOrEqual(400);
    await expect(nonOwnerPage.getByText(fixture.eventName, { exact: true })).toHaveCount(0);
    await expect(nonOwnerPage.locator("body")).not.toContainText(fixture.id);
  } finally {
    await adminPage.close();
    await nonOwnerPage.close();
    await fixture.cleanup();
  }
});

test.describe("V3 organizer lifecycle", () => {
  test("organizer lands in the command center and cannot enter platform admin", async ({ page }) => {
    await loginAsOrganizer(page, "id");
    await expect(page).toHaveURL(/\/id\/organizer$/);
    await expect(page.getByRole("heading", { name: "Organizer Command Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create event" }).first()).toBeVisible();
    await expect(page.locator('aside a[href="/id/admin"]')).toHaveCount(0);
    await page.goto("/id/admin");
    await expect(page).toHaveURL(/\/id\/organizer$/);
  });
  lifecycleTest("organizer can create, autosave, preview, revoke, and publish an event", async ({ browser, page, trackLifecycleEvent }) => {
    test.setTimeout(90_000);
    const event = eventIdentity();
    trackLifecycleEvent(event);
    let guest: BrowserContext | undefined;

    try {
      await loginAsOrganizer(page);
      await page.goto("/id/organizer/events/new");
      await page.getByLabel("Event name").fill(event.name);
      await page.getByLabel("Public URL slug").fill(event.slug);
      await page.getByRole("button", { name: "Create private draft" }).click();
      await expect(page).toHaveURL(/\/id\/organizer\/events\/[^/]+\/overview$/, { timeout: 30_000 });
      const eventId = new URL(page.url()).pathname.match(/\/events\/([^/]+)\/overview$/)?.[1];
      expect(eventId).toBeTruthy();
      await page.goto(`/id/organizer/events/${encodeURIComponent(eventId!)}/${eventEditorRoute}`);
      await expect(page).toHaveURL(new RegExp(`/id/organizer/events/[^/]+/${eventEditorRoute}$`));

      const expectStep = async (step: number) => {
        await expect(page.getByText(`Langkah ${step} dari 5`, { exact: true })).toBeVisible();
      };
      const back = page.getByRole("button", { name: "Kembali", exact: true });
      const next = page.getByRole("button", { name: "Lanjut", exact: true });
      await expectStep(1);
      const description = "A complete browser-tested tournament draft for the Miracle V3 organizer lifecycle.";
      await page.getByLabel("Deskripsi singkat").fill(description);
      await next.click();
      await expectStep(2);
      await page.getByLabel("Acara dimulai").fill("2026-10-10T10:00");
      await page.getByLabel("Pelaksanaan").fill("Miracle Test Arena");
      await next.click();
      await expectStep(3);
      await page.getByLabel("Pendaftaran dibuka").fill("2026-10-01T09:00");
      await page.getByLabel("Pendaftaran ditutup").fill("2026-10-07T21:00");
      await expect(page.getByRole("status").filter({ hasText: "Tersimpan" })).toBeVisible({ timeout: 20_000 });
      await next.click();
      await expectStep(4);
      await next.click();
      await expectStep(5);
      const review = page.locator("section#section-review");
      await expect(review.getByRole("heading", { name: "Tinjau & terbitkan", exact: true })).toBeVisible();
      await expect(review.getByRole("heading", { name: "Siap diterbitkan", exact: true })).toBeVisible({ timeout: 20_000 });

      await page.reload();
      await expectStep(5);
      for (let step = 4; step >= 1; step -= 1) {
        await back.click();
        await expectStep(step);
      }
      await expect(page.getByLabel("Deskripsi singkat")).toHaveValue(description);
      await next.click();
      await expectStep(2);
      await expect(page.getByLabel("Pelaksanaan")).toHaveValue("Miracle Test Arena");
      await next.click();
      await next.click();
      await next.click();
      await expectStep(5);

      await review.getByRole("button", { name: "Buat pratinjau", exact: true }).click();
      const previewLink = review.getByRole("link", { name: "Buka pratinjau", exact: true });
      await expect(previewLink).toBeVisible({ timeout: 20_000 });
      const previewUrl = await previewLink.getAttribute("href");
      expect(previewUrl).toMatch(/^\/id\/preview\/events\//);

      guest = await browser.newContext();
      const guestPage = await guest.newPage();
      await guestPage.goto(previewUrl!);
      await expect(guestPage.getByLabel(/pratinjau privat|private preview/i)).toBeVisible();
      await expect(guestPage.getByText(event.name)).toBeVisible();

      await review.getByRole("button", { name: "Cabut tautan", exact: true }).click();
      await expect(review.getByRole("button", { name: "Buat pratinjau", exact: true })).toBeVisible({ timeout: 20_000 });
      await guestPage.goto(previewUrl!);
      await expect(guestPage.getByRole("heading", { name: /not found|halaman tidak ditemukan/i })).toBeVisible();

      await review.getByRole("button", { name: "Terbitkan acara", exact: true }).click();
      if (organizerMasterShellEnabled) {
        const publication = page.locator('main > header dl div').filter({ hasText: "Diterbitkan" });
        await expect(publication).toHaveCount(1, { timeout: 20_000 });
        await expect(publication.locator("dt")).toHaveText("Publikasi");
        await expect(publication.locator("dd")).toHaveText("Diterbitkan");
      } else {
        await expect(page.getByText("Acara sudah diterbitkan", { exact: true })).toBeVisible({ timeout: 20_000 });
      }
      await page.goto(`/id/events/${event.slug}`);
      await expect(page.getByRole("heading", { name: event.name })).toBeVisible({ timeout: 20_000 });
    } finally {
      await guest?.close();
    }
  });

  for (const locale of ["id", "en"] as const) {
    lifecycleTest(`workspace navigation labels fit without overlap at ${locale} tablet widths`, async ({ page, trackLifecycleEvent }) => {
      test.setTimeout(90_000);
      const event = eventIdentity();
      trackLifecycleEvent(event);
      await loginAsOrganizer(page, locale);
      await page.goto(`/${locale}/organizer/events/new`);
      await page.getByLabel("Event name").fill(event.name);
      await page.getByLabel("Public URL slug").fill(event.slug);
      await page.getByRole("button", { name: "Create private draft" }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/organizer/events/[^/]+/overview$`), { timeout: 30_000 });
      const eventId = new URL(page.url()).pathname.match(/\/events\/([^/]+)\/overview$/)?.[1];
      expect(eventId).toBeTruthy();
      await page.goto(`/${locale}/organizer/events/${encodeURIComponent(eventId!)}/${eventEditorRoute}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/organizer/events/[^/]+/${eventEditorRoute}$`));
      const navigation = page.locator('nav:has(a[aria-current="step"])');
      for (const width of [700, 768, 980]) {
        await page.setViewportSize({ width, height: 800 });
        if (organizerMasterShellEnabled) {
          await expect(navigation).toHaveCount(1);
          await expect(navigation.locator('a[aria-current="step"]')).toHaveCount(1);
          const layout = await navigation.evaluate((navigation) => {
            const viewportWidth = document.documentElement.clientWidth;
            const labels = Array.from(navigation.querySelectorAll<HTMLElement>("a > span:last-child"))
              .map((label) => {
                const rect = label.getBoundingClientRect();
                return { left: Math.round(rect.left), right: Math.round(rect.right), visible: rect.width > 1 && rect.height > 1 };
              });
            return {
              overflow: Array.from(document.querySelectorAll<HTMLElement>("*")).filter((element) => element.getBoundingClientRect().right > viewportWidth + 1).map((element) => element.tagName),
              labels,
              overlaps: labels.flatMap((label, index) => labels.slice(index + 1).filter((other) => label.right > other.left + 1).map(() => index)),
            };
          });
          expect(layout.overflow).toEqual([]);
          expect(layout.labels).toHaveLength(5);
          expect(layout.labels.filter((label) => label.visible)).toHaveLength(width < 900 ? 0 : 5);
          expect(layout.overlaps).toEqual([]);
        } else {
          await expect(navigation).toHaveCount(0);
          const controls = page.locator("[data-workspace-step-controls]");
          await expect(controls).toBeVisible();
          const directControls = controls.locator(":scope > *");
          await expect(directControls).toHaveCount(3);
          expect(await directControls.evaluateAll((elements) => elements.map((element) => element.tagName))).toEqual(["BUTTON", "P", "BUTTON"]);
          await expect(directControls.nth(0)).toBeVisible();
          await expect(directControls.nth(0)).toHaveAccessibleName(locale === "id" ? "Kembali" : "Back");
          await expect(directControls.nth(1)).toBeVisible();
          await expect(directControls.nth(1)).toHaveText(locale === "id" ? "Langkah 1 dari 5" : "Step 1 of 5");
          await expect(directControls.nth(2)).toBeVisible();
          await expect(directControls.nth(2)).toHaveAccessibleName(locale === "id" ? "Lanjut" : "Continue");
          const layout = await controls.evaluate((controls) => {
            const viewportWidth = document.documentElement.clientWidth;
            const bounds = controls.getBoundingClientRect();
            const children = Array.from(controls.children)
              .map((element) => {
                const rect = (element as HTMLElement).getBoundingClientRect();
                return { left: rect.left, right: rect.right, visible: rect.width > 0 && rect.height > 0 };
              });
            const overflowingElements = Array.from(controls.querySelectorAll<HTMLElement>("*"))
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
              })
              .map((element) => element.tagName);
            return {
              pageOverflow: document.documentElement.scrollWidth > viewportWidth,
              controlsWithinViewport: bounds.left >= -1 && bounds.right <= viewportWidth + 1,
              children,
              overflowingElements,
              overlaps: children.flatMap((child, index) => children.slice(index + 1).filter((other) => child.right > other.left + 1).map(() => index)),
            };
          });
          expect(layout.children).toHaveLength(3);
          expect(layout.children.map((child) => child.visible)).toEqual([true, true, true]);
          expect(layout.pageOverflow).toBe(false);
          expect(layout.controlsWithinViewport).toBe(true);
          expect(layout.overflowingElements).toEqual([]);
          expect(layout.overlaps).toEqual([]);
        }
      }
    });
  }
  test("workspace stays within a 360px viewport", async ({ page }) => {
    const event = eventIdentity();
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAsOrganizer(page);
    await page.goto("/id/organizer/events/new");
    await page.getByLabel("Event name").fill(event.name);
    await page.getByLabel("Public URL slug").fill(event.slug);
    await page.getByRole("button", { name: "Create private draft" }).click();
    await expect(page).toHaveURL(/\/id\/organizer\/events\/[^/]+\/overview$/, { timeout: 30_000 });
    const overflow = await page.locator("*").evaluateAll((elements) => elements
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        text: element.textContent?.trim().slice(0, 80),
      }))
      .slice(0, 12));
    expect(overflow).toEqual([]);
  });
});
