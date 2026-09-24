/**
 * Quick load test: 50 concurrent connections, 5 second burst.
 */
import autocannon from "autocannon";

const BASE = process.env.BASE_URL;
const P97_5_BUDGET_MS = 3_000;

if (!BASE) {
  console.error("[load-test-quick] BLOCKED: set BASE_URL to the credentialed preview or explicitly approved load-test target.");
  process.exitCode = 2;
  process.exit(2);
}

const isProd = BASE.includes("vercel.app");

const routes = isProd
  ? [
      { label: "Home page", path: "/" },
      { label: "Events list", path: "/events" },
      { label: "Bracket (miracle-league)", path: "/events/miracle-league/bracket" },
    ]
  : [
      { label: "Home page", path: "/id" },
      { label: "Events list", path: "/id/events" },
      { label: "Bracket (flashpeak-champions-32)", path: "/id/events/flashpeak-champions-32/bracket" },
    ];

async function measure(label, path) {
  const result = await new Promise((resolve) =>
    autocannon(
      {
        url: BASE + path,
        connections: 50,
        duration: 5,
        headers: { accept: "text/html,application/xhtml+xml" },
      },
      (err, res) => resolve(err ? null : res),
    ),
  );
  if (!result) return null;
  return {
    label,
    rps: Math.round(result.requests.mean),
    p50: result.latency.p50,
    p97_5: result.latency.p97_5,
    p99: result.latency.p99,
    "2xx": result["2xx"],
    non2xx: result.non2xx,
    errors: result.errors,
    statusCodes: result.statusCodeStats,
  };
}

console.log(`\nLoad test target: ${BASE}`);
console.log(`Config: 50 concurrent connections × 5s per route; p97.5 < ${P97_5_BUDGET_MS}ms\n`);

const results = [];
for (const route of routes) {
  process.stdout.write(`Testing: ${route.label} ... `);
  const r = await measure(route.label, route.path);
  if (r) { results.push(r); console.log(r.errors + r.non2xx === 0 ? "OK" : "ISSUES"); }
}

console.log("\n" + "=".repeat(65));
console.log("RESULTS SUMMARY");
console.log("=".repeat(65));
console.log(
  `${"Route".padEnd(35)} ${"Req/s".padStart(6)} ${"p50".padStart(7)} ${"p97.5".padStart(8)} ${"2xx".padStart(6)} ${"Err".padStart(5)}`,
);
console.log("-".repeat(65));
for (const r of results) {
  const label = r.label.length > 34 ? r.label.slice(0, 31) + "..." : r.label;
  const flag = r.errors > 0 || r.non2xx > 0 ? " ⚠️" : "";
  console.log(
    `${label.padEnd(35)} ${String(r.rps).padStart(6)} ${String(r.p50 + "ms").padStart(7)} ${String(r.p97_5 + "ms").padStart(8)} ${String(r["2xx"]).padStart(6)} ${String(r.errors + r.non2xx).padStart(5)}${flag}`,
  );
  if ((r.errors > 0 || r.non2xx > 0) && r.statusCodes)
    console.log(`        Status codes: ${JSON.stringify(r.statusCodes)}`);
}

const allPass = results.length === routes.length && results.every((r) => r.errors === 0 && r.non2xx === 0 && r.p97_5 < P97_5_BUDGET_MS);
console.log("\nCONCLUSION:");
if (allPass) {
  console.log(`✅ Web dapat menangani 50 concurrent users tanpa error.`);
  console.log(`   Worst-case p97.5: ${Math.max(...results.map((r) => r.p97_5))}ms`);
} else {
  const slow = results.filter((r) => r.p97_5 >= P97_5_BUDGET_MS);
  const errored = results.filter((r) => r.errors > 0 || r.non2xx > 0);
  if (slow.length) console.log(`⚠️  Slow routes (p97.5 ≥ ${P97_5_BUDGET_MS}ms): ${slow.map((r) => r.label).join(", ")}`);
  if (errored.length) console.log(`❌ Routes with errors/non-2xx: ${errored.map((r) => r.label).join(", ")}`);
  process.exitCode = 1;
}
