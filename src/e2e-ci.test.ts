import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

type CiModule = {
  runCommand(
    command: string,
    args: string[],
    spawnImpl: (command: string, args: string[], options: Record<string, unknown>) => {
      once(event: string, handler: (value?: unknown) => void): void;
    },
    runtime?: { platform: string; npmExecPath?: string; nodePath: string },
  ): Promise<void>;
  runE2eCi(options: {
    runCommand: (command: string, args: string[]) => Promise<void>;
  }): Promise<void>;
};

const ciModulePath = "../scripts/e2e-ci.mjs";

describe("CI E2E release sequence", () => {
  it("runs a real fail-closed ESLint gate on the pinned CI runtime", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain("version: 10");
    expect(workflow).toContain("run: pnpm exec eslint . --quiet");
    expect(workflow).not.toMatch(/eslint[^\n]*\|\|\s*true/i);
  });
  it("guards the shared database, then runs Match Day, two fresh-server shards, and flags-off profiles serially", async () => {
    const { runE2eCi } = await import(ciModulePath) as CiModule;
    const calls: string[] = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, ...args].join(" "));
    });

    await runE2eCi({ runCommand });

    expect(calls).toEqual([
      "pnpm test:e2e:preflight",
      "pnpm test:e2e:prepare",
      "pnpm exec playwright test tests/e2e/v3-matchday.spec.ts --fail-on-flaky-tests",
      "pnpm exec playwright test --shard=1/2 --fail-on-flaky-tests",
      "pnpm exec playwright test --shard=2/2 --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.legacy.config.ts --fail-on-flaky-tests",
    ]);
  });

  it("stops before later profiles when a guarded step fails", async () => {
    const { runE2eCi } = await import(ciModulePath) as CiModule;
    const calls: string[] = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      const call = [command, ...args].join(" ");
      calls.push(call);
      if (call === "pnpm test:e2e:prepare") throw new Error("reset blocked");
    });

    await expect(runE2eCi({ runCommand })).rejects.toThrow("reset blocked");
    expect(calls).toEqual([
      "pnpm test:e2e:preflight",
      "pnpm test:e2e:prepare",
    ]);
  });

  it("uses the platform command shim without a shell", async () => {
    const { runCommand } = await import(ciModulePath) as CiModule;
    let invocation: { command: string; args: string[]; options: Record<string, unknown> } | undefined;
    const spawnImpl = vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
      invocation = { command, args, options };
      return {
        once(event: string, handler: (value?: unknown) => void) {
          if (event === "close") handler(0);
        },
      };
    });

    await runCommand("pnpm", ["test:e2e:preflight"], spawnImpl, {
      platform: "win32",
      npmExecPath: "C:\\tools\\pnpm.mjs",
      nodePath: "C:\\tools\\node.exe",
    });

    expect(invocation).toEqual({
      command: "C:\\tools\\node.exe",
      args: ["C:\\tools\\pnpm.mjs", "test:e2e:preflight"],
      options: { shell: false, stdio: "inherit" },
    });
  });
});
