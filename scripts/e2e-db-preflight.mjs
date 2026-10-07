import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadE2eEnvironment } from "./e2e-env.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
import { validateE2eDatabaseConfiguration } from "./e2e-db-configuration.mjs";
export { validateE2eDatabaseConfiguration } from "./e2e-db-configuration.mjs";

function describeError(error) {
  if (!(error instanceof Error)) return "Unknown database connection error.";
  if (error.message.includes("Can't reach database server")) {
    return "Database host is not reachable from this machine.";
  }
  return error.message.split("\n")[0] || "Database connection failed.";
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Database preflight timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function checkE2eDatabaseConnection({
  env = process.env,
  PrismaClient = DefaultPrismaClient,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const configuration = validateE2eDatabaseConfiguration(env);
  if (!configuration.ok) {
    return configuration;
  }

  const prisma = new PrismaClient();
  try {
    await withTimeout(prisma.$connect(), timeoutMs);
    return {
      ok: true,
      host: configuration.host,
      message: "Database connection is reachable for DB-backed E2E tests.",
    };
  } catch (error) {
    return {
      ok: false,
      host: configuration.host,
      message: describeError(error),
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function requireE2eDatabaseResetPermission(env = process.env) {
  if (env.E2E_DATABASE_RESET_ALLOWED !== "true") {
    throw new Error("Blocked: set E2E_DATABASE_RESET_ALLOWED=true in .env.test before resetting the E2E database.");
  }
}

async function main() {
  loadE2eEnvironment();
  const result = await checkE2eDatabaseConnection();
  const prefix = result.ok ? "[e2e-db-preflight] OK" : "[e2e-db-preflight] BLOCKED";
  const output = `${prefix}: ${result.message} Host: ${result.host}`;

  if (result.ok) {
    console.log(output);
    return;
  }

  console.error(output);
  console.error("[e2e-db-preflight] Use a reachable isolated test database before running pnpm test:e2e.");
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
