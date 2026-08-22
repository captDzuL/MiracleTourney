import { getDefaultGameBackgroundUrl } from "./config";
import { resolveEventVisual, type ResolvableEvent } from "./event-visual-assets";
import type { Event } from "./types";

/**
 * Legacy background accessor kept for surfaces that still render a single URL.
 * Precedence matches `resolveEventVisual`: approved active revision, then the
 * legacy event background, then the configured game default.
 */
export function getEventBackgroundUrl(event: Pick<Event, "gameId" | "gameImageUrl"> & Partial<ResolvableEvent>) {
  return resolveEventVisual(event).url || getDefaultGameBackgroundUrl(event.gameId);
}
