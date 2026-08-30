import { getGameArtTheme } from "./config";
import type { Event } from "./types";

export const DEFAULT_EVENT_ACCENT_COLOR = "#caff38";

export type ResolvedEventVisual = {
  source: "organizer_upload" | "ai_generated" | "typographic";
  url?: string;
  accentColor: string;
  focalPoint: { x: number; y: number };
};

export type ResolvableEvent = Pick<Event, "gameId" | "gameImageUrl" | "accentColor" | "activeVisualAsset">;

/**
 * Resolves the artwork a public surface should render, in precedence order:
 * approved active revision → legacy event background → deterministic typographic poster.
 *
 * The accent colour falls back to the event's game identity (not one flat
 * platform lime) so events without an organizer-set accent still read as
 * distinct per game.
 */
export function resolveEventVisual(event: ResolvableEvent): ResolvedEventVisual {
  const accentColor = event.accentColor ?? getGameArtTheme(event.gameId).accent;
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

  return { source: "typographic", url: undefined, accentColor, focalPoint: { x: 0.5, y: 0.5 } };
}
