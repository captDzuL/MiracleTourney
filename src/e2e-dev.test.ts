import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startE2eDevServer } from "../scripts/e2e-dev.mjs";

const MIB = 1_048_576;
const SYSTEM_MEMORY_BYTES = 8 * 1024 * MIB;

const temporaryDirectories: string[] = [];

async function createEnvironment(contents: string) {
  const cwd = await mkdtemp(join(tmpdir(), "miracle-e2e-dev-"));
  temporaryDirectories.push(cwd);
  await writeFile(join(cwd, ".env.test"), contents, "utf8");
  return cwd;
}

function spawnMock() {
  return vi.fn((_command: string, _args: string[], _options: SpawnOptions) =>
    ({ on: vi.fn() }) as unknown as ChildProcess);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("E2E development server", () => {
  it("can verify competition flags-off without disabling the organizer shell", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    startE2eDevServer({
      cwd,
      env: { E2E_COMPETITION_FLAGS_OFF: "true" },
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: undefined,
      logger: () => undefined,
    });
    expect(spawnImpl.mock.calls[0][2].env).toMatchObject({
      FEATURE_FLAG_COMPETITION_OPERATIONS_V3: "false",
      FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3: "false",
      FEATURE_FLAG_COMPLETION_WORKSPACE_V3: "false",
      FEATURE_FLAG_PUBLIC_DISCOVERY_V3: "false",
      FEATURE_FLAG_ORGANIZER_WORKSPACE_V3: "true",
    });
  });
  it("starts Next locally with .env.test database settings and all V3 flags", async () => {
    const cwd = await createEnvironment([
      "DATABASE_URL=postgresql://test-user:test-password@test.example.test/testdb",
      "DIRECT_URL=postgresql://test-user:test-password@test-direct.example.test/testdb",
    ].join("\n"));
    const spawnImpl = spawnMock();

    startE2eDevServer({
      cwd,
      env: { DATABASE_URL: "postgresql://prod-user:prod-password@ep-sparkling-night-azr6wxwd.example.test/proddb" },
      args: ["--hostname", "127.0.0.1", "--port", "3100"],
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: undefined,
      logger: () => undefined,
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
        FEATURE_FLAG_COMPLETION_WORKSPACE_V3: "true",
        FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3: "true",
        FEATURE_FLAG_PUBLIC_DISCOVERY_V3: "true",
        NODE_OPTIONS: "--max-old-space-size=5120",
      },
    });
  });

  it("blocks a production database before spawning Next", async () => {
    const cwd = await createEnvironment([
      "DATABASE_URL=postgresql://prod-user:prod-password@ep-sparkling-night-azr6wxwd.example.test/proddb",
      "DIRECT_URL=postgresql://test-user:test-password@test-direct.example.test/testdb",
    ].join("\n"));
    const spawnImpl = spawnMock();

    expect(() => startE2eDevServer({ cwd, env: {}, spawnImpl }))
      .toThrow(/production Neon branch/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("derives the system-only default with the exact 62.5% calculation", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();

    startE2eDevServer({
      cwd,
      env: {},
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: undefined,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS).toBe("--max-old-space-size=5120");
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=5120 source=system");
  });

  it("prefers a smaller valid constrained memory limit", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();

    startE2eDevServer({
      cwd,
      env: {},
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: 4 * 1024 * MIB,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS).toBe("--max-old-space-size=2560");
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=2560 source=constrained");
  });

  it.each([
    ["absent", undefined],
    ["zero", 0],
    ["negative", -1],
    ["non-finite", Number.NaN],
    ["larger than system", SYSTEM_MEMORY_BYTES + 1],
  ])("uses system memory when the constrained value is %s", async (_label, constrainedMemoryBytes) => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();

    startE2eDevServer({
      cwd,
      env: {},
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS).toBe("--max-old-space-size=5120");
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=5120 source=system");
  });

  it("caps the derived heap at 10,240 MiB while retaining more than the requested headroom", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();

    startE2eDevServer({
      cwd,
      env: {},
      spawnImpl,
      systemMemoryBytes: 32 * 1024 * MIB,
      constrainedMemoryBytes: undefined,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS).toBe("--max-old-space-size=10240");
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=10240 source=system");
  });

  it.each([
    "--max-old-space-size=2048",
    "--max-old-space-size 2048",
    "--max_old_space_size=2048",
    "--max_old_space_size 2048",
  ])("preserves a valid caller heap option byte-for-byte (%s)", async (callerNodeOptions) => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();
    const completeNodeOptions = `--trace-warnings ${callerNodeOptions} --unhandled-rejections=strict`;

    startE2eDevServer({
      cwd,
      env: { NODE_OPTIONS: completeNodeOptions },
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: 2 * 1024 * MIB,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS).toBe(completeNodeOptions);
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=2048 source=caller");
  });

  it("appends the canonical heap option without changing unrelated caller options", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();
    const callerNodeOptions = "--trace-warnings --unhandled-rejections=strict";

    startE2eDevServer({
      cwd,
      env: { NODE_OPTIONS: callerNodeOptions },
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: undefined,
      logger,
    });

    expect(spawnImpl.mock.calls[0][2].env?.NODE_OPTIONS)
      .toBe(`${callerNodeOptions} --max-old-space-size=5120`);
    expect(logger).toHaveBeenCalledWith("[e2e-dev] memory-headroom selectedMiB=5120 source=system");
  });

  it("does not leak environment secrets through safe telemetry", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();
    const secret = "sentinel-secret-that-must-not-be-logged";

    startE2eDevServer({
      cwd,
      env: { NODE_OPTIONS: `--trace-warnings --secret=${secret}` },
      spawnImpl,
      systemMemoryBytes: SYSTEM_MEMORY_BYTES,
      constrainedMemoryBytes: 4 * 1024 * MIB,
      logger,
    });

    expect(logger).toHaveBeenCalledOnce();
    expect(logger.mock.calls[0][0]).toBe("[e2e-dev] memory-headroom selectedMiB=2560 source=constrained");
    expect(logger.mock.calls[0][0]).not.toContain(secret);
  });

  it("fails closed before spawning when system memory is invalid", async () => {
    const cwd = await createEnvironment("DATABASE_URL=postgresql://test:test@isolated.example.test/testdb");
    const spawnImpl = spawnMock();
    const logger = vi.fn();
    const secret = "invalid-memory-secret";

    expect(() => startE2eDevServer({
      cwd,
      env: { NODE_OPTIONS: `--secret=${secret}` },
      spawnImpl,
      systemMemoryBytes: Number.NaN,
      constrainedMemoryBytes: 2 * 1024 * MIB,
      logger,
    })).toThrow("Unable to determine a valid system memory limit for the E2E development server.");
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });
});
