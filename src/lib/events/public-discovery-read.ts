import { sortDiscoveryEvents, type PublicDiscoveryEvent } from "./public-discovery";

export type PublicDiscoveryLoadResult = {
  entries: PublicDiscoveryEvent[];
  loadState: "ready" | "error";
  failureCode?: "timeout" | "read_failure";
};

export async function loadPublicDiscovery(
  load: () => Promise<PublicDiscoveryEvent[]>,
  timeoutMs = 2_000,
  logger: (message: string, context: { code: "timeout" | "read_failure" }) => void = console.error,
): Promise<PublicDiscoveryLoadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const trace = process.env.PUBLIC_V3_HOME_DISCOVERY_TRACE === "1";
  const started = performance.now();
  if (trace) console.info("[public-v3-discovery] load-start");
  try {
    const entries = await Promise.race([
      load(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error("Public event read timed out")); }, timeoutMs);
      }),
    ]);
    if (trace) console.info(`[public-v3-discovery] load-done ms=${Math.min(99999, Math.round(performance.now() - started))}`);
    return { entries: sortDiscoveryEvents(entries), loadState: "ready" };
  } catch {
    const code = timedOut ? "timeout" : "read_failure";
    if (trace) console.info(`[public-v3-discovery] ${timedOut ? "load-timeout" : "load-error"} ms=${Math.min(99999, Math.round(performance.now() - started))}`);
    logger("Public discovery events unavailable", { code });
    return { entries: [], loadState: "error", failureCode: code };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
