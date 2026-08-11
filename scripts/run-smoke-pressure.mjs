import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const port = process.env.PRESSURE_SMOKE_PORT ?? "3102";
const baseUrl = `http://127.0.0.1:${port}`;
const readyUrl = `${baseUrl}/id/login`;
const isWindows = process.platform === "win32";

const scenarios = [
  { path: "/id/login", requests: 80, concurrency: 20, p95Ms: 8_000 },
  { path: "/api/me", requests: 80, concurrency: 20, p95Ms: 2_000 },
  { path: "/id/admin", requests: 40, concurrency: 10, allowedStatuses: new Set([200, 307]), p95Ms: 8_000 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyUrl);
      if (response.ok) return;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw lastError ?? new Error("Pressure smoke server did not become ready.");
}

function stopServer(server) {
  if (!server.pid) return;

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  server.kill("SIGTERM");
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function runBatch(items, workerCount, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex];
      nextIndex += 1;
      await worker(current);
    }
  });

  await Promise.all(workers);
}

async function runScenario(scenario) {
  const allowedStatuses = scenario.allowedStatuses ?? new Set([200]);
  const durations = [];
  const failures = [];
  const items = Array.from({ length: scenario.requests }, (_, index) => index);

  await runBatch(items, scenario.concurrency, async () => {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}${scenario.path}`, { redirect: "manual" });
      const duration = performance.now() - startedAt;
      durations.push(duration);

      if (!allowedStatuses.has(response.status)) {
        failures.push(`${scenario.path} returned ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      failures.push(`${scenario.path} failed: ${message}`);
    }
  });

  const p95 = percentile(durations, 95);
  const max = Math.max(...durations, 0);

  console.log(
    `[pressure-smoke] ${scenario.path}: requests=${scenario.requests} concurrency=${scenario.concurrency} p95=${Math.round(p95)}ms max=${Math.round(max)}ms failures=${failures.length}`,
  );

  if (failures.length > 0) {
    throw new Error(failures.slice(0, 3).join("; "));
  }

  if (p95 > scenario.p95Ms) {
    throw new Error(`${scenario.path} p95 ${Math.round(p95)}ms exceeded ${scenario.p95Ms}ms.`);
  }
}

async function warmScenario(scenario) {
  const allowedStatuses = scenario.allowedStatuses ?? new Set([200]);
  const response = await fetch(`${baseUrl}${scenario.path}`, { redirect: "manual" });

  if (!allowedStatuses.has(response.status)) {
    throw new Error(`Warm-up for ${scenario.path} returned ${response.status}.`);
  }
}

const server = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", port],
  {
    env: { ...process.env, PRESSURE_SMOKE_PORT: port },
    stdio: "inherit",
  },
);

try {
  await waitForServer();

  for (const scenario of scenarios) {
    await warmScenario(scenario);
    await sleep(250);
    await runScenario(scenario);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Pressure smoke failed.";
  console.error(`[pressure-smoke] FAILED: ${message}`);
  process.exitCode = 1;
} finally {
  stopServer(server);
  process.exit(process.exitCode ?? 0);
}
