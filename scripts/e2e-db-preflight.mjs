import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;

function configuredDatabaseUrl(env) {
  return env.DIRECT_URL || env.DATABASE_URL || "";
}

function safeHostFromUrl(value) {
  try {
    return new URL(value).host || "(unknown host)";
  } catch {
    return "(invalid database URL)";
  }
}

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
  const databaseUrl = configuredDatabaseUrl(env);
  if (!databaseUrl) {
    return {
      ok: false,
      host: "(not configured)",
      message: "DATABASE_URL or DIRECT_URL must be set before running DB-backed E2E tests.",
    };
  }

  const prisma = new PrismaClient();
  try {
    await withTimeout(prisma.$connect(), timeoutMs);
    return {
      ok: true,
      host: safeHostFromUrl(databaseUrl),
      message: "Database connection is reachable for DB-backed E2E tests.",
    };
  } catch (error) {
    return {
      ok: false,
      host: safeHostFromUrl(databaseUrl),
      message: describeError(error),
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
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
