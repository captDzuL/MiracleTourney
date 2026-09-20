import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { buildMiracleV3CertificateHtml } from "../../src/lib/certificate/templates/miracle-v3";
import {
  MIRACLE_V3_BRANDING,
  MIRACLE_V3_SAFE_ZONES,
  MIRACLE_V3_CERTIFICATE_TYPES,
} from "../../src/lib/certificate/templates/miracle-v3-contract";
import { loginAsOrganizer } from "./helpers/auth";
import {
  completionDb,
  prepareCertificateFixture,
  type CertificateFixture,
} from "./helpers/completion";

test.describe.configure({ mode: "serial" });

let fixture: CertificateFixture | undefined;
test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test("publishes all seven certificates and preserves superseded verification history", async ({ page }) => {
  test.slow();
  const scenario = await prepareCertificateFixture();
  fixture = scenario;
  await loginAsOrganizer(page, "en");
  await page.goto(`/en/organizer/events/${scenario.id}/certificates`);

  await expect(page.locator("[data-certificate-type]")).toHaveCount(7);
  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  await expect(page.locator("[data-publish-certificate-set]")).toBeEnabled();
  await expect.poll(() => completionDb.certificateGenerationMutation.count({ where: { eventId: scenario.id } })).toBe(scenario.generatedMutationCount);
  await page.locator("[data-publish-certificate-set]").click();
  await expect(page.locator('[role="status"]')).toContainText("The seven-certificate set was published safely.");
  await expect.poll(() => completionDb.certificatePublication.count({ where: { eventId: scenario.id } })).toBe(2);
  await expect.poll(async () => (await completionDb.tournamentCompletion.findUniqueOrThrow({ where: { eventId: scenario.id }, select: { certificateRevision: true } })).certificateRevision).toBe(2);

  const certificates = await completionDb.certificate.findMany({
    where: { eventId: scenario.id },
    orderBy: [{ type: "asc" }, { version: "asc" }],
  });
  const publishedCertificates = certificates.filter(({ publishedAt, publishedUrl }) => publishedAt && publishedUrl);
  expect(new Set(publishedCertificates.map(({ type }) => type))).toEqual(new Set(MIRACLE_V3_CERTIFICATE_TYPES));
  expect(publishedCertificates).toHaveLength(7);
  const oldChampion = certificates.find(({ type, version }) => type === "champion" && version === 1)!;
  expect(oldChampion).toMatchObject({
    status: "superseded",
    supersededByVersion: 2,
    verificationCode: scenario.historicalVerificationCode,
    publishedUrl: scenario.historicalPublishedUrl,
  });

  await page.goto(`/id/certificates/verify/${scenario.historicalVerificationCode}`);
  await expect(page).toHaveURL(new RegExp(`/id/certificates/verify/${scenario.historicalVerificationCode}$`));
  await expect(page.locator('[data-certificate-verification="superseded"]')).toBeVisible();
  await expect(page.getByText(/remains valid|tetap valid/i)).toBeVisible();

  await page.goto(`/en/certificates/verify/${scenario.currentVerificationCode}`);
  await expect(page.locator('[data-certificate-verification="current"]')).toBeVisible();
  await expect(page.getByText(scenario.eventName, { exact: true })).toBeVisible();
});

test("publishes once in Indonesian and announces the localized revision", async ({ page }) => {
  test.slow();
  const scenario = await prepareCertificateFixture();
  fixture = scenario;
  await loginAsOrganizer(page, "id");
  await page.goto(`/id/organizer/events/${scenario.id}/certificates`);

  await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
  const publish = page.locator("[data-publish-certificate-set]");
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.locator('[role="status"]')).toContainText("Set tujuh sertifikat diterbitkan dengan aman.");
  await expect.poll(() => completionDb.certificatePublication.count({ where: { eventId: scenario.id } })).toBe(2);
  await expect.poll(async () => (await completionDb.tournamentCompletion.findUniqueOrThrow({ where: { eventId: scenario.id }, select: { certificateRevision: true } })).certificateRevision).toBe(2);
});

test("keeps the certificate studio reachable and usable at desktop and mobile geometry", async ({ page }) => {
  test.slow();
  const scenario = await prepareCertificateFixture();
  fixture = scenario;
  await loginAsOrganizer(page, "en");

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/en/organizer/events/${scenario.id}/certificates`);
    await expect(page.locator('[data-hydration-ready="true"]')).toHaveCount(1);
    await expect(page.locator("[data-certificate-studio]")).toBeVisible();
    await expect(page.locator("[data-certificate-studio] > header")).toBeVisible();
    await expect(page.locator("[data-certificate-recipient-selection]")).toBeVisible();
    await expect(page.locator("[data-regenerate-certificate]")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("[data-certificate-studio]")!;
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
        root: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
        header: rect("[data-certificate-studio] > header"),
        recipient: rect("[data-certificate-recipient-selection]"),
        actions: rect("[data-certificate-primary-actions]"),
        preview: rect("[data-certificate-preview-sticky]"),
        controls: [...root.querySelectorAll<HTMLElement>("button, a, input, textarea, select, summary")]
          .map((control) => ({ label: control.textContent?.trim() || control.getAttribute("name") || control.tagName, height: control.getBoundingClientRect().height }))
          .filter(({ height }) => height > 0),
      };
    });

    expect(geometry.document.scrollWidth, `document overflow at ${viewport.width}px`).toBeLessThanOrEqual(geometry.document.clientWidth);
    expect(geometry.root.scrollWidth, `studio overflow at ${viewport.width}px`).toBeLessThanOrEqual(geometry.root.clientWidth);
    for (const [name, box] of Object.entries({ header: geometry.header, recipient: geometry.recipient, actions: geometry.actions })) {
      expect(box.width, `${name} has no width at ${viewport.width}px`).toBeGreaterThan(0);
      expect(box.height, `${name} has no height at ${viewport.width}px`).toBeGreaterThan(0);
    }
    expect(geometry.preview.width, `preview exceeds mobile viewport`).toBeLessThanOrEqual(viewport.width);
    for (const control of geometry.controls) {
      expect(control.height, `${control.label} is below the 44px target at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
    }

    const preview = page.locator("[data-certificate-preview-sticky]");
    const previewPosition = await preview.evaluate((element) => getComputedStyle(element).position);
    if (viewport.width >= 1100) {
      expect(previewPosition).toBe("sticky");
      await preview.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 96));
      const topBeforeScroll = await preview.evaluate((element) => element.getBoundingClientRect().top);
      await page.evaluate(() => window.scrollBy(0, 120));
      const topAfterScroll = await preview.evaluate((element) => element.getBoundingClientRect().top);
      expect(Math.abs(topAfterScroll - topBeforeScroll), "desktop preview does not remain sticky while scrolling").toBeLessThanOrEqual(2);
    } else {
      expect(previewPosition).toBe("static");
    }
    await page.locator("[data-certificate-primary-actions]").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-regenerate-certificate]")).toBeVisible();
    await expect(page.locator("[data-publish-certificate-set]")).toBeVisible();
  }
});

test("renders the 1080x1920 protected-zone certificate with fallback and immutable QR target", async ({ page }) => {
  const verificationCode = "e2e-rendered-fallback";
  const html = await buildMiracleV3CertificateHtml({
    eventId: "e2e-certificate-render",
    eventName: "Miracle Completion Final",
    gameId: "game-flashpeak",
    gameName: "Flashpeak",
    certificateId: "certificate-render-1",
    certificateType: "champion",
    version: 1,
    templateVersion: "miracle-v3",
    recipientId: "team-a",
    recipientName: "Team Alpha",
    recipientKind: "team",
    teamId: "team-a",
    teamName: "Team Alpha",
    teamLogoUrl: null,
    characterArtUrl: null,
    issueDate: "2026-09-13",
    verificationCode,
    verificationBaseUrl: "https://miracle-league.fun",
    branding: MIRACLE_V3_BRANDING,
    assetPlacements: [],
  });
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.setContent(html);
  const canvas = page.locator('[data-certificate-canvas="1080x1920"]');
  await expect(canvas).toBeVisible();
  await expect(canvas.locator('[data-role="hero-fallback"]')).toHaveCount(1);
  await expect(canvas.locator('[data-role="verification-qr"]')).toBeVisible();
  await expect(canvas.locator(`a[href="https://miracle-league.fun/certificates/verify/${verificationCode}"]`)).toHaveCount(1);

  const bounds = await canvas.evaluate((root) => ({
    width: root.clientWidth,
    height: root.clientHeight,
    zones: [...root.querySelectorAll<HTMLElement>("[data-zone]")].map((zone) => ({
      name: zone.dataset.zone!,
      x: zone.offsetLeft,
      y: zone.offsetTop,
      width: zone.offsetWidth,
      height: zone.offsetHeight,
    })),
  }));
  expect({ width: bounds.width, height: bounds.height }).toEqual({ width: 1080, height: 1920 });
  for (const [name, expected] of Object.entries(MIRACLE_V3_SAFE_ZONES)) {
    expect(bounds.zones.find((zone) => zone.name === name)).toEqual({ name, ...expected });
  }
  const png = await canvas.screenshot({ path: path.join(test.info().outputDir, "certificate-fallback.png") });
  expect(await sharp(png).metadata()).toMatchObject({ width: 1080, height: 1920, format: "png" });

  const embedded = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const characterPlacement = { assetKind: "character_art" as const, x: 360, y: 708, width: 560, height: 620 };
  const badgePlacement = { assetKind: "team_logo_badge" as const, x: 80, y: 1052, width: 160, height: 160 };
  const placedHtml = await buildMiracleV3CertificateHtml({
    eventId: "e2e-certificate-placed",
    eventName: "Miracle Completion Final",
    gameId: "game-flashpeak",
    gameName: "Flashpeak",
    certificateId: "certificate-placed-1",
    certificateType: "mvp",
    version: 1,
    templateVersion: "miracle-v3",
    recipientId: "player-a",
    recipientName: "Ari Alpha",
    recipientKind: "player",
    teamId: "team-a",
    teamName: "Team Alpha",
    teamLogoUrl: embedded,
    characterArtUrl: embedded,
    issueDate: "2026-09-13",
    verificationCode: "e2e-rendered-assets",
    verificationBaseUrl: "https://miracle-league.fun",
    branding: MIRACLE_V3_BRANDING,
    assetPlacements: [characterPlacement, badgePlacement],
  });
  await page.setContent(placedHtml);
  const placedCanvas = page.locator('[data-certificate-canvas="1080x1920"]');
  const placedBounds = await placedCanvas.evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    const relative = (selector: string) => {
      const box = root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { x: box.x - rootBox.x, y: box.y - rootBox.y, width: box.width, height: box.height };
    };
    return {
      character: relative('[data-role="character-art"]'),
      badge: relative('[data-zone="secondaryBadge"] img'),
    };
  });
  expect(placedBounds.character).toEqual({
    x: characterPlacement.x,
    y: characterPlacement.y,
    width: characterPlacement.width,
    height: characterPlacement.height,
  });
  expect(placedBounds.badge).toEqual({
    x: badgePlacement.x,
    y: badgePlacement.y,
    width: badgePlacement.width,
    height: badgePlacement.height,
  });
  const placedPng = await placedCanvas.screenshot({ path: path.join(test.info().outputDir, "certificate-placed-assets.png") });
  expect(await sharp(placedPng).metadata()).toMatchObject({ width: 1080, height: 1920, format: "png" });
});
