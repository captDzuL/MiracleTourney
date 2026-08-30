import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_SMOKE_PORT ?? "3101";
const baseURL = `http://127.0.0.1:${port}`;
// Optional escape hatch: reuse a locally installed browser (e.g. "msedge", "chrome")
// when the bundled Chromium download is unavailable. Unset = bundled Chromium.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const webServer =
  process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
    ? undefined
    : {
        command: `node .\\node_modules\\next\\dist\\bin\\next dev --hostname 127.0.0.1 --port ${port}`,
        url: `${baseURL}/id/login`,
        reuseExistingServer: !process.env.CI,
      };

export default defineConfig({
  testDir: "./tests/e2e-smoke",
  workers: 1,
  webServer,
  use: {
    baseURL,
    headless: true,
    ...(channel ? { channel } : {}),
  },
});
