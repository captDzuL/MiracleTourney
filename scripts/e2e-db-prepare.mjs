import { spawn as defaultSpawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  checkE2eDatabaseConnection,
  requireE2eDatabaseResetPermission,
} from "./e2e-db-preflight.mjs";
import { loadE2eEnvironment } from "./e2e-env.mjs";

function redactDatabaseUrls(value) {
  return value.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database URL]");
}

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
      reject(new Error("Windows E2E database preparation must be launched through a pnpm package script."));
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

    child.once("error", (error) => {
      reject(new Error(`Unable to start ${command} ${args.join(" ")}: ${error.message}`));
    });
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${exitCode}.`));
    });
  });
}

export async function prepareE2eDatabase({
  env = process.env,
  checkConnection = checkE2eDatabaseConnection,
  requireResetPermission = requireE2eDatabaseResetPermission,
  runCommand: execute = runCommand,
  log = console.log,
} = {}) {
  const preflight = await checkConnection({ env });
  if (!preflight.ok) {
    const safeMessage = redactDatabaseUrls(preflight.message);
    throw new Error(`[e2e-db-prepare] ${safeMessage} Host: ${preflight.host}`);
  }

  requireResetPermission(env);
  log(`[e2e-db-prepare] Preflight passed for isolated test host ${preflight.host}.`);

  await execute("pnpm", ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"]);
  await execute("pnpm", ["db:seed"]);

  log("[e2e-db-prepare] Test database reset and seeded.");
}

async function main() {
  const env = loadE2eEnvironment();
  await prepareE2eDatabase({ env });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "E2E database preparation failed.";
    console.error(redactDatabaseUrls(message));
    process.exitCode = 1;
  }
}
