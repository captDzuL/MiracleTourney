import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, getPlayerStatFormContext } = vi.hoisted(() => ({
  prisma: {
    statSubmission: { findMany: vi.fn() },
    match: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    player: { findMany: vi.fn() },
    playerStat: { findMany: vi.fn() },
  },
  getPlayerStatFormContext: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/player-stats/repository", () => ({ getPlayerStatFormContext }));

import type { AppUser } from "@/lib/platform/types";

import { getMatchWithRosterAndStats, getPendingStatSubmissions } from "./write-repository";

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    matchId: "match-1",
    teamId: "team-1",
    eventId: "evt-1",
    submittedBy: "user-1",
    status: "pending",
    rejectionNote: null,
    stats: { p1: { points: 10 } },
    submittedAt: new Date("2026-03-01T10:00:00.000Z"),
    ...overrides,
  };
}

function setupLookups(input: {
  matches?: unknown[];
  teams?: unknown[];
  events?: unknown[];
  users?: unknown[];
} = {}) {
  prisma.match.findMany.mockResolvedValue(input.matches ?? []);
  prisma.team.findMany.mockResolvedValue(input.teams ?? []);
  prisma.event.findMany.mockResolvedValue(input.events ?? []);
  prisma.user.findMany.mockResolvedValue(input.users ?? []);
}

const ADMIN: AppUser = { id: "admin-1", email: "admin@example.com", name: "Admin", role: "admin" };
const ORGANIZER: AppUser = { id: "org-1", email: "org@example.com", name: "Organizer", role: "organizer" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getPendingStatSubmissions", () => {
  it("reads pending submissions oldest first for an anonymous caller without an event filter", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([]);

    await getPendingStatSubmissions();

    expect(prisma.statSubmission.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith({
      where: { status: "pending" },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("does not filter by event for an admin", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([]);

    await getPendingStatSubmissions(ADMIN);

    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith({
      where: { status: "pending" },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("limits an organizer to submissions of events they organize", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([]);

    await getPendingStatSubmissions(ORGANIZER);

    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith({
      where: { status: "pending", event: { organizerUserId: "org-1" } },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("returns an empty list without display lookups when nothing is pending", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([]);

    const result = await getPendingStatSubmissions(ADMIN);

    expect(result).toEqual([]);
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(prisma.team.findMany).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("looks up match, team, event and captain by the ids found in the submissions", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([
      submissionRow({ id: "sub-1", matchId: "m-1", teamId: "t-1", eventId: "e-1", submittedBy: "u-1" }),
      submissionRow({ id: "sub-2", matchId: "m-2", teamId: "t-2", eventId: "e-2", submittedBy: "u-2" }),
    ]);
    setupLookups();

    await getPendingStatSubmissions(ADMIN);

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["m-1", "m-2"] } },
      select: { id: true, roundLabel: true, slot: true },
    });
    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["t-1", "t-2"] } },
      select: { id: true, name: true },
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["e-1", "e-2"] } },
      select: { id: true, name: true },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1", "u-2"] } },
      select: { id: true, email: true },
    });
  });

  it("does not remove repeated ids from the lookups", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([
      submissionRow({ id: "sub-1", teamId: "t-1" }),
      submissionRow({ id: "sub-2", teamId: "t-2" }),
    ]);
    setupLookups();

    await getPendingStatSubmissions(ADMIN);

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["match-1", "match-1"] } },
      select: { id: true, roundLabel: true, slot: true },
    });
  });

  it("returns the submission with match label, team name, captain email and event name", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([submissionRow({ rejectionNote: "Fix assists" })]);
    setupLookups({
      matches: [{ id: "match-1", roundLabel: "Semifinal", slot: 2 }],
      teams: [{ id: "team-1", name: "Alpha" }],
      events: [{ id: "evt-1", name: "Kuroko Cup" }],
      users: [{ id: "user-1", email: "captain@example.com" }],
    });

    const result = await getPendingStatSubmissions(ADMIN);

    expect(result).toEqual([
      {
        id: "sub-1",
        matchId: "match-1",
        teamId: "team-1",
        eventId: "evt-1",
        submittedBy: "user-1",
        status: "pending",
        rejectionNote: "Fix assists",
        stats: { p1: { points: 10 } },
        submittedAt: new Date("2026-03-01T10:00:00.000Z"),
        matchLabel: "Semifinal · Match 2",
        teamName: "Alpha",
        captainEmail: "captain@example.com",
        eventName: "Kuroko Cup",
      },
    ]);
  });

  it("leaves the match number out of the label when the match has no slot", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([submissionRow()]);
    setupLookups({ matches: [{ id: "match-1", roundLabel: "Final", slot: null }] });

    const [row] = await getPendingStatSubmissions(ADMIN);

    expect(row.matchLabel).toBe("Final");
  });

  it("keeps a match number of zero in the label", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([submissionRow()]);
    setupLookups({ matches: [{ id: "match-1", roundLabel: "Final", slot: 0 }] });

    const [row] = await getPendingStatSubmissions(ADMIN);

    expect(row.matchLabel).toBe("Final · Match 0");
  });

  it("shows the raw ids when the match, team, captain or event cannot be found", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([submissionRow()]);
    setupLookups();

    const [row] = await getPendingStatSubmissions(ADMIN);

    expect(row.matchLabel).toBe("match-1");
    expect(row.teamName).toBe("team-1");
    expect(row.captainEmail).toBe("user-1");
    expect(row.eventName).toBe("evt-1");
  });

  it("matches each submission to its own lookup rows and keeps the submission order", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([
      submissionRow({ id: "sub-b", matchId: "m-b", teamId: "t-b", eventId: "e-b", submittedBy: "u-b" }),
      submissionRow({ id: "sub-a", matchId: "m-a", teamId: "t-a", eventId: "e-a", submittedBy: "u-a" }),
    ]);
    setupLookups({
      matches: [{ id: "m-a", roundLabel: "Round 1", slot: 1 }, { id: "m-b", roundLabel: "Final", slot: null }],
      teams: [{ id: "t-a", name: "Alpha" }, { id: "t-b", name: "Bravo" }],
      events: [{ id: "e-a", name: "Cup A" }, { id: "e-b", name: "Cup B" }],
      users: [{ id: "u-a", email: "a@example.com" }, { id: "u-b", email: "b@example.com" }],
    });

    const result = await getPendingStatSubmissions(ADMIN);

    expect(result.map((row) => [row.id, row.matchLabel, row.teamName, row.eventName, row.captainEmail])).toEqual([
      ["sub-b", "Final", "Bravo", "Cup B", "b@example.com"],
      ["sub-a", "Round 1 · Match 1", "Alpha", "Cup A", "a@example.com"],
    ]);
  });

  it("passes a submission lookup failure on", async () => {
    prisma.statSubmission.findMany.mockRejectedValue(new Error("db down"));

    await expect(getPendingStatSubmissions(ADMIN)).rejects.toThrow("db down");
    expect(prisma.match.findMany).not.toHaveBeenCalled();
  });

  it("passes a display lookup failure on", async () => {
    prisma.statSubmission.findMany.mockResolvedValue([submissionRow()]);
    setupLookups();
    prisma.user.findMany.mockRejectedValue(new Error("users down"));

    await expect(getPendingStatSubmissions(ADMIN)).rejects.toThrow("users down");
  });
});

const MATCH_SELECT = {
  id: true,
  homeTeamId: true,
  awayTeamId: true,
  status: true,
  eventId: true,
  actualStartedAt: true,
  actualEndedAt: true,
  resultConfirmedAt: true,
};

function matchClockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    homeTeamId: "home",
    awayTeamId: "away",
    status: "Completed",
    eventId: "evt-1",
    actualStartedAt: null,
    actualEndedAt: null,
    resultConfirmedAt: null,
    ...overrides,
  };
}

function playerRow(id: string, teamId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    teamId,
    eventId: "evt-1",
    displayName: `Name ${id}`,
    nickname: `Nick ${id}`,
    position: "Guard",
    jerseyNumber: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    removedAt: null,
    rosterGaps: [],
    ...overrides,
  };
}

const MATCH_START = new Date("2026-02-01T12:00:00.000Z");

describe("getMatchWithRosterAndStats", () => {
  it("returns null without further queries when the match does not exist", async () => {
    prisma.match.findUnique.mockResolvedValue(null);

    const result = await getMatchWithRosterAndStats("missing");

    expect(result).toBeNull();
    expect(prisma.match.findUnique).toHaveBeenCalledWith({ where: { id: "missing" }, select: MATCH_SELECT });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(prisma.playerStat.findMany).not.toHaveBeenCalled();
    expect(getPlayerStatFormContext).not.toHaveBeenCalled();
  });

  it.each([
    ["home", { homeTeamId: "" }],
    ["away", { awayTeamId: "" }],
  ])("returns null when the %s team is missing", async (_side, overrides) => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow(overrides));

    await expect(getMatchWithRosterAndStats("match-1")).resolves.toBeNull();
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("reads the players of both teams, the saved stats and the form context of the match", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow());
    prisma.player.findMany.mockResolvedValue([]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    await getMatchWithRosterAndStats("match-1");

    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: { teamId: { in: ["home", "away"] } },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    });
    expect(prisma.playerStat.findMany).toHaveBeenCalledWith({ where: { matchId: "match-1" } });
    expect(getPlayerStatFormContext).toHaveBeenCalledWith("match-1", "evt-1");
  });

  it("splits the roster by team, maps players and returns saved stats by player id", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow());
    prisma.player.findMany.mockResolvedValue([
      playerRow("p1", "home", { jerseyNumber: 7 }),
      playerRow("p2", "home"),
      playerRow("p3", "away", { eventId: null, jerseyNumber: 0 }),
    ]);
    prisma.playerStat.findMany.mockResolvedValue([
      { playerId: "p1", stats: { points: 12 } },
      { playerId: "p3", stats: { points: 4 } },
    ]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: [1, 2] });

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result).toEqual({
      match: { id: "match-1", homeTeamId: "home", awayTeamId: "away", status: "Completed", eventId: "evt-1" },
      homePlayers: [
        { id: "p1", teamId: "home", eventId: "evt-1", displayName: "Name p1", nickname: "Nick p1", position: "Guard", jerseyNumber: 7 },
        { id: "p2", teamId: "home", eventId: "evt-1", displayName: "Name p2", nickname: "Nick p2", position: "Guard" },
      ],
      awayPlayers: [
        { id: "p3", teamId: "away", displayName: "Name p3", nickname: "Nick p3", position: "Guard", jerseyNumber: 0 },
      ],
      existingStats: { p1: { points: 12 }, p3: { points: 4 } },
      scoreGameNumbers: [1, 2],
    });
  });

  it("returns empty rosters and no stats for a match without players", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow());
    prisma.player.findMany.mockResolvedValue([]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result).toMatchObject({ homePlayers: [], awayPlayers: [], existingStats: {}, scoreGameNumbers: null });
  });

  it("returns null score game numbers when the form context cannot be built", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow({ status: "Scheduled" }));
    prisma.player.findMany.mockResolvedValue([]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockRejectedValue(new Error("Completed match not found."));

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result).toMatchObject({ match: { status: "Scheduled" }, scoreGameNumbers: null });
  });

  it("keeps only active players when the match has no start, end or confirmation time", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow());
    prisma.player.findMany.mockResolvedValue([
      playerRow("active", "home"),
      playerRow("removed", "home", { removedAt: new Date("2026-01-15T00:00:00.000Z") }),
    ]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result?.homePlayers.map((player) => player.id)).toEqual(["active"]);
  });

  it("uses the roster at the time the match started instead of today's roster", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow({ actualStartedAt: MATCH_START }));
    prisma.player.findMany.mockResolvedValue([
      playerRow("veteran", "home"),
      playerRow("joined-later", "home", { createdAt: new Date("2026-02-10T00:00:00.000Z") }),
      playerRow("left-before", "home", { removedAt: new Date("2026-01-20T00:00:00.000Z") }),
      playerRow("left-after", "away", { removedAt: new Date("2026-02-20T00:00:00.000Z") }),
      playerRow("away-during-gap", "away", {
        rosterGaps: [{ from: "2026-01-25T00:00:00.000Z", to: "2026-02-05T00:00:00.000Z" }],
      }),
      playerRow("away-after-gap", "away", {
        rosterGaps: [{ from: "2026-01-10T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" }],
      }),
    ]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result?.homePlayers.map((player) => player.id)).toEqual(["veteran"]);
    expect(result?.awayPlayers.map((player) => player.id)).toEqual(["left-after", "away-after-gap"]);
  });

  it("includes a player who joined after the match when stats are already saved for them", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow({ actualStartedAt: MATCH_START }));
    prisma.player.findMany.mockResolvedValue([
      playerRow("joined-later", "home", { createdAt: new Date("2026-02-10T00:00:00.000Z") }),
    ]);
    prisma.playerStat.findMany.mockResolvedValue([{ playerId: "joined-later", stats: { points: 3 } }]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    const result = await getMatchWithRosterAndStats("match-1");

    expect(result?.homePlayers.map((player) => player.id)).toEqual(["joined-later"]);
    expect(result?.existingStats).toEqual({ "joined-later": { points: 3 } });
  });

  it("falls back to the end time and then the confirmation time when the match has no start time", async () => {
    prisma.player.findMany.mockResolvedValue([
      playerRow("early", "home", { createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      playerRow("mid", "home", { createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    ]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    prisma.match.findUnique.mockResolvedValueOnce(matchClockRow({ actualEndedAt: new Date("2026-02-01T00:00:00.000Z"), resultConfirmedAt: new Date("2026-04-01T00:00:00.000Z") }));
    const byEndTime = await getMatchWithRosterAndStats("match-1");
    prisma.match.findUnique.mockResolvedValueOnce(matchClockRow({ resultConfirmedAt: new Date("2026-04-01T00:00:00.000Z") }));
    const byConfirmation = await getMatchWithRosterAndStats("match-1");

    expect(byEndTime?.homePlayers.map((player) => player.id)).toEqual(["early"]);
    expect(byConfirmation?.homePlayers.map((player) => player.id)).toEqual(["early", "mid"]);
  });

  it("passes a match lookup failure on", async () => {
    prisma.match.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getMatchWithRosterAndStats("match-1")).rejects.toThrow("db down");
  });

  it("passes a roster lookup failure on", async () => {
    prisma.match.findUnique.mockResolvedValue(matchClockRow());
    prisma.player.findMany.mockRejectedValue(new Error("players down"));
    prisma.playerStat.findMany.mockResolvedValue([]);
    getPlayerStatFormContext.mockResolvedValue({ scoreGameNumbers: null });

    await expect(getMatchWithRosterAndStats("match-1")).rejects.toThrow("players down");
  });
});
