import { describe, expect, it } from "vitest";

import { getRosterLimits } from "./roster-limits";
import { registrationInput } from "./public-v3/registration";

describe("getRosterLimits", () => {
  it("takes the minimum from the team size of the game mode, the same rule the registration form enforces", () => {
    expect(getRosterLimits("mode-flashpeak-5v5")).toEqual({ minimumRoster: 5, maximumRoster: 8 });
    expect(getRosterLimits("mode-kuroko-3v3")).toEqual({ minimumRoster: 3, maximumRoster: 5 });
  });

  it.each([undefined, null, "", "mode-that-does-not-exist"])("falls back to 1 and 1 for %j", (gameModeId) => {
    expect(getRosterLimits(gameModeId)).toEqual({ minimumRoster: 1, maximumRoster: 1 });
  });
});

describe("public registration roster limits", () => {
  const event = {
    id: "event-1",
    slug: "miracle-cup",
    name: "Miracle Cup",
    description: "A public event",
    status: "Published",
    gameModeId: "mode-flashpeak-5v5",
    participantCap: 16,
  };
  const build = (input: Record<string, unknown> = {}) =>
    registrationInput(event as never, input as never, [], "compatible") as { registration: { minimumRoster: number; maximumRoster: number } };

  it("shows the game mode's roster size when the event carries no roster limits", () => {
    expect(build().registration).toMatchObject({ minimumRoster: 5, maximumRoster: 8 });
  });

  it("keeps limits that the data gives explicitly", () => {
    expect(build({ registration: { minimumRoster: 6, maximumRoster: 7 } }).registration).toMatchObject({ minimumRoster: 6, maximumRoster: 7 });
  });
});
