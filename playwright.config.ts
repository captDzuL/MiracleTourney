import { defineConfig } from "@playwright/test";
import { loadE2eEnvironment } from "./scripts/e2e-env.mjs";

loadE2eEnvironment();

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
// Optional escape hatch: reuse a locally installed browser (e.g. "msedge", "chrome")
// when the bundled Chromium download is unavailable. Unset = bundled Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const releaseFlagMode = process.env.FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 === "true" ? "on" : "off";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1, // serial execution to avoid shared-DB conflicts between test files
  fullyParallel: false,
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0, // E2E login helpers use distinct test clients, so local failures stay visible
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  webServer: {
    command: `node scripts/e2e-dev.mjs --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Jakarta",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [{
    name: "chromium",
    metadata: {
      releaseFlagMode,
      deterministicClock: "2026-09-21T00:00:00.000Z",
      requiredViewports: [360, 390, 768, 1024, 1440],
    },
  }],
});
