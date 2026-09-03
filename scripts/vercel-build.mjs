import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function executeCommand(command, args) {
  return spawnSync(command, args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

export function runVercelBuild(env, runCommand = executeCommand) {
  const commands = [];

  if (env.VERCEL_ENV === "production") {
    commands.push(["pnpm", ["exec", "prisma", "migrate", "deploy"]]);
  }

  commands.push(["pnpm", ["exec", "next", "build"]]);

  for (const [command, args] of commands) {
    const result = runCommand(command, args);

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

const isEntryPoint = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
  process.exitCode = runVercelBuild(process.env);
}
