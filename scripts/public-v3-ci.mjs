import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BASE_ARGS = ["exec", "playwright", "test"];
const SAFE_ARGS = ["--workers=1", "--retries=0", "--fail-on-flaky-tests"];
const selection = (id, expected, config, files, grep) => ({
  id, expected,
  args: [...BASE_ARGS, ...files, "--config", config, ...SAFE_ARGS, ...(grep ? ["--grep", grep] : [])],
});

export const PUBLIC_PHASES = [
  { id: "db", expected: 35, selections: [
    selection("db-main", 22, "playwright.config.ts", ["tests/e2e/v3-public-discovery.spec.ts", "tests/e2e/v3-adaptive-public-registration.spec.ts", "tests/e2e/v3-public-event-lifecycle.spec.ts", "tests/e2e/v3-published-event-revision.spec.ts", "tests/e2e/locale-switcher.spec.ts"]),
    selection("db-matchday", 6, "playwright.config.ts", ["tests/e2e/v3-matchday.spec.ts"], "official (single_elimination|double_elimination|round_robin|group_playoffs) result advances|public ongoing API hides|public ongoing shows"),
    selection("db-leaderboard", 2, "playwright.config.ts", ["tests/e2e/v3-organizer-lifecycle.spec.ts"], "@task11-public-leaderboard-tail"),
    selection("db-seeded-visit", 1, "playwright.config.ts", ["tests/e2e/public-v3-seeded-events.spec.ts"], "visits registration, drawing, ongoing, and finished authoritative fixtures"),
    selection("db-bracket", 3, "playwright.config.ts", ["tests/e2e/admin-match-results.spec.ts"], "public bracket page"),
    selection("db-order", 1, "playwright.config.ts", ["tests/e2e/overnight-smoke.spec.ts"], "registration order stays private and imports stop after drawing publication"),
  ] },
  { id: "v3", expected: 9, selections: [
    selection("v3-shell", 5, "playwright.smoke.config.ts", ["tests/e2e-smoke/public-shell.smoke.spec.ts"]),
    selection("v3-foundation", 4, "playwright.smoke.config.ts", ["tests/e2e-smoke/v3-foundation.smoke.spec.ts"], "public shell meets|V3 locale buttons are keyboard reachable"),
  ] },
  { id: "v2", expected: 9, selections: [selection("v2-compatibility", 9, "playwright.visual-v2.config.ts", ["tests/e2e-smoke/public-visual-v2.smoke.spec.ts"]) ] },
  { id: "legacy", expected: 1, selections: [selection("legacy-public", 1, "playwright.legacy.config.ts", ["tests/e2e-legacy/matchday-flags-off.spec.ts"], "flags off preserve legacy public rendering and deny V3 APIs") ] },
];

export function parseListCount(output) {
  const match = output.match(/Total:\s*(\d+)\s+tests?\s+in\s+\d+\s+files?/);
  if (!match) throw new Error("Playwright selection list has no trustworthy total.");
  return Number(match[1]);
}

function selectedCases(report) {
  if (!Array.isArray(report?.suites)) throw new Error("Selection manifest is missing suites.");
  const cases = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (typeof spec.id !== "string" || typeof spec.title !== "string" || typeof spec.file !== "string" || !Number.isInteger(spec.line) || !Number.isInteger(spec.column)) throw new Error("Selection manifest has incomplete cases.");
      cases.push({ id: spec.id, file: spec.file.replaceAll("\\", "/").split("/").at(-1), line: spec.line, column: spec.column, title: spec.title.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 200) });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  report.suites.forEach(visit);
  cases.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Selection manifest has duplicate cases.");
  return cases;
}

export function assertSameSelectedCases(listReport, runReport) {
  const listed = selectedCases(listReport);
  if (JSON.stringify(listed) !== JSON.stringify(selectedCases(runReport))) throw new Error("Selection manifest mismatch between list and run.");
  return listed;
}

function failedCases(report) {
  const cases = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if ((spec.tests ?? []).some((test) => test.status === "unexpected" || test.status === "skipped" || test.status === "flaky" || (test.results ?? []).some((result) => result.status === "failed" || result.status === "timedOut"))) {
        cases.push({ id: String(spec.id ?? "").slice(0, 120), title: String(spec.title ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 200) });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report?.suites ?? []) visit(suite);
  return cases;
}

export function validateReport(report, expected) {
  const stats = report?.stats;
  if (!stats || ![stats.expected, stats.unexpected, stats.skipped, stats.flaky].every(Number.isInteger)) throw new Error("Playwright JSON report is incomplete.");
  if (stats.unexpected !== 0 || stats.skipped !== 0 || stats.flaky !== 0) throw new Error(`Playwright failures/skipped/flaky: ${stats.unexpected}/${stats.skipped}/${stats.flaky}.`);
  if (stats.expected !== expected) throw new Error(`Playwright passed ${stats.expected}; expected ${expected}.`);
  return { passed: stats.expected, failed: 0, skipped: 0, flaky: 0, durationMs: stats.duration ?? null };
}

export function executeCommand(command, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const windowsPnpm = process.platform === "win32" && command === "pnpm";
    if (windowsPnpm && !process.env.npm_execpath) return reject(new Error("Windows public CI requires invocation through a pnpm script."));
    const child = spawn(windowsPnpm ? process.execPath : command, windowsPnpm ? [process.env.npm_execpath, ...args] : args, { env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", async (exitCode) => {
      try {
        const report = env.PLAYWRIGHT_JSON_OUTPUT_FILE ? JSON.parse(await readFile(env.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8")) : undefined;
        resolve({ exitCode, output, report });
      } catch {
        resolve({ exitCode, output });
      }
    });
  });
}

export async function runPublicV3Ci({ execute = executeCommand, preflight = async () => {
  const result = await execute("pnpm", ["test:e2e:preflight"]);
  if (result.exitCode !== 0) throw new Error("Database preflight failed.");
  const fixtures = await execute("node", ["scripts/public-v3-fixtures.mjs"]);
  if (fixtures.exitCode !== 0) throw new Error("Public fixture preflight failed.");
}, writeEvidence = async (evidence) => {
  await mkdir("test-results/public-v3", { recursive: true });
  await writeFile("test-results/public-v3/evidence.json", JSON.stringify(evidence, null, 2));
}, sha = process.env.PUBLIC_V3_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local", now = Date.now } = {}) {
  const evidence = { sha, mode: "full-public", exclusions: ["three public-v3-seeded-events seed/reseed cases"], phases: [], status: "failed" };
  let stage = "preflight";
  let currentSelection = null;
  const startedAt = now();
  try {
    await preflight();
    for (const phase of PUBLIC_PHASES) {
      const phaseEvidence = { id: phase.id, expected: phase.expected, selections: [], passed: 0 };
      evidence.phases.push(phaseEvidence);
      for (const item of phase.selections) {
        currentSelection = item.id;
        stage = "list";
        const listed = await execute("pnpm", [...item.args, "--list", "--reporter=json"], { phase: phase.id, selection: item.id, env: { ...process.env, PUBLIC_V3_NO_RESET: "1" } });
        if (listed.exitCode !== 0) throw new Error(`Selection ${item.id} list failed.`);
        const listReport = JSON.parse(listed.output);
        const manifest = selectedCases(listReport);
        const listedCount = manifest.length;
        phaseEvidence.selections.push({ id: item.id, args: item.args, listed: listedCount, manifest, passed: 0, failed: 0, skipped: 0, flaky: 0 });
        if (listedCount !== item.expected) throw new Error(`Selection ${item.id} listed ${listedCount}; expected ${item.expected}.`);
        const reportPath = `test-results/public-v3/${item.id}.json`;
        await mkdir("test-results/public-v3", { recursive: true });
        const started = now();
        stage = "run";
        const result = await execute("pnpm", [...item.args, "--reporter=line,json"], { phase: phase.id, selection: item.id, env: { ...process.env, PUBLIC_V3_NO_RESET: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath } });
        const selectionEvidence = phaseEvidence.selections.at(-1);
        if (result.report?.stats) {
          const stats = result.report.stats;
          selectionEvidence.passed = Number.isInteger(stats.expected) ? stats.expected : 0;
          selectionEvidence.failed = Number.isInteger(stats.unexpected) ? stats.unexpected : 0;
          selectionEvidence.skipped = Number.isInteger(stats.skipped) ? stats.skipped : 0;
          selectionEvidence.flaky = Number.isInteger(stats.flaky) ? stats.flaky : 0;
        }
        selectionEvidence.elapsedMs = now() - started;
        selectionEvidence.failedCases = failedCases(result.report);
        if (result.exitCode !== 0) throw new Error(`Selection ${item.id} failed.`);
        assertSameSelectedCases(listReport, result.report);
        const summary = validateReport(result.report, item.expected);
        Object.assign(selectionEvidence, summary);
        phaseEvidence.passed += summary.passed;
      }
      if (phaseEvidence.passed !== phase.expected) throw new Error(`Phase ${phase.id} passed ${phaseEvidence.passed}; expected ${phase.expected}.`);
    }
    evidence.status = "passed";
    return evidence;
  } catch (error) {
    evidence.failure = { kind: stage === "preflight" ? "preflight" : stage === "list" ? "selection" : "test", stage, selection: currentSelection, elapsedMs: now() - startedAt };
    evidence.error = error instanceof Error && /^(Selection |Playwright |Database preflight |Public fixture preflight |Phase )/.test(error.message)
      ? error.message
      : "Public lane failed before producing a safe diagnostic.";
    throw error;
  } finally {
    await writeEvidence(evidence);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runPublicV3Ci(); }
  catch (error) { console.error(`[public-v3-ci] ${error instanceof Error ? error.message : "Failed."}`); process.exitCode = 1; }
}
