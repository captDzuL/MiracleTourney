import { describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { deflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

const routeModulePath = "../scripts/public-v3-route.mjs";
const ciModulePath = "../scripts/public-v3-ci.mjs";
const pressureModulePath = "../scripts/public-v3-pressure.mjs";
const cases = (count: number, suffix = "") => ({ suites: [{ specs: Array.from({ length: count }, (_, index) => ({ id: `case-${index}${suffix}`, title: `public case ${index}${suffix}`, file: "public.spec.ts", line: index + 1, column: 1, tests: [] })) }] });
const proofSha = "a".repeat(40);
const selectionCounts = [22, 6, 2, 1, 3, 1, 5, 4, 9, 1];
const pressurePaths = ["/id/login", "/api/me", "/id/admin", "/id", "/id/events", "/id/events/flashpeak-champions-32", "/id/events/flashpeak-champions-32/bracket",
  "/en", "/en/events", "/en/events/flashpeak-champions-32", "/en/events/flashpeak-champions-32/bracket"];
const cleanResult = (path: string, initial: boolean, latency = 500) => {
  const requests = initial ? 1 : path === "/id/login" || path === "/api/me" ? 80 : 40;
  const concurrency = initial ? 1 : requests === 80 ? 20 : 10;
  return { path, requests, concurrency, completed: requests, statusCounts: { 200: requests },
    ...(initial ? { initialLatencyMs: latency } : { p95Ms: latency }), maxMs: latency, failures: 0, failureKinds: [], passed: true };
};
const fullProof = async () => {
  const { PUBLIC_PHASES } = await import(ciModulePath);
  let selectionIndex = 0;
  const evidence = { sha: proofSha, mode: "full-public", status: "passed", exclusions: ["three public-v3-seeded-events seed/reseed cases"],
    phases: PUBLIC_PHASES.map((phase: { id: string; expected: number; selections: { id: string; args: string[] }[] }) => ({ id: phase.id, expected: phase.expected, passed: phase.expected,
      selections: phase.selections.map((selection) => {
        const count = selectionCounts[selectionIndex++];
        return { id: selection.id, args: selection.args, listed: count, passed: count, failed: 0, skipped: 0, flaky: 0, elapsedMs: 100,
          manifest: Array.from({ length: count }, (_, index) => ({ id: `${selection.id}-${index}`, file: "public.spec.ts", line: index + 1, column: 1, title: `case ${index}` })), failedCases: [] };
      }) })) };
  const pressure = { sha: proofSha, mode: "production-like", policy: "initial-warning-load-strict-v1", environment: "guarded E2E test database", status: "passed", buildMs: 100,
    warmups: pressurePaths.map((path) => cleanResult(path, true)), scenarios: pressurePaths.map((path) => cleanResult(path, false)), initialLatencyWarnings: [] };
  return { evidence, pressure };
};
const crc32 = (bytes: Buffer) => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const zipProof = (proof: Record<string, unknown>, compress = false) => {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(proof)) {
    const fileName = Buffer.from(`${name}.json`);
    const data = Buffer.from(JSON.stringify(content));
    const stored = compress ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(compress ? 8 : 0, 8); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(stored.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(fileName.length, 26);
    local.push(header, fileName, stored);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(compress ? 8 : 0, 10); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(stored.length, 20); entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(fileName.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, fileName);
    offset += header.length + fileName.length + stored.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
};

describe("public V3 CI routing", () => {
  it("routes only the named marker push to the full public lane", async () => {
    const { routePublicV3 } = await import(routeModulePath);
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship [ci:public-v3-full]" })).toBe("run");
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship [ci:public-v3-only]" })).toBe("diagnostic");
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "probe [ci:public-v3-home]" })).toBe("home");
    expect(routePublicV3({ event: "push", branch: "other", message: "probe [ci:public-v3-home]" })).toBe("full");
    expect(routePublicV3({ event: "push", branch: "other", message: "[ci:public-v3-full]" })).toBe("full");
    expect(routePublicV3({ event: "push", branch: "codex/public-event-overview-v3", message: "ship" })).toBe("full");
    expect(() => routePublicV3({ event: "mystery" })).toThrow(/unknown/i);
  });

  it("requires exact push proof for draft, ready, reopened and synchronized eligible PRs", async () => {
    const { routePublicV3 } = await import(routeModulePath);
    const draft = { event: "pull_request", action: "opened", head: "codex/public-event-overview-v3", base: "feature/ui/release/1.0", draft: true,
      repository: "captDzuL/MiracleTourney", repositoryId: 1316699241, headRepositoryId: 1316699241, baseRepositoryId: 1316699241, sha: "a".repeat(40) };
    for (const action of ["opened", "reopened", "synchronize", "ready_for_review"]) {
      expect(routePublicV3({ ...draft, action, draft: action !== "ready_for_review" }, true)).toBe("verify");
      expect(() => routePublicV3({ ...draft, action }, false)).toThrow(/evidence/i);
    }
    expect(() => routePublicV3({ ...draft, repositoryId: 42 }, true)).toThrow(/repository/i);
    expect(() => routePublicV3({ ...draft, headRepositoryId: 42 }, true)).toThrow(/repository/i);
    expect(() => routePublicV3({ ...draft, sha: "bad" }, true)).toThrow(/SHA/i);
    expect(routePublicV3({ ...draft, base: "main" }, true)).toBe("full");
    expect(routePublicV3({ ...draft, head: "other" }, false)).toBe("full");
    expect(() => routePublicV3({ ...draft, action: "unknown" }, false)).toThrow(/unknown/i);
  });

  it("rejects a wrong-run provenance, job, artifact or expired artifact", async () => {
    const { matchingPublicEvidence } = await import(routeModulePath);
    const target = { sha: "a".repeat(40), repository: "captDzuL/MiracleTourney", repositoryId: 1316699241 };
    const run = { head_sha: target.sha, head_branch: "codex/public-event-overview-v3", event: "push", conclusion: "success", status: "completed", path: ".github/workflows/ci.yml", id: 101,
      repository: { id: 1316699241, full_name: target.repository }, head_repository: { id: 1316699241, full_name: target.repository } };
    const job = { name: "Public V3 E2E", conclusion: "success", status: "completed", head_sha: target.sha, run_id: 101 };
    const artifact = { name: "public-v3-evidence", expired: false, workflow_run: { id: 101, head_sha: target.sha, repository_id: 1316699241 } };
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, { 101: [artifact] })).toBe(true);
    expect(matchingPublicEvidence(target, [{ ...run, head_sha: "b".repeat(40) }], { 101: [job] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [{ ...run, repository: { id: 42 } }], { 101: [job] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [{ ...run, head_repository: { id: 42 } }], { 101: [job] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [{ ...run, event: "pull_request" }], { 101: [job] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [{ ...run, conclusion: "failure" }], { 101: [job] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [{ ...job, name: "E2E Tests" }] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [{ ...job, conclusion: "skipped" }] }, { 101: [artifact] })).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, { 101: [{ ...artifact, expired: true }] })).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, { 101: [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: "b".repeat(40) } }] })).toBe(false);
    expect(matchingPublicEvidence(target, [run], { 101: [job] }, { 101: [{ ...artifact, name: "public-v3-home-evidence" }] })).toBe(false);
  });

  it("requires exact 54 clean cases and strict measured pressure in the downloaded artifact", async () => {
    const { validatePublicArtifact } = await import(routeModulePath);
    const { evidence, pressure } = await fullProof();
    expect(validatePublicArtifact(proofSha, { evidence, pressure })).toBe(true);
    expect(validatePublicArtifact(proofSha, { evidence: { ...evidence, sha: "b".repeat(40) }, pressure })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence: { ...evidence, status: "failed" }, pressure })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence: { ...evidence, phases: evidence.phases.slice(0, 3) }, pressure })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence: { ...evidence, phases: evidence.phases.map((phase: { passed: number }, i: number) => i ? phase : { ...phase, passed: 34 }) }, pressure })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence: { ...evidence, phases: evidence.phases.map((phase: { selections: { flaky: number }[] }, i: number) => i ? phase : { ...phase,
      selections: phase.selections.map((selection: { flaky: number }, j: number) => j ? selection : { ...selection, flaky: 1 }) }) }, pressure })).toBe(false);
    const duplicated = structuredClone(evidence);
    duplicated.phases[0].selections[1].manifest[0].id = duplicated.phases[0].selections[0].manifest[0].id;
    expect(validatePublicArtifact(proofSha, { evidence: duplicated, pressure })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...pressure, status: "failed" } })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...pressure, scenarios: pressure.scenarios.slice(0, 10) } })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...pressure, scenarios: pressure.scenarios.map((item, i) => i ? item : { ...item, p95Ms: 3000, passed: true }) } })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...pressure, scenarios: pressure.scenarios.map((item, i) => i ? item : { ...item, failures: 1, passed: true }) } })).toBe(false);
  });

  it("accepts a slow initial sample only as a warning when actual load and content pass", async () => {
    const { validatePublicArtifact } = await import(routeModulePath);
    const { evidence, pressure } = await fullProof();
    const warned = { ...pressure, warmups: pressure.warmups.map((item, i) => i ? item : { ...item, initialLatencyMs: 4082, maxMs: 4082 }),
      initialLatencyWarnings: [{ path: "/id/login", latencyMs: 4082, thresholdMs: 3000 }] };
    expect(validatePublicArtifact(proofSha, { evidence, pressure: warned })).toBe(true);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...warned, warmups: warned.warmups.map((item, i) => i ? item : { ...item, failures: 1, failureKinds: ["content"], passed: false }) } })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...warned, scenarios: warned.scenarios.map((item, i) => i ? item : { ...item, p95Ms: 3000 }) } })).toBe(false);
    expect(validatePublicArtifact(proofSha, { evidence, pressure: { ...warned, initialLatencyWarnings: [] } })).toBe(false);
  });

  it("keeps the dependency-free router pressure proof in sync with the runtime scenarios", async () => {
    const { EXPECTED_PRESSURE_SCENARIOS } = await import(routeModulePath);
    const { PRESSURE_SCENARIOS } = await import(pressureModulePath);
    expect(EXPECTED_PRESSURE_SCENARIOS).toEqual(PRESSURE_SCENARIOS.map((scenario: { path: string; requests: number; concurrency: number; p95Ms: number; statuses: number[] }) => ({
      path: scenario.path, requests: scenario.requests, concurrency: scenario.concurrency, p95Ms: scenario.p95Ms, statuses: scenario.statuses,
    })));
  });

  it("boots the route script from a clean directory before package installation", () => {
    const isolated = mkdtempSync(join(tmpdir(), "public-v3-route-"));
    try {
      mkdirSync(join(isolated, "scripts"));
      for (const file of ["public-v3-route.mjs", "public-v3-ci.mjs"]) copyFileSync(join("scripts", file), join(isolated, "scripts", file));
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./scripts/public-v3-route.mjs')"], {
        cwd: isolated, encoding: "utf8", timeout: 10_000, env: { ...process.env },
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    } finally { rmSync(isolated, { recursive: true, force: true }); }
  });

  it("reads both bounded JSON files from the downloaded GitHub artifact ZIP", async () => {
    const { decodePublicEvidenceArchive } = await import(routeModulePath);
    const proof = await fullProof();
    expect(decodePublicEvidenceArchive(zipProof(proof))).toEqual(proof);
    expect(decodePublicEvidenceArchive(zipProof(proof, true))).toEqual(proof);
    expect(() => decodePublicEvidenceArchive(zipProof({ evidence: proof.evidence }))).toThrow(/archive/i);
    expect(() => decodePublicEvidenceArchive(zipProof({ evidence: proof.evidence, pressure: proof.pressure, extra: {} }))).toThrow(/archive/i);
    expect(() => decodePublicEvidenceArchive(Buffer.alloc(2_000_001))).toThrow(/archive/i);
  });

  it("reuses only a verified artifact downloaded through a bounded unauthenticated redirect", async () => {
    const { findEvidence } = await import(routeModulePath);
    const proof = await fullProof();
    const run = { id: 101, head_sha: proofSha, head_branch: "codex/public-event-overview-v3", event: "push", status: "completed", conclusion: "success", path: ".github/workflows/ci.yml",
      repository: { id: 1316699241, full_name: "captDzuL/MiracleTourney" }, head_repository: { id: 1316699241, full_name: "captDzuL/MiracleTourney" } };
    const job = { run_id: 101, name: "Public V3 E2E", head_sha: proofSha, status: "completed", conclusion: "success" };
    const artifact = { id: 501, name: "public-v3-evidence", expired: false, size_in_bytes: 100000, workflow_run: { id: 101, head_sha: proofSha, repository_id: 1316699241 } };
    const signedUrl = "https://productionresultssa0.blob.core.windows.net/actions-results/proof.zip";
    let duplicateArtifact = false;
    const fetchImpl = vi.fn(async (url: string, options?: { headers?: Record<string, string> }) => {
      if (url.includes("/workflows/ci.yml/runs?")) return Response.json({ workflow_runs: [run] });
      if (url.endsWith("/runs/101/jobs?per_page=100")) return Response.json({ jobs: [job] });
      if (url.endsWith("/runs/101/artifacts?per_page=100")) return Response.json({ artifacts: duplicateArtifact ? [artifact, { ...artifact, id: 502 }] : [artifact] });
      if (url.endsWith("/artifacts/501/zip")) return new Response(null, { status: 302, headers: { location: signedUrl } });
      if (url === signedUrl) {
        expect(options?.headers?.Authorization).toBeUndefined();
        return new Response(zipProof(proof));
      }
      throw new Error(`Unexpected test URL ${url}`);
    });
    expect(await findEvidence({ repository: "captDzuL/MiracleTourney", sha: proofSha, token: "synthetic", fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    duplicateArtifact = true;
    expect(await findEvidence({ repository: "captDzuL/MiracleTourney", sha: proofSha, token: "synthetic", fetchImpl })).toBe(false);
    duplicateArtifact = false;
    const badFetch = vi.fn(async (url: string, options?: { headers?: Record<string, string> }) => url === signedUrl
      ? new Response(zipProof({ ...proof, pressure: { ...proof.pressure, status: "failed" } }))
      : fetchImpl(url, options));
    expect(await findEvidence({ repository: "captDzuL/MiracleTourney", sha: proofSha, token: "synthetic", fetchImpl: badFetch })).toBe(false);
  });

  it("binds the homepage route to a separate guarded check without broad runners", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const homepage = workflow.split(/^  public-v3-homepage:/m)[1];
    expect(homepage).toBeDefined();
    expect(homepage).toContain("name: Public V3 Homepage Check");
    expect(homepage).toContain("timeout-minutes: 15");
    expect(homepage).toContain("group: e2e-neon-test-db");
    expect(homepage).toContain("needs.ci-route.outputs.route == 'home'");
    expect(homepage).toContain("uses: ./.github/actions/guarded-public-e2e-env");
    expect(homepage).toContain("node scripts/public-v3-pressure.mjs --homepage-only");
    expect(homepage).toContain("name: public-v3-home-evidence");
    expect(homepage).not.toMatch(/playwright|test:e2e:public-v3|db:seed|db:push|migrate/);
    expect(workflow).toContain("needs.ci-route.outputs.route == 'run' || needs.ci-route.outputs.route == 'verify'");
    expect(workflow).toContain("needs.ci-route.outputs.route == 'full' || needs.ci-route.outputs.route == 'diagnostic'");
  });

  it("shares one guarded public database setup across the full and homepage jobs", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const full = workflow.split(/^  public-v3-e2e:/m)[1].split(/^  public-v3-homepage:/m)[0];
    const home = workflow.split(/^  public-v3-homepage:/m)[1];
    const setup = "uses: ./.github/actions/guarded-public-e2e-env";
    expect(full).toContain(setup);
    expect(home).toContain(setup);
    expect((workflow.match(/uses: \.\/\.github\/actions\/guarded-public-e2e-env/g) ?? [])).toHaveLength(2);
    expect(full).not.toContain("printf 'DATABASE_URL");
    expect(home).not.toContain("printf 'DATABASE_URL");
    const action = readFileSync(".github/actions/guarded-public-e2e-env/action.yml", "utf8");
    expect(action).toContain("E2E_DATABASE_RESET_ALLOWED=false");
    expect(action).toContain("::add-mask::");
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
  it("collects only fixed featured stage/class lines with bounded finite aggregates", async () => {
    const { createFeaturedTraceCollector } = await import(pressureModulePath);
    const collector = createFeaturedTraceCollector();
    collector.consume("[public-v3-featured] stage=transaction_start ms=12\n[public-v3-fea");
    collector.consume("tured] failure stage=event_read_start class=pool_timeout ms=15\n");
    collector.consume("[public-v3-featured] failure stage=unknown_stage class=pool_timeout ms=9\n");
    collector.consume("[public-v3-featured] failure stage=event_read_start class=secret_code ms=9\n");
    collector.consume("[public-v3-featured] failure stage=event_read_start class=pool_timeout ms=100000\n");
    collector.consume("[public-v3-featured] failure stage=event_read_start class=pool_timeout ms=NaN\n");
    collector.consume("secret=do-not-retain\n" + "x".repeat(4100) + "[public-v3-featured] stage=reader_done ms=1\n");
    expect(collector.snapshot()).toEqual({
      stageCounts: { transaction_start: 1 }, failureCounts: { "event_read_start:pool_timeout": 1 },
      maxDurationMs: { transaction_start: 12, event_read_start: 15 },
    });
    for (let index = 0; index < 10_002; index += 1) collector.consume("[public-v3-featured] stage=transaction_start ms=99999\n");
    expect(collector.snapshot()).toEqual({
      stageCounts: { transaction_start: 10_000 }, failureCounts: { "event_read_start:pool_timeout": 1 },
      maxDurationMs: { transaction_start: 99_999, event_read_start: 15 },
    });
    expect(JSON.stringify(collector.snapshot())).not.toContain("secret");
  });

  it("serializes featured diagnostics only in homepage mode without changing failed content", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const stdout = new EventEmitter();
    const server = { pid: 123, exitCode: null, stdout, stderr: new EventEmitter() };
    const writeEvidence = vi.fn();
    const options = { loadEnvironment: vi.fn(), checkFixtures: vi.fn(), build: vi.fn(), startServer: () => {
      queueMicrotask(() => stdout.emit("data", "[public-v3-featured] failure stage=event_read_start class=pool_timeout ms=14\nprivate=do-not-retain\n"));
      return server;
    },
      stopServer: vi.fn(), writeEvidence, traceDrainMs: 0,
      fetchImpl: async (url: string) => url.endsWith("/id/login")
        ? { status: 200, body: { cancel: async () => undefined } }
        : { status: 200, text: async () => "<main role='alert'>Unavailable</main>" },
      scenarios: [{ path: "/id", requests: 1, concurrency: 1, p95Ms: 3000, public: true, expected: "featured-event", statuses: [200] }],
    };
    await expect(runPublicPressure({ ...options, mode: "homepage-only" })).rejects.toThrow(/Warm/);
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", failure: { kind: "content" },
      featuredTrace: { failureCounts: { "event_read_start:pool_timeout": 1 }, maxDurationMs: { event_read_start: 14 } } });
    expect(JSON.stringify(writeEvidence.mock.calls[0][0])).not.toContain("do-not-retain");

    writeEvidence.mockClear();
    await expect(runPublicPressure({ ...options, mode: "production-like", env: { PUBLIC_V3_HOME_DISCOVERY_TRACE: "1" } })).rejects.toThrow(/Warm/);
    expect(writeEvidence.mock.calls[0][0]).not.toHaveProperty("featuredTrace");
  });
  const homeScenarios = ["/id", "/en"].map((path) => ({ path, requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200] }));
  const measuredResult = (scenario: { path: string; requests: number; concurrency: number }, p95Ms = 500, overrides = {}) => ({
    path: scenario.path, requests: scenario.requests, completed: scenario.requests, concurrency: scenario.concurrency,
    statusCounts: { 200: scenario.requests }, p95Ms, maxMs: p95Ms, failures: 0, failureKinds: [], passed: p95Ms < 3000,
    ...overrides,
  });
  const initialResult = (scenario: { path: string }, initialLatencyMs = 500, overrides = {}) => ({
    path: scenario.path, requests: 1, completed: 1, concurrency: 1,
    statusCounts: { 200: 1 }, initialLatencyMs, maxMs: initialLatencyMs,
    failures: 0, failureKinds: [], passed: true, ...overrides,
  });

  it("accepts slow initial samples for both locales as recorded warnings while requiring both measured loads", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const server = { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() };
    const writeEvidence = vi.fn();
    const visited: string[] = [];
    const saved = await runPublicPressure({ scenarios: homeScenarios, loadEnvironment: vi.fn(), checkFixtures: vi.fn(),
      build: vi.fn(), startServer: () => server, stopServer: vi.fn(), writeEvidence,
      measure: async (scenario: { path: string; requests: number; concurrency: number }) => {
        visited.push(`${scenario.requests === 1 ? "initial" : "load"}-${scenario.path}`);
        return scenario.requests === 1 ? initialResult(scenario, scenario.path === "/id" ? 4082 : 3000) : measuredResult(scenario, 700);
      },
      fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }),
    });
    expect(visited).toEqual(["initial-/id", "initial-/en", "load-/id", "load-/en"]);
    expect(saved).toMatchObject({ policy: "initial-warning-load-strict-v1", status: "passed",
      initialLatencyWarnings: [
        { path: "/id", latencyMs: 4082, thresholdMs: 3000 },
        { path: "/en", latencyMs: 3000, thresholdMs: 3000 },
      ],
      warmups: [{ path: "/id", initialLatencyMs: 4082 }, { path: "/en", initialLatencyMs: 3000 }],
      scenarios: [{ path: "/id", requests: 40, completed: 40, p95Ms: 700, failures: 0 },
        { path: "/en", requests: 40, completed: 40, p95Ms: 700, failures: 0 }],
    });
    expect(saved.warmups[0]).not.toHaveProperty("p95Ms");
    expect(writeEvidence).toHaveBeenCalledWith(saved);
  });

  it("stops on initial HTTP/content/request/timeout failures and persists failed evidence", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    for (const [kind, overrides] of [
      ["status", { statusCounts: { 500: 1 }, failures: 1, failureKinds: ["status"], passed: false }],
      ["content", { failures: 1, failureKinds: ["content"], passed: false }],
      ["request", { completed: 0, statusCounts: {}, initialLatencyMs: null, maxMs: 0, failures: 1, failureKinds: ["request"], passed: false }],
      ["timeout", { completed: 0, statusCounts: {}, initialLatencyMs: null, maxMs: 0, failures: 1, failureKinds: ["timeout"], passed: false }],
    ] as const) {
      const server = { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() };
      const writeEvidence = vi.fn();
      const measure = vi.fn(async (scenario: { path: string }) => initialResult(scenario, 4082, overrides));
      await expect(runPublicPressure({ scenarios: homeScenarios, loadEnvironment: vi.fn(), checkFixtures: vi.fn(),
        build: vi.fn(), startServer: () => server, stopServer: vi.fn(), writeEvidence, measure,
        fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }),
      })).rejects.toThrow(/Warm/);
      expect(measure, kind).toHaveBeenCalledTimes(1);
      expect(writeEvidence.mock.calls[0][0], kind).toMatchObject({ status: "failed", policy: "initial-warning-load-strict-v1",
        failure: { kind, stage: "warmup", path: "/id" }, initialLatencyWarnings: [] });
    }
  });

  it("keeps measured p95 at the 3000ms boundary and measured failures fatal after initial warnings", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    for (const [kind, overrides] of [
      ["latency", { p95Ms: 3000, maxMs: 3000, passed: false }],
      ["content", { failures: 1, failureKinds: ["content"], passed: false }],
      ["request", { completed: 39, statusCounts: { 200: 39 }, failures: 1, failureKinds: ["request"], passed: false }],
    ] as const) {
      const server = { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() };
      const writeEvidence = vi.fn();
      const measure = vi.fn(async (scenario: { path: string; requests: number; concurrency: number }) => scenario.requests === 1
        ? initialResult(scenario, scenario.path === "/id" ? 4082 : 500) : measuredResult(scenario, 500, overrides));
      await expect(runPublicPressure({ scenarios: homeScenarios, loadEnvironment: vi.fn(), checkFixtures: vi.fn(),
        build: vi.fn(), startServer: () => server, stopServer: vi.fn(), writeEvidence, measure,
        fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }),
      })).rejects.toThrow(/Pressure/);
      expect(measure, kind).toHaveBeenCalledTimes(3);
      expect(writeEvidence.mock.calls[0][0], kind).toMatchObject({ status: "failed",
        failure: { kind, stage: "measured", path: "/id" },
        initialLatencyWarnings: [{ path: "/id", latencyMs: 4082, thresholdMs: 3000 }],
        scenarios: [{ path: "/id", requests: 40, failures: kind === "latency" ? 0 : 1 }],
      });
    }
  });

  it("collects both locale initial samples and loads after a cold latency warning", async () => {
    const { runPressureScenarios } = await import(pressureModulePath);
    const calls: string[] = [];
    const warmups: unknown[] = [];
    const loads: unknown[] = [];
    const warnings: unknown[] = [];
    await runPressureScenarios(homeScenarios, {
      measure: async (scenario: { path: string; requests: number; concurrency: number }) => {
        calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
        return scenario.requests === 1 ? initialResult(scenario, scenario.path === "/id" ? 4082 : 500) : measuredResult(scenario);
      },
      onWarm: (result: unknown) => warmups.push(result), onMeasured: (result: unknown) => loads.push(result),
      onInitialWarning: (warning: unknown) => warnings.push(warning),
    });
    expect(calls).toEqual(["warm-/id", "warm-/en", "load-/id", "load-/en"]);
    expect(warmups).toHaveLength(2);
    expect(loads).toHaveLength(2);
    expect(warmups[0]).toMatchObject({ path: "/id", passed: true, initialLatencyMs: 4082 });
    expect(warnings).toEqual([{ path: "/id", latencyMs: 4082, thresholdMs: 3000 }]);
  });

  it("stops on measured latency and every unsafe or invalid initial result", async () => {
    const { runPressureScenarios } = await import(pressureModulePath);
    const calls: string[] = [];
    await expect(runPressureScenarios(homeScenarios, {
      measure: async (scenario: { path: string; requests: number; concurrency: number }) => {
        calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
        return scenario.requests === 1 ? initialResult(scenario) : measuredResult(scenario, scenario.path === "/id" ? 3200 : 500);
      },
    })).rejects.toThrow(/Pressure/);
    expect(calls).toEqual(["warm-/id", "warm-/en", "load-/id"]);

    const unsafe = [
      { failureKinds: ["content"], failures: 1 }, { failureKinds: ["status"], failures: 1, statusCounts: { 500: 1 } },
      { failureKinds: ["timeout"], failures: 1, completed: 0, statusCounts: {}, initialLatencyMs: null, maxMs: 0 },
      { failureKinds: ["request"], failures: 1, completed: 0, statusCounts: {}, initialLatencyMs: null, maxMs: 0 },
      { completed: 0 }, { initialLatencyMs: Number.NaN }, { maxMs: Number.POSITIVE_INFINITY },
      { initialLatencyMs: 500, passed: false }, { p95Ms: 500 }, { failureKinds: ["unknown"], failures: 1 },
    ];
    for (const overrides of unsafe) {
      const visited: string[] = [];
      await expect(runPressureScenarios(homeScenarios, {
        measure: async (scenario: { path: string; requests: number; concurrency: number }) => {
          visited.push(scenario.path);
          return initialResult(scenario, 4082, { passed: false, ...overrides });
        },
      })).rejects.toThrow();
      expect(visited, JSON.stringify(overrides)).toEqual(["/id"]);
    }
  });

  it("stops after a later content failure while preserving an earlier initial warning", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const server = { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() };
    const writeEvidence = vi.fn();
    const measure = vi.fn(async (scenario: { path: string; requests: number; concurrency: number }) =>
      scenario.requests === 1 ? initialResult(scenario, scenario.path === "/id" ? 4082 : 500,
        scenario.path === "/en" ? { failures: 1, failureKinds: ["content"], passed: false } : {}) : measuredResult(scenario));
    await expect(runPublicPressure({ mode: "homepage-only", scenarios: homeScenarios, loadEnvironment: vi.fn(), checkFixtures: vi.fn(),
      build: vi.fn(), startServer: () => server, stopServer: vi.fn(), writeEvidence, measure,
      fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }),
    })).rejects.toThrow(/Warm/);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", failure: { kind: "content", stage: "warmup", path: "/en" },
      initialLatencyWarnings: [{ path: "/id", latencyMs: 4082, thresholdMs: 3000 }] });
    expect(writeEvidence.mock.calls[0][0].warmups[1]).toMatchObject({ path: "/en", failureKinds: ["content"] });
    expect(writeEvidence.mock.calls[0][0].scenarios).toEqual([]);
  });

  it("keeps a passing homepage artifact passed when every cold and measured gate passes", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const server = { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() };
    const writeEvidence = vi.fn();
    const saved = await runPublicPressure({ mode: "homepage-only", scenarios: homeScenarios, loadEnvironment: vi.fn(), checkFixtures: vi.fn(),
      build: vi.fn(), startServer: () => server, stopServer: vi.fn(), writeEvidence,
      measure: async (scenario: { path: string; requests: number; concurrency: number }) => scenario.requests === 1
        ? initialResult(scenario, scenario.path === "/id" ? 4082 : 500) : measuredResult(scenario),
      fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }),
    });
    expect(saved).toMatchObject({ status: "passed", warmups: [{ path: "/id", passed: true }, { path: "/en", passed: true }],
      scenarios: [{ path: "/id", passed: true }, { path: "/en", passed: true }],
      initialLatencyWarnings: [{ path: "/id", latencyMs: 4082, thresholdMs: 3000 }] });
    expect(saved).not.toHaveProperty("failure");
    expect(writeEvidence).toHaveBeenCalledWith(saved);
  });
  it("collects only allowlisted discovery stages and numeric durations across stream chunks", async () => {
    const { createDiscoveryTraceCollector } = await import(pressureModulePath);
    const collector = createDiscoveryTraceCollector();
    collector.consume("[public-v3-discovery] connect-start\n[public-v3-disc");
    collector.consume("overy] connect-done ms=123\nsecret=do-not-retain\n[public-v3-discovery] query-start\n");
    collector.consume("[public-v3-discovery] query-done ms=8\n[public-v3-discovery] map-done ms=1\n");
    expect(collector.snapshot()).toEqual({
      stageCounts: { "connect-start": 1, "connect-done": 1, "query-start": 1, "query-done": 1, "map-done": 1 },
      maxDurationMs: { "connect-done": 123, "query-done": 8, "map-done": 1 },
    });
  });
  it("caps repeated discovery stage counts at 10,000", async () => {
    const { createDiscoveryTraceCollector } = await import(pressureModulePath);
    const collector = createDiscoveryTraceCollector();
    for (let index = 0; index < 10_002; index += 1) collector.consume("[public-v3-discovery] query-start\n");
    expect(collector.snapshot().stageCounts).toEqual({ "query-start": 10_000 });
  });
  it("normalizes diagnostic drain input to finite milliseconds within three seconds", async () => {
    const { boundedTraceDrainMs } = await import(pressureModulePath);
    expect(boundedTraceDrainMs(10)).toBe(10);
    expect(boundedTraceDrainMs(4_000)).toBe(3_000);
    expect(boundedTraceDrainMs(-1)).toBe(0);
    expect(boundedTraceDrainMs(Number.NaN)).toBe(0);
    expect(boundedTraceDrainMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it("selects only both localized homepages for a bounded diagnostic CLI", async () => {
    const { pressureOptionsForArgs } = await import(pressureModulePath);
    const focused = pressureOptionsForArgs(["--homepage-only"]);
    expect(focused.mode).toBe("homepage-only");
    expect(focused.scenarios.map((scenario: { path: string }) => scenario.path)).toEqual(["/id", "/en"]);
    expect(() => pressureOptionsForArgs(["--home"])).toThrow(/Unknown pressure option/);
    expect(() => pressureOptionsForArgs(["--homepage-only", "--other"])).toThrow(/Unknown pressure option/);
    expect(pressureOptionsForArgs([]).scenarios).toHaveLength(11);
  });
  it("rejects unknown CLI input before loading an environment or starting a server", () => {
    const result = spawnSync(process.execPath, ["scripts/public-v3-pressure.mjs", "--unknown"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("[public-v3-pressure] Failed; inspect scrubbed pressure evidence when available.");
  });
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
  it("forces discovery tracing off when ordinary pressure inherits a trace flag", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    let serverEnv: Record<string, string> = {};
    const server = { pid: 123, exitCode: null, stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
    await runPublicPressure({ env: { PUBLIC_V3_HOME_DISCOVERY_TRACE: "1" }, loadEnvironment: vi.fn(), checkFixtures: vi.fn(), build: vi.fn(),
      startServer: (_file: string, _args: string[], options: { env: Record<string, string> }) => { serverEnv = options.env; return server; },
      stopServer: vi.fn(), writeEvidence: vi.fn(),
      fetchImpl: async () => ({ status: 200, body: { cancel: async () => undefined } }), scenarios: [],
    });
    expect(serverEnv.PUBLIC_V3_HOME_DISCOVERY_TRACE).toBe("0");
  });
  it("writes only safe stage evidence for a failed homepage warmup", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const server = { pid: 123, exitCode: null, stdout, stderr };
    const writeEvidence = vi.fn();
    let serverEnv: Record<string, string> = {};
    const fetchImpl = vi.fn(async (url: string) => url.endsWith("/id/login")
      ? { status: 200, body: { cancel: async () => undefined } }
      : { status: 200, text: async () => "<main role='alert'>Unavailable</main>" });
    await expect(runPublicPressure({ mode: "homepage-only", loadEnvironment: vi.fn(), checkFixtures: vi.fn(), build: vi.fn(),
      startServer: (_file: string, _args: string[], options: { env: Record<string, string> }) => {
        serverEnv = options.env;
        queueMicrotask(() => stdout.emit("data", "[public-v3-discovery] connect-done ms=123\nsecret=do-not-retain\n"));
        return server;
      },
      stopServer: vi.fn(), writeEvidence, fetchImpl, traceDrainMs: 0,
      scenarios: [{ path: "/id", requests: 1, concurrency: 1, p95Ms: 3000, public: true, expected: "data-public-v3", statuses: [200] }],
    })).rejects.toThrow(/Warm/);
    expect(serverEnv.PUBLIC_V3_HOME_DISCOVERY_TRACE).toBe("1");
    const saved = writeEvidence.mock.calls[0][0];
    expect(saved).toMatchObject({ failure: { kind: "content", stage: "warmup", path: "/id" },
      discoveryTrace: { stageCounts: { "connect-done": 1 }, maxDurationMs: { "connect-done": 123 } } });
    expect(JSON.stringify(saved)).not.toContain("do-not-retain");
  });
  it("captures late safe stage completion without turning failed homepage content green", async () => {
    const { runPublicPressure } = await import(pressureModulePath);
    const stdout = new EventEmitter();
    const server = { pid: 123, exitCode: null, stdout, stderr: new EventEmitter() };
    const writeEvidence = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/id/login")) return { status: 200, body: { cancel: async () => undefined } };
      setTimeout(() => stdout.emit("data", "[public-v3-discovery] query-done ms=2123\n"), 1);
      return { status: 200, text: async () => "<main role='alert'>Unavailable</main>" };
    });
    await expect(runPublicPressure({ mode: "homepage-only", loadEnvironment: vi.fn(), checkFixtures: vi.fn(), build: vi.fn(),
      startServer: () => server, stopServer: vi.fn(), writeEvidence, fetchImpl, traceDrainMs: 10,
      scenarios: [{ path: "/id", requests: 1, concurrency: 1, p95Ms: 3000, public: true, expected: "data-public-v3", statuses: [200] }],
    })).rejects.toThrow(/Warm/);
    expect(writeEvidence.mock.calls[0][0]).toMatchObject({ status: "failed", failure: { kind: "content", path: "/id" },
      discoveryTrace: { stageCounts: { "query-done": 1 }, maxDurationMs: { "query-done": 2123 } } });
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

  it("records a single initial request as latency without inventing a p95", async () => {
    const { measureScenario } = await import(pressureModulePath);
    let time = 0;
    const result = await measureScenario({ path: "/id", requests: 1, concurrency: 1, p95Ms: 3000,
      initialSample: true, public: true, expected: "ok", statuses: [200] }, {
      fetchImpl: async () => ({ status: 200, text: async () => "ok" }), baseUrl: "http://127.0.0.1:3102",
      clock: () => { time += 4082; return time; },
    });
    expect(result).toMatchObject({ path: "/id", requests: 1, completed: 1, initialLatencyMs: 4082,
      statusCounts: { 200: 1 }, failures: 0, passed: true });
    expect(result).not.toHaveProperty("p95Ms");
  });

  it("warms and validates every route before starting measured load", async () => {
    const { runPressureScenarios } = await import(pressureModulePath);
    const calls: string[] = [];
    const measure = vi.fn(async (scenario: { path: string; requests: number; concurrency: number }) => {
      calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
      return scenario.requests === 1 ? initialResult(scenario) : measuredResult(scenario);
    });
    await runPressureScenarios(homeScenarios, { measure });
    expect(calls).toEqual(["warm-/id", "warm-/en", "load-/id", "load-/en"]);
    calls.length = 0;
    await expect(runPressureScenarios(homeScenarios, {
      measure: async (scenario: { path: string; requests: number; concurrency: number }) => {
        calls.push(`${scenario.requests === 1 ? "warm" : "load"}-${scenario.path}`);
        return scenario.requests === 1 ? initialResult(scenario, 500, scenario.path === "/en"
          ? { failures: 1, failureKinds: ["content"], passed: false } : {}) : measuredResult(scenario);
      },
    })).rejects.toThrow(/Warm/);
    expect(calls).toEqual(["warm-/id", "warm-/en"]);
  });
});
