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
  try {
    const entries = await Promise.race([
      load(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error("Public event read timed out")); }, timeoutMs);
      }),
    ]);
    return { entries: sortDiscoveryEvents(entries), loadState: "ready" };
  } catch {
    const code = timedOut ? "timeout" : "read_failure";
    logger("Public discovery events unavailable", { code });
    return { entries: [], loadState: "error", failureCode: code };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
