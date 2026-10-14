import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: { findFirst: vi.fn(), findMany: vi.fn() },
    event: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    statSubmission: { findMany: vi.fn() },
    eventRoundConfig: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { getCompletedMatchesForCaptain, getPlayerStatFormContext } from "./repository";

const EVENT_ID = "evt-1";
const MISSING_GAMES_MESSAGE = "Completed MatchGame rows are required before entering player scores.";

const FORM_CONTEXT_SELECT = {
  id: true,
  eventId: true,
  status: true,
  homeTeamId: true,
  awayTeamId: true,
  roundLabel: true,
  resultSnapshot: true,
  games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
  event: { select: { gameId: true, gameModeId: true } },
};

function formMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    eventId: EVENT_ID,
    status: "Completed",
    homeTeamId: "home",
    awayTeamId: "away",
    roundLabel: "Final",
    resultSnapshot: null,
    games: [],
    event: { gameId: "game-kuroko", gameModeId: "mode-kuroko-3v3" },
    ...overrides,
  };
}

function flashpeakMatchRow(overrides: Record<string, unknown> = {}) {
  return formMatchRow({ event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" }, ...overrides });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getPlayerStatFormContext", () => {
  it("looks up the match by id, event and Completed status", async () => {
    prisma.match.findFirst.mockResolvedValue(formMatchRow());

    await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(prisma.match.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.match.findFirst).toHaveBeenCalledWith({
      where: { id: "match-1", eventId: EVENT_ID, status: "Completed" },
      select: FORM_CONTEXT_SELECT,
    });
  });

  it("throws when no completed match is found", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(getPlayerStatFormContext("match-1", EVENT_ID)).rejects.toThrow("Completed match not found.");
    expect(prisma.eventRoundConfig.findUnique).not.toHaveBeenCalled();
  });

  it("returns the match summary and the stat keys of the game mode, without score slots, for a non-Flashpeak game", async () => {
    prisma.match.findFirst.mockResolvedValue(formMatchRow({ games: [{ gameNumber: 1 }, { gameNumber: 2 }] }));

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result).toEqual({
      match: { id: "match-1", eventId: EVENT_ID, status: "Completed", homeTeamId: "home", awayTeamId: "away" },
      allowedStatKeys: ["points", "assists", "rebounds", "steals", "blocks", "flb"],
      scoreGameNumbers: null,
    });
    expect(prisma.eventRoundConfig.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the first mode of the game when the mode id is unknown", async () => {
    prisma.match.findFirst.mockResolvedValue(formMatchRow({ event: { gameId: "game-kuroko", gameModeId: "mode-unknown" } }));

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.allowedStatKeys).toEqual(["points", "assists", "rebounds", "steals", "blocks", "flb"]);
  });

  it("returns no stat keys when both the mode and the game are unknown", async () => {
    prisma.match.findFirst.mockResolvedValue(formMatchRow({ event: { gameId: "game-unknown", gameModeId: "mode-unknown" } }));

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.allowedStatKeys).toEqual([]);
    expect(result.scoreGameNumbers).toBeNull();
  });

  it("uses the persisted game numbers for a Flashpeak match and reads the round setting by event and round label", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow({ games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] }));
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 3 });

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(prisma.eventRoundConfig.findUnique).toHaveBeenCalledWith({
      where: { eventId_roundLabel: { eventId: EVENT_ID, roundLabel: "Final" } },
      select: { bestOf: true },
    });
    expect(result).toEqual({
      match: { id: "match-1", eventId: EVENT_ID, status: "Completed", homeTeamId: "home", awayTeamId: "away" },
      allowedStatKeys: ["goal", "assist", "passing", "defense"],
      scoreGameNumbers: [1, 2, 3],
    });
  });

  it("uses the games stored in the result snapshot when no MatchGame row exists", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow({ resultSnapshot: { games: [{ gameNumber: 1 }, { gameNumber: 2 }] } }));
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 3 });

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.scoreGameNumbers).toEqual([1, 2]);
  });

  it("gives one score slot for a best-of-1 round without any game rows", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow());
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 1 });

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.scoreGameNumbers).toEqual([1]);
  });

  it("assumes best-of-1 when there is no round setting and no snapshot", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow());
    prisma.eventRoundConfig.findUnique.mockResolvedValue(null);

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.scoreGameNumbers).toEqual([1]);
  });

  it("throws when a best-of-3 round has no game rows", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow());
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 3 });

    await expect(getPlayerStatFormContext("match-1", EVENT_ID)).rejects.toThrow(MISSING_GAMES_MESSAGE);
  });

  it("takes bestOf from the snapshot when the round has no setting", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow({ resultSnapshot: { bestOf: 3 } }));
    prisma.eventRoundConfig.findUnique.mockResolvedValue(null);

    await expect(getPlayerStatFormContext("match-1", EVENT_ID)).rejects.toThrow(MISSING_GAMES_MESSAGE);
  });

  it("prefers the round setting over the snapshot bestOf", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow({ resultSnapshot: { bestOf: 3 } }));
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 1 });

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.scoreGameNumbers).toEqual([1]);
  });

  it.each([
    ["a string", { bestOf: "3" }],
    ["a fraction", { bestOf: 2.5 }],
    ["an array snapshot", [{ bestOf: 3 }]],
    ["a snapshot without bestOf", {}],
  ])("ignores a snapshot bestOf that is %s", async (_label, resultSnapshot) => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow({ resultSnapshot }));
    prisma.eventRoundConfig.findUnique.mockResolvedValue(null);

    const result = await getPlayerStatFormContext("match-1", EVENT_ID);

    expect(result.scoreGameNumbers).toEqual([1]);
  });

  it("passes a match lookup failure on", async () => {
    prisma.match.findFirst.mockRejectedValue(new Error("db down"));

    await expect(getPlayerStatFormContext("match-1", EVENT_ID)).rejects.toThrow("db down");
  });

  it("passes a round setting lookup failure on", async () => {
    prisma.match.findFirst.mockResolvedValue(flashpeakMatchRow());
    prisma.eventRoundConfig.findUnique.mockRejectedValue(new Error("config down"));

    await expect(getPlayerStatFormContext("match-1", EVENT_ID)).rejects.toThrow("config down");
  });
});

function captainTeam(id: string, name: string, eventId: string | null) {
  return { id, name, eventId };
}

function completedMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    eventId: "evt-1",
    roundLabel: "Final",
    homeTeamId: "t1",
    awayTeamId: "t2",
    homeScore: 3,
    awayScore: 1,
    status: "Completed",
    slot: 1,
    round: 1,
    resultSnapshot: null,
    games: [],
    ...overrides,
  };
}

const KURO_EVENT = { id: "evt-1", name: "Kuroko Cup", gameId: "game-kuroko", gameModeId: "mode-kuroko-3v3" };
const FLASH_EVENT = { id: "evt-2", name: "Flash Cup", gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" };

function setupCaptainQueries(input: {
  captainTeams: ReturnType<typeof captainTeam>[];
  matches?: unknown[];
  events?: unknown[];
  allTeams?: unknown[];
  submissions?: unknown[];
  roundConfigs?: unknown[];
}) {
  prisma.team.findMany
    .mockResolvedValueOnce(input.captainTeams)
    .mockResolvedValueOnce(input.allTeams ?? []);
  prisma.match.findMany.mockResolvedValue(input.matches ?? []);
  prisma.event.findMany.mockResolvedValue(input.events ?? []);
  prisma.statSubmission.findMany.mockResolvedValue(input.submissions ?? []);
  prisma.eventRoundConfig.findMany.mockResolvedValue(input.roundConfigs ?? []);
}

describe("getCompletedMatchesForCaptain", () => {
  it("returns an empty list without further queries when the captain has no team", async () => {
    prisma.team.findMany.mockResolvedValueOnce([]);

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result).toEqual([]);
    expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { captainId: "cap-1" },
      select: { id: true, name: true, eventId: true },
    });
    expect(prisma.match.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty list without further queries when no captain team is registered for an event", async () => {
    prisma.team.findMany.mockResolvedValueOnce([captainTeam("t1", "Alpha", null)]);

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result).toEqual([]);
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(prisma.statSubmission.findMany).not.toHaveBeenCalled();
  });

  it("queries matches, events, teams, submissions and round settings for the event teams only", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1"), captainTeam("t9", "Loose", null), captainTeam("t3", "Gamma", "evt-1"), captainTeam("t5", "Echo", "evt-2")],
    });

    await getCompletedMatchesForCaptain("cap-1");

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["evt-1", "evt-2"] },
        status: "Completed",
        OR: [{ homeTeamId: { in: ["t1", "t3", "t5"] } }, { awayTeamId: { in: ["t1", "t3", "t5"] } }],
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
      include: { games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } } },
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["evt-1", "evt-2"] } },
      select: { id: true, name: true, gameId: true, gameModeId: true },
    });
    expect(prisma.team.findMany).toHaveBeenNthCalledWith(2, {
      where: { eventId: { in: ["evt-1", "evt-2"] } },
      select: { id: true, name: true, eventId: true },
    });
    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith({ where: { teamId: { in: ["t1", "t3", "t5"] } } });
    expect(prisma.eventRoundConfig.findMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["evt-1", "evt-2"] } },
      select: { eventId: true, roundLabel: true, bestOf: true },
    });
  });

  it("returns an empty list when the captain teams have no completed matches", async () => {
    setupCaptainQueries({ captainTeams: [captainTeam("t1", "Alpha", "evt-1")], events: [KURO_EVENT] });

    await expect(getCompletedMatchesForCaptain("cap-1")).resolves.toEqual([]);
  });

  it("builds a row with opponent name and a null submission when the captain is the home team", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch()],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t1", "Alpha", "evt-1"), captainTeam("t2", "Bravo", "evt-1")],
    });

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result).toEqual([
      {
        matchId: "match-1",
        matchLabel: "Final",
        slot: 1,
        eventId: "evt-1",
        eventName: "Kuroko Cup",
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        teamId: "t1",
        teamName: "Alpha",
        opponentName: "Bravo",
        homeScore: 3,
        awayScore: 1,
        scoreGameNumbers: null,
        submission: null,
      },
    ]);
  });

  it("uses the home team as opponent and keeps the score order when the captain is the away team", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t2", "Bravo", "evt-1")],
      matches: [completedMatch({ slot: null })],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t1", "Alpha", "evt-1"), captainTeam("t2", "Bravo", "evt-1")],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row).toMatchObject({ teamId: "t2", teamName: "Bravo", opponentName: "Alpha", homeScore: 3, awayScore: 1, slot: null });
  });

  it("falls back to Unknown when the opponent team cannot be found", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch()],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t1", "Alpha", "evt-1")],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row.opponentName).toBe("Unknown");
  });

  it("skips matches whose event cannot be found", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch()],
      events: [],
      allTeams: [captainTeam("t2", "Bravo", "evt-1")],
    });

    await expect(getCompletedMatchesForCaptain("cap-1")).resolves.toEqual([]);
  });

  it("skips captain teams that are not part of the match", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1"), captainTeam("t7", "Other", "evt-1")],
      matches: [completedMatch()],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-1")],
    });

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result.map((row) => row.teamId)).toEqual(["t1"]);
  });

  it("returns one row per captain team when the captain owns both sides of a match", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t2", "Bravo", "evt-1"), captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch()],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t1", "Alpha", "evt-1"), captainTeam("t2", "Bravo", "evt-1")],
    });

    const result = await getCompletedMatchesForCaptain("cap-1");

    // Rows follow the order of the captain's teams, not home then away.
    expect(result.map((row) => [row.teamId, row.opponentName])).toEqual([["t2", "Alpha"], ["t1", "Bravo"]]);
  });

  it("keeps the order of the matches the database returned", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch({ id: "match-b", slot: 1 }), completedMatch({ id: "match-a", slot: 2 })],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-1")],
    });

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result.map((row) => row.matchId)).toEqual(["match-b", "match-a"]);
  });

  it("attaches only the submission of the same match and team", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-1")],
      matches: [completedMatch({ id: "match-1" }), completedMatch({ id: "match-2", slot: 2 })],
      events: [KURO_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-1")],
      submissions: [
        { id: "sub-1", matchId: "match-1", teamId: "t1", status: "rejected", rejectionNote: "Check goals", stats: { p1: { points: 4 } } },
        { id: "sub-other-team", matchId: "match-2", teamId: "t2", status: "pending", rejectionNote: null, stats: {} },
      ],
    });

    const result = await getCompletedMatchesForCaptain("cap-1");

    expect(result[0].submission).toEqual({ id: "sub-1", status: "rejected", rejectionNote: "Check goals", stats: { p1: { points: 4 } } });
    expect(result[1].submission).toBeNull();
  });

  it("gives score game numbers from the match games for a Flashpeak event", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-2")],
      matches: [completedMatch({ eventId: "evt-2", games: [{ gameNumber: 1 }, { gameNumber: 2 }] })],
      events: [FLASH_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-2")],
      roundConfigs: [{ eventId: "evt-2", roundLabel: "Final", bestOf: 3 }],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row.scoreGameNumbers).toEqual([1, 2]);
    expect(row.gameId).toBe("game-flashpeak");
  });

  it("gives one score slot for a Flashpeak match without game rows when the round is best-of-1 by default", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-2")],
      matches: [completedMatch({ eventId: "evt-2" })],
      events: [FLASH_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-2")],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row.scoreGameNumbers).toEqual([1]);
  });

  it("returns an empty score list instead of throwing when a best-of-3 Flashpeak match has no game rows", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-2")],
      matches: [completedMatch({ eventId: "evt-2" })],
      events: [FLASH_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-2")],
      roundConfigs: [{ eventId: "evt-2", roundLabel: "Final", bestOf: 3 }],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row.scoreGameNumbers).toEqual([]);
  });

  it("ignores round settings of another event or another round", async () => {
    setupCaptainQueries({
      captainTeams: [captainTeam("t1", "Alpha", "evt-2")],
      matches: [completedMatch({ eventId: "evt-2" })],
      events: [FLASH_EVENT],
      allTeams: [captainTeam("t2", "Bravo", "evt-2")],
      roundConfigs: [
        { eventId: "evt-1", roundLabel: "Final", bestOf: 3 },
        { eventId: "evt-2", roundLabel: "Semifinal", bestOf: 3 },
      ],
    });

    const [row] = await getCompletedMatchesForCaptain("cap-1");

    expect(row.scoreGameNumbers).toEqual([1]);
  });

  it("passes a failure of any of the batched queries on", async () => {
    setupCaptainQueries({ captainTeams: [captainTeam("t1", "Alpha", "evt-1")] });
    prisma.statSubmission.findMany.mockRejectedValue(new Error("submissions down"));

    await expect(getCompletedMatchesForCaptain("cap-1")).rejects.toThrow("submissions down");
  });

  it("passes a captain team lookup failure on", async () => {
    prisma.team.findMany.mockRejectedValueOnce(new Error("teams down"));

    await expect(getCompletedMatchesForCaptain("cap-1")).rejects.toThrow("teams down");
  });
});
