import { defineConfig } from "@playwright/test";

process.env.FEATURE_FLAG_UI_V3_FOUNDATION = "true";
process.env.FEATURE_FLAG_PUBLIC_VISUAL_V2 = "true";

const port = process.env.PLAYWRIGHT_VISUAL_V2_PORT ?? "3102";
const baseURL = `http://127.0.0.1:${port}`;
// Optional escape hatch: reuse a locally installed browser (e.g. "msedge", "chrome")
// when the bundled Chromium download is unavailable. Unset = bundled Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const webServer =
  process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
    ? undefined
    : {
        command: `node .\\node_modules\\next\\dist\\bin\\next dev --hostname 127.0.0.1 --port ${port}`,
        env: {
          ...process.env,
          FEATURE_FLAG_UI_V3_FOUNDATION: "true",
          FEATURE_FLAG_PUBLIC_VISUAL_V2: "true",
        },
        url: `${baseURL}/id/login`,
        reuseExistingServer: !process.env.CI,
      };

export default defineConfig({
  testDir: "./tests/e2e-smoke",
  testMatch: /public-visual-v2\.smoke\.spec\.ts$/,
  workers: 1,
  retries: 0,
  outputDir: "test-results/visual-v2",
  webServer,
  use: {
    baseURL,
    headless: true,
    ...(channel ? { channel } : {}),
  },
});
