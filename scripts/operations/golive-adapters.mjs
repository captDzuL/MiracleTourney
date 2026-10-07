// Real Vercel / Neon / shell adapters for golive-core. Network calls are plain fetch; secrets come from the
// environment and are only ever sent as Authorization headers, never logged.
import { spawn } from "node:child_process";
import { diffCatalogs, readCatalog, withoutKnownProductionDifferences } from "./catalog-postcheck-core.mjs";
import { ACTIVATION_GROUPS } from "./golive-core.mjs";
import { evaluateReadback, fetchReadback, formatReadback, V3_FLAGS } from "./vercel-readback-core.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(fetchImpl, method, url, token, body) {
  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname} failed with HTTP ${response.status}`);
  return text ? JSON.parse(text) : {};
}

export function createVercelAdapter({ token, teamSlug, project = "miracle-tourney", repoId = 1316699241, siteUrl, fetchImpl = fetch, pollMs = 10_000, timeoutMs = 20 * 60_000 }) {
  const base = "https://api.vercel.com";
  const q = `slug=${encodeURIComponent(teamSlug)}`;
  const flagEntries = async () => (await api(fetchImpl, "GET", `${base}/v9/projects/${project}/env?${q}`, token)).envs;

  return {
    async readback() {
      const data = await fetchReadback({ token, teamSlug, projectName: project, fetchImpl });
      const result = evaluateReadback(data);
      // Every V3 flag must be explicitly false for production before anything is written.
      const notOff = V3_FLAGS.filter((key) => result.flags[key]?.production !== "false");
      return { ok: result.ok && notOff.length === 0, report: `${formatReadback(result)}${notOff.length ? `\nNot explicitly false for production: ${notOff.join(", ")}` : ""}` };
    },
    async flagReport() {
      const result = evaluateReadback(await fetchReadback({ token, teamSlug, projectName: project, fetchImpl }));
      return V3_FLAGS.map((key) => `  ${key}: production=${result.flags[key]?.production ?? "unset"}`).join("\n");
    },
    async setProductionFlag(key, value) {
      const entry = (await flagEntries()).find((env) => env.key === key && env.target.length === 1 && env.target[0] === "production");
      if (!entry) throw new Error(`No production-only variable ${key} found.`);
      await api(fetchImpl, "PATCH", `${base}/v9/projects/${project}/env/${entry.id}?${q}`, token, { value });
    },
    async productionUrl() {
      if (siteUrl) return siteUrl.replace(/\/$/, "");
      const found = await api(fetchImpl, "GET", `${base}/v9/projects/${project}?${q}`, token);
      const alias = found.targets?.production?.alias?.[0];
      if (!alias) throw new Error("No production domain found; pass SITE_URL.");
      return `https://${alias}`;
    },
    deployProduction: ({ sha, ref }) => deploy({ sha, ref, target: "production" }),
    deployPreview: ({ sha, ref }) => deploy({ sha, ref, target: "preview" }),
  };

  async function deploy({ sha, ref, target }) {
    const created = await api(fetchImpl, "POST", `${base}/v13/deployments?${q}&forceNew=1`, token, {
      name: project,
      project,
      target,
      gitSource: { type: "github", repoId, ref, sha },
    });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const state = (await api(fetchImpl, "GET", `${base}/v13/deployments/${created.id}?${q}`, token)).readyState;
      if (state === "READY") return { id: created.id };
      if (["ERROR", "CANCELED"].includes(state)) throw new Error(`Deployment ${created.id} ended as ${state}.`);
      if (Date.now() > deadline) throw new Error(`Deployment ${created.id} was not READY within ${Math.round(timeoutMs / 60_000)} minutes.`);
      await sleep(pollMs);
    }
  }
}

export function createNeonAdapter({ token, projectId = "steep-tree-47893196", productionBranchId = "br-rough-mountain-azfdh3db", fetchImpl = fetch }) {
  const base = `https://console.neon.tech/api/v2/projects/${projectId}`;
  return {
    async productionBranch() {
      const { branch } = await api(fetchImpl, "GET", `${base}/branches/${productionBranchId}`, token);
      if (!branch?.id) throw new Error("Production branch not found in Neon.");
      return { id: branch.id };
    },
    // A child branch with no compute endpoint: a copy-on-write checkpoint of the data at this moment.
    async createCheckpoint(name) {
      const { branch } = await api(fetchImpl, "POST", `${base}/branches`, token, { branch: { parent_id: productionBranchId, name } });
      if (!branch?.id) throw new Error("Neon did not return the checkpoint branch.");
      return { id: branch.id, name };
    },
  };
}

export function createShell(env) {
  return (command, args) => new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, shell: false });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stdout += chunk; process.stderr.write(chunk); });
    child.on("error", () => resolve({ code: 127, stdout }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

export async function createDatabaseChecks({ url, referenceCatalog }) {
  const createClient = async (target) => {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({ datasources: { db: { url: target } }, log: [] });
  };
  return {
    async appliedMigrationCount() {
      const prisma = await createClient(url);
      try {
        const rows = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          return tx.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL");
        });
        return rows[0].n;
      } finally {
        await prisma.$disconnect();
      }
    },
    async catalogDifferences() {
      const actual = await readCatalog(url, createClient);
      return withoutKnownProductionDifferences(diffCatalogs(referenceCatalog, actual));
    },
  };
}

export { ACTIVATION_GROUPS };
