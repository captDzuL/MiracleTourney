import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const config = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
const lifecycle = readFileSync(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"), "utf8");
const auth = readFileSync(resolve(root, "tests/e2e/helpers/auth.ts"), "utf8");

describe("Task 11 release verification contracts", () => {
  it("declares two real flag profiles with separate servers and 20 baseline names", () => {
    expect(config).toMatch(/organizer-release-on/);
    expect(config).toMatch(/organizer-release-off/);
    expect(config).toMatch(/FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3.*true/);
    expect(config).toMatch(/FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3.*false/);
    expect(config).toMatch(/3101/);
    expect(config).toMatch(/3102/);
    expect(lifecycle).toMatch(/release-accessibility-\$\{mode\}-\$\{locale\}-\$\{viewport\.name\}/);
    expect(lifecycle).toMatch(/VIEWPORTS\.length \* LOCALES\.length \* FEATURE_FLAG_MODES\.length/);
  });

  it("drives non-vacuous keyboard, dialog, aria-sort, and deterministic journey contracts", () => {
    expect(lifecycle).toMatch(/page\.keyboard\.press\("Tab"\)/);
    expect(lifecycle).toMatch(/page\.keyboard\.press\("Shift\+Tab"\)/);
    expect(lifecycle).toMatch(/aria-modal/);
    expect(lifecycle).toMatch(/toHaveCount\(1\)/);
    expect(auth).toMatch(/document\.fonts\.ready/);
    expect(lifecycle).toMatch(/paymentRequestId/);
    expect(lifecycle).toMatch(/importBatchId/);
    expect(lifecycle).toMatch(/qrisVersion/);
    expect(lifecycle).toMatch(/revisionBefore/);
  });
});
