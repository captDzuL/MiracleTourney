import { getDefaultGameBackgroundUrl } from "./config";
import type { Event } from "./types";

export const DEFAULT_EVENT_ACCENT_COLOR = "#caff38";

export type ResolvedEventVisual = {
  source: "organizer_upload" | "ai_generated" | "game_default" | "typographic";
  url?: string;
  accentColor: string;
  focalPoint: { x: number; y: number };
};

export type ResolvableEvent = Pick<Event, "gameId" | "gameImageUrl" | "accentColor" | "activeVisualAsset">;

/**
 * Resolves the artwork a public surface should render, in precedence order:
 * approved active revision → legacy event background → configured game background
 * → deterministic typographic poster.
 */
export function resolveEventVisual(event: ResolvableEvent): ResolvedEventVisual {
  const accentColor = event.accentColor ?? DEFAULT_EVENT_ACCENT_COLOR;
  const active = event.activeVisualAsset;

  if (active?.status === "approved" && active.url) {
    return {
      source: active.source,
      url: active.url,
      accentColor,
      focalPoint: { x: active.focalX, y: active.focalY },
    };
  }

  if (event.gameImageUrl) {
    return {
      source: "organizer_upload",
      url: event.gameImageUrl,
      accentColor,
      focalPoint: { x: 0.5, y: 0.5 },
    };
  }

  const gameBackgroundUrl = getDefaultGameBackgroundUrl(event.gameId);
  if (gameBackgroundUrl) {
    return {
      source: "game_default",
      url: gameBackgroundUrl,
      accentColor,
      focalPoint: { x: 0.5, y: 0.5 },
    };
  }

  return { source: "typographic", url: undefined, accentColor, focalPoint: { x: 0.5, y: 0.5 } };
}
