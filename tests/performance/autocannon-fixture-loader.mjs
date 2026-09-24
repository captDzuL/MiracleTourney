const fixtureSource = `
const failing = process.env.LOAD_FIXTURE_MODE === "failing";
const calls = [];
export default function autocannon(_options, callback) {
  const hasFailure = failing;
  const percentile = hasFailure ? 3_500 : 100;
  const result = {
    requests: { mean: 10, total: 10 },
    latency: { p50: 80, p97_5: percentile, p99: percentile },
    "2xx": hasFailure ? 9 : 10,
    non2xx: hasFailure ? 1 : 0,
    errors: hasFailure ? 1 : 0,
    statusCodeStats: {},
  };
  calls.push({ ..._options, result: { p97_5: result.latency.p97_5, errors: result.errors, non2xx: result.non2xx } });
  callback(null, result);
}
process.once("exit", () => console.log("AUTOCANNON_FIXTURE_CALLS=" + JSON.stringify(calls)));
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "autocannon") {
    return { url: `data:text/javascript,${encodeURIComponent(fixtureSource)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
