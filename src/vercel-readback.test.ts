import { describe, expect, it, vi } from "vitest";

type Env = { key: string; target: string[]; value?: string };
type Result = {
  ok: boolean;
  findings: { id: string; level: string; message: string }[];
  flags: Record<string, Record<string, string>>;
};
type Core = {
  V3_FLAGS: string[];
  evaluateReadback(input: { project: Record<string, unknown>; envs: Env[] }): Result;
  formatReadback(result: Result): string;
  fetchReadback(input: {
    token?: string;
    teamSlug?: string;
    fetchImpl: (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  }): Promise<{ project: Record<string, unknown>; envs: Env[] }>;
};

const corePath = "../scripts/operations/vercel-readback-core.mjs";
const load = () => import(corePath) as Promise<Core>;

const guardEnvs: Env[] = ["DATABASE_URL", "DIRECT_URL", "NEON_PROD_HOST"].map((key) => ({ key, target: ["preview"] }));
const flagEnvs = (core: Core, value: string): Env[] => [
  ...core.V3_FLAGS.map((key) => ({ key, target: ["production", "preview"], value })),
  ...guardEnvs,
];

describe("Vercel read-back cutover evaluation", () => {
  it("blocks while the build override still runs prisma migrate deploy", async () => {
    const core = await load();
    const result = core.evaluateReadback({
      project: { buildCommand: 'if [ "$VERCEL_ENV" = "production" ]; then pnpm prisma migrate deploy; fi && pnpm build', link: { productionBranch: "master" } },
      envs: flagEnvs(core, "false"),
    });
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.id)).toContain("build-runs-migrate-deploy");
  });

  it("blocks while V3 flags are already true for production, even with a clean build command", async () => {
    const core = await load();
    const result = core.evaluateReadback({ project: { buildCommand: "pnpm vercel-build" }, envs: flagEnvs(core, "true") });
    expect(result.ok).toBe(false);
    expect(result.findings.find((finding) => finding.id === "v3-flags-on-in-production")?.message).toContain("8/8");
  });

  it("passes only when the build is migration-free and every V3 flag is staged off", async () => {
    const core = await load();
    for (const buildCommand of ["pnpm vercel-build", null]) {
      const result = core.evaluateReadback({ project: { buildCommand, link: { productionBranch: "main" } }, envs: flagEnvs(core, "false") });
      expect(result.ok, String(buildCommand)).toBe(true);
    }
  });

  it("blocks when the Preview build guard variables are missing (the 7 October Preview failure)", async () => {
    const core = await load();
    const withoutHost = flagEnvs(core, "false").filter((env) => env.key !== "NEON_PROD_HOST");
    const result = core.evaluateReadback({ project: { buildCommand: "pnpm vercel-build" }, envs: withoutHost });
    expect(result.ok).toBe(false);
    expect(result.findings.find((finding) => finding.id === "preview-build-guard-env-missing")?.message).toContain("NEON_PROD_HOST");
    // A production-only variable does not satisfy the Preview target.
    const productionOnly = flagEnvs(core, "false").map((env) => (env.key === "NEON_PROD_HOST" ? { ...env, target: ["production"] } : env));
    expect(core.evaluateReadback({ project: { buildCommand: "pnpm vercel-build" }, envs: productionOnly }).ok).toBe(false);
    // The old override does not use the guard, so the variables are not required for it.
    expect(core.evaluateReadback({ project: { buildCommand: "pnpm build" }, envs: withoutHost }).ok).toBe(true);
  });

  it("warns instead of passing silently when a flag value cannot be read", async () => {
    const core = await load();
    const envs = flagEnvs(core, "false");
    envs[0] = { key: envs[0].key, target: ["production"], value: "enc:opaque-ciphertext" };
    const result = core.evaluateReadback({ project: { buildCommand: "pnpm vercel-build" }, envs });
    expect(result.findings.map((finding) => finding.id)).toContain("v3-flags-unreadable");
    expect(JSON.stringify(result)).not.toContain("opaque-ciphertext");
  });

  it("never prints a non-flag value", async () => {
    const core = await load();
    const envs: Env[] = [...flagEnvs(core, "false"), { key: "JWT_SECRET", target: ["production"], value: "super-secret-value" }];
    const result = core.evaluateReadback({ project: { buildCommand: "pnpm vercel-build" }, envs });
    expect(core.formatReadback(result)).not.toContain("super-secret-value");
    expect(core.formatReadback(result)).not.toContain("JWT_SECRET");
  });

  it("only issues GET requests and requests values for FEATURE_FLAG_* variables alone", async () => {
    const core = await load();
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: { method: string }) => {
      calls.push({ url, method: init.method });
      const path = new URL(url).pathname;
      const body = path.endsWith("/env")
        ? { envs: [{ id: "a1", key: "FEATURE_FLAG_UI_V3_FOUNDATION", target: ["production"] }, { id: "b2", key: "JWT_SECRET", target: ["production"] }] }
        : path.includes("/env/") ? { value: "true" } : { buildCommand: null };
      return { ok: true, status: 200, json: async () => body };
    });
    const data = await core.fetchReadback({ token: "t", teamSlug: "team", fetchImpl });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.filter((call) => call.url.includes("/env/")).map((call) => new URL(call.url).pathname)).toEqual(["/v1/projects/miracle-tourney/env/a1"]);
    expect(data.envs).toEqual([
      { key: "FEATURE_FLAG_UI_V3_FOUNDATION", target: ["production"], value: "true" },
      { key: "JWT_SECRET", target: ["production"] },
    ]);
  });

  it("retries a dropped connection but not an HTTP error", async () => {
    const core = await load();
    let attempts = 0;
    const flaky = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("fetch failed");
      return { ok: true, status: 200, json: async () => ({ envs: [] }) };
    });
    await expect(core.fetchReadback({ token: "t", fetchImpl: flaky })).resolves.toBeDefined();
    const forbidden = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(core.fetchReadback({ token: "t", fetchImpl: forbidden })).rejects.toThrow("HTTP 403");
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
});
