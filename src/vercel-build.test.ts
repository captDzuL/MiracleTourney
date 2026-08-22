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

  it("does not migrate the database for preview builds", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 0 }));

    const exitCode = runVercelBuild({ VERCEL_ENV: "preview" }, runCommand);

    expect(exitCode).toBe(0);
    expect(runCommand.mock.calls).toEqual([
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });

  it("stops the deployment when the migration fails", () => {
    const runCommand = vi.fn<() => CommandResult>(() => ({ status: 1 }));

    const exitCode = runVercelBuild({ VERCEL_ENV: "production" }, runCommand);

    expect(exitCode).toBe(1);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});
