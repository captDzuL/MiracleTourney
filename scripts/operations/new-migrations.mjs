import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ADDED_MIGRATION = /^prisma\/migrations\/([^/]+)\/migration\.sql$/;
const EMPTY_SHA = /^0+$/;

export function extractNewMigrations(changedFiles) {
  return changedFiles
    .split(/\r?\n/)
    .map((line) => line.trim().match(ADDED_MIGRATION)?.[1])
    .filter(Boolean);
}

export function isUsableBaseRef(baseRef) {
  return Boolean(baseRef) && !EMPTY_SHA.test(baseRef);
}

function listAddedMigrations(baseRef) {
  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`, "--", "prisma/migrations"],
    { encoding: "utf8" },
  );
  return extractNewMigrations(changedFiles);
}

const isEntryPoint = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
  const baseRef = process.argv[2];
  if (isUsableBaseRef(baseRef)) {
    for (const name of listAddedMigrations(baseRef)) console.log(name);
  }
}
