import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { loadE2eEnvironment } from "./e2e-env.mjs";
import { checkPublicFixtures } from "./public-v3-fixtures.mjs";

const BUDGET = 3000;
const REQUEST_DEADLINE_MS = 10_000;
const SLUG = "flashpeak-champions-32";
export const PRESSURE_SCENARIOS = [
  { path: "/id/login", requests: 80, concurrency: 20, p95Ms: BUDGET, statuses: [200] },
  { path: "/api/me", requests: 80, concurrency: 20, p95Ms: BUDGET, statuses: [200] },
  { path: "/id/admin", requests: 40, concurrency: 10, p95Ms: BUDGET, statuses: [200, 307] },
  ...["id", "en"].flatMap((locale) => [
    { path: `/${locale}`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: ["mpv3-homepage", "data-featured-event=", `href="/${locale}/events/${SLUG}"`], expectedIds: ["home-shell", "featured-event", "fixture-link"], statuses: [200] },
    { path: `/${locale}/events`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: ["mpv3-directory", "mpv3-directory-card", `href="/${locale}/events/${SLUG}"`], statuses: [200] },
    { path: `/${locale}/events/${SLUG}`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: ['data-public-source="authoritative"', "Flashpeak Champions 32"], statuses: [200] },
    { path: `/${locale}/events/${SLUG}/bracket`, requests: 40, concurrency: 10, p95Ms: BUDGET, public: true, expected: ["mpv3-bracket-page", 'id="adaptive-bracket-heading"', "Flashpeak Champions 32"], statuses: [200] },
  ]),
];

export function pressureOptionsForArgs(args) {
  if (args.length === 0) return { scenarios: PRESSURE_SCENARIOS, mode: "production-like" };
  if (args.length === 1 && args[0] === "--homepage-only") return { scenarios: PRESSURE_SCENARIOS.filter(({ path }) => path === "/id" || path === "/en"), mode: "homepage-only" };
  throw new Error("Unknown pressure option.");
}

const percentile = (values, percentage) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentage / 100) - 1] ?? 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const boundedTraceDrainMs = (value) => Number.isFinite(value) ? Math.min(3_000, Math.max(0, Math.floor(value))) : 0;

export function createDiscoveryTraceCollector() {
  const stageCounts = {};
  const maxDurationMs = {};
  let pending = "";
  const stages = new Set(["load-start", "load-done", "load-timeout", "load-error", "connect-start", "connect-done", "connect-error", "query-start", "query-done", "map-done"]);
  return {
    consume(chunk) {
      pending = (pending + String(chunk)).slice(-4096);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^\[public-v3-discovery\] ([a-z-]+)(?: ms=(\d{1,5}))?$/.exec(line);
        if (!match || !stages.has(match[1])) continue;
        const stage = match[1];
        // Cap evidence counters below the safe-integer limit even for noisy server output.
        stageCounts[stage] = Math.min(10_000, (stageCounts[stage] ?? 0) + 1);
        if (match[2] !== undefined) maxDurationMs[stage] = Math.max(maxDurationMs[stage] ?? 0, Number(match[2]));
      }
    },
    snapshot() { return { stageCounts: { ...stageCounts }, maxDurationMs: { ...maxDurationMs } }; },
  };
}

export function createFeaturedTraceCollector() {
  const stages = new Set(["reader_await", "identity_check", "reader_start", "transaction_start", "transaction_enter",
    "event_read_start", "event_read_done", "revision_read_start", "revision_read_done", "projection_start", "projection_done",
    "callback_done", "transaction_done", "transaction_after_callback", "fallback_start", "fallback_done", "reader_done"]);
  const errorClasses = new Set(["transaction_error", "pool_timeout", "connection_error", "transaction_conflict",
    "validation_error", "projection_error", "unknown_error"]);
  const stageCounts = {};
  const failureCounts = {};
  const maxDurationMs = {};
  let pending = "";
  let discard = false;
  const collect = (line) => {
    const stage = /^\[public-v3-featured\] stage=([a-z_]+) ms=(0|[1-9]\d{0,4})$/.exec(line);
    const failure = /^\[public-v3-featured\] failure stage=([a-z_]+) class=([a-z_]+) ms=(0|[1-9]\d{0,4})$/.exec(line);
    if (stage && stages.has(stage[1])) {
      stageCounts[stage[1]] = Math.min(10_000, (stageCounts[stage[1]] ?? 0) + 1);
      maxDurationMs[stage[1]] = Math.max(maxDurationMs[stage[1]] ?? 0, Number(stage[2]));
    } else if (failure && stages.has(failure[1]) && errorClasses.has(failure[2])) {
      const key = `${failure[1]}:${failure[2]}`;
      failureCounts[key] = Math.min(10_000, (failureCounts[key] ?? 0) + 1);
      maxDurationMs[failure[1]] = Math.max(maxDurationMs[failure[1]] ?? 0, Number(failure[3]));
    }
  };
  return {
    consume(chunk) {
      const parts = String(chunk).split("\n");
      for (let index = 0; index < parts.length; index += 1) {
        const complete = index < parts.length - 1;
        const combinedLength = pending.length + parts[index].length;
        if (combinedLength > 4_096) discard = true;
        if (complete) {
          if (!discard) collect((pending + parts[index]).replace(/\r$/, ""));
          pending = "";
          discard = false;
        } else if (!discard) pending += parts[index];
        else pending = "";
      }
    },
    snapshot() { return { stageCounts: { ...stageCounts }, failureCounts: { ...failureCounts }, maxDurationMs: { ...maxDurationMs } }; },
  };
}

async function boundedFetch(fetchImpl, url, { publicBody, timeoutMs }) {
  const controller = new AbortController();
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error("Request deadline exceeded.");
      error.kind = "timeout";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { redirect: "manual", signal: controller.signal });
        const body = publicBody ? await response.text() : null;
        if (!publicBody) void Promise.resolve(response.body?.cancel?.()).catch(() => undefined);
        return { response, body };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function measureScenario(scenario, { fetchImpl = fetch, baseUrl, clock = performance.now.bind(performance), timeoutMs = REQUEST_DEADLINE_MS }) {
  let next = 0;
  const durations = [];
  const failures = [];
  const statusCounts = {};
  const missingMarkerCounts = {};
  const detectedMarkerCounts = {};
  const sourceCounts = {};
  const discoveryStateCounts = {};
  const featuredStateCounts = {};
  const rejectedMarkers = [
    ["public-v3-error", /data-public-v3-error/],
    ["public-visual-v2", /public-visual-v2/],
    ["compatible-source", /data-public-source="compatible"/],
    ["alert", /role="alert"/],
  ];
  const worker = async () => {
    while (next < scenario.requests) {
      next++;
      const started = clock();
      try {
        const { response, body } = await boundedFetch(fetchImpl, `${baseUrl}${scenario.path}`, { publicBody: scenario.public, timeoutMs });
        const duration = clock() - started;
        durations.push(duration);
        statusCounts[response.status] = (statusCounts[response.status] ?? 0) + 1;
        if (!(scenario.statuses ?? [200]).includes(response.status)) failures.push("status");
        const expected = Array.isArray(scenario.expected) ? scenario.expected : [scenario.expected];
        if (scenario.public) {
          const missing = expected.flatMap((marker, index) => body?.includes(marker) ? [] : [scenario.expectedIds?.[index] ?? `marker-${index + 1}`]);
          const detected = rejectedMarkers.flatMap(([id, pattern]) => pattern.test(body) ? [id] : []);
          if (missing.length || detected.length) {
            failures.push("content");
            for (const id of missing) missingMarkerCounts[id] = (missingMarkerCounts[id] ?? 0) + 1;
            for (const id of detected) detectedMarkerCounts[id] = (detectedMarkerCounts[id] ?? 0) + 1;
            const source = /data-public-source="authoritative"/.test(body) ? "authoritative" : /data-public-source="compatible"/.test(body) ? "compatible" : "absent";
            sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
            const discoveryState = /data-public-home-discovery="(ready|timeout|read_failure)"/.exec(body)?.[1] ?? "absent";
            const featuredState = /data-public-home-featured="(none|ready|unavailable|read_failure|mismatch)"/.exec(body)?.[1] ?? "absent";
            discoveryStateCounts[discoveryState] = (discoveryStateCounts[discoveryState] ?? 0) + 1;
            featuredStateCounts[featuredState] = (featuredStateCounts[featuredState] ?? 0) + 1;
          }
        }
      } catch (error) { failures.push(error?.kind === "timeout" ? "timeout" : "request"); }
    }
  };
  await Promise.all(Array.from({ length: scenario.concurrency }, worker));
  const p95Ms = percentile(durations, 95);
  return { path: scenario.path, requests: scenario.requests, completed: durations.length, concurrency: scenario.concurrency, statusCounts, p95Ms, maxMs: Math.max(0, ...durations), failures: failures.length, failureKinds: [...new Set(failures)], ...(Object.keys(sourceCounts).length ? { contentDiagnostics: { missingMarkerCounts, detectedMarkerCounts, sourceCounts, discoveryStateCounts, featuredStateCounts } } : {}), passed: durations.length === scenario.requests && failures.length === 0 && p95Ms < scenario.p95Ms };
}

function validPressureResult(scenario, result) {
  if (!result || result.path !== scenario.path || result.requests !== scenario.requests || result.concurrency !== scenario.concurrency
    || !Number.isInteger(result.completed) || result.completed < 0 || result.completed > scenario.requests
    || !Number.isInteger(result.failures) || result.failures < 0 || !Array.isArray(result.failureKinds)
    || !Number.isFinite(result.p95Ms) || result.p95Ms < 0 || !Number.isFinite(result.maxMs) || result.maxMs < result.p95Ms
    || typeof result.passed !== "boolean" || !result.statusCounts || typeof result.statusCounts !== "object") return false;
  const counts = Object.entries(result.statusCounts);
  return counts.every(([status, count]) => (scenario.statuses ?? [200]).includes(Number(status)) && Number.isInteger(count) && count >= 0)
    && counts.reduce((total, [, count]) => total + count, 0) === result.completed
    && result.passed === (result.completed === scenario.requests && result.failures === 0
      && result.failureKinds.length === 0 && result.p95Ms < scenario.p95Ms);
}

function latencyOnlyFailure(scenario, result) {
  return (scenario.path === "/id" || scenario.path === "/en") && Number.isFinite(scenario.p95Ms) && scenario.p95Ms > 0
    && validPressureResult(scenario, result) && result.completed === scenario.requests && result.failures === 0
    && result.failureKinds.length === 0 && result.passed === false && result.p95Ms >= scenario.p95Ms;
}

export async function runPressureScenarios(scenarios, { measure, onWarm = () => undefined, onMeasured = () => undefined,
  onStage = () => undefined, onRetainedFailure = () => undefined, collectLatencyOnly = false }) {
  let retainedLatency = false;
  for (const scenario of scenarios) {
    onStage("warmup", scenario.path);
    const warm = await measure({ ...scenario, requests: 1, concurrency: 1 });
    onWarm(warm);
    if (collectLatencyOnly && !validPressureResult({ ...scenario, requests: 1, concurrency: 1 }, warm)) throw new Error(`Invalid pressure result for ${scenario.path}.`);
    if (!warm.passed) {
      if (!collectLatencyOnly || !latencyOnlyFailure({ ...scenario, requests: 1, concurrency: 1 }, warm)) throw new Error(`Warm/content preflight failed for ${scenario.path}.`);
      if (!retainedLatency) onRetainedFailure({ kind: "latency", stage: "warmup", path: scenario.path });
      retainedLatency = true;
    }
  }
  for (const scenario of scenarios) {
    onStage("measured", scenario.path);
    const result = await measure(scenario);
    onMeasured(result);
    if (collectLatencyOnly && !validPressureResult(scenario, result)) throw new Error(`Invalid pressure result for ${scenario.path}.`);
    if (!result.passed) {
      if (!collectLatencyOnly || !latencyOnlyFailure(scenario, result)) throw new Error(`Pressure contract failed for ${scenario.path}.`);
      if (!retainedLatency) onRetainedFailure({ kind: "latency", stage: "measured", path: scenario.path });
      retainedLatency = true;
    }
  }
  if (retainedLatency) throw new Error("Homepage latency contract failed.");
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

export async function runPublicPressure({ env = process.env, fetchImpl = fetch, sha = process.env.PUBLIC_V3_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local", now = Date.now, mode = "production-like",
  loadEnvironment = loadE2eEnvironment, checkFixtures = checkPublicFixtures, build = command, startServer = spawn, stopServer = stopOwnedServer,
  writeEvidence = async (value) => { await mkdir("test-results/public-v3", { recursive: true }); await writeFile("test-results/public-v3/pressure.json", JSON.stringify(value, null, 2)); },
  scenarios = PRESSURE_SCENARIOS, timeoutMs = REQUEST_DEADLINE_MS, traceDrainMs = 3_000, measure = measureScenario,
} = {}) {
  const evidence = { sha, mode, environment: "guarded E2E test database", buildMs: null, warmups: [], scenarios: [], safeServerLogCounts: {}, status: "failed" };
  let server;
  let stage = "environment";
  let route = null;
  const startedAt = now();
  const logs = [];
  const discoveryTrace = createDiscoveryTraceCollector();
  const featuredTrace = createFeaturedTraceCollector();
  try {
    loadEnvironment({ env });
    stage = "fixtures";
    await checkFixtures({ env });
    const serverEnv = { ...env, NODE_ENV: "production", FEATURE_FLAG_UI_V3_FOUNDATION: "true", FEATURE_FLAG_ORGANIZER_WORKSPACE_V3: "true", FEATURE_FLAG_REGISTRATION_WORKSPACE_V3: "true", FEATURE_FLAG_COMPETITION_OPERATIONS_V3: "true", FEATURE_FLAG_COMPLETION_WORKSPACE_V3: "true", FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3: "true", FEATURE_FLAG_PUBLIC_DISCOVERY_V3: "true", FEATURE_FLAG_PUBLIC_VISUAL_V2: "false", PUBLIC_V3_HOME_DISCOVERY_TRACE: mode === "homepage-only" ? "1" : "0" };
    const port = "3102";
    const baseUrl = `http://127.0.0.1:${port}`;
    const buildStart = now();
    stage = "build";
    await build(["build"], serverEnv, logs);
    evidence.buildMs = now() - buildStart;
    stage = "readiness";
    server = startServer(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { const output = String(chunk); logs.push(...output.split(/\r?\n/).filter(Boolean).map((line) => /error|warn|fail/i.test(line) ? "diagnostic" : "normal")); if (mode === "homepage-only") { discoveryTrace.consume(output); featuredTrace.consume(output); } });
    server.stderr.on("data", (chunk) => { logs.push(...String(chunk).split(/\r?\n/).filter(Boolean).map(() => "stderr")); });
    const deadline = now() + 45_000;
    let ready = false;
    while (now() < deadline && server.exitCode === null) {
      try { const { response } = await boundedFetch(fetchImpl, `${baseUrl}/id/login`, { publicBody: false, timeoutMs }); if (response.status === 200) { ready = true; break; } }
      catch { /* bounded readiness wait */ }
      await sleep(500);
    }
    if (!ready) throw new Error("Owned production server did not become ready.");
    await runPressureScenarios(scenarios, {
      measure: (scenario) => measure(scenario, { fetchImpl, baseUrl, timeoutMs }),
      collectLatencyOnly: mode === "homepage-only",
      onStage: (nextStage, path) => { stage = nextStage; route = path; },
      onWarm: (result) => evidence.warmups.push(result),
      onMeasured: (result) => evidence.scenarios.push(result),
      onRetainedFailure: (failure) => { evidence.failure ??= { ...failure, elapsedMs: now() - startedAt }; },
    });
    evidence.status = "passed";
    return evidence;
  } catch (error) {
    const last = stage === "warmup" ? evidence.warmups.at(-1) : stage === "measured" ? evidence.scenarios.at(-1) : null;
    const scenario = scenarios.find(({ path }) => path === route);
    const invalid = mode === "homepage-only" && scenario && last && !validPressureResult(stage === "warmup" ? { ...scenario, requests: 1, concurrency: 1 } : scenario, last);
    const resultKind = last?.failureKinds?.[0] ?? (last && last.completed !== last.requests ? "incomplete" : invalid ? "invalid_metrics" : last ? "latency" : null);
    evidence.failure ??= { kind: resultKind ?? (stage === "fixtures" ? "fixture" : stage === "readiness" ? "readiness" : stage === "build" ? "build" : "preflight"), stage, path: route, elapsedMs: now() - startedAt };
    throw error;
  } finally {
    const drainMs = boundedTraceDrainMs(traceDrainMs);
    if (mode === "homepage-only" && evidence.failure?.kind === "content" && drainMs > 0) await sleep(drainMs);
    stopServer(server);
    if (mode === "homepage-only") { evidence.discoveryTrace = discoveryTrace.snapshot(); evidence.featuredTrace = featuredTrace.snapshot(); }
    evidence.safeServerLogCounts = { normal: logs.filter((value) => value === "normal").length, diagnostic: logs.filter((value) => value === "diagnostic").length, stderr: logs.filter((value) => value === "stderr").length };
    await writeEvidence(evidence);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runPublicPressure(pressureOptionsForArgs(process.argv.slice(2))); }
  catch { console.error("[public-v3-pressure] Failed; inspect scrubbed pressure evidence when available."); process.exitCode = 1; }
}
