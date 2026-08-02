import { describe, expect, it, beforeEach } from "vitest";

import {
  createEvent,
  getBracketManageableMatches,
  getBracketPreview,
  importTeams,
  resetDemoStore,
  setMatchResult,
} from "./demo-store";
import type { BracketMatch } from "../tournament/types";

describe("demo-store bracket operations", () => {
  beforeEach(() => {
    resetDemoStore();
  });

  it("derives manageable bracket matches for a newly created/imported elimination event", () => {
    const event = createEvent({
      name: "Import Flow Cup",
      slug: "import-flow-cup",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });

    importTeams([
      { eventId: event.id, teamName: "Team 1", teamTag: "T01", captainName: "C1", captainContact: "1" },
      { eventId: event.id, teamName: "Team 2", teamTag: "T02", captainName: "C2", captainContact: "2" },
      { eventId: event.id, teamName: "Team 3", teamTag: "T03", captainName: "C3", captainContact: "3" },
      { eventId: event.id, teamName: "Team 4", teamTag: "T04", captainName: "C4", captainContact: "4" },
      { eventId: event.id, teamName: "Team 5", teamTag: "T05", captainName: "C5", captainContact: "5" },
      { eventId: event.id, teamName: "Team 6", teamTag: "T06", captainName: "C6", captainContact: "6" },
      { eventId: event.id, teamName: "Team 7", teamTag: "T07", captainName: "C7", captainContact: "7" },
      { eventId: event.id, teamName: "Team 8", teamTag: "T08", captainName: "C8", captainContact: "8" },
    ]);

    const manageable = getBracketManageableMatches(event.id);

    expect(manageable.length).toBeGreaterThan(0);
    expect(manageable[0]).toMatchObject({
      eventId: event.id,
      round: 1,
      slot: 1,
      status: "Scheduled",
    });
  });

  it("uses canonical projected bracket match ids for admin result entry and public advancement", () => {
    const manageable = getBracketManageableMatches("event-kuroko-summer");
    const targetMatch = manageable.find((match) => match.id === "bracket-r2-m1");

    expect(targetMatch).toMatchObject({
      homeTeamId: "team-seirin",
      awayTeamId: "team-shutoku",
      round: 2,
      slot: 1,
    });

    const saved = setMatchResult({
      eventId: "event-kuroko-summer",
      matchId: "bracket-r2-m1",
      homeScore: 21,
      awayScore: 18,
    });

    expect(saved).toMatchObject({
      id: "bracket-r2-m1",
      winnerTeamId: "team-seirin",
      status: "Completed",
    });

    const preview = getBracketPreview("event-kuroko-summer") as BracketMatch[];
    const final = preview.find((match) => match.round === 3 && match.slot === 1);

    expect(final?.homeTeamId).toBe("team-seirin");
  });
});

