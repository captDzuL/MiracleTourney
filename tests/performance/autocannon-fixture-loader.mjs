const fixtureSource = `
const mode = process.env.LOAD_FIXTURE_MODE;
const calls = [];
export default function autocannon(_options, callback) {
  const percentile = mode === "failing" || mode === "slow"
    ? 3_500
    : mode === "boundary-fail"
      ? 3_000
      : mode === "boundary-pass" || mode === "errors" || mode === "non2xx"
        ? 2_999
        : 100;
  const errors = mode === "failing" || mode === "errors" ? 1 : 0;
  const non2xx = mode === "failing" || mode === "non2xx" ? 1 : 0;
  const result = {
    requests: { mean: 10, total: 10 },
    latency: { p50: 80, p97_5: percentile, p99: percentile },
    "2xx": non2xx ? 9 : 10,
    non2xx,
    errors,
    statusCodeStats: {},
  };
  const complete = () => {
    calls.push({ ..._options, result: { p97_5: result.latency.p97_5, errors: result.errors, non2xx: result.non2xx } });
    callback(null, result);
  };
  if (process.env.LOAD_FIXTURE_AUTOCANNON_TRACE === "true" && process.env.BASE_URL) {
    fetch(process.env.BASE_URL + "/__autocannon_call", { method: "POST" }).then(complete, complete);
  } else {
    complete();
  }
}
process.once("exit", () => console.log("AUTOCANNON_FIXTURE_CALLS=" + JSON.stringify(calls)));
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "autocannon") {
    return { url: `data:text/javascript,${encodeURIComponent(fixtureSource)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
