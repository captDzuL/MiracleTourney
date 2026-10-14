import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    matchGame: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { getMatchGames } from "./rounds-repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getMatchGames", () => {
  it("reads the games of one match ordered by game number ascending", async () => {
    prisma.matchGame.findMany.mockResolvedValue([]);

    await getMatchGames("match-1");

    expect(prisma.matchGame.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.matchGame.findMany).toHaveBeenCalledWith({
      where: { matchId: "match-1" },
      orderBy: { gameNumber: "asc" },
    });
  });

  it("returns an empty list when the match has no games", async () => {
    prisma.matchGame.findMany.mockResolvedValue([]);

    await expect(getMatchGames("match-1")).resolves.toEqual([]);
  });

  it("maps each row to id, match id, game number and both scores, in the order the database returned", async () => {
    prisma.matchGame.findMany.mockResolvedValue([
      { id: "g-1", matchId: "match-1", gameNumber: 1, homeScore: 5, awayScore: 3, createdAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "g-2", matchId: "match-1", gameNumber: 2, homeScore: 0, awayScore: 0, createdAt: new Date("2026-01-01T01:00:00.000Z") },
    ]);

    const result = await getMatchGames("match-1");

    expect(result).toEqual([
      { id: "g-1", matchId: "match-1", gameNumber: 1, homeScore: 5, awayScore: 3 },
      { id: "g-2", matchId: "match-1", gameNumber: 2, homeScore: 0, awayScore: 0 },
    ]);
    expect(Object.keys(result[0]).sort()).toEqual(["awayScore", "gameNumber", "homeScore", "id", "matchId"]);
  });

  it("passes a database failure on", async () => {
    prisma.matchGame.findMany.mockRejectedValue(new Error("db down"));

    await expect(getMatchGames("match-1")).rejects.toThrow("db down");
  });
});
