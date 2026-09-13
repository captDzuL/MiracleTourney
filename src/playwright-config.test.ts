import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
