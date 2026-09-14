import { sortDiscoveryEvents, type PublicDiscoveryEvent } from "./public-discovery";

export type PublicDiscoveryLoadResult = {
  entries: PublicDiscoveryEvent[];
  loadState: "ready" | "error";
};

export async function loadPublicDiscovery(
  load: () => Promise<PublicDiscoveryEvent[]>,
  timeoutMs = 2_000,
  logger: (message: string, context: { error: unknown }) => void = console.error,
): Promise<PublicDiscoveryLoadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const entries = await Promise.race([
      load(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Public event read timed out")), timeoutMs);
      }),
    ]);
    return { entries: sortDiscoveryEvents(entries), loadState: "ready" };
  } catch (error) {
    logger("Public discovery events unavailable", { error });
    return { entries: [], loadState: "error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
