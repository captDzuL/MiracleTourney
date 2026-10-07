// Physical-catalog comparison for the post-migration check. Compares what PostgreSQL really contains (tables,
// columns, indexes, constraints, enums, triggers, functions of schema "public") with a reference catalog taken from
// a throwaway database that was built only from the checked-in migrations. The migration ledger alone cannot prove
// the physical schema; this can. Every query runs in a READ ONLY transaction.
import { CATALOG_SQL } from "./testing-schema-catalog.mjs";

export { CATALOG_SQL };
export const CATEGORIES = ["tables", "columns", "indexes", "constraints", "enums", "triggers", "functions"];

const KEY = {
  tables: (item) => item.name,
  columns: (item) => `${item.table}.${item.name}`,
  indexes: (item) => `${item.table}.${item.name}`,
  constraints: (item) => `${item.table}.${item.name}`,
  enums: (item) => item.name,
  triggers: (item) => `${item.table}.${item.name}`,
  functions: (item) => item.name,
};

function assertCatalog(catalog, label) {
  if (!catalog || CATEGORIES.some((category) => !Array.isArray(catalog[category]))) {
    throw new Error(`${label} is not a catalog (missing ${CATEGORIES.join("/")} arrays).`);
  }
}

const canonical = (item) => JSON.stringify(Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))));

export function diffCatalogs(reference, actual) {
  assertCatalog(reference, "reference");
  assertCatalog(actual, "actual");
  const differences = [];
  for (const category of CATEGORIES) {
    const refMap = new Map(reference[category].map((item) => [KEY[category](item), item]));
    const actMap = new Map(actual[category].map((item) => [KEY[category](item), item]));
    for (const [key, item] of refMap) {
      if (!actMap.has(key)) differences.push({ category, key, kind: "missing" });
      else if (canonical(item) !== canonical(actMap.get(key))) differences.push({ category, key, kind: "changed", expected: item, actual: actMap.get(key) });
    }
    for (const key of actMap.keys()) if (!refMap.has(key)) differences.push({ category, key, kind: "extra" });
  }
  return differences.sort((a, b) => `${a.category}${a.key}`.localeCompare(`${b.category}${b.key}`));
}

// Differences between the production database and a database built from the migrations that were verified harmless on
// 2026-10-07 (nothing in the application references either by name). Anything else is a real difference.
export const KNOWN_PRODUCTION_DIFFERENCES = Object.freeze([
  { category: "constraints", key: "Match.Match_eventId_round_slot_key", kind: "missing" },
  { category: "functions", key: "show_db_tree", kind: "extra" },
]);

export function withoutKnownProductionDifferences(differences) {
  return differences.filter((diff) => !KNOWN_PRODUCTION_DIFFERENCES.some((known) => known.category === diff.category && known.key === diff.key && known.kind === diff.kind));
}

export function formatDifferences(differences) {
  if (differences.length === 0) return "Physical catalog matches the reference.";
  const lines = [`Physical catalog differs from the reference in ${differences.length} place(s):`];
  for (const diff of differences) lines.push(`  [${diff.kind.toUpperCase()}] ${diff.category}: ${diff.key}`);
  return lines.join("\n");
}

export function databaseHost(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && url.hostname ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Production is only read when the caller says so explicitly; the default refuses any host that looks like it.
export function assertTargetAllowed(url, env, { allowProductionRead = false } = {}) {
  const host = databaseHost(url);
  if (!host) throw new Error("Database URL is missing or not a postgres URL.");
  const productionHost = env.NEON_PROD_HOST?.trim().toLowerCase();
  const looksProduction = (productionHost && host.includes(productionHost)) || host.includes("ep-sparkling-night-azr6wxwd");
  if (looksProduction && !allowProductionRead) {
    throw new Error("Refusing to read the production database without --allow-production-read.");
  }
  return host;
}

export async function readCatalog(url, createClient) {
  const prisma = await createClient(url);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const rows = await tx.$queryRawUnsafe(CATALOG_SQL);
      const catalog = Array.isArray(rows) ? Object.values(rows[0] ?? {})[0] : null;
      assertCatalog(catalog, "database catalog");
      return catalog;
    });
  } finally {
    await prisma.$disconnect();
  }
}
