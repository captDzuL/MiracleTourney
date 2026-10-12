import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const FETCH_TIMEOUT_MS = 20_000;

export function listLocalMigrations(directory = resolve("prisma/migrations")) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function findUnappliedMigrations(localMigrations, appliedMigrations) {
  const applied = new Set(appliedMigrations);
  return localMigrations.filter((name) => !applied.has(name));
}

export async function fetchAppliedMigrations(databaseUrl) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer from the database after ${FETCH_TIMEOUT_MS / 1000}s`)), FETCH_TIMEOUT_MS);
    });
    const rows = await Promise.race([
      prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      timeout,
    ]);
    return rows.map((row) => row.migration_name);
  } finally {
    clearTimeout(timer);
    await prisma.$disconnect().catch(() => {});
  }
}

function blockedMessage(missing) {
  return [
    `Build blocked: the database is missing ${missing.length} migration${missing.length === 1 ? "" : "s"} that this code needs:`,
    ...missing.map((name) => `  - ${name}`),
    "",
    "Apply them first, then redeploy. The previous deployment keeps serving until then.",
    "  pnpm exec prisma migrate deploy        (run with the production DIRECT_URL)",
    "If you already applied the SQL by hand (for example in the Neon SQL Editor), record it instead:",
    ...missing.map((name) => `  pnpm exec prisma migrate resolve --applied ${name}`),
    "To skip this check for one build, set SKIP_MIGRATION_CHECK=1 in the Vercel environment.",
  ].join("\n");
}

export async function assertMigrationsApplied(env, deps = {}) {
  const {
    listLocal = listLocalMigrations,
    fetchApplied = fetchAppliedMigrations,
    warn = console.warn,
  } = deps;

  if (env.SKIP_MIGRATION_CHECK === "1") {
    warn("Migration check skipped because SKIP_MIGRATION_CHECK=1.");
    return;
  }

  const databaseUrl = env.DIRECT_URL || env.DATABASE_URL;
  if (!databaseUrl) {
    warn("Migration check skipped: DIRECT_URL or DATABASE_URL is not set.");
    return;
  }

  let applied;
  try {
    applied = await fetchApplied(databaseUrl);
  } catch (error) {
    // An unreadable database is not proof of a missing migration; do not hold the deploy hostage to it.
    warn(`Migration check skipped: could not read the migration table (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }

  const missing = findUnappliedMigrations(listLocal(), applied);
  if (missing.length > 0) throw new Error(blockedMessage(missing));
}
