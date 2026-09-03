import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: {
  player: { findMany: vi.fn() },
  playerStat: { findMany: vi.fn() },
} }));
vi.mock("./db", () => ({ prisma }));

import { getMatchStatRecordings } from "./stat-recording-repository";

const matches = [
  { id: "m1", homeTeamId: "a", awayTeamId: "b" },
  { id: "m2", homeTeamId: "a", awayTeamId: "b" },
];
const players = [{ id: "p1", teamId: "a" }, { id: "p2", teamId: "b" }];
const row = (playerId: string, teamId: string, source: string | null = "admin") =>
  ({ matchId: "m1", teamId, playerId, stats: { goal: 0 }, source });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.player.findMany.mockResolvedValue(players);
  prisma.playerStat.findMany.mockResolvedValue([]);
});

describe("batch match recording lookup", () => {
  it("scopes both queries to the active event and fetches once for multiple cards", async () => {
    prisma.playerStat.findMany.mockResolvedValue([row("p1", "a")]);
    const result = await getMatchStatRecordings("event", matches, ["goal"]);
    expect(result.get("m1")).toEqual({ status: "partial", home: "recorded", away: "unrecorded" });
    expect(result.get("m2")?.status).toBe("unrecorded");
    expect(prisma.player.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { teamId: { in: ["a", "b"] }, team: { eventId: "event" } },
      select: { id: true, teamId: true },
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

  it("skips queries when there are no cards or configured statistics", async () => {
    expect(await getMatchStatRecordings("event", [], ["goal"])).toEqual(new Map());
    expect((await getMatchStatRecordings("event", matches, [])).get("m1")?.status).toBe("notRequired");
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(prisma.playerStat.findMany).not.toHaveBeenCalled();
  });
});
