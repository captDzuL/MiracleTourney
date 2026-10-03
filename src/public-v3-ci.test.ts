import { describe, expect, it, vi } from "vitest";

const routeModulePath = "../scripts/public-v3-route.mjs";
const ciModulePath = "../scripts/public-v3-ci.mjs";
const pressureModulePath = "../scripts/public-v3-pressure.mjs";

describe("public V3 CI routing", () => {
  it("routes only the named marker push to the full public lane", async () => {
    const { routePublicV3 } = await import(routeModulePath);
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship [ci:public-v3-full]" })).toBe("run");
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship [ci:public-v3-only]" })).toBe("diagnostic");
    expect(routePublicV3({ event: "push", branch: "other", message: "[ci:public-v3-full]" })).toBe("full");
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship" })).toBe("full");
    expect(() => routePublicV3({ event: "mystery" })).toThrow(/unknown/i);
  });

  it("runs drafts at new SHAs, reuses exact verified evidence, and restores full gate when ready", async () => {
    const { routePublicV3 } = await import(routeModulePath);
    const draft = { event: "pull_request", action: "opened", head: "codex/public-event-overview-v3", base: "feature/ui/release/1.0", draft: true };
    expect(routePublicV3(draft, false)).toBe("run");
    expect(routePublicV3(draft, true)).toBe("verify");
    expect(routePublicV3({ ...draft, action: "synchronize" }, false)).toBe("run");
    expect(routePublicV3({ ...draft, action: "ready_for_review", draft: false }, true)).toBe("full");
    expect(routePublicV3({ ...draft, draft: false }, true)).toBe("full");
    expect(routePublicV3({ ...draft, base: "main" }, true)).toBe("full");
    expect(() => routePublicV3({ ...draft, action: "unknown" }, false)).toThrow(/unknown/i);
  });

  it("rejects old or unrelated successful runs as reuse evidence", async () => {
    const { matchingPublicEvidence } = await import(routeModulePath);
    const target = { sha: "a".repeat(40), repository: "owner/repo" };
    const run = { head_sha: target.sha, head_branch: "codex/public-event-overview-v3", event: "push", conclusion: "success", path: ".github/workflows/ci.yml", id: 101 };
    const job = { name: "Public V3 E2E", conclusion: "success", head_sha: target.sha };
    const artifacts = { 101: [{ name: "public-v3-evidence", expired: false }] };
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, artifacts)).toBe(true);
    expect(matchingPublicEvidence(target, [{ ...run, head_sha: "b".repeat(40) }], { 101: [job] }, artifacts)).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [{ ...job, name: "E2E Tests" }] }, artifacts)).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [{ ...job, conclusion: "skipped" }] }, artifacts)).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, { 101: [{ name: "playwright-report", expired: false }] })).toBe(false);
  });
});

describe("public V3 lane", () => {
  it("selects 35 DB, 9 V3, 9 V2 and 1 legacy cases without reseed commands", async () => {
    const { PUBLIC_PHASES } = await import(ciModulePath);
    expect(PUBLIC_PHASES.map((phase: { expected: number }) => phase.expected)).toEqual([35, 9, 9, 1]);
    expect(PUBLIC_PHASES.flatMap((phase: { selections: { args: string[] }[] }) => phase.selections.flatMap((item) => item.args)).join(" ")).not.toMatch(/db:seed|test:e2e:prepare|--shard/);
    for (const phase of PUBLIC_PHASES) {
      for (const item of phase.selections) {
        expect(item.args).toContain("--workers=1");
        expect(item.args).toContain("--retries=0");
        expect(item.args).toContain("--fail-on-flaky-tests");
      }
    }
  });

  it("checks list counts and fails before running an incomplete selection", async () => {
    const { runPublicV3Ci } = await import(ciModulePath);
    const commands: string[] = [];
    const execute = vi.fn(async (_command: string, args: string[]) => {
      commands.push(args.join(" "));
      return { exitCode: 0, output: "Total: 34 tests in 7 files" };
    });
    const writeEvidence = vi.fn();
    await expect(runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence })).rejects.toThrow(/22/);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("--list");
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", error: "Selection db-main listed 34; expected 22." });
  });

  it("runs phases serially and stops on nonzero, skipped, or flaky results", async () => {
    const { runPublicV3Ci } = await import(ciModulePath);
    const counts = [22, 6, 2, 1, 3, 1, 5, 4, 9, 1];
    const calls: string[] = [];
    const execute = vi.fn(async (_command: string, args: string[], options?: { phase?: string }) => {
      calls.push(args.includes("--list") ? `list-${options?.phase}` : `run-${options?.phase}`);
      const index = Math.floor((calls.length - 1) / 2);
      if (args.includes("--list")) return { exitCode: 0, output: `Total: ${counts[index]} tests in 1 file` };
      return { exitCode: 0, report: { stats: { expected: counts[index], unexpected: 0, skipped: 0, flaky: 0 } } };
    });
    await runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence: vi.fn() });
    expect(calls).toEqual([
      "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db",
      "list-v3", "run-v3", "list-v3", "run-v3", "list-v2", "run-v2", "list-legacy", "run-legacy",
    ]);
    const bad = vi.fn(async (_command: string, args: string[]) => args.includes("--list")
      ? { exitCode: 0, output: "Total: 22 tests in 1 file" }
      : { exitCode: 0, report: { stats: { expected: 21, unexpected: 0, skipped: 1, flaky: 0 } } });
    await expect(runPublicV3Ci({ execute: bad, preflight: vi.fn(async () => undefined), writeEvidence: vi.fn() })).rejects.toThrow(/skipped/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });
});

describe("production pressure measurements", () => {
  it("consumes public bodies and rejects branded fallback and missing content", async () => {
    const { measureScenario } = await import(pressureModulePath);
    const scenario = { path: "/id", requests: 2, concurrency: 1, p95Ms: 3000, public: true, expected: "data-public-v3" };
    const good = vi.fn(async () => ({ status: 200, text: async () => "<main data-public-v3>Events</main>" }));
    expect((await measureScenario(scenario, { fetchImpl: good, baseUrl: "http://127.0.0.1:3102", clock: () => 0 })).failures).toBe(0);
    expect(good).toHaveBeenCalledTimes(2);
    const fallback = vi.fn(async () => ({ status: 200, text: async () => "<main class='public-visual-v2'>Error</main>" }));
    expect((await measureScenario(scenario, { fetchImpl: fallback, baseUrl: "http://127.0.0.1:3102", clock: () => 0 })).failures).toBe(2);
  });

  it("fails p95 at the strict budget and records every request failure", async () => {
    const { measureScenario } = await import(pressureModulePath);
    let time = 0;
    const result = await measureScenario({ path: "/id", requests: 2, concurrency: 1, p95Ms: 3000, public: true, expected: "ok" }, {
      fetchImpl: async () => ({ status: 200, text: async () => "ok" }), baseUrl: "http://127.0.0.1:3102", clock: () => { time += 3000; return time; },
    });
    expect(result.p95Ms).toBe(3000);
    expect(result.passed).toBe(false);
  });

  it("warms and validates every route before starting measured load", async () => {
    const { runPressureScenarios } = await import(pressureModulePath);
    const calls: string[] = [];
    const measure = vi.fn(async (scenario: { path: string; requests: number }) => {
      calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
      return { path: scenario.path, passed: true };
    });
    await runPressureScenarios([{ path: "/id", requests: 40 }, { path: "/en", requests: 40 }], { measure });
    expect(calls).toEqual(["warm-/id", "warm-/en", "load-/id", "load-/en"]);
    calls.length = 0;
    await expect(runPressureScenarios([{ path: "/id", requests: 40 }, { path: "/en", requests: 40 }], {
      measure: async (scenario: { path: string; requests: number }) => {
        calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
        return { path: scenario.path, passed: scenario.path !== "/en" };
      },
    })).rejects.toThrow(/Warm/);
    expect(calls).toEqual(["warm-/id", "warm-/en"]);
  });
});
