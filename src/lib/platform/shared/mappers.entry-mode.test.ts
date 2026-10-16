import { describe, expect, it } from "vitest";

import { mapEvent } from "@/lib/platform/shared/mappers";

const publishedEventRow = (overrides: { id: string; slug: string }) => ({
  id: overrides.id,
  slug: overrides.slug,
  name: "Solo Cup",
  description: "A solo event",
  gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5",
  format: "Single Elimination",
  status: "Published",
  participantCap: 8,
  registrationWindow: "Aug 24 - Aug 31",
  startsAt: "2026-09-01",
  venue: "Online",
});

describe("mapEvent carries the registration mode", () => {
  const row = { ...publishedEventRow({ id: "event-1", slug: "solo-cup" }), logoUrl: null, gameImageUrl: null };

  it("marks a solo event", () => {
    expect(mapEvent({ ...row, entryMode: "solo" }).entryMode).toBe("solo");
  });

  it("leaves a team event, and an event from before the column, without a mode", () => {
    expect(mapEvent({ ...row, entryMode: "team" }).entryMode).toBeUndefined();
    expect(mapEvent(row).entryMode).toBeUndefined();
    expect(mapEvent({ ...row, entryMode: null }).entryMode).toBeUndefined();
  });
});
