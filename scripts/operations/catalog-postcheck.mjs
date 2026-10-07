#!/usr/bin/env node
// Read-only. Two modes:
//   snapshot <out.json>   : write the physical catalog of $CATALOG_DATABASE_URL (a throwaway database that was built only by
//                           `prisma migrate deploy`) to a file. This is the reference.
//   compare <reference.json> : compare the physical catalog of $CATALOG_DATABASE_URL with the reference.
// Exit codes: 0 same, 1 different, 2 could not read / refused.
import { readFile, writeFile } from "node:fs/promises";
import { assertTargetAllowed, diffCatalogs, formatDifferences, readCatalog, withoutKnownProductionDifferences } from "./catalog-postcheck-core.mjs";

const createClient = async (url) => {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient({ datasources: { db: { url } }, log: [] });
};

try {
  const [mode, file, ...flags] = process.argv.slice(2);
  const url = process.env.CATALOG_DATABASE_URL;
  if (!["snapshot", "compare"].includes(mode) || !file) throw new Error("Usage: catalog-postcheck.mjs snapshot|compare <file.json> [--allow-production-read] [--allow-known-production-differences]");
  const host = assertTargetAllowed(url, process.env, { allowProductionRead: flags.includes("--allow-production-read") });
  const actual = await readCatalog(url, createClient);
  if (mode === "snapshot") {
    await writeFile(file, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(`Wrote catalog of ${host} to ${file}.`);
  } else {
    const all = diffCatalogs(JSON.parse(await readFile(file, "utf8")), actual);
    const differences = flags.includes("--allow-known-production-differences") ? withoutKnownProductionDifferences(all) : all;
    console.log(formatDifferences(differences));
    process.exitCode = differences.length === 0 ? 0 : 1;
  }
} catch (error) {
  console.error(`catalog-postcheck: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 2;
}
