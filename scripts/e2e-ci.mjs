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
    if (runtime.platform === "win32" && command === "pnpm" && !runtime.npmExecPath) {
      reject(new Error("Windows E2E CI runner must be launched through a pnpm package script."));
      return;
    }
    const executable = runtime.platform === "win32" && command === "pnpm" ? runtime.nodePath : command;
    const executableArgs = runtime.platform === "win32" && command === "pnpm"
      ? [runtime.npmExecPath, ...args]
      : args;
    const child = spawnImpl(executable, executableArgs, {
      shell: false,
      stdio: "inherit",
    });
    child.once("error", (error) => reject(error));
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${exitCode}.`));
    });
  });
}

const RELEASE_STEPS = [
  ["pnpm", ["test:e2e:preflight"]],
  ["pnpm", ["test:e2e:prepare"]],
  ["pnpm", ["exec", "playwright", "test", "tests/e2e/v3-matchday.spec.ts", "--fail-on-flaky-tests"]],
  ["pnpm", ["exec", "playwright", "test", "--fail-on-flaky-tests"]],
  ["pnpm", ["exec", "playwright", "test", "--config", "playwright.legacy.config.ts", "--fail-on-flaky-tests"]],
];

export async function runE2eCi({ runCommand: execute = runCommand } = {}) {
  for (const [command, args] of RELEASE_STEPS) {
    await execute(command, args);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runE2eCi();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CI E2E sequence failed.");
    process.exitCode = 1;
  }
}
