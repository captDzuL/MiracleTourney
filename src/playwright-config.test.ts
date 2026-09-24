import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("Playwright CI configuration", () => {
  it("serializes the default profile while excluding Match Day and visual specs", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "miracle-playwright-ci-default-"));
    const environmentPath = join(temporaryDirectory, ".env.test");
    await writeFile(environmentPath, [
      "DATABASE_URL=postgresql://test:test@isolated.example.test/testdb",
      "E2E_DATABASE_RESET_ALLOWED=true",
    ].join("\n"), "utf8");
    vi.stubEnv("E2E_ENV_FILE", environmentPath);
    vi.stubEnv("CI", "true");

    const { default: config } = await import("../playwright.ci-default.config");

    expect(config.workers).toBe(1);
    expect(config.testDir).toBe("./tests/e2e");
    expect(config.testIgnore).toEqual([
      /v3-matchday\.spec\.ts$/,
      /public-visual-v2\.smoke\.spec\.ts$/,
    ]);
  });

  it("keeps the shared database serial and retains browser evidence on failure", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "miracle-playwright-config-"));
    const environmentPath = join(temporaryDirectory, ".env.test");
    await writeFile(environmentPath, [
      "DATABASE_URL=postgresql://test:test@isolated.example.test/testdb",
      "E2E_DATABASE_RESET_ALLOWED=true",
    ].join("\n"), "utf8");
    vi.stubEnv("E2E_ENV_FILE", environmentPath);
    vi.stubEnv("CI", "true");

    const { default: config } = await import("../playwright.config");

    expect(config.workers).toBe(1);
    expect(config.use).toMatchObject({
      headless: true,
      screenshot: "only-on-failure",
      trace: "retain-on-failure",
    });
    expect(config.reporter).toEqual([
      ["line"],
      ["html", { open: "never", outputFolder: "playwright-report" }],
    ]);
  });

  it("forces public visual v2 for Playwright and the spawned smoke server", async () => {
    vi.stubEnv("FEATURE_FLAG_PUBLIC_VISUAL_V2", "false");

    const { default: config } = await import("../playwright.smoke.config");

    expect(process.env.FEATURE_FLAG_PUBLIC_VISUAL_V2).toBe("true");
    expect(config.webServer).toMatchObject({
      env: expect.objectContaining({ FEATURE_FLAG_PUBLIC_VISUAL_V2: "true" }),
    });
  });

  it("keeps the public visual v2 gate fail-closed", async () => {
    const smokeSpec = await readFile(
      join(process.cwd(), "tests/e2e-smoke/public-visual-v2.smoke.spec.ts"),
      "utf8",
    );

    expect(smokeSpec).not.toMatch(/test\.skip/);
    expect(smokeSpec).toMatch(/page\.locator\(\s*["']\.public-visual-v2["']\s*\)/);
  });
});
