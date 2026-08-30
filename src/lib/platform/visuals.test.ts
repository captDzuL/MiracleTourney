import { describe, expect, it } from "vitest";

import type { Event } from "./types";
import { getEventBackgroundUrl } from "./visuals";

const baseEvent: Event = {
  id: "event-1",
  slug: "event-one",
  name: "Event One",
  description: "Demo",
  gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5",
  format: "Single Elimination",
  status: "Ongoing",
  participantCap: 32,
  registrationWindow: "Open",
  startsAt: "TBD",
  venue: "Online",
};

describe("event visuals", () => {
  it("prefers an event-specific background over the game default", () => {
    expect(getEventBackgroundUrl({ ...baseEvent, gameImageUrl: "/event-backgrounds/custom.webp" })).toBe(
      "/event-backgrounds/custom.webp",
    );
  });

  it("prefers the approved active revision over the legacy event background", () => {
    expect(
      getEventBackgroundUrl({
        ...baseEvent,
        gameImageUrl: "/event-backgrounds/custom.webp",
        activeVisualAsset: {
          id: "asset-1",
          eventId: "event-1",
          source: "ai_generated",
          status: "approved",
          url: "https://assets.example/generated.webp",
          focalX: 0.5,
          focalY: 0.5,
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
          updatedAt: new Date("2026-08-21T00:00:00.000Z"),
        },
      }),
    ).toBe("https://assets.example/generated.webp");
  });

  it("ignores an active revision that is still awaiting review", () => {
    expect(
      getEventBackgroundUrl({
        ...baseEvent,
        gameImageUrl: "/event-backgrounds/custom.webp",
        activeVisualAsset: {
          id: "asset-1",
          eventId: "event-1",
          source: "ai_generated",
          status: "ready_for_review",
          url: "https://assets.example/generated.webp",
          focalX: 0.5,
          focalY: 0.5,
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
          updatedAt: new Date("2026-08-21T00:00:00.000Z"),
        },
      }),
    ).toBe("/event-backgrounds/custom.webp");
  });

  it("falls back to the configured game background", () => {
    expect(getEventBackgroundUrl(baseEvent)).toBe("/game-backgrounds/flashpeak.svg");
  });

  it("returns an empty string when neither event nor game background exists", () => {
    expect(getEventBackgroundUrl({ ...baseEvent, gameId: "unknown-game" })).toBe("");
  });
});
