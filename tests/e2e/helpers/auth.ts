import { expect, type Page } from "@playwright/test";

let loginClientSequence = 0;
const initializedPages = new WeakSet<Page>();
const clockInstalledPages = new WeakSet<Page>();
export const RELEASE_CLOCK = new Date("2026-09-21T00:00:00.000Z");

/**
 * Make release screenshots and keyboard checks reproducible without changing
 * application data. This is intentionally browser-local: the guarded E2E
 * database remains the only source of fixture state.
 */
export async function normalizeReleasePage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (initializedPages.has(page)) return;
  await page.addInitScript(() => {
    document.documentElement.dataset.e2eReducedMotion = "true";
  });
  initializedPages.add(page);
}

export async function probeReleaseReducedMotion(page: Page) {
  const state = await page.evaluate(() => ({
    matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
  }));
  expect(state.matches).toBe(true);
  expect(state.runningAnimations, "reduced-motion mode must not leave animations running").toBe(0);
}

export async function installReleaseClock(page: Page) {
  if (clockInstalledPages.has(page)) return;
  await page.clock.install({ time: RELEASE_CLOCK });
  clockInstalledPages.add(page);
}

export async function waitForReleaseFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

/** Apply visual-only suppression after the product reduced-motion contract has been checked. */
export async function suppressAnimationsForScreenshot(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0ms !important;
        animation-iteration-count: 1 !important;
        animation-play-state: paused !important;
        transition: none !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `,
  });
}

export async function loginWithCredentials(
  page: Page,
  {
    locale = "id",
    email,
    password,
    destination,
  }: {
    locale?: "id" | "en";
    email: string;
    password: string;
    destination: RegExp;
  },
) {
  // Each browser login represents a separate client. A unique RFC 2544 test-net
  // address keeps this suite from intentionally triggering the production per-IP
  // brute-force limit while preserving that middleware protection in every environment.
  loginClientSequence += 1;
  await normalizeReleasePage(page);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.18.0.${(loginClientSequence % 250) + 1}`,
    "x-e2e-clock": "2026-09-21T00:00:00.000Z",
  });
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await probeReleaseReducedMotion(page);
  await installReleaseClock(page);
  const emailField = page.getByLabel(/email/i);
  const passwordField = page.getByLabel(/password/i);
  const submit = page.getByRole("button", { name: /masuk|sign in/i });
  await expect(emailField).toBeVisible({ timeout: 20_000 });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await emailField.fill(email);
  await passwordField.fill(password);
  await submit.click({ timeout: 20_000 });
  await page.waitForURL(destination, { timeout: 60_000 });
}

export async function loginAsAdmin(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "admin@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/admin/,
  });
}

export async function loginAsCaptain(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "captain@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/captain/,
  });
}

export async function loginAsOrganizer(page: Page, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, {
    locale,
    email: "organizer-a@miraclefc.gg",
    password: "Miracle2026!",
    destination: /\/(id|en)\/organizer/,
  });
}
