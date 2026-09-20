import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig(base, {
  testDir: "./tests/e2e",
  workers: 1,
  retries: 0,
  testIgnore: [/v3-matchday\.spec\.ts$/, /public-visual-v2\.smoke\.spec\.ts$/],
});
