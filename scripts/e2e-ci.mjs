import { spawn as defaultSpawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function runCommand(
  command,
  args,
  spawnImpl = defaultSpawn,
  runtime = {
    platform: process.platform,
    npmExecPath: process.env.npm_execpath,
    nodePath: process.execPath,
  },
) {
  return new Promise((resolve, reject) => {
    if (
      runtime.platform === "win32" &&
      command === "pnpm" &&
      !runtime.npmExecPath
    ) {
      reject(
        new Error(
          "Windows E2E CI runner must be launched through a pnpm package script.",
        ),
      );
      return;
    }
    const executable =
      runtime.platform === "win32" && command === "pnpm"
        ? runtime.nodePath
        : command;
    const executableArgs =
      runtime.platform === "win32" && command === "pnpm"
        ? [runtime.npmExecPath, ...args]
        : args;
    const child = spawnImpl(executable, executableArgs, {
      shell: false,
      stdio: "inherit",
    });
    child.once("error", (error) => reject(error));
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with code ${exitCode}.`,
          ),
        );
    });
  });
}

const VISUAL_V3_ARGS = [
  "exec",
  "playwright",
  "test",
  "--config",
  "playwright.smoke.config.ts",
  "--fail-on-flaky-tests",
];
const VISUAL_V2_ARGS = [
  "exec",
  "playwright",
  "test",
  "--config",
  "playwright.visual-v2.config.ts",
  "--fail-on-flaky-tests",
];

/** @type {readonly [label: string, command: "pnpm", args: readonly string[]][]} */
export const VISUAL_PROFILE_STEPS = [
  ["Visual profile V3 foundation", "pnpm", VISUAL_V3_ARGS],
  ["Visual profile public V2", "pnpm", VISUAL_V2_ARGS],
];

/** @type {readonly [label: string, command: "pnpm", args: readonly string[]][]} */
export const RELEASE_STEPS = [
  ["Database preflight", "pnpm", ["test:e2e:preflight"]],
  ["Database reset and seed", "pnpm", ["test:e2e:prepare"]],
  [
    "Match Day profile",
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/v3-matchday.spec.ts",
      "--fail-on-flaky-tests",
    ],
  ],
  [
    "Default profile shard 1/2",
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.ci-default.config.ts",
      "--shard=1/2",
      "--fail-on-flaky-tests",
    ],
  ],
  [
    "Default profile shard 2/2",
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.ci-default.config.ts",
      "--shard=2/2",
      "--fail-on-flaky-tests",
    ],
  ],
  [
    "Visual profile",
    "pnpm",
    VISUAL_V3_ARGS,
  ],
  [
    "Legacy flags-off profile",
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.legacy.config.ts",
      "--fail-on-flaky-tests",
    ],
  ],
];

export async function runE2eCi({
  runCommand: execute = runCommand,
  now = Date.now,
  logger = console,
} = {}) {
  const sequenceStartedAt = now();
  try {
    for (const [label, command, args] of RELEASE_STEPS) {
      logger.log(`[e2e-ci] START ${label}`);
      const phaseStartedAt = now();
      try {
        // The two visual profiles share .next and therefore must remain serial within one phase.
        const commands =
          label === "Visual profile"
            ? VISUAL_PROFILE_STEPS.map(([, profileCommand, profileArgs]) => [
                profileCommand,
                profileArgs,
              ])
            : [[command, args]];
        for (const [phaseCommand, phaseArgs] of commands) {
          await execute(phaseCommand, phaseArgs);
        }
      } catch (error) {
        logger.error(`[e2e-ci] FAIL ${label} (${now() - phaseStartedAt}ms)`);
        throw error;
      }
      logger.log(`[e2e-ci] PASS ${label} (${now() - phaseStartedAt}ms)`);
    }
  } catch (error) {
    logger.error(`[e2e-ci] FAIL All profiles (${now() - sequenceStartedAt}ms)`);
    throw error;
  }
  logger.log(`[e2e-ci] PASS All profiles (${now() - sequenceStartedAt}ms)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runE2eCi();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "CI E2E sequence failed.",
    );
    process.exitCode = 1;
  }
}
