import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startE2eDevServer } from "../scripts/e2e-dev.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("E2E development server", () => {
  it("starts Next locally with .env.test database settings and all V3 flags", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "miracle-e2e-dev-"));
    temporaryDirectories.push(cwd);
    await writeFile(join(cwd, ".env.test"), [
      "DATABASE_URL=postgresql://test-user:test-password@test.example.test/testdb",
      "DIRECT_URL=postgresql://test-user:test-password@test-direct.example.test/testdb",
    ].join("\n"), "utf8");
    const spawnImpl = vi.fn((_command: string, _args: string[], _options: SpawnOptions) =>
      ({ on: vi.fn() }) as unknown as ChildProcess);

    startE2eDevServer({
      cwd,
      env: { DATABASE_URL: "postgresql://prod-user:prod-password@ep-sparkling-night-azr6wxwd.example.test/proddb" },
      args: ["--hostname", "127.0.0.1", "--port", "3100"],
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledOnce();
    const [command, args, options] = spawnImpl.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      join(cwd, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ]);
    expect(options).toMatchObject({
      cwd,
      stdio: "inherit",
      env: {
        DATABASE_URL: expect.stringContaining("test.example.test"),
        DIRECT_URL: expect.stringContaining("test-direct.example.test"),
        FEATURE_FLAG_UI_V3_FOUNDATION: "true",
        FEATURE_FLAG_ORGANIZER_WORKSPACE_V3: "true",
        FEATURE_FLAG_REGISTRATION_WORKSPACE_V3: "true",
        FEATURE_FLAG_COMPETITION_OPERATIONS_V3: "true",
      },
    });
  });
});