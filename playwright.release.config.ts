import { defineConfig } from "@playwright/test";
import { loadE2eEnvironment } from "./scripts/e2e-env.mjs";

loadE2eEnvironment();

const releaseOnPort = process.env.PLAYWRIGHT_RELEASE_ON_PORT ?? "3101";
const releaseOffPort = process.env.PLAYWRIGHT_RELEASE_OFF_PORT ?? "3102";
const releaseOnBaseURL = `http://127.0.0.1:${releaseOnPort}`;
const releaseOffBaseURL = `http://127.0.0.1:${releaseOffPort}`;
const releaseTestMatch = /v3-organizer-lifecycle\.spec\.ts/;
const releaseMatrixGrep = /@task11-release-matrix/;
const releaseJourneyGrep = /@task11-release-journey/;
const releaseClock = "2026-09-21T00:00:00.000Z";
const channel = process.env.PLAYWRIGHT_CHANNEL;

const shared = {
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  retries: process.env.CI ? 2 : 0,
};

export default defineConfig({
  ...shared,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-release-report" }]]
    : "list",
  webServer: [
    {
      command: `node scripts/e2e-dev.mjs --hostname 127.0.0.1 --port ${releaseOnPort}`,
      url: releaseOnBaseURL,
      reuseExistingServer: false,
      name: "organizer-release-on",
      env: { FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3: "true", PLAYWRIGHT_PORT: releaseOnPort },
    },
    {
      command: `node scripts/e2e-dev.mjs --hostname 127.0.0.1 --port ${releaseOffPort}`,
      url: releaseOffBaseURL,
      reuseExistingServer: false,
      name: "organizer-release-off",
      env: { FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3: "false", PLAYWRIGHT_PORT: releaseOffPort },
    },
  ],
  projects: [
    {
      name: "organizer-release-on",
      testMatch: releaseTestMatch,
      grep: new RegExp(`${releaseMatrixGrep.source}|${releaseJourneyGrep.source}`),
      timeout: 120_000,
      metadata: { releaseFlagMode: "on", deterministicClock: releaseClock, requiredViewports: [360, 390, 768, 1024, 1440] },
      use: {
        baseURL: releaseOnBaseURL,
        headless: true,
        locale: "en-US",
        timezoneId: "Asia/Jakarta",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        ...(channel ? { channel } : {}),
      },
    },
    {
      name: "organizer-release-off",
      testMatch: releaseTestMatch,
      grep: releaseMatrixGrep,
      timeout: 120_000,
      metadata: { releaseFlagMode: "off", deterministicClock: releaseClock, requiredViewports: [360, 390, 768, 1024, 1440] },
      use: {
        baseURL: releaseOffBaseURL,
        headless: true,
        locale: "en-US",
        timezoneId: "Asia/Jakarta",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        ...(channel ? { channel } : {}),
      },
    },
  ],
});
