#!/usr/bin/env node
// Entry point of the go-live workflow. Inputs come from environment variables set by .github/workflows/go-live.yml;
// secrets (PROD_DIRECT_URL, VERCEL_TOKEN, NEON_API_KEY) are never printed.
import { readFile, readdir } from "node:fs/promises";
import { createDatabaseChecks, createNeonAdapter, createShell, createVercelAdapter } from "./golive-adapters.mjs";
import { runGoLive } from "./golive-core.mjs";

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is required.`); })();

try {
  const productionDatabaseUrl = need("PROD_DIRECT_URL");
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).length;
  const referenceCatalog = JSON.parse(await readFile(need("CATALOG_REFERENCE_FILE"), "utf8"));
  const checks = await createDatabaseChecks({ url: productionDatabaseUrl, referenceCatalog });
  const deps = {
    env: process.env,
    productionDatabaseUrl,
    log: (message) => console.log(message),
    shell: createShell({ DATABASE_URL: productionDatabaseUrl, DIRECT_URL: productionDatabaseUrl }),
    http: async (url) => {
      const response = await fetch(url, { redirect: "follow" });
      return { status: response.status, body: await response.text() };
    },
    vercel: createVercelAdapter({ token: need("VERCEL_TOKEN"), teamSlug: process.env.VERCEL_TEAM_SLUG || "miracle25", siteUrl: process.env.SITE_URL || undefined }),
    neon: createNeonAdapter({ token: need("NEON_API_KEY") }),
    ...checks,
  };
  const result = await runGoLive({
    mode: need("GOLIVE_MODE"),
    sha: need("GOLIVE_SHA"),
    ref: need("GOLIVE_REF"),
    confirm: process.env.GOLIVE_CONFIRM,
    writesPaused: process.env.GOLIVE_WRITES_PAUSED === "true",
    expectedMigrations: migrations,
    deps,
  });
  console.log(`Done: ${JSON.stringify({ mode: result.mode, migrated: result.migrated, enabled: result.enabled?.length ?? 0, checkpoint: result.checkpoint })}`);
} catch (error) {
  console.error(`go-live: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
