// One-button V3 go-live orchestration. All side effects go through injected dependencies so the sequence, the safety
// gates and the rollback can be tested without touching Vercel, Neon or a database.
//
// Modes: "dry-run" (reads only; no write of any kind), "go-live" (backup, migrate, deploy flags-off, enable flags).
// Never reads a secret value into the log; only flag values and statuses are printed.

export const KNOWN_PRODUCTION_HOST = "ep-sparkling-night-azr6wxwd";

// Same order as docs/operations/v3-feature-flag-matrix.md ("Activation order"); email_password_reset is a separate owner decision.
export const ACTIVATION_GROUPS = Object.freeze([
  ["FEATURE_FLAG_UI_V3_FOUNDATION"],
  ["FEATURE_FLAG_PUBLIC_DISCOVERY_V3", "FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3"],
  ["FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3", "FEATURE_FLAG_ORGANIZER_WORKSPACE_V3"],
  ["FEATURE_FLAG_REGISTRATION_WORKSPACE_V3", "FEATURE_FLAG_COMPETITION_OPERATIONS_V3"],
  ["FEATURE_FLAG_COMPLETION_WORKSPACE_V3"],
]);

export const DEFAULT_SMOKE_PATHS = Object.freeze(["/", "/events", "/id/events", "/en/events"]);

export function confirmationPhrase(sha) {
  return `GO-LIVE ${sha.slice(0, 8)}`;
}

export function assertProductionDatabase(url, env) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("PROD_DIRECT_URL is missing or not a URL.");
  }
  const configured = env.NEON_PROD_HOST?.trim().toLowerCase();
  const matches = host.includes(KNOWN_PRODUCTION_HOST) || (configured && host.includes(configured));
  if (!matches) throw new Error("PROD_DIRECT_URL does not point at the production Neon host; refusing to run.");
}

function fail(message) {
  throw new Error(message);
}

async function sh(deps, command, args, label, okCodes = [0]) {
  const result = await deps.shell(command, args);
  if (!okCodes.includes(result.code)) fail(`${label} failed (exit ${result.code}).`);
  return result;
}

async function smoke(deps, baseUrl, paths) {
  for (const path of paths) {
    const response = await deps.http(`${baseUrl}${path}`);
    if (response.status !== 200 || /Application error|Internal Server Error/i.test(response.body)) {
      fail(`Smoke check failed: ${path} returned HTTP ${response.status}.`);
    }
    deps.log(`  smoke ${path}: HTTP 200`);
  }
}

export async function runGoLive({ mode, sha, ref, confirm, writesPaused, smokePaths = DEFAULT_SMOKE_PATHS, expectedMigrations, deps }) {
  const live = mode === "go-live";
  if (!["dry-run", "go-live"].includes(mode)) fail(`Unknown mode ${mode}.`);
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) fail("A full 40-character commit SHA is required.");
  if (live) {
    if (confirm !== confirmationPhrase(sha)) fail(`Confirmation text must be exactly "${confirmationPhrase(sha)}".`);
    if (writesPaused !== true) fail("Confirm that organizer and registration writes are paused before a live run.");
  }
  const log = deps.log;

  log("1/7 Preflight (read only)");
  assertProductionDatabase(deps.productionDatabaseUrl, deps.env);
  const readback = await deps.vercel.readback();
  if (!readback.ok) fail(`Vercel is not ready for cutover:\n${readback.report}`);
  log("  Vercel: build command has no migration; every V3 flag is false for production.");
  const branch = await deps.neon.productionBranch();
  log(`  Neon: production branch ${branch.id} found.`);

  log("2/7 Migration state (read only)");
  const status = await deps.shell("pnpm", ["exec", "prisma", "migrate", "status"]);
  const upToDate = status.code === 0;
  log(upToDate ? "  database already up to date; migrate deploy will be skipped" : "  pending migrations found");
  if (!upToDate && !/have not yet been applied|Following migration/i.test(status.stdout)) {
    fail("migrate status failed for a reason other than pending migrations; stopping.");
  }

  if (!live) {
    log(`Required confirmation text for a live run of this commit: "${confirmationPhrase(sha)}"`);
    log("Dry run finished: nothing was written. A live run would now take a Neon checkpoint, migrate, deploy with flags off and enable flags in order.");
    return { mode, migrated: false };
  }

  log("2b/7 Rehearse the deployment call on a Preview build (the same commit, before anything is migrated)");
  await deps.vercel.deployPreview({ sha, ref });
  log("  Preview build of this commit is READY, so the deploy call and the build both work.");

  log("3/7 Checkpoint of the production branch");
  const checkpoint = await deps.neon.createCheckpoint(`checkpoint-pre-v3-${sha.slice(0, 8)}`);
  log(`  created Neon branch ${checkpoint.id} (${checkpoint.name}); it holds the data as of now and no compute.`);

  log("4/7 Migrate");
  if (!upToDate) {
    await sh(deps, "pnpm", ["exec", "prisma", "migrate", "deploy"], "migrate deploy");
    await sh(deps, "pnpm", ["exec", "prisma", "migrate", "status"], "migrate status after deploy");
  }
  await sh(deps, "pnpm", ["exec", "prisma", "migrate", "diff", "--from-url", deps.productionDatabaseUrl, "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--exit-code"], "schema drift check");
  const applied = await deps.appliedMigrationCount();
  if (expectedMigrations !== undefined && applied !== expectedMigrations) fail(`Expected ${expectedMigrations} applied migrations, found ${applied}.`);
  log(`  ${applied} migrations applied, zero schema drift`);
  const differences = await deps.catalogDifferences();
  if (differences.length > 0) fail(`Physical catalog differs from the reference:\n${differences.map((d) => `  [${d.kind}] ${d.category}: ${d.key}`).join("\n")}`);
  log("  physical catalog matches the reference (known production differences excluded)");

  log("5/7 Deploy the release with every V3 flag off");
  const first = await deps.vercel.deployProduction({ sha, ref });
  const url = await deps.vercel.productionUrl();
  await smoke(deps, url, smokePaths);

  log("6/7 Enable V3 flags in order");
  const enabled = [];
  for (const [index, group] of ACTIVATION_GROUPS.entries()) {
    log(`  step ${index + 1}/${ACTIVATION_GROUPS.length}: ${group.join(", ")}`);
    try {
      for (const flag of group) await deps.vercel.setProductionFlag(flag, "true");
      await deps.vercel.deployProduction({ sha, ref });
      await smoke(deps, url, smokePaths);
      enabled.push(...group);
    } catch (error) {
      log(`  FAILED: ${error.message}`);
      log("  Rolling back: turning this step's flags off again and redeploying.");
      try {
        for (const flag of group) await deps.vercel.setProductionFlag(flag, "false");
        await deps.vercel.deployProduction({ sha, ref });
        await smoke(deps, url, smokePaths);
      } catch (rollbackError) {
        throw new Error(`Go-live failed at step ${index + 1} (${error.message}) AND the rollback failed (${rollbackError.message}). Turn ${group.join(", ")} off in Vercel and redeploy by hand.`);
      }
      throw new Error(`Go-live stopped at step ${index + 1}; flags of this step are off again, earlier steps stay on (${enabled.join(", ") || "none"}). ${error.message}`);
    }
  }

  log("7/7 Final read-back");
  log(await deps.vercel.flagReport());
  return { mode, migrated: !upToDate, deployment: first?.id, enabled, checkpoint: checkpoint.id };
}
