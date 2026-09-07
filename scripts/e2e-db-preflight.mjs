import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadE2eEnvironment } from "./e2e-env.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const KNOWN_NEON_PROD_HOST = "ep-sparkling-night-azr6wxwd";

function parseDatabaseUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

function isProductionHost(host, env) {
  const configuredProductionHost = env.NEON_PROD_HOST?.trim().toLowerCase();
  const normalizedHost = host.toLowerCase();

  return normalizedHost.includes(KNOWN_NEON_PROD_HOST)
    || Boolean(configuredProductionHost && normalizedHost.includes(configuredProductionHost));
}

function databaseConfiguration(env) {
  const databaseUrl = env.DATABASE_URL ?? "";
  const directUrl = env.DIRECT_URL ?? "";
  const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
  const parsedDirectUrl = parseDatabaseUrl(directUrl);
  const configuredUrls = [parsedDatabaseUrl, parsedDirectUrl].filter(Boolean);
  const productionUrl = configuredUrls.find((url) => isProductionHost(url.hostname, env));

  if (productionUrl) {
    return {
      ok: false,
      host: productionUrl.host,
      message: "Blocked: a database URL points to the production Neon branch. Set DATABASE_URL and DIRECT_URL to the isolated test branch before running E2E tests.",
    };
  }

  if ((databaseUrl && !parsedDatabaseUrl) || (directUrl && !parsedDirectUrl)) {
    return {
      ok: false,
      host: "(invalid database URL)",
      message: "DATABASE_URL and DIRECT_URL must be valid absolute URLs before running DB-backed E2E tests.",
    };
  }

  const connectionUrl = parsedDirectUrl ?? parsedDatabaseUrl;
  if (!connectionUrl) {
    return {
      ok: false,
      host: "(not configured)",
      message: "DATABASE_URL or DIRECT_URL must be set before running DB-backed E2E tests.",
    };
  }

  return { ok: true, host: connectionUrl.host };
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
  const configuration = databaseConfiguration(env);
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