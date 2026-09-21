const fixtureSource = `
const failing = process.env.LOAD_FIXTURE_MODE === "failing";
export default function autocannon(_options, callback) {
  const hasFailure = failing;
  const percentile = hasFailure ? 3_500 : 100;
  callback(null, {
    requests: { mean: 10, total: 10 },
    latency: { p50: 80, p97_5: percentile, p99: percentile },
    "2xx": hasFailure ? 9 : 10,
    non2xx: hasFailure ? 1 : 0,
    errors: hasFailure ? 1 : 0,
    statusCodeStats: {},
  });
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "autocannon") {
    return { url: `data:text/javascript,${encodeURIComponent(fixtureSource)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
