import { describe, expect, it, beforeEach } from "vitest";

import {
  createEvent,
  getBracketManageableMatches,
  getBracketPreview,
  isEventBracketLocked,
  importTeams,
  registerTeam,
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

  it("treats a single-elimination event as locked after the first completed result", () => {
    resetDemoStore();

    const lockedBefore = isEventBracketLocked("event-kuroko-summer");
    expect(lockedBefore).toBe(true);
  });

  it("rejects direct imports after a single-elimination event is locked", () => {
    expect(() =>
      importTeams([
        {
          eventId: "event-kuroko-summer",
          teamName: "Late Entrants",
          teamTag: "LATE",
          captainName: "Late Captain",
          captainContact: "0800",
        },
      ]),
    ).toThrow(
      'Event "kuroko-summer-cup" already has recorded match results, so additional teams cannot be imported.',
    );
  });

  it("rejects direct captain registration after a single-elimination event is locked", () => {
    expect(() =>
      registerTeam({
        eventId: "event-kuroko-summer",
        captainId: "captain-seirin",
        name: "Late Captain Team",
        tag: "LCT",
      }),
    ).toThrow(
      'Event "kuroko-summer-cup" already has recorded match results, so additional teams cannot be registered.',
    );
  });

  it("allows direct captain registration before kickoff", () => {
    const team = registerTeam({
      eventId: "event-flashpeak-open",
      captainId: "captain-seirin",
      name: "Pre-Kickoff Team",
      tag: "PKT",
    });

    expect(team).toMatchObject({
      eventId: "event-flashpeak-open",
      captainId: "captain-seirin",
      name: "Pre-Kickoff Team",
    });
  });

  it("rebuilds the projected bracket when more teams are imported before kickoff", () => {
    resetDemoStore();

    const created = createEvent({
      name: "Flashpeak 24",
      slug: "flashpeak-24",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      participantCap: 24,
    });

    importTeams(Array.from({ length: 22 }, (_, index) => ({
      eventId: created.id,
      teamName: `Team ${index + 1}`,
      teamTag: `T${String(index + 1).padStart(2, "0")}`,
      captainName: `Captain ${index + 1}`,
      captainContact: `08${index + 1}`,
    })));

    const before = getBracketPreview(created.id);

    importTeams([
      {
        eventId: created.id,
        teamName: "Team 23",
        teamTag: "T23",
        captainName: "Captain 23",
        captainContact: "0823",
      },
      {
        eventId: created.id,
        teamName: "Team 24",
        teamTag: "T24",
        captainName: "Captain 24",
        captainContact: "0824",
      },
    ]);

    const after = getBracketPreview(created.id);

    expect(after).not.toEqual(before);
    expect(after.filter((match) => match.round === 1).length).toBeGreaterThanOrEqual(
      before.filter((match) => match.round === 1).length,
    );
  });
});

