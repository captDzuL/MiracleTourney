import { getDefaultGameBackgroundUrl } from "./config";
import type { Event } from "./types";

export function getEventBackgroundUrl(event: Pick<Event, "gameId" | "gameImageUrl">) {
  return event.gameImageUrl || getDefaultGameBackgroundUrl(event.gameId);
}
