import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_NEON_PROD_HOST = "ep-sparkling-night-azr6wxwd";

function databaseHost(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && url.hostname ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function assertVercelBuildDatabaseSafety(env) {
  if (env.VERCEL_ENV !== "preview") return;

  const productionHost = env.NEON_PROD_HOST?.trim().toLowerCase();
  const hosts = [databaseHost(env.DATABASE_URL), databaseHost(env.DIRECT_URL)];
  if (!productionHost || hosts.some((host) => !host)) {
    throw new Error("Preview builds require DATABASE_URL, DIRECT_URL, and NEON_PROD_HOST so the production database can be rejected.");
  }
  if (hosts.some((host) => host.includes(KNOWN_NEON_PROD_HOST) || host.includes(productionHost))) {
    throw new Error("Preview build blocked: DATABASE_URL or DIRECT_URL points to the production Neon branch.");
  }
}

function executeCommand(command, args) {
  return spawnSync(command, args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

export function runVercelBuild(env, runCommand = executeCommand) {
  assertVercelBuildDatabaseSafety(env);
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