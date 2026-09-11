import { defineConfig } from "@playwright/test";
import { loadE2eEnvironment } from "./scripts/e2e-env.mjs";

loadE2eEnvironment();

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
// Optional escape hatch: reuse a locally installed browser (e.g. "msedge", "chrome")
// when the bundled Chromium download is unavailable. Unset = bundled Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1, // serial execution to avoid shared-DB conflicts between test files
  retries: process.env.CI ? 2 : 0, // E2E login helpers use distinct test clients, so local failures stay visible
  webServer: {
    command: `node scripts/e2e-dev.mjs --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    headless: true,
    ...(channel ? { channel } : {}),
  },
});
