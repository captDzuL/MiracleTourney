import { describe, expect, it } from "vitest";

import { resolveEventVisual } from "./event-visual-assets";
import type { Event, EventVisualAsset } from "./types";

const baseEvent: Pick<Event, "gameId" | "gameImageUrl" | "accentColor" | "activeVisualAsset"> = {
  gameId: "game-flashpeak",
};

const asset: EventVisualAsset = {
  id: "asset-1",
  eventId: "event-1",
  source: "organizer_upload",
  status: "approved",
  url: "https://assets.example/upload.webp",
  focalX: 0.25,
  focalY: 0.75,
  createdAt: new Date("2026-08-21T00:00:00.000Z"),
  updatedAt: new Date("2026-08-22T00:00:00.000Z"),
};

describe("resolveEventVisual", () => {
  it("prefers the approved active revision", () => {
    expect(resolveEventVisual({ ...baseEvent, activeVisualAsset: asset })).toMatchObject({
      source: "organizer_upload",
      url: "https://assets.example/upload.webp",
    });
  });

  it("carries the approved revision focal point", () => {
    expect(resolveEventVisual({ ...baseEvent, activeVisualAsset: asset }).focalPoint).toEqual({ x: 0.25, y: 0.75 });
  });

  it("reports an approved AI revision as ai_generated", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: { ...asset, source: "ai_generated" } }),
    ).toMatchObject({ source: "ai_generated" });
  });

  it("falls back to the legacy event background when there is no active revision", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: undefined, gameImageUrl: "/legacy.webp" }),
    ).toMatchObject({ source: "organizer_upload", url: "/legacy.webp" });
  });

  it("centres the focal point for legacy artwork", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: undefined, gameImageUrl: "/legacy.webp" }).focalPoint,
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("falls back to the typographic poster when no artwork exists", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: undefined, gameImageUrl: undefined }),
    ).toMatchObject({ source: "typographic", url: undefined });
  });

  it("ignores an active revision that is not approved", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: { ...asset, status: "ready_for_review" } }),
    ).toMatchObject({ source: "typographic" });
  });

  it("ignores an approved revision that has no url", () => {
    expect(
      resolveEventVisual({ ...baseEvent, activeVisualAsset: { ...asset, url: undefined } }),
    ).toMatchObject({ source: "typographic" });
  });

  it("uses the event accent colour when set", () => {
    expect(resolveEventVisual({ ...baseEvent, accentColor: "#ff5a1f" }).accentColor).toBe("#ff5a1f");
  });

  it("defaults the accent colour to the event's game identity", () => {
    expect(resolveEventVisual(baseEvent).accentColor).toBe("#4ade80");
  });

  it("defaults an unknown game to the platform lime", () => {
    expect(resolveEventVisual({ ...baseEvent, gameId: "game-unknown" }).accentColor).toBe("#caff38");
  });
});
