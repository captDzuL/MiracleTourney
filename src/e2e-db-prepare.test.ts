import { describe, expect, it, vi } from "vitest";

type PreflightResult = {
  ok: boolean;
  host: string;
  message: string;
};

type PrepareModule = {
  runCommand(
    command: string,
    args: string[],
    spawnImpl: (command: string, args: string[], options: Record<string, unknown>) => {
      once(event: string, handler: (value?: unknown) => void): void;
    },
    runtime?: { platform: string; npmExecPath?: string; nodePath: string },
  ): Promise<void>;
  prepareE2eDatabase(options: {
    env: Record<string, string | undefined>;
    checkConnection?: (options: { env: Record<string, string | undefined> }) => Promise<PreflightResult>;
    runCommand: (command: string, args: string[]) => Promise<void>;
    log?: (message: string) => void;
  }): Promise<void>;
};

const prepareModulePath = "../scripts/e2e-db-prepare.mjs";
const { prepareE2eDatabase, runCommand: runPrepareCommand } = await import(prepareModulePath) as PrepareModule;

const validEnvironment = {
  DATABASE_URL: "postgresql://test-user:super-secret@example.test/testdb",
  E2E_DATABASE_RESET_ALLOWED: "true",
};

describe("E2E database preparation", () => {
  it("uses the platform pnpm shim without a shell", async () => {
    let invocation: { command: string; args: string[]; options: Record<string, unknown> } | undefined;
    const spawnImpl = vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
      invocation = { command, args, options };
      return {
        once(event: string, handler: (value?: unknown) => void) {
          if (event === "close") handler(0);
        },
      };
    });

    await runPrepareCommand("pnpm", ["db:seed"], spawnImpl, {
      platform: "win32",
      npmExecPath: "C:\\tools\\pnpm.mjs",
      nodePath: "C:\\tools\\node.exe",
    });

    expect(invocation).toEqual({
      command: "C:\\tools\\node.exe",
      args: ["C:\\tools\\pnpm.mjs", "db:seed"],
      options: { shell: false, stdio: "inherit" },
    });
  });

  it("runs the connectivity preflight before reset, then applies migrations and the normal seed", async () => {
    const events: string[] = [];
    const checkConnection = vi.fn(async () => {
      events.push("preflight");
      return { ok: true, host: "example.test", message: "reachable" };
    });
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      events.push([command, ...args].join(" "));
    });

    await prepareE2eDatabase({ env: validEnvironment, checkConnection, runCommand, log: vi.fn() });

    expect(events).toEqual([
      "preflight",
      "pnpm exec prisma migrate reset --force --skip-seed --skip-generate",
      "pnpm db:seed",
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
    );
    expect(runCommand).toHaveBeenNthCalledWith(2, "pnpm", ["db:seed"]);
  });

  it("does not start a child process when reset permission is missing", async () => {
    const runCommand = vi.fn();

    await expect(prepareE2eDatabase({
      env: { DATABASE_URL: validEnvironment.DATABASE_URL },
      checkConnection: vi.fn().mockResolvedValue({ ok: true, host: "example.test", message: "reachable" }),
      runCommand,
    })).rejects.toThrow(/E2E_DATABASE_RESET_ALLOWED=true/);

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not start a child process when preflight rejects a production database", async () => {
    const runCommand = vi.fn();

    await expect(prepareE2eDatabase({
      env: {
        DATABASE_URL: "postgresql://prod-user:super-secret@ep-sparkling-night-azr6wxwd.neon.tech/proddb",
        E2E_DATABASE_RESET_ALLOWED: "true",
      },
      runCommand,
    })).rejects.toThrow(/production Neon branch/);

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("never prints database credentials", async () => {
    const log = vi.fn();
    const runCommand = vi.fn().mockResolvedValue(undefined);

    await prepareE2eDatabase({
      env: validEnvironment,
      checkConnection: vi.fn().mockResolvedValue({ ok: true, host: "example.test", message: "reachable" }),
      runCommand,
      log,
    });

    expect(JSON.stringify(log.mock.calls)).not.toContain("super-secret");
    expect(JSON.stringify(runCommand.mock.calls)).not.toContain("super-secret");
  });
});
