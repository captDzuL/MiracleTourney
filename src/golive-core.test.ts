import { describe, expect, it, vi } from "vitest";

type Deps = Record<string, unknown>;
type Core = {
  ACTIVATION_GROUPS: string[][];
  confirmationPhrase(sha: string): string;
  assertProductionDatabase(url: string, env: Record<string, string | undefined>): void;
  runGoLive(input: Record<string, unknown>): Promise<{ enabled: string[]; migrated: boolean; checkpoint?: string }>;
};

const corePath = "../scripts/operations/golive-core.mjs";
const core = () => import(corePath) as Promise<Core>;

const SHA = "a".repeat(40);
const PROD_URL = "postgresql://u:p@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb";

function makeDeps(overrides: { pending?: boolean; failSmokeOnCall?: number; failMigrate?: boolean; differences?: unknown[]; readbackOk?: boolean; failRollback?: boolean } = {}) {
  const events: string[] = [];
  let smokeCalls = 0;
  const { pending = true } = overrides;
  const deps = {
    env: {},
    productionDatabaseUrl: PROD_URL,
    log: vi.fn(),
    vercel: {
      readback: vi.fn(async () => ({ ok: overrides.readbackOk ?? true, report: "report" })),
      deployProduction: vi.fn(async () => { events.push("deploy"); return { id: "dpl_1" }; }),
      deployPreview: vi.fn(async () => { events.push("rehearsal"); return { id: "dpl_0" }; }),
      productionUrl: vi.fn(async () => "https://site.example"),
      setProductionFlag: vi.fn(async (flag: string, value: string) => {
        events.push(`flag:${flag}=${value}`);
        if (overrides.failRollback && value === "false") throw new Error("vercel unreachable");
      }),
      flagReport: vi.fn(async () => "flags"),
    },
    neon: {
      productionBranch: vi.fn(async () => ({ id: "br-prod" })),
      createCheckpoint: vi.fn(async (name: string) => { events.push("checkpoint"); return { id: "br-cp", name }; }),
    },
    shell: vi.fn(async (command: string, args: string[]) => {
      const line = [command, ...args].join(" ");
      if (line.endsWith("migrate status")) {
        const done = events.includes("migrate");
        return pending && !done ? { code: 1, stdout: "Following migration have not yet been applied" } : { code: 0, stdout: "Database schema is up to date!" };
      }
      if (line.endsWith("migrate deploy")) { events.push("migrate"); return { code: overrides.failMigrate ? 1 : 0, stdout: "" }; }
      if (line.includes("migrate diff")) { events.push("diff"); return { code: 0, stdout: "" }; }
      return { code: 0, stdout: "" };
    }),
    appliedMigrationCount: vi.fn(async () => 38),
    catalogDifferences: vi.fn(async () => overrides.differences ?? []),
    http: vi.fn(async () => {
      smokeCalls += 1;
      return { status: overrides.failSmokeOnCall !== undefined && smokeCalls >= overrides.failSmokeOnCall && smokeCalls < overrides.failSmokeOnCall + 1 ? 500 : 200, body: "ok" };
    }),
  };
  return { deps, events };
}

const live = (deps: Deps, extra: Record<string, unknown> = {}) =>
  core().then(({ runGoLive, confirmationPhrase }) =>
    runGoLive({ mode: "go-live", sha: SHA, ref: "release", confirm: confirmationPhrase(SHA), writesPaused: true, expectedMigrations: 38, deps, ...extra }));

describe("go-live gates", () => {
  it("dry run reads only: no checkpoint, migration, deployment or flag write", async () => {
    const { runGoLive } = await core();
    const { deps, events } = makeDeps();
    const result = await runGoLive({ mode: "dry-run", sha: SHA, ref: "release", deps });
    expect(result.migrated).toBe(false);
    expect(events).toEqual([]);
  });

  it("refuses a live run without the exact confirmation text or the write-pause confirmation", async () => {
    const { runGoLive } = await core();
    const { deps, events } = makeDeps();
    await expect(runGoLive({ mode: "go-live", sha: SHA, ref: "r", confirm: "go-live", writesPaused: true, deps })).rejects.toThrow(/Confirmation text/);
    await expect(runGoLive({ mode: "go-live", sha: SHA, ref: "r", confirm: `GO-LIVE ${"b".repeat(8)}`, writesPaused: true, deps })).rejects.toThrow(/Confirmation text/);
    await expect(runGoLive({ mode: "go-live", sha: SHA, ref: "r", confirm: `GO-LIVE ${SHA.slice(0, 8)}`, writesPaused: false, deps })).rejects.toThrow(/writes are paused/);
    expect(events).toEqual([]);
  });

  it("changes nothing when the Preview rehearsal of the deployment fails", async () => {
    const { deps, events } = makeDeps();
    (deps.vercel.deployPreview as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Deployment ended as ERROR."));
    await expect(live(deps)).rejects.toThrow(/ended as ERROR/);
    expect(events).toEqual([]);
  });

  it("requires a full commit SHA", async () => {
    const { runGoLive } = await core();
    await expect(runGoLive({ mode: "dry-run", sha: "main", ref: "r", deps: makeDeps().deps })).rejects.toThrow(/40-character/);
  });

  it("refuses a database that is not the production host", async () => {
    const { assertProductionDatabase } = await core();
    expect(() => assertProductionDatabase("postgresql://u:p@ep-delicate-forest-azuodo4q.neon.tech/neondb", {})).toThrow(/production Neon host/);
    expect(() => assertProductionDatabase("postgresql://u:p@localhost/db", { NEON_PROD_HOST: "ep-other" })).toThrow();
    expect(() => assertProductionDatabase("postgresql://u:p@ep-other.neon.tech/db", { NEON_PROD_HOST: "ep-other" })).not.toThrow();
    expect(() => assertProductionDatabase("not a url", {})).toThrow(/not a URL/);
  });

  it("stops before any write when Vercel is not ready for cutover", async () => {
    const { deps, events } = makeDeps({ readbackOk: false });
    await expect(live(deps)).rejects.toThrow(/not ready for cutover/);
    expect(events).toEqual([]);
  });
});

describe("go-live sequence", () => {
  it("checkpoints before migrating, migrates before deploying, then enables the five groups in order", async () => {
    const { deps, events } = makeDeps();
    const { ACTIVATION_GROUPS } = await core();
    const result = await live(deps);
    expect(events.slice(0, 4)).toEqual(["rehearsal", "checkpoint", "migrate", "diff"]);
    const firstDeploy = events.indexOf("deploy");
    expect(firstDeploy).toBeGreaterThan(events.indexOf("diff"));
    expect(events.filter((event) => event.startsWith("flag:")).every((event) => event.endsWith("=true"))).toBe(true);
    expect(events.filter((event) => event.startsWith("flag:")).map((event) => event.slice(5, -5))).toEqual(ACTIVATION_GROUPS.flat());
    expect(events.filter((event) => event === "deploy")).toHaveLength(1 + ACTIVATION_GROUPS.length);
    expect(result.enabled).toEqual(ACTIVATION_GROUPS.flat());
    expect(result.migrated).toBe(true);
  });

  it("skips migrate deploy when the database is already up to date but still verifies it", async () => {
    const { deps, events } = makeDeps({ pending: false });
    const result = await live(deps);
    expect(events).not.toContain("migrate");
    expect(events).toContain("diff");
    expect(result.migrated).toBe(false);
  });

  it("never deploys the application when the migration fails", async () => {
    const { deps, events } = makeDeps({ failMigrate: true });
    await expect(live(deps)).rejects.toThrow(/migrate deploy failed/);
    expect(events).toEqual(["rehearsal", "checkpoint", "migrate"]);
  });

  it("never deploys the application when the physical catalog differs", async () => {
    const { deps, events } = makeDeps({ differences: [{ kind: "missing", category: "tables", key: "Match" }] });
    await expect(live(deps)).rejects.toThrow(/Physical catalog differs/);
    expect(events).not.toContain("deploy");
  });

  it("never deploys when the applied migration count is wrong", async () => {
    const { deps, events } = makeDeps();
    (deps.appliedMigrationCount as ReturnType<typeof vi.fn>).mockResolvedValue(37);
    await expect(live(deps)).rejects.toThrow(/Expected 38 applied migrations, found 37/);
    expect(events).not.toContain("deploy");
  });

  it("turns only the failing group off again, keeps earlier groups on and stops", async () => {
    // Smoke calls: 4 paths after the flags-off deploy, 4 after group 1, then group 2 fails on its first path (call 9).
    const { deps, events } = makeDeps({ failSmokeOnCall: 9 });
    await expect(live(deps)).rejects.toThrow(/stopped at step 2; flags of this step are off again, earlier steps stay on \(FEATURE_FLAG_UI_V3_FOUNDATION\)/);
    const flagEvents = events.filter((event) => event.startsWith("flag:"));
    expect(flagEvents).toEqual([
      "flag:FEATURE_FLAG_UI_V3_FOUNDATION=true",
      "flag:FEATURE_FLAG_PUBLIC_DISCOVERY_V3=true",
      "flag:FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3=true",
      "flag:FEATURE_FLAG_PUBLIC_DISCOVERY_V3=false",
      "flag:FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3=false",
    ]);
  });

  it("says so loudly when the rollback itself fails", async () => {
    const { deps } = makeDeps({ failSmokeOnCall: 9, failRollback: true });
    await expect(live(deps)).rejects.toThrow(/rollback failed.*by hand/);
  });

  it("fails the step when a page returns an application error even with HTTP 200", async () => {
    const { deps } = makeDeps();
    (deps.http as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 200, body: "Application error: a server-side exception" });
    await expect(live(deps)).rejects.toThrow(/Smoke check failed/);
  });
});
