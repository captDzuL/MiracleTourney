import { describe, expect, it } from "vitest";

import type { Event } from "@/lib/platform/types";
import {
  chooseFeaturedDiscoveryEvent,
  filterDiscoveryEvents,
  groupDiscoveryEvents,
  type PublicDiscoveryEvent,
} from "./public-discovery";

function item(
  slug: string,
  status: Event["status"],
  options: Partial<PublicDiscoveryEvent> = {},
): PublicDiscoveryEvent {
  return {
    event: {
      id: slug,
      slug,
      name: slug,
      description: "",
      gameId: "game-flashpeak",
      gameModeId: "mode",
      format: "Single Elimination",
      status,
      participantCap: 16,
      registrationWindow: "",
      startsAt: "",
      venue: "",
      registrationFeeRequired: false,
    },
    phaseStatus: null,
    hasLiveMatch: false,
    teamCount: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...options,
  };
}

describe("public discovery event priority", () => {
  it("selects ongoing, then drawing/starting soon, registration, and newest finished", () => {
    const finishedOld = item("finished-old", "Finished", { updatedAt: "2026-08-01T00:00:00.000Z" });
    const finishedNew = item("finished-new", "Finished", { updatedAt: "2026-09-12T00:00:00.000Z" });
    const registration = item("registration", "Published");
    const drawing = item("drawing", "Registration Closed", { phaseStatus: "active" });
    const ongoing = item("ongoing", "Ongoing");

    expect(chooseFeaturedDiscoveryEvent([finishedOld, finishedNew])?.event.slug).toBe("finished-new");
    expect(chooseFeaturedDiscoveryEvent([finishedNew, registration])?.event.slug).toBe("registration");
    expect(chooseFeaturedDiscoveryEvent([registration, drawing])?.event.slug).toBe("drawing");
    expect(chooseFeaturedDiscoveryEvent([drawing, ongoing])?.event.slug).toBe("ongoing");
  });

  it("uses a deterministic slug tie-break and puts a live match first", () => {
    const alphabetic = item("alpha", "Ongoing");
    const live = item("zulu", "Ongoing", { hasLiveMatch: true });
    expect(chooseFeaturedDiscoveryEvent([alphabetic, live])?.event.slug).toBe("zulu");
    expect(chooseFeaturedDiscoveryEvent([item("zulu", "Published"), item("alpha", "Published")])?.event.slug).toBe("alpha");
  });

  it("groups all other events without hiding the featured event's peers", () => {
    const ongoing = item("ongoing", "Ongoing");
    const registration = item("registration", "Published");
    const finished = item("finished", "Finished");
    const groups = groupDiscoveryEvents([finished, registration, ongoing]);

    expect(groups.ongoing.map((entry) => entry.event.slug)).toEqual(["ongoing"]);
    expect(groups.upcoming.map((entry) => entry.event.slug)).toEqual(["registration"]);
    expect(groups.finished.map((entry) => entry.event.slug)).toEqual(["finished"]);
  });

  it("filters by URL game and status categories", () => {
    const ongoing = item("ongoing", "Ongoing");
    const drawing = item("drawing", "Registration Closed");
    const registration = item("registration", "Published");
    const finished = item("finished", "Finished");
    finished.event.gameId = "game-other";

    expect(filterDiscoveryEvents([ongoing, drawing, registration, finished], {
      game: "all",
      status: "upcoming",
    }).map((entry) => entry.event.slug)).toEqual(["drawing", "registration"]);
    expect(filterDiscoveryEvents([ongoing, drawing, registration, finished], {
      game: "game-other",
      status: "all",
    }).map((entry) => entry.event.slug)).toEqual(["finished"]);
  });
});
