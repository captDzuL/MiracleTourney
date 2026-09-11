import { describe, expect, it, vi } from "vitest";

import { runVercelBuild } from "../scripts/vercel-build.mjs";

type CommandResult = {
  error?: Error;
  status: number | null;
};

describe("Vercel production build", () => {
  it("deploys pending Prisma migrations before building production", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

    const exitCode = runVercelBuild({ VERCEL_ENV: "production" }, runCommand);

    expect(exitCode).toBe(0);
    expect(runCommand.mock.calls).toEqual([
      ["pnpm", ["exec", "prisma", "migrate", "deploy"]],
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });

  it("migrates main branch candidates before they are promoted to production", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

    const exitCode = runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_REPO_ID: "1316699241",
    }, runCommand);

    expect(exitCode).toBe(0);
    expect(runCommand.mock.calls).toEqual([
      ["pnpm", ["exec", "prisma", "migrate", "deploy"]],
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });

  it("does not migrate pull requests whose source branch is named main", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

    const exitCode = runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_PULL_REQUEST_ID: "42",
      VERCEL_GIT_REPO_ID: "1316699241",
    }, runCommand);

    expect(exitCode).toBe(0);
    expect(runCommand.mock.calls).toEqual([
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });

  it("migrates deployments targeting the production environment", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

    const exitCode = runVercelBuild({
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "production",
    }, runCommand);

    expect(exitCode).toBe(0);
    expect(runCommand.mock.calls).toEqual([
      ["pnpm", ["exec", "prisma", "migrate", "deploy"]],
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });

  it.each(["preview", "development", undefined])(
    "does not migrate the database for non-production environment %s",
    (vercelEnvironment) => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

      const exitCode = runVercelBuild({ VERCEL_ENV: vercelEnvironment }, runCommand);

      expect(exitCode).toBe(0);
      expect(runCommand.mock.calls).toEqual([
        ["pnpm", ["exec", "next", "build"]],
      ]);
    },
  );

  it("stops the deployment when the migration fails", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 1 }));

    const exitCode = runVercelBuild({ VERCEL_ENV: "production" }, runCommand);

    expect(exitCode).toBe(1);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});
