import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: {
  player: { findMany: vi.fn() },
  playerStat: { findMany: vi.fn() },
  match: { findMany: vi.fn() },
} }));
vi.mock("./db", () => ({ prisma }));

import { getMatchStatRecordings, getMatchTeamRosters } from "./stat-recording-repository";

const matches = [
  { id: "m1", homeTeamId: "a", awayTeamId: "b" },
  { id: "m2", homeTeamId: "a", awayTeamId: "b" },
];
const longAgo = new Date("2026-10-01T00:00:00Z");
const matchStart = new Date("2026-10-12T10:00:00Z");
const laterOn = new Date("2026-10-14T00:00:00Z");
const member = (id: string, teamId: string, createdAt = longAgo, removedAt: Date | null = null) => ({ id, teamId, nickname: id.toUpperCase(), position: "Forward", createdAt, removedAt });
const players = [member("p1", "a"), member("p2", "b")];
const clocks = [
  { id: "m1", actualStartedAt: matchStart, actualEndedAt: null, resultConfirmedAt: null },
  { id: "m2", actualStartedAt: null, actualEndedAt: null, resultConfirmedAt: null },
];
const row = (playerId: string, teamId: string, source: string | null = "admin") =>
  ({ matchId: "m1", teamId, playerId, stats: { goal: 0 }, source });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.player.findMany.mockResolvedValue(players);
  prisma.playerStat.findMany.mockResolvedValue([]);
  prisma.match.findMany.mockResolvedValue(clocks);
});

describe("batch match recording lookup", () => {
  it("scopes both queries to the active event and fetches once for multiple cards", async () => {
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "a")]);
    const result = await getMatchStatRecordings("event", matches, ["goal"]);
    expect(result.get("m1")).toEqual({ status: "partial", home: "recorded", away: "unrecorded" });
    expect(result.get("m2")?.status).toBe("unrecorded");
    expect(prisma.player.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { teamId: { in: ["a", "b"] }, team: { eventId: "event" } },
      select: { id: true, teamId: true, createdAt: true, removedAt: true, rosterGaps: true },
    });
    expect(prisma.match.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["m1", "m2"] }, eventId: "event" },
      select: { id: true, actualStartedAt: true, actualEndedAt: true, resultConfirmedAt: true },
    });
    expect(prisma.playerStat.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { matchId: { in: ["m1", "m2"] }, match: { eventId: "event" } },
      select: { matchId: true, teamId: true, playerId: true, stats: true },
    });
  });

  it.each(["captain", "admin", null])("counts persisted %s statistics, including legacy data", async (source) => {
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "a", source), row("p2", "b", source)]);
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("recorded");
  });

  it("recomputes from saved rows after approval, partial failure, edit, and reload", async () => {
    // Pending/rejected submissions have no PlayerStat rows.
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("unrecorded");
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "a", "captain")]);
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("partial");
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "a", "captain"), row("p2", "b")]);
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("recorded");
    prisma.playerStat.findMany.mockResolvedValue([{ ...row("p1", "a"), stats: { goal: 2 } }, row("p2", "b")]);
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("recorded");
  });

  it("does not count rows assigned to the opposing team", async () => {
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "b"), row("p2", "a")]);
    expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("unrecorded");
  });

  describe("roster changes during the group stage", () => {
    it("does not turn an old recorded match into partial when a player joins later", async () => {
      prisma.player.findMany.mockResolvedValue([...players, member("p3", "a", laterOn)]);
      prisma.playerStat.findMany.mockResolvedValue([row("p1", "a"), row("p2", "b")]);
      expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("recorded");
    });

    it("still expects stats from a player who played the match and left afterwards", async () => {
      prisma.player.findMany.mockResolvedValue([member("p1", "a"), member("p0", "a", longAgo, laterOn), member("p2", "b")]);
      prisma.playerStat.findMany.mockResolvedValue([row("p1", "a"), row("p2", "b")]);
      expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")).toEqual({ status: "partial", home: "partial", away: "recorded" });
    });

    it("counts a player who left once their stats are saved", async () => {
      prisma.player.findMany.mockResolvedValue([member("p1", "a"), member("p0", "a", longAgo, laterOn), member("p2", "b")]);
      prisma.playerStat.findMany.mockResolvedValue([row("p0", "a"), row("p1", "a"), row("p2", "b")]);
      expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.status).toBe("recorded");
    });

    it("uses only active players for a match without a real start time", async () => {
      prisma.player.findMany.mockResolvedValue([member("p1", "a"), member("p0", "a", longAgo, laterOn), member("p2", "b")]);
      prisma.playerStat.findMany.mockResolvedValue([{ ...row("p1", "a"), matchId: "m2" }, { ...row("p2", "b"), matchId: "m2" }]);
      expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m2")?.status).toBe("recorded");
    });

    it("reports a missing roster when every player had left before the match started", async () => {
      prisma.player.findMany.mockResolvedValue([member("p0", "a", longAgo, new Date("2026-10-02T00:00:00Z")), member("p2", "b")]);
      expect((await getMatchStatRecordings("event", matches, ["goal"])).get("m1")?.home).toBe("missingRoster");
    });
  });

  it("skips queries when there are no cards or configured statistics", async () => {
    expect(await getMatchStatRecordings("event", [], ["goal"])).toEqual(new Map());
    expect((await getMatchStatRecordings("event", matches, [])).get("m1")?.status).toBe("notRequired");
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(prisma.playerStat.findMany).not.toHaveBeenCalled();
    expect(prisma.match.findMany).not.toHaveBeenCalled();
  });
});

describe("roster per completed match", () => {
  const pairs = [{ matchId: "m1", teamId: "a" }, { matchId: "m2", teamId: "a" }];

  it("lists, for each match, the team's roster as it was when that match started", async () => {
    prisma.player.findMany.mockResolvedValue([member("p1", "a"), member("p0", "a", longAgo, laterOn), member("p3", "a", laterOn)]);
    const rosters = await getMatchTeamRosters(pairs);
    expect(rosters.get("m1::a")?.map((player) => player.id)).toEqual(["p1", "p0"]);
    // m2 has no real start time, so only today's active players count.
    expect(rosters.get("m2::a")?.map((player) => player.id)).toEqual(["p1", "p3"]);
  });

  it("keeps a player with saved stats for the match and exposes only what the form needs", async () => {
    prisma.player.findMany.mockResolvedValue([member("p1", "a"), member("p3", "a", laterOn)]);
    prisma.playerStat.findMany.mockResolvedValue([row("p3", "a")]);
    const rosters = await getMatchTeamRosters([{ matchId: "m1", teamId: "a" }]);
    expect(rosters.get("m1::a")).toEqual([
      { id: "p1", nickname: "P1", position: "Forward" },
      { id: "p3", nickname: "P3", position: "Forward" },
    ]);
  });

  it("skips queries when there are no completed matches", async () => {
    expect(await getMatchTeamRosters([])).toEqual(new Map());
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });
});
