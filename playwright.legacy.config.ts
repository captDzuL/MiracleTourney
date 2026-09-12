import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
process.env.E2E_COMPETITION_FLAGS_OFF = "true";
export default defineConfig({ ...base, testDir: "./tests/e2e-legacy" });
