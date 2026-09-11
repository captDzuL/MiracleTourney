import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadE2eEnvironment } from "../scripts/e2e-env.mjs";

const temporaryDirectories: string[] = [];

async function writeTestEnvironment(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "miracle-e2e-env-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, ".env.test"), contents, "utf8");
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await (await import("node:fs/promises")).rm(directory, { recursive: true, force: true });
  }));
});

describe("E2E environment loader", () => {
  it("uses .env.test to override inherited database settings", async () => {
    const directory = await writeTestEnvironment([
      "DATABASE_URL=postgresql://test-user:test-password@ep-test.example.test/testdb",
      "DIRECT_URL=postgresql://test-user:test-password@ep-test-direct.example.test/testdb",
      "E2E_DATABASE_RESET_ALLOWED=true",
    ].join("\n"));

    const environment = loadE2eEnvironment({
      cwd: directory,
      env: {
        DATABASE_URL: "postgresql://inherited-user:inherited-password@ep-sparkling-night-azr6wxwd.example.test/proddb",
        DIRECT_URL: "postgresql://inherited-user:inherited-password@inherited.example.test/proddb",
        E2E_DATABASE_RESET_ALLOWED: "false",
      },
    });

    expect(environment.DATABASE_URL).toContain("ep-test.example.test");
    expect(environment.DIRECT_URL).toContain("ep-test-direct.example.test");
    expect(environment.E2E_DATABASE_RESET_ALLOWED).toBe("true");
  });

  it("pins omitted E2E keys so Next cannot restore inherited database settings", async () => {
    const directory = await writeTestEnvironment(
      "DATABASE_URL=postgresql://test-user:test-password@ep-test.example.test/testdb",
    );

    const environment = loadE2eEnvironment({
      cwd: directory,
      env: {
        DIRECT_URL: "postgresql://prod-user:prod-password@ep-sparkling-night-azr6wxwd.example.test/proddb",
        E2E_DATABASE_RESET_ALLOWED: "true",
      },
    });

    expect(environment.DIRECT_URL).toBe("");
    expect(environment.NEON_PROD_HOST).toBe("");
    expect(environment.E2E_DATABASE_RESET_ALLOWED).toBe("");
  });

  it("fails clearly when .env.test is missing instead of retaining inherited settings", () => {
    const missingDirectory = join(tmpdir(), `miracle-e2e-env-missing-${Date.now()}`);
    const environment = {
      DATABASE_URL: "postgresql://inherited-user:inherited-password@ep-sparkling-night-azr6wxwd.example.test/proddb",
    };

    expect(() => loadE2eEnvironment({ cwd: missingDirectory, env: environment }))
      .toThrow(/\.env\.test.*not found/i);
    expect(environment.DATABASE_URL).toBeUndefined();
  });
});