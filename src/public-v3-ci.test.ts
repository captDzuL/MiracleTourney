import { describe, expect, it, vi } from "vitest";

const routeModulePath = "../scripts/public-v3-route.mjs";
const ciModulePath = "../scripts/public-v3-ci.mjs";
const pressureModulePath = "../scripts/public-v3-pressure.mjs";
const cases = (count: number, suffix = "") => ({ suites: [{ specs: Array.from({ length: count }, (_, index) => ({ id: `case-${index}${suffix}`, title: `public case ${index}${suffix}`, file: "public.spec.ts", line: index + 1, column: 1, tests: [] })) }] });

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
      return { exitCode: 0, output: JSON.stringify(cases(34)) };
    });
    const writeEvidence = vi.fn();
    await expect(runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence })).rejects.toThrow(/22/);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("--list");
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", error: "Selection db-main listed 34; expected 22." });
  });

  it("rejects a run that replaces a selected title while keeping the same count", async () => {
    const { assertSameSelectedCases } = await import(ciModulePath);
    const listed = { suites: [{ specs: [{ id: "case-a", title: "public bracket", file: "public.spec.ts", line: 12, column: 3, tests: [] }] }] };
    const changed = { suites: [{ specs: [{ id: "case-b", title: "organizer mutation", file: "public.spec.ts", line: 12, column: 3, tests: [] }] }] };
    expect(() => assertSameSelectedCases(listed, changed)).toThrow(/manifest/i);
    expect(assertSameSelectedCases(listed, listed)).toEqual([{ id: "case-a", file: "public.spec.ts", line: 12, column: 3, title: "public bracket" }]);
  });

  it("stops the lane when the actual cases differ from its retained manifest", async () => {
    const { runPublicV3Ci } = await import(ciModulePath);
    const writeEvidence = vi.fn();
    const execute = vi.fn(async (_command: string, args: string[]) => args.includes("--list")
      ? { exitCode: 0, output: JSON.stringify(cases(22)) }
      : { exitCode: 0, report: { ...cases(22, "-changed"), stats: { expected: 22, unexpected: 0, skipped: 0, flaky: 0 } } });
    await expect(runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence })).rejects.toThrow(/manifest/i);
    expect(writeEvidence.mock.calls[0][0].phases[0].selections[0].manifest).toHaveLength(22);
    expect(writeEvidence.mock.calls[0][0].failure).toMatchObject({ stage: "run", selection: "db-main" });
  });

  it("runs phases serially and stops on nonzero, skipped, or flaky results", async () => {
    const { runPublicV3Ci } = await import(ciModulePath);
    const counts = [22, 6, 2, 1, 3, 1, 5, 4, 9, 1];
    const calls: string[] = [];
    const execute = vi.fn(async (_command: string, args: string[], options?: { phase?: string }) => {
      calls.push(args.includes("--list") ? `list-${options?.phase}` : `run-${options?.phase}`);
      const index = Math.floor((calls.length - 1) / 2);
      if (args.includes("--list")) return { exitCode: 0, output: JSON.stringify(cases(counts[index])) };
      return { exitCode: 0, report: { ...cases(counts[index]), stats: { expected: counts[index], unexpected: 0, skipped: 0, flaky: 0 } } };
    });
    await runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence: vi.fn() });
    expect(calls).toEqual([
      "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db", "list-db", "run-db",
      "list-v3", "run-v3", "list-v3", "run-v3", "list-v2", "run-v2", "list-legacy", "run-legacy",
    ]);
    const bad = vi.fn(async (_command: string, args: string[]) => args.includes("--list")
      ? { exitCode: 0, output: JSON.stringify(cases(22)) }
      : { exitCode: 0, report: { ...cases(22), stats: { expected: 21, unexpected: 0, skipped: 1, flaky: 0 } } });
    await expect(runPublicV3Ci({ execute: bad, preflight: vi.fn(async () => undefined), writeEvidence: vi.fn() })).rejects.toThrow(/skipped/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("retains selected titles and safe failing cases without raw command output", async () => {
    const { runPublicV3Ci } = await import(ciModulePath);
    const writeEvidence = vi.fn();
    const execute = vi.fn(async (_command: string, args: string[]) => args.includes("--list")
      ? { exitCode: 0, output: JSON.stringify(cases(22)) }
      : { exitCode: 1, output: "secret=never-retain", report: { suites: [{ specs: [{ ...cases(1).suites[0].specs[0], tests: [{ status: "unexpected", results: [{ status: "failed" }] }] }] }], stats: { expected: 21, unexpected: 1, skipped: 0, flaky: 0 } } });
    await expect(runPublicV3Ci({ execute, preflight: vi.fn(async () => undefined), writeEvidence })).rejects.toThrow(/Selection db-main failed/);
    const evidence = writeEvidence.mock.calls[0][0];
    expect(evidence.failure).toMatchObject({ kind: "test", stage: "run", selection: "db-main" });
    expect(evidence.phases[0].selections[0].manifest).toHaveLength(22);
    expect(evidence.phases[0].selections[0].failedCases).toEqual([{ id: "case-0", title: "public case 0" }]);
    expect(JSON.stringify(evidence)).not.toContain("secret=never-retain");
  });
});

describe("production pressure measurements", () => {
  it("rejects marker-bearing discovery errors and an empty finished bracket", async () => {
    const { measureScenario, PRESSURE_SCENARIOS } = await import(pressureModulePath);
    const bodies = [
      ["/id", '<main class="mpv3-main"><div class="mpv3-homepage"><div role="alert">Data event belum dapat dimuat</div></div></main>'],
      ["/en/events", '<main class="mpv3-main"><div class="mpv3-directory"><div role="alert">Events are unavailable</div></div></main>'],
      ["/id/events/flashpeak-champions-32/bracket", '<div class="mpv3-bracket-page"><h1>Flashpeak Champions 32</h1><p role="status">Bracket atau klasemen resmi belum tersedia.</p></div>'],
    ] as const;
    for (const [path, body] of bodies) {
      const scenario = PRESSURE_SCENARIOS.find((item: { path: string }) => item.path === path);
      expect(scenario).toBeDefined();
      const result = await measureScenario({ ...scenario, requests: 1, concurrency: 1 }, {
        fetchImpl: async () => ({ status: 200, text: async () => body }), baseUrl: "http://127.0.0.1:3102", clock: () => 0,
      });
      expect(result.passed, path).toBe(false);
      expect(result.failureKinds, path).toContain("content");
    }
  });

  it("bounds a never-settling fetch and records a timeout failure", async () => {
    const { measureScenario } = await import(pressureModulePath);
    const result = await measureScenario({ path: "/id", requests: 1, concurrency: 1, p95Ms: 3000, public: true, expected: "ok" }, {
      fetchImpl: () => new Promise(() => undefined), baseUrl: "http://127.0.0.1:3102", timeoutMs: 10,
    });
    expect(result.passed).toBe(false);
    expect(result.failureKinds).toContain("timeout");
    expect(result.completed).toBe(0);
  });
  it("bounds a never-settling public response body", async () => {
    const { measureScenario } = await import(pressureModulePath);
    const result = await measureScenario({ path: "/en/events", requests: 1, concurrency: 1, p95Ms: 3000, public: true, expected: "event" }, {
      fetchImpl: async () => ({ status: 200, text: () => new Promise(() => undefined) }), baseUrl: "http://127.0.0.1:3102", timeoutMs: 10,
    });
    expect(result.failureKinds).toContain("timeout");
    expect(result.completed).toBe(0);
  });

  it("retains a failed warmup and stops its owned server after a stalled request", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const stopServer = vi.fn();
    const writeEvidence = vi.fn();
    const server = { pid: 123, exitCode: null, stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
    const fetchImpl = vi.fn(async (url: string) => url.endsWith("/id/login")
      ? { status: 200, body: { cancel: async () => undefined } }
      : new Promise(() => undefined));
    await expect(runPublicPressure({ loadEnvironment: vi.fn(), checkFixtures: vi.fn(), build: vi.fn(), startServer: () => server,
      stopServer, writeEvidence, fetchImpl, timeoutMs: 10, scenarios: [{ path: "/id", requests: 2, concurrency: 1, p95Ms: 3000, public: true, expected: "ok", statuses: [200] }],
    })).rejects.toThrow(/Warm/);
    expect(stopServer).toHaveBeenCalledWith(server);
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", failure: { kind: "timeout", stage: "warmup", path: "/id" }, warmups: [{ failureKinds: ["timeout"], completed: 0 }] });
  });
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
