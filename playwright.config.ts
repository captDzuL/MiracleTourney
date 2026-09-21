import { defineConfig } from "@playwright/test";
import { loadE2eEnvironment } from "./scripts/e2e-env.mjs";

loadE2eEnvironment();

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
// Optional escape hatch: reuse a locally installed browser (e.g. "msedge", "chrome")
// when the bundled Chromium download is unavailable. Unset = bundled Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const releaseOnPort = process.env.PLAYWRIGHT_RELEASE_ON_PORT ?? "3101";
const releaseOffPort = process.env.PLAYWRIGHT_RELEASE_OFF_PORT ?? "3102";
const releaseOnBaseURL = `http://127.0.0.1:${releaseOnPort}`;
const releaseOffBaseURL = `http://127.0.0.1:${releaseOffPort}`;
const releaseTestMatch = /v3-organizer-lifecycle\.spec\.ts/;
const releaseMatrixGrep = /@task11-release-matrix/;
const releaseClock = "2026-09-21T00:00:00.000Z";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1, // serial execution to avoid shared-DB conflicts between test files
  retries: process.env.CI ? 2 : 0, // E2E login helpers use distinct test clients, so local failures stay visible
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  webServer: [
    {
      command: `node scripts/e2e-dev.mjs --hostname 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      name: "default",
    },
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
      name: "chromium",
      grepInvert: releaseMatrixGrep,
      use: {
        baseURL,
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        ...(channel ? { channel } : {}),
      },
    },
    {
      name: "organizer-release-on",
      testMatch: releaseTestMatch,
      grep: releaseMatrixGrep,
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
