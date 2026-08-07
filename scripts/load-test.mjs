import autocannon from "autocannon";

const BASE = process.env.BASE_URL ?? "https://miracle-tourney.vercel.app";
const CONNECTIONS = 50;
const DURATION = 10; // seconds

const routes = [
  { label: "Home page", path: "/" },
  { label: "Events list", path: "/events" },
  { label: "Bracket (miracle-league)", path: "/events/miracle-league/bracket" },
];

console.log(`\nLoad test target: ${BASE}`);
console.log(`Config: ${CONNECTIONS} concurrent users × ${DURATION}s per route\n`);
console.log("=".repeat(60));

const results = [];

for (const route of routes) {
  const url = BASE + route.path;
  process.stdout.write(`Testing: ${route.label} ... `);

  const result = await new Promise((resolve) =>
    autocannon(
      {
        url,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { accept: "text/html,application/xhtml+xml" },
      },
      (err, res) => resolve(err ? null : res),
    ),
  );

  if (!result) {
    console.log("ERROR");
    continue;
  }

  const ok = result.non2xx === 0 && result.errors === 0;
  console.log(ok ? "OK" : "ISSUES FOUND");

  results.push({
    label: route.label,
    path: route.path,
    rps: Math.round(result.requests.mean),
    p50: result.latency.p50,
    p95: result.latency.p97_5, // autocannon uses p97_5 for the 97.5th percentile
    p99: result.latency.p99,
    "2xx": result["2xx"],
    non2xx: result.non2xx,
    errors: result.errors,
    totalRequests: result.requests.total,
    statusCodes: result.statusCodeStats,
  });
}

console.log("\n" + "=".repeat(60));
console.log("RESULTS SUMMARY");
console.log("=".repeat(60));
console.log(
  `${"Route".padEnd(35)} ${"Req/s".padStart(6)} ${"p50".padStart(7)} ${"p97.5".padStart(7)} ${"p99".padStart(7)} ${"Err".padStart(5)}`,
);
console.log("-".repeat(70));

for (const r of results) {
  const label = r.label.length > 34 ? r.label.slice(0, 31) + "..." : r.label;
  const hasIssue = r.errors > 0 || r.non2xx > 0;
  const errFlag = hasIssue ? " ⚠️" : "";
  console.log(
    `${label.padEnd(35)} ${String(r.rps).padStart(6)} ${String(r.p50 + "ms").padStart(7)} ${String(r.p95 + "ms").padStart(7)} ${String(r.p99 + "ms").padStart(7)} ${String(r.errors + r.non2xx).padStart(5)}${errFlag}`,
  );
  if (hasIssue && r.statusCodes) {
    console.log(`        Status codes: ${JSON.stringify(r.statusCodes)}`);
  }
}

console.log("\nCONCLUSION:");
const allPass = results.every((r) => r.errors === 0 && r.non2xx === 0 && r.p95 < 3000);
if (allPass) {
  console.log(`✅ Web dapat menangani ${CONNECTIONS} concurrent users tanpa error.`);
  const maxP95 = Math.max(...results.map((r) => r.p95));
  const minRps = Math.min(...results.map((r) => r.rps));
  console.log(`   Worst-case p97.5 latency: ${maxP95}ms | Slowest route: ${minRps} req/s`);
} else {
  const slow = results.filter((r) => r.p95 >= 3000);
  const errored = results.filter((r) => r.errors > 0 || r.non2xx > 0);
  if (slow.length) console.log(`⚠️  Slow routes (p97.5 ≥ 3s): ${slow.map((r) => r.label).join(", ")}`);
  if (errored.length) console.log(`❌ Routes with errors/non-2xx: ${errored.map((r) => r.label).join(", ")}`);
}
