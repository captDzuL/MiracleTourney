import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: { findUnique: vi.fn() },
    match: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import type { Event } from "@/lib/platform/types";

import {
  getBracketManageableMatches,
  getBracketManageableMatchesForEvent,
  getBracketRoundLabel,
  getTeamStandings,
} from "./repository";

const EVENT_ID = "evt-1";

function teamRow(id: string, name: string) {
  return {
    id,
    eventId: EVENT_ID,
    captainId: `cap-${id}`,
    name,
    logoText: name.slice(0, 2).toUpperCase(),
    logoUrl: null,
    tag: name.slice(0, 3).toUpperCase(),
    captainName: null,
    captainContact: null,
    captainIgn: null,
    captainUid: null,
    captainIsPlayer: false,
    source: "captain",
    captain: null,
  };
}

function matchRow(overrides: Partial<{
  id: string;
  roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  slot: number | null;
  round: number | null;
  winnerTeamId: string | null;
  scheduledLabel: string | null;
}> = {}) {
  return {
    id: "m-1",
    eventId: EVENT_ID,
    roundLabel: "Round 1",
    homeTeamId: "t1",
    awayTeamId: "t2",
    homeScore: 0,
    awayScore: 0,
    status: "Scheduled",
    slot: null,
    round: null,
    winnerTeamId: null,
    scheduledLabel: null,
    ...overrides,
  };
}

function eventObject(format: Event["format"]): Event {
  return {
    id: EVENT_ID,
    slug: "evt",
    name: "Evt",
    description: "",
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    format,
    status: "Ongoing",
    participantCap: 8,
    registrationWindow: "",
    startsAt: "2026-01-01T00:00:00.000Z",
    venue: "Hall",
    registrationFeeRequired: false,
  } as Event;
}

const EVENT_SELECT = {
  id: true,
  format: true,
  participantCap: true,
  slug: true,
  name: true,
  description: true,
  gameId: true,
  gameModeId: true,
  status: true,
  registrationWindow: true,
  startsAt: true,
  venue: true,
  logoUrl: true,
  gameImageUrl: true,
};

function eventRow(format: string) {
  return {
    id: EVENT_ID,
    format,
    participantCap: 8,
    slug: "evt",
    name: "Evt",
    description: "",
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    status: "Ongoing",
    registrationWindow: "",
    startsAt: "2026-01-01T00:00:00.000Z",
    venue: "Hall",
    logoUrl: null,
    gameImageUrl: null,
  };
}

const LEAGUE_FILTER = {
  where: { eventId: EVENT_ID, round: { not: null }, slot: { not: null } },
  orderBy: [{ round: "asc" }, { slot: "asc" }],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getBracketRoundLabel", () => {
  it.each([
    [1, 1, "Final"],
    [3, 3, "Final"],
    [2, 3, "Semifinal"],
    [1, 2, "Semifinal"],
    [1, 3, "Quarterfinal"],
    [3, 5, "Quarterfinal"],
    [1, 4, "Round of 16"],
    [2, 5, "Round of 16"],
    [1, 5, "Round 1"],
    [2, 6, "Round 2"],
  ])("labels round %i of %i as %s", (round, totalRounds, expected) => {
    expect(getBracketRoundLabel(round, totalRounds)).toBe(expected);
  });

  it("falls back to the numbered label for a round past the final", () => {
    expect(getBracketRoundLabel(3, 2)).toBe("Round 3");
  });
});

describe("getBracketManageableMatchesForEvent", () => {
  it("reads only matches that have both round and slot, ordered by round then slot, for a league", async () => {
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "m-1", round: 1, slot: 1, status: "Completed", homeScore: 2, awayScore: 1, winnerTeamId: "t1", scheduledLabel: "Sat 10:00" }),
      matchRow({ id: "m-2", round: 1, slot: 2 }),
    ]);

    const result = await getBracketManageableMatchesForEvent(eventObject("League"));

    expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith(LEAGUE_FILTER);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: "m-1", eventId: EVENT_ID, roundLabel: "Round 1", homeTeamId: "t1", awayTeamId: "t2",
        homeScore: 2, awayScore: 1, status: "Completed", round: 1, slot: 1, winnerTeamId: "t1", scheduledLabel: "Sat 10:00",
      },
      {
        id: "m-2", eventId: EVENT_ID, roundLabel: "Round 1", homeTeamId: "t1", awayTeamId: "t2",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 2,
      },
    ]);
  });

  it("returns an empty list for a league without stored matches", async () => {
    prisma.match.findMany.mockResolvedValue([]);

    await expect(getBracketManageableMatchesForEvent(eventObject("League"))).resolves.toEqual([]);
  });

  it("passes a database failure on for a league", async () => {
    prisma.match.findMany.mockRejectedValue(new Error("db down"));

    await expect(getBracketManageableMatchesForEvent(eventObject("League"))).rejects.toThrow("db down");
  });

  it("projects the bracket from teams and stored matches for single elimination", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow("t1", "Alpha"), teamRow("t2", "Bravo"), teamRow("t3", "Charlie"), teamRow("t4", "Delta"),
    ]);
    prisma.match.findMany.mockResolvedValue([]);

    const result = await getBracketManageableMatchesForEvent(eventObject("Single Elimination"));

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { captain: { select: { id: true, name: true } } },
    });
    expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith({ where: { eventId: EVENT_ID }, orderBy: { createdAt: "asc" } });
    // Seed order for four teams: 1 v 4 and 2 v 3. The final has no teams yet and is left out.
    expect(result).toEqual([
      {
        id: "evt-1-r1-m1", eventId: EVENT_ID, roundLabel: "Semifinal", homeTeamId: "t1", awayTeamId: "t4",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 1, winnerTeamId: null,
      },
      {
        id: "evt-1-r1-m2", eventId: EVENT_ID, roundLabel: "Semifinal", homeTeamId: "t2", awayTeamId: "t3",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 2, winnerTeamId: null,
      },
    ]);
  });

  it("merges recorded results and shows the final once both semifinals have a winner", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow("t1", "Alpha"), teamRow("t2", "Bravo"), teamRow("t3", "Charlie"), teamRow("t4", "Delta"),
    ]);
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "stored-a", homeTeamId: "t1", awayTeamId: "t4", round: 1, slot: 1, status: "Completed", homeScore: 3, awayScore: 1, winnerTeamId: "t1" }),
      matchRow({ id: "stored-b", homeTeamId: "t2", awayTeamId: "t3", round: 1, slot: 2, status: "Completed", homeScore: 0, awayScore: 2, winnerTeamId: "t3" }),
    ]);

    const result = await getBracketManageableMatchesForEvent(eventObject("Single Elimination"));

    expect(result).toEqual([
      {
        id: "evt-1-r1-m1", eventId: EVENT_ID, roundLabel: "Semifinal", homeTeamId: "t1", awayTeamId: "t4",
        homeScore: 3, awayScore: 1, status: "Completed", round: 1, slot: 1, winnerTeamId: "t1",
      },
      {
        id: "evt-1-r1-m2", eventId: EVENT_ID, roundLabel: "Semifinal", homeTeamId: "t2", awayTeamId: "t3",
        homeScore: 0, awayScore: 2, status: "Completed", round: 1, slot: 2, winnerTeamId: "t3",
      },
      {
        id: "evt-1-r2-m1", eventId: EVENT_ID, roundLabel: "Final", homeTeamId: "t1", awayTeamId: "t3",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 2, slot: 1, winnerTeamId: null,
      },
    ]);
  });

  it("returns an empty list for single elimination without teams", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValue([]);

    await expect(getBracketManageableMatchesForEvent(eventObject("Single Elimination"))).resolves.toEqual([]);
  });

  it("passes a team lookup failure on for single elimination", async () => {
    prisma.team.findMany.mockRejectedValue(new Error("teams down"));
    prisma.match.findMany.mockResolvedValue([]);

    await expect(getBracketManageableMatchesForEvent(eventObject("Single Elimination"))).rejects.toThrow("teams down");
  });
});

describe("getBracketManageableMatches", () => {
  it("returns an empty list when the event does not exist", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    const result = await getBracketManageableMatches("missing");

    expect(result).toEqual([]);
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: "missing" }, select: EVENT_SELECT });
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it("reads stored round and slot matches for a league event", async () => {
    prisma.event.findUnique.mockResolvedValue(eventRow("League"));
    prisma.match.findMany.mockResolvedValue([matchRow({ id: "m-9", round: 2, slot: 3, winnerTeamId: "t2" })]);

    const result = await getBracketManageableMatches(EVENT_ID);

    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: EVENT_ID }, select: EVENT_SELECT });
    expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith(LEAGUE_FILTER);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: "m-9", eventId: EVENT_ID, roundLabel: "Round 1", homeTeamId: "t1", awayTeamId: "t2",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 2, slot: 3, winnerTeamId: "t2",
      },
    ]);
  });

  it("projects the bracket for a single elimination event", async () => {
    prisma.event.findUnique.mockResolvedValue(eventRow("Single Elimination"));
    prisma.team.findMany.mockResolvedValue([teamRow("t1", "Alpha"), teamRow("t2", "Bravo")]);
    prisma.match.findMany.mockResolvedValue([]);

    const result = await getBracketManageableMatches(EVENT_ID);

    expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith({ where: { eventId: EVENT_ID }, orderBy: { createdAt: "asc" } });
    expect(result).toEqual([
      {
        id: "evt-1-r1-m1", eventId: EVENT_ID, roundLabel: "Final", homeTeamId: "t1", awayTeamId: "t2",
        homeScore: 0, awayScore: 0, status: "Scheduled", round: 1, slot: 1, winnerTeamId: null,
      },
    ]);
  });

  it("passes an event lookup failure on", async () => {
    prisma.event.findUnique.mockRejectedValue(new Error("event db down"));

    await expect(getBracketManageableMatches(EVENT_ID)).rejects.toThrow("event db down");
  });
});

describe("getTeamStandings", () => {
  it("returns an empty table for an event without teams", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValue([]);

    await expect(getTeamStandings(EVENT_ID)).resolves.toEqual([]);
  });

  it("lists every team with zeros before any match is completed", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("t1", "Zulu"), teamRow("t2", "Alpha")]);
    prisma.match.findMany.mockResolvedValue([matchRow({ id: "m-1", homeTeamId: "t1", awayTeamId: "t2", status: "Scheduled", homeScore: 9, awayScore: 0 })]);

    const result = await getTeamStandings(EVENT_ID);

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { captain: { select: { id: true, name: true } } },
    });
    expect(prisma.match.findMany).toHaveBeenCalledWith({ where: { eventId: EVENT_ID }, orderBy: { createdAt: "asc" } });
    // All zero, so the order falls back to the team name.
    expect(result).toEqual([
      { teamId: "t2", teamName: "Alpha", played: 0, wins: 0, draws: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, rank: 1 },
      { teamId: "t1", teamName: "Zulu", played: 0, wins: 0, draws: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, rank: 2 },
    ]);
  });

  it("scores wins with 3 points and draws with 1 point, counting only completed matches", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("a", "Alpha"), teamRow("b", "Bravo"), teamRow("c", "Charlie")]);
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "m-1", homeTeamId: "a", awayTeamId: "b", homeScore: 3, awayScore: 1, status: "Completed" }),
      matchRow({ id: "m-2", homeTeamId: "b", awayTeamId: "c", homeScore: 2, awayScore: 2, status: "Completed" }),
      matchRow({ id: "m-3", homeTeamId: "a", awayTeamId: "c", homeScore: 7, awayScore: 0, status: "Scheduled" }),
    ]);

    const result = await getTeamStandings(EVENT_ID);

    expect(result).toEqual([
      { teamId: "a", teamName: "Alpha", played: 1, wins: 1, draws: 0, losses: 0, points: 3, scoreFor: 3, scoreAgainst: 1, scoreDifference: 2, rank: 1 },
      { teamId: "c", teamName: "Charlie", played: 1, wins: 0, draws: 1, losses: 0, points: 1, scoreFor: 2, scoreAgainst: 2, scoreDifference: 0, rank: 2 },
      { teamId: "b", teamName: "Bravo", played: 2, wins: 0, draws: 1, losses: 1, points: 1, scoreFor: 3, scoreAgainst: 5, scoreDifference: -2, rank: 3 },
    ]);
  });

  it("credits an away win to the away team", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("a", "Alpha"), teamRow("b", "Bravo")]);
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "m-1", homeTeamId: "a", awayTeamId: "b", homeScore: 0, awayScore: 2, status: "Completed" }),
    ]);

    const result = await getTeamStandings(EVENT_ID);

    expect(result.map((row) => [row.teamId, row.rank, row.points, row.wins, row.losses])).toEqual([
      ["b", 1, 3, 1, 0],
      ["a", 2, 0, 0, 1],
    ]);
  });

  it("breaks a points tie by score difference, then by score for, then by team name", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow("d", "Delta"), teamRow("c", "Charlie"), teamRow("b", "Bravo"), teamRow("a", "Alpha"),
    ]);
    prisma.match.findMany.mockResolvedValue([
      // Alpha: 3 points, +1, scoreFor 1. Bravo: 3 points, +1, scoreFor 3. Charlie: 3 points, +3.
      matchRow({ id: "m-1", homeTeamId: "a", awayTeamId: "d", homeScore: 1, awayScore: 0, status: "Completed" }),
      matchRow({ id: "m-2", homeTeamId: "b", awayTeamId: "d", homeScore: 3, awayScore: 2, status: "Completed" }),
      matchRow({ id: "m-3", homeTeamId: "c", awayTeamId: "d", homeScore: 3, awayScore: 0, status: "Completed" }),
    ]);

    const result = await getTeamStandings(EVENT_ID);

    expect(result.map((row) => row.teamId)).toEqual(["c", "b", "a", "d"]);
    expect(result.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it("breaks a full tie by team name", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("b", "Bravo"), teamRow("a", "Alpha")]);
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "m-1", homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 1, status: "Completed" }),
    ]);

    const result = await getTeamStandings(EVENT_ID);

    expect(result.map((row) => [row.teamName, row.rank])).toEqual([["Alpha", 1], ["Bravo", 2]]);
  });

  it("ignores completed matches that involve a team that is not registered for the event", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("a", "Alpha"), teamRow("b", "Bravo")]);
    prisma.match.findMany.mockResolvedValue([
      matchRow({ id: "m-1", homeTeamId: "a", awayTeamId: "ghost", homeScore: 5, awayScore: 0, status: "Completed" }),
    ]);

    const result = await getTeamStandings(EVENT_ID);

    expect(result.every((row) => row.played === 0 && row.points === 0)).toBe(true);
  });

  it("passes a match lookup failure on", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow("a", "Alpha")]);
    prisma.match.findMany.mockRejectedValue(new Error("matches down"));

    await expect(getTeamStandings(EVENT_ID)).rejects.toThrow("matches down");
  });

  it("passes a team lookup failure on", async () => {
    prisma.team.findMany.mockRejectedValue(new Error("teams down"));
    prisma.match.findMany.mockResolvedValue([]);

    await expect(getTeamStandings(EVENT_ID)).rejects.toThrow("teams down");
  });
});
