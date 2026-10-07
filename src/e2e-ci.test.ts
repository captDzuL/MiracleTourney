import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

type CiModule = {
  RELEASE_STEPS: readonly [label: string, command: "pnpm", args: readonly string[]][];
  VISUAL_PROFILE_STEPS: readonly [label: string, command: "pnpm", args: readonly string[]][];
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
    now?: () => number;
    logger?: { log(message: string): void; error(message: string): void };
  }): Promise<void>;
};

const ciModulePath = "../scripts/e2e-ci.mjs";
const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);

const readWorkflow = () => readFile(workflowPath, "utf8");

const extractJob = (workflow: string, jobId: string) =>
  workflow.match(new RegExp(`  ${jobId}:\\r?\\n([\\s\\S]*?)(?=\\r?\\n  [a-z][\\w-]*:|$)`))?.[0] ?? "";

describe("CI E2E release sequence", () => {
  it("runs a real fail-closed ESLint gate on the pinned CI runtime", async () => {
    const workflow = await readWorkflow();
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain("version: 10");
    expect(workflow).toContain("run: pnpm exec eslint . --quiet");
    expect(workflow).not.toMatch(/eslint[^\n]*\|\|\s*true/i);
  });

  it("keeps lint and unit jobs unconditional", async () => {
    const workflow = await readWorkflow();

    for (const jobId of ["lint-and-typecheck", "unit-tests"]) {
      const job = extractJob(workflow, jobId);
      expect(job).not.toMatch(/^    if:/m);
      expect(job).not.toContain("github.event_name");
    }
  });

  it("runs only lint and unit jobs and never touches a shared database", async () => {
    const workflow = await readWorkflow();
    const jobsSection = workflow.slice(workflow.search(/^jobs:\r?$/m));
    const jobIds = [...jobsSection.matchAll(/^  ([a-z][\w-]*):\r?$/gm)].map((match) => match[1]);

    // E2E is run on demand with the repository scripts; CI must not reset or seed a shared database.
    expect(jobIds).toEqual(["lint-and-typecheck", "unit-tests"]);
    expect(workflow).not.toMatch(/NEON_|DATABASE_URL|DIRECT_URL|E2E_DATABASE_RESET_ALLOWED|test:e2e|playwright/i);
  });

  it("records elapsed time for every release phase and the total sequence", async () => {
    const { runE2eCi } = await import(ciModulePath) as CiModule;
    const timestamps = [0, 100, 350, 400, 900, 950, 1_550, 1_600, 2_300, 2_350, 3_150, 3_200, 4_000, 4_100, 4_200, 4_300];
    const logger = { log: vi.fn(), error: vi.fn() };

    await runE2eCi({
      runCommand: vi.fn(async () => undefined),
      now: () => timestamps.shift()!,
      logger,
    });

    expect(logger.log.mock.calls.map(([message]) => message)).toEqual([
      "[e2e-ci] START Database preflight",
      "[e2e-ci] PASS Database preflight (250ms)",
      "[e2e-ci] START Database reset and seed",
      "[e2e-ci] PASS Database reset and seed (500ms)",
      "[e2e-ci] START Match Day profile",
      "[e2e-ci] PASS Match Day profile (600ms)",
      "[e2e-ci] START Default profile shard 1/2",
      "[e2e-ci] PASS Default profile shard 1/2 (700ms)",
      "[e2e-ci] START Default profile shard 2/2",
      "[e2e-ci] PASS Default profile shard 2/2 (800ms)",
      "[e2e-ci] START Visual profile",
      "[e2e-ci] PASS Visual profile (800ms)",
      "[e2e-ci] START Legacy flags-off profile",
      "[e2e-ci] PASS Legacy flags-off profile (100ms)",
      "[e2e-ci] PASS All profiles (4300ms)",
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });
  it("guards the shared database, then runs Match Day, two fresh-server shards, and flags-off profiles serially", async () => {
    const { RELEASE_STEPS, VISUAL_PROFILE_STEPS, runE2eCi } = await import(ciModulePath) as CiModule;
    const calls: string[] = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, ...args].join(" "));
    });

    await runE2eCi({ runCommand });

    expect(calls).toEqual([
      "pnpm test:e2e:preflight",
      "pnpm test:e2e:prepare",
      "pnpm exec playwright test tests/e2e/v3-matchday.spec.ts --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.ci-default.config.ts --shard=1/2 --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.ci-default.config.ts --shard=2/2 --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.smoke.config.ts --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.visual-v2.config.ts --fail-on-flaky-tests",
      "pnpm exec playwright test --config playwright.legacy.config.ts --fail-on-flaky-tests",
    ]);
    expect(calls.filter((call) => call.includes("--config playwright.smoke.config.ts"))).toHaveLength(1);
    expect(calls.filter((call) => call.includes("--config playwright.visual-v2.config.ts"))).toHaveLength(1);
    expect(RELEASE_STEPS.map(([label]) => label)).toEqual([
      "Database preflight",
      "Database reset and seed",
      "Match Day profile",
      "Default profile shard 1/2",
      "Default profile shard 2/2",
      "Visual profile",
      "Legacy flags-off profile",
    ]);
    expect(VISUAL_PROFILE_STEPS).toEqual([
      [
        "Visual profile V3 foundation",
        "pnpm",
        ["exec", "playwright", "test", "--config", "playwright.smoke.config.ts", "--fail-on-flaky-tests"],
      ],
      [
        "Visual profile public V2",
        "pnpm",
        ["exec", "playwright", "test", "--config", "playwright.visual-v2.config.ts", "--fail-on-flaky-tests"],
      ],
    ]);
  });

  it("fails closed inside the visual phase before starting V2 when V3 fails", async () => {
    const { runE2eCi } = await import(ciModulePath) as CiModule;
    const calls: string[] = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      const call = [command, ...args].join(" ");
      calls.push(call);
      if (call === "pnpm exec playwright test --config playwright.smoke.config.ts --fail-on-flaky-tests") {
        throw new Error("V3 visual failed");
      }
    });

    await expect(runE2eCi({ runCommand })).rejects.toThrow("V3 visual failed");
    expect(calls.at(-1)).toBe(
      "pnpm exec playwright test --config playwright.smoke.config.ts --fail-on-flaky-tests",
    );
    expect(calls).not.toContain(
      "pnpm exec playwright test --config playwright.visual-v2.config.ts --fail-on-flaky-tests",
    );
  });

  it("stops before later profiles when a guarded step fails", async () => {
    const { runE2eCi } = await import(ciModulePath) as CiModule;
    const calls: string[] = [];
    const logger = { log: vi.fn(), error: vi.fn() };
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      const call = [command, ...args].join(" ");
      calls.push(call);
      if (call === "pnpm test:e2e:prepare") throw new Error("reset blocked");
    });

    const timestamps = [100, 200, 300, 500, 800, 800];
    await expect(runE2eCi({ runCommand, now: () => timestamps.shift()!, logger })).rejects.toThrow("reset blocked");
    expect(calls).toEqual([
      "pnpm test:e2e:preflight",
      "pnpm test:e2e:prepare",
    ]);
    expect(logger.error.mock.calls.map(([message]) => message)).toEqual([
      "[e2e-ci] FAIL Database reset and seed (300ms)",
      "[e2e-ci] FAIL All profiles (700ms)",
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
