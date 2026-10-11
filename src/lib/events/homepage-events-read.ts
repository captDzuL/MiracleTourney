import type { Event } from "@/lib/platform/types";

export type HomepageEventsResult = Readonly<{ events: Event[]; failed: boolean }>;

/**
 * Loads the events for the legacy home page. A failed read is reported as `failed`, never as an empty list, so the
 * page can say the data could not be loaded instead of claiming there are no events. There is no time limit: a database
 * that is waking up should answer with real events, not be replaced by made-up ones.
 */
export async function loadHomepageEvents(
  load: () => Promise<Event[]>,
  logger: (message: string, error: unknown) => void = console.warn,
): Promise<HomepageEventsResult> {
  try {
    return { events: await load(), failed: false };
  } catch (error) {
    logger("Homepage public events unavailable", error);
    return { events: [], failed: true };
  }
}
