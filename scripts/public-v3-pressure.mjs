import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { loadE2eEnvironment } from "./e2e-env.mjs";
import { checkPublicFixtures } from "./public-v3-fixtures.mjs";

const BUDGET = 3000;
const SLUG = "flashpeak-champions-32";
export const PRESSURE_SCENARIOS = [
  { path: "/id/login", requests: 80, concurrency: 20, p95Ms: BUDGET, statuses: [200] },
  { path: "/api/me", requests: 80, concurrency: 20, p95Ms: BUDGET, statuses: [200] },
  { path: "/id/admin", requests: 40, concurrency: 10, p95Ms: BUDGET, statuses: [200, 307] },
  ...["id", "en"].flatMap((locale) => [
    { path: `/${locale}`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: "mpv3-main", statuses: [200] },
    { path: `/${locale}/events`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: "mpv3-directory", statuses: [200] },
    { path: `/${locale}/events/${SLUG}`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: 'data-public-source="authoritative"', statuses: [200] },
    { path: `/${locale}/events/${SLUG}/bracket`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: "mpv3-bracket-page", statuses: [200] },
  ]),
];

const percentile = (values, percentage) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentage / 100) - 1] ?? 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function measureScenario(scenario, { fetchImpl = fetch, baseUrl, clock = performance.now.bind(performance) }) {
  let next = 0;
  const durations = [];
  const failures = [];
  const statusCounts = {};
  const worker = async () => {
    while (next < scenario.requests) {
      next++;
      const started = clock();
      try {
        const response = await fetchImpl(`${baseUrl}${scenario.path}`, { redirect: "manual" });
        const body = scenario.public ? await response.text() : null;
        const duration = clock() - started;
        durations.push(duration);
        statusCounts[response.status] = (statusCounts[response.status] ?? 0) + 1;
        if (!scenario.public && response.body?.cancel) await response.body.cancel();
        if (!(scenario.statuses ?? [200]).includes(response.status)) failures.push("status");
        if (scenario.public && (!body?.includes(scenario.expected) || /data-public-v3-error|public-visual-v2|data-public-source="compatible"/.test(body))) failures.push("content");
      } catch { failures.push("request"); }
    }
  };
  await Promise.all(Array.from({ length: scenario.concurrency }, worker));
  const p95Ms = percentile(durations, 95);
  return { path: scenario.path, requests: scenario.requests, completed: durations.length, concurrency: scenario.concurrency, statusCounts, p95Ms, maxMs: Math.max(0, ...durations), failures: failures.length, failureKinds: [...new Set(failures)], passed: durations.length === scenario.requests && failures.length === 0 && p95Ms < scenario.p95Ms };
}

export async function runPressureScenarios(scenarios, { measure, onMeasured = () => undefined }) {
  for (const scenario of scenarios) {
    const warm = await measure({ ...scenario, requests: 1, concurrency: 1 });
    if (!warm.passed) throw new Error(`Warm/content preflight failed for ${scenario.path}.`);
  }
  for (const scenario of scenarios) {
    const result = await measure(scenario);
    onMeasured(result);
    if (!result.passed) throw new Error(`Pressure contract failed for ${scenario.path}.`);
  }
}

async function command(args, env, logs) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { logs.push(...String(chunk).split(/\r?\n/).filter(Boolean).map((line) => /error|warn|fail/i.test(line) ? "diagnostic" : "normal")); });
  child.stderr.on("data", (chunk) => { logs.push(...String(chunk).split(/\r?\n/).filter(Boolean).map(() => "stderr")); });
  const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  if (exitCode !== 0) throw new Error(`Next.js ${args[0]} failed with exit ${exitCode}.`);
}

function stopOwnedServer(server) {
  if (!server?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

export async function runPublicPressure({ env = process.env, fetchImpl = fetch, sha = process.env.PUBLIC_V3_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local", now = Date.now } = {}) {
  const evidence = { sha, mode: "production-like", environment: "guarded E2E test database", buildMs: null, scenarios: [], safeServerLogCounts: {}, status: "failed" };
  let server;
  const logs = [];
  try {
    loadE2eEnvironment({ env });
    await checkPublicFixtures({ env });
    const serverEnv = { ...env, NODE_ENV: "production", FEATURE_FLAG_UI_V3_FOUNDATION: "true", FEATURE_FLAG_ORGANIZER_WORKSPACE_V3: "true", FEATURE_FLAG_REGISTRATION_WORKSPACE_V3: "true", FEATURE_FLAG_COMPETITION_OPERATIONS_V3: "true", FEATURE_FLAG_COMPLETION_WORKSPACE_V3: "true", FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3: "true", FEATURE_FLAG_PUBLIC_DISCOVERY_V3: "true", FEATURE_FLAG_PUBLIC_VISUAL_V2: "false" };
    const port = "3102";
    const baseUrl = `http://127.0.0.1:${port}`;
    const buildStart = now();
    await command(["build"], serverEnv, logs);
    evidence.buildMs = now() - buildStart;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { logs.push(...String(chunk).split(/\r?\n/).filter(Boolean).map((line) => /error|warn|fail/i.test(line) ? "diagnostic" : "normal")); });
    server.stderr.on("data", (chunk) => { logs.push(...String(chunk).split(/\r?\n/).filter(Boolean).map(() => "stderr")); });
    const deadline = now() + 45_000;
    let ready = false;
    while (now() < deadline && server.exitCode === null) {
      try { const response = await fetchImpl(`${baseUrl}/id/login`, { redirect: "manual" }); await response.body?.cancel(); if (response.status === 200) { ready = true; break; } }
      catch { /* bounded readiness wait */ }
      await sleep(500);
    }
    if (!ready) throw new Error("Owned production server did not become ready.");
    await runPressureScenarios(PRESSURE_SCENARIOS, {
      measure: (scenario) => measureScenario(scenario, { fetchImpl, baseUrl }),
      onMeasured: (result) => evidence.scenarios.push(result),
    });
    evidence.status = "passed";
    return evidence;
  } finally {
    stopOwnedServer(server);
    evidence.safeServerLogCounts = { normal: logs.filter((value) => value === "normal").length, diagnostic: logs.filter((value) => value === "diagnostic").length, stderr: logs.filter((value) => value === "stderr").length };
    await mkdir("test-results/public-v3", { recursive: true });
    await writeFile("test-results/public-v3/pressure.json", JSON.stringify(evidence, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runPublicPressure(); }
  catch (error) { console.error(`[public-v3-pressure] ${error instanceof Error ? error.message : "Failed."}`); process.exitCode = 1; }
}
