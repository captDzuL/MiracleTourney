import { expect, test } from "vitest";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { renderCertificatePng } from "./renderer";
import { buildMiracleV3CertificateHtml, getMiracleV3CertificateFingerprint, MIRACLE_V3_BRANDING, type MiracleV3CertificateData } from "./templates/miracle-v3";

// The project uses playwright-core without a bundled browser. Opt in with an installed channel.
const browserTest = test.skipIf(!process.env.CERTIFICATE_TEST_BROWSER_CHANNEL);
const data: MiracleV3CertificateData = {
  eventId: "event-1", eventName: "Miracle Cup", gameId: "game-flashpeak", gameName: "Flashpeak",
  certificateId: "cert-1", certificateType: "mvp", version: 2, templateVersion: "miracle-v3",
  recipientId: "player-1", recipientName: "Nyx", recipientKind: "player",
  teamId: "team-1", teamName: "Garuda Nova", teamLogoUrl: null,
  characterArtUrl: "https://assets.example/hero.png", issueDate: "2026-09-05",
  verificationCode: "verify-123", verificationBaseUrl: "https://miracle-league.fun", branding: MIRACLE_V3_BRANDING,
};

browserTest.each(["not-found", "decode-failed", "network-failed", "valid"] as const)("captures a populated hero after %s remote artwork", async outcome => {
  const browser = await chromium.launch({ channel: process.env.CERTIFICATE_TEST_BROWSER_CHANNEL, headless: true });
  const page = await browser.newPage();
  await page.route("https://assets.example/hero.png", async route => {
    if (outcome === "network-failed") return route.abort("failed");
    if (outcome === "not-found") return route.fulfill({ status: 404, body: "not found" });
    if (outcome === "decode-failed") return route.fulfill({ contentType: "image/png", body: "invalid image bytes" });
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="cyan"/></svg>' });
  });
  const html = await buildMiracleV3CertificateHtml(data);
  const fingerprint = getMiracleV3CertificateFingerprint(data);
  const png = await renderCertificatePng(html, { launchBrowser: async () => ({
    newPage: async () => ({
      setViewportSize: viewport => page.setViewportSize(viewport),
      setContent: (content, options) => page.setContent(content, options),
      evaluate: (callback: () => Promise<void>) => page.evaluate(callback),
      screenshot: async options => {
        // Assert against the actual browser DOM at the capture boundary, not a mocked image state.
        const hero = page.locator('[data-zone="hero"]');
        expect(await hero.locator("img").count()).toBe(outcome === "valid" ? 1 : 0);
        expect(await hero.locator('[data-role="hero-fallback"]').count()).toBe(outcome === "valid" ? 0 : 1);
        const contentBox = await hero.locator(outcome === "valid" ? "img" : "svg").boundingBox();
        expect(contentBox!.width).toBeGreaterThan(500); expect(contentBox!.height).toBeGreaterThan(500);
        expect(await page.locator("main").getAttribute("data-fingerprint")).toBe(fingerprint);
        expect(await hero.boundingBox()).toEqual({ x: 304, y: 688, width: 712, height: 660 });
        return page.screenshot(options);
      },
    }),
    close: () => browser.close(),
  }) });
  const metadata = await sharp(png).metadata();
  expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 1080, height: 1920 });
  expect(browser.isConnected()).toBe(false);
}, 20_000);
