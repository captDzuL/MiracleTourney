import { describe, expect, it, vi } from "vitest";

import { assertVercelBuildDatabaseSafety, runVercelBuild } from "../scripts/vercel-build.mjs";

const testDatabaseUrl = "postgresql://user:pass@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const productionDatabaseUrl = "postgresql://user:pass@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const productionHost = "ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech";

describe("Vercel database safety", () => {
  it("rejects Preview when either configured URL targets production", () => {
    expect(() => assertVercelBuildDatabaseSafety({
      VERCEL_ENV: "preview", DATABASE_URL: testDatabaseUrl, DIRECT_URL: productionDatabaseUrl, NEON_PROD_HOST: productionHost,
    })).toThrow(/production Neon branch/i);
  });

  it("rejects Preview when it cannot validate both database URLs", () => {
    expect(() => assertVercelBuildDatabaseSafety({
      VERCEL_ENV: "preview", DATABASE_URL: testDatabaseUrl, DIRECT_URL: "", NEON_PROD_HOST: productionHost,
    })).toThrow(/require DATABASE_URL, DIRECT_URL, and NEON_PROD_HOST/i);
  });

  it("builds Preview without migration when it uses the isolated test branch", () => {
    const runCommand = vi.fn(() => ({ status: 0 }));
    expect(runVercelBuild({
      VERCEL_ENV: "preview", DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl, NEON_PROD_HOST: productionHost,
    }, runCommand)).toBe(0);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith("pnpm", ["exec", "next", "build"]);
  });

  it("builds production without applying migrations", () => {
    const runCommand = vi.fn(() => ({ status: 0 }));
    expect(runVercelBuild({ VERCEL_ENV: "production" }, runCommand)).toBe(0);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("pnpm", ["exec", "next", "build"]);
  });

  it("builds trusted main branch candidates without applying migrations", () => {
    const runCommand = vi.fn(() => ({ status: 0 }));
    runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_REPO_ID: "1316699241",
    }, runCommand);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("pnpm", ["exec", "next", "build"]);
  });

  it("does not migrate pull requests whose source branch is named main", () => {
    const runCommand = vi.fn(() => ({ status: 0 }));
    runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_PULL_REQUEST_ID: "42",
      VERCEL_GIT_REPO_ID: "1316699241",
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      NEON_PROD_HOST: productionHost,
    }, runCommand);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith("pnpm", ["exec", "next", "build"]);
  });

  it("builds explicit production targets without applying migrations", () => {
    const runCommand = vi.fn(() => ({ status: 0 }));
    runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "production",
    }, runCommand);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("pnpm", ["exec", "next", "build"]);
  });

  it("returns a failed build command status", () => {
    const runCommand = vi.fn(() => ({ status: 1 }));
    const exitCode = runVercelBuild({ VERCEL_ENV: "production" }, runCommand);
    expect(exitCode).toBe(1);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("pnpm", ["exec", "next", "build"]);
  });
});
