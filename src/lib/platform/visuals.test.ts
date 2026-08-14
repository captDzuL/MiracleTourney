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

  it("falls back to the configured game background", () => {
    expect(getEventBackgroundUrl(baseEvent)).toBe("/game-backgrounds/flashpeak.svg");
  });

  it("returns an empty string when neither event nor game background exists", () => {
    expect(getEventBackgroundUrl({ ...baseEvent, gameId: "unknown-game" })).toBe("");
  });
});
