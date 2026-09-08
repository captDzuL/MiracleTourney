import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  decidePreflightExitCode,
  evaluateOwnershipMappings,
  formatPreflightSummary,
  runTenantOwnershipPreflight,
} from "../src/lib/tenant-ownership/preflight.ts";

function parseArgs(argv) {
  const args = {
    mappingPath: null,
    apply: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--apply") {
      args.apply = true;
      continue;
    }

    if (value === "--mapping") {
      args.mappingPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function ensureObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }
  return value;
}

function ensureStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings.`);
  }
  return value;
}

function canonicalizeUniqueIds(ids) {
  return [...new Set(ids)];
}

export async function loadOwnershipMappingContract(mappingPath, readTextFile = readFile) {
  if (!mappingPath) {
    return {
      orphanEventOwners: {},
      legacyAdminUserIds: [],
    };
  }

  const raw = await readTextFile(mappingPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Mapping file must be a JSON object.");
  }

  const orphanEventOwners = ensureObject(parsed.orphanEventOwners, "orphanEventOwners");
  const legacyAdminUserIds = canonicalizeUniqueIds(
    ensureStringArray(parsed.legacyAdminUserIds, "legacyAdminUserIds"),
  );

  const entries = Object.entries(orphanEventOwners);
  for (const [eventId, organizerUserId] of entries) {
    if (!eventId || typeof eventId !== "string") {
      throw new Error("Mapping keys must be non-empty event ID strings.");
    }
    if (!organizerUserId || typeof organizerUserId !== "string") {
      throw new Error(`Mapping for ${eventId} must be a non-empty organizer user ID string.`);
    }
  }

  return {
    orphanEventOwners: Object.fromEntries(entries),
    legacyAdminUserIds,
  };
}

function normalizeErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return "Preflight failed unexpectedly.";
}

async function loadRows(prisma) {
  return Promise.all([
    prisma.user.findMany({ select: { id: true, role: true } }),
    prisma.event.findMany({ select: { id: true, organizerUserId: true } }),
  ]);
}

async function applyOwnershipUpdates(prisma, mapping) {
  const orphanEntries = Object.entries(mapping.orphanEventOwners);

  await prisma.$transaction(async (tx) => {
    for (const [eventId, organizerUserId] of orphanEntries) {
      const updateResult = await tx.event.updateMany({
        where: {
          id: eventId,
          organizerUserId: null,
        },
        data: {
          organizerUserId,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(`Ownership apply failed: orphan update mismatch for event ${eventId}.`);
      }
    }

    if (mapping.legacyAdminUserIds.length > 0) {
      const legacyUpdateResult = await tx.user.updateMany({
        where: {
          id: {
            in: mapping.legacyAdminUserIds,
          },
          role: {
            in: ["admin", "platform_admin"],
          },
        },
        data: {
          role: "organizer",
        },
      });

      if (legacyUpdateResult.count !== mapping.legacyAdminUserIds.length) {
        throw new Error("Ownership apply failed: legacy admin role update count mismatch.");
      }
    }
  });
}

export async function runTenantOwnershipPreflightCli({
  argv = process.argv,
  PrismaClient = DefaultPrismaClient,
  stdout = console.log,
  stderr = console.error,
  readTextFile = readFile,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr(`[tenant-ownership-preflight] ${error instanceof Error ? error.message : "Failed to parse arguments."}`);
    return 1;
  }

  if (args.help) {
    stdout("Usage: node scripts/preflight-tenant-ownership.mjs [--mapping <path>] [--apply]");
    stdout("Template: scripts/preflight-tenant-ownership.mapping.template.json");
    return 0;
  }

  if (args.apply && !args.mappingPath) {
    stderr("[tenant-ownership-preflight] --apply requires --mapping <path>.");
    return 1;
  }

  const prisma = new PrismaClient();

  try {
    const [users, events] = await loadRows(prisma);

    const report = await runTenantOwnershipPreflight({ users, events });
    let mappingContract;
    let mappingValidation;

    if (args.mappingPath) {
      mappingContract = await loadOwnershipMappingContract(args.mappingPath, readTextFile);
      mappingValidation = evaluateOwnershipMappings(report, mappingContract);
    }

    if ((report.nullOwnerEventIds.length > 0 || report.adminUserIds.length > 0) && !mappingValidation) {
      stderr("[tenant-ownership-preflight] Missing required explicit ownership mapping file.");
      stderr("[tenant-ownership-preflight] Use --mapping scripts/preflight-tenant-ownership.mapping.template.json");
      return 1;
    }

    const summary = formatPreflightSummary(report, mappingValidation);
    stdout(summary);

    const exitCode = decidePreflightExitCode(report, mappingValidation);
    if (exitCode !== 0) {
      stderr("[tenant-ownership-preflight] Ownership anomalies detected. Fix data before migration.");
      return 1;
    }

    if (!args.apply) {
      return 0;
    }

    await applyOwnershipUpdates(prisma, mappingContract);

    const [postUsers, postEvents] = await loadRows(prisma);
    const postReport = await runTenantOwnershipPreflight({ users: postUsers, events: postEvents });
    stdout(formatPreflightSummary(postReport));

    const postExitCode = decidePreflightExitCode(postReport);
    if (postExitCode !== 0) {
      stderr("[tenant-ownership-preflight] Post-apply validation failed. Ownership data is still not deployable.");
      return 1;
    }

    return 0;
  } catch (error) {
    stderr(`[tenant-ownership-preflight] ${normalizeErrorMessage(error)}`);
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const exitCode = await runTenantOwnershipPreflightCli();
  process.exitCode = exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
