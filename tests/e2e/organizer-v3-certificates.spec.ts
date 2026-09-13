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

let fixture: CertificateFixture | undefined;
test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test("publishes all seven certificates and preserves superseded verification history", async ({ page }) => {
  fixture = await prepareCertificateFixture();
  await loginAsOrganizer(page, "en");
  await page.goto(`/en/organizer/events/${fixture.id}/certificates`);

  await expect(page.locator("[data-certificate-type]")).toHaveCount(7);
  await expect(page.locator("[data-publish-certificate-set]")).toBeEnabled();
  await expect.poll(() => completionDb.certificateGenerationMutation.count({ where: { eventId: fixture!.id } })).toBe(fixture.generatedMutationCount);
  await page.locator("[data-publish-certificate-set]").click();
  await expect.poll(() => completionDb.certificatePublication.count({ where: { eventId: fixture!.id } })).toBe(2);

  const certificates = await completionDb.certificate.findMany({
    where: { eventId: fixture.id },
    orderBy: [{ type: "asc" }, { version: "asc" }],
  });
  expect(new Set(certificates.filter(({ publishedAt }) => publishedAt).map(({ type }) => type))).toEqual(new Set(MIRACLE_V3_CERTIFICATE_TYPES));
  const oldChampion = certificates.find(({ type, version }) => type === "champion" && version === 1)!;
  expect(oldChampion).toMatchObject({
    status: "superseded",
    supersededByVersion: 2,
    verificationCode: fixture.historicalVerificationCode,
    publishedUrl: fixture.historicalPublishedUrl,
  });

  await page.goto(`/certificates/verify/${fixture.historicalVerificationCode}`);
  await expect(page).toHaveURL(new RegExp(`/(id|en)/certificates/verify/${fixture.historicalVerificationCode}$`));
  await expect(page.locator('[data-certificate-verification="superseded"]')).toBeVisible();
  await expect(page.getByText(/remains valid|tetap valid/i)).toBeVisible();

  await page.goto(`/en/certificates/verify/${fixture.currentVerificationCode}`);
  await expect(page.locator('[data-certificate-verification="current"]')).toBeVisible();
  await expect(page.getByText(fixture.eventName, { exact: true })).toBeVisible();
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
