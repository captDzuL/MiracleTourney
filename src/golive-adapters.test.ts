import { describe, expect, it, vi } from "vitest";

type Call = { method: string; path: string; body?: unknown };
type Adapters = {
  createVercelAdapter(options: Record<string, unknown>): {
    deployProduction(input: { sha: string; ref: string }): Promise<{ id: string }>;
    deployPreview(input: { sha: string; ref: string }): Promise<{ id: string }>;
    setProductionFlag(key: string, value: string): Promise<void>;
  };
  createNeonAdapter(options: Record<string, unknown>): { createCheckpoint(name: string): Promise<{ id: string; name: string }> };
};

const adaptersPath = "../scripts/operations/golive-adapters.mjs";
const load = () => import(adaptersPath) as Promise<Adapters>;
const SHA = "c".repeat(40);

function fakeFetch(handler: (call: Call) => unknown, calls: Call[]) {
  return vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const parsed = new URL(url);
    const call: Call = { method: init.method, path: parsed.pathname + (parsed.searchParams.has("forceNew") ? "?forceNew" : ""), body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const data = handler(call);
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  });
}

describe("Vercel adapter", () => {
  it("creates a production deployment of the given commit and waits for READY", async () => {
    const { createVercelAdapter } = await load();
    const calls: Call[] = [];
    let polls = 0;
    const fetchImpl = fakeFetch((call) => (call.method === "POST" ? { id: "dpl_x" } : { readyState: ++polls < 3 ? "BUILDING" : "READY" }), calls);
    const adapter = createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl, pollMs: 0 });
    await expect(adapter.deployProduction({ sha: SHA, ref: "release" })).resolves.toEqual({ id: "dpl_x" });
    expect(calls[0]).toEqual({ method: "POST", path: "/v13/deployments?forceNew", body: { name: "miracle-tourney", project: "miracle-tourney", target: "production", gitSource: { type: "github", repoId: 1316699241, ref: "release", sha: SHA } } });
    expect(polls).toBe(3);
  });

  it("uses target preview for the rehearsal", async () => {
    const { createVercelAdapter } = await load();
    const calls: Call[] = [];
    const fetchImpl = fakeFetch((call) => (call.method === "POST" ? { id: "dpl_p" } : { readyState: "READY" }), calls);
    await createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl, pollMs: 0 }).deployPreview({ sha: SHA, ref: "release" });
    // Vercel answers 400 to target "preview"; a Preview deployment is created by leaving target out.
    expect(calls[0].body).not.toHaveProperty("target");
  });

  it("fails when the deployment ends as ERROR or never becomes READY", async () => {
    const { createVercelAdapter } = await load();
    const errored = fakeFetch((call) => (call.method === "POST" ? { id: "d" } : { readyState: "ERROR" }), []);
    await expect(createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl: errored, pollMs: 0 }).deployProduction({ sha: SHA, ref: "r" })).rejects.toThrow(/ended as ERROR/);
    const stuck = fakeFetch((call) => (call.method === "POST" ? { id: "d" } : { readyState: "BUILDING" }), []);
    await expect(createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl: stuck, pollMs: 0, timeoutMs: -1 }).deployProduction({ sha: SHA, ref: "r" })).rejects.toThrow(/not READY/);
  });

  it("changes the value of the production-only variable and never the shared Preview one", async () => {
    const { createVercelAdapter } = await load();
    const calls: Call[] = [];
    const envs = [
      { id: "preview1", key: "FEATURE_FLAG_X", target: ["preview"] },
      { id: "prod1", key: "FEATURE_FLAG_X", target: ["production"] },
    ];
    const fetchImpl = fakeFetch((call) => (call.method === "GET" ? { envs } : {}), calls);
    await createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl }).setProductionFlag("FEATURE_FLAG_X", "true");
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch).toEqual({ method: "PATCH", path: "/v9/projects/miracle-tourney/env/prod1", body: { value: "true" } });
    await expect(createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl }).setProductionFlag("FEATURE_FLAG_MISSING", "true")).rejects.toThrow(/No production-only variable/);
  });

  it("reports the API's own error message when a request is rejected", async () => {
    const { createVercelAdapter } = await load();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { code: "bad_request", message: "Invalid request: `target` should be 'production'" } }) }));
    await expect(createVercelAdapter({ token: "secret-token-value", teamSlug: "team", fetchImpl }).deployPreview({ sha: SHA, ref: "r" })).rejects.toThrow(/HTTP 400: bad_request Invalid request: `target` should be 'production'/);
  });

  it("keeps polling through a dropped connection but never repeats a POST", async () => {
    const { createVercelAdapter } = await load();
    let polls = 0;
    const fetchImpl = vi.fn(async (_url: string, init: { method: string }) => {
      if (init.method === "POST") return { ok: true, status: 200, text: async () => JSON.stringify({ id: "dpl_n" }) };
      polls += 1;
      if (polls === 1) throw new Error("fetch failed");
      return { ok: true, status: 200, text: async () => JSON.stringify({ readyState: "READY" }) };
    });
    await expect(createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl, pollMs: 0 }).deployPreview({ sha: SHA, ref: "r" })).resolves.toEqual({ id: "dpl_n" });
    expect(fetchImpl.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    const failingPost = vi.fn(async () => { throw new Error("fetch failed"); });
    await expect(createVercelAdapter({ token: "t", teamSlug: "team", fetchImpl: failingPost }).deployPreview({ sha: SHA, ref: "r" })).rejects.toThrow("fetch failed");
    expect(failingPost).toHaveBeenCalledTimes(1);
  });

  it("does not leak the token into an error message", async () => {
    const { createVercelAdapter } = await load();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }));
    const error = await createVercelAdapter({ token: "secret-token-value", teamSlug: "team", fetchImpl }).setProductionFlag("FEATURE_FLAG_X", "true").catch((e: Error) => e);
    expect(String(error)).not.toContain("secret-token-value");
  });
});

describe("Neon adapter", () => {
  it("creates the checkpoint as a child of the production branch with no compute endpoint", async () => {
    const { createNeonAdapter } = await load();
    const calls: Call[] = [];
    const fetchImpl = fakeFetch(() => ({ branch: { id: "br-cp" } }), calls);
    await expect(createNeonAdapter({ token: "t", fetchImpl }).createCheckpoint("checkpoint-pre-v3-cccccccc")).resolves.toEqual({ id: "br-cp", name: "checkpoint-pre-v3-cccccccc" });
    expect(calls[0]).toEqual({ method: "POST", path: "/api/v2/projects/steep-tree-47893196/branches", body: { branch: { parent_id: "br-rough-mountain-azfdh3db", name: "checkpoint-pre-v3-cccccccc" } } });
  });
});
