import { describe, expect, it } from "vitest";

import {
  aggregateFlashpeakLeaderboard,
  parsePlayerScoreArray,
  readFlashpeakStatPayload,
  sortFlashpeakLeaderboard,
  type FlashpeakLeaderboardEntry,
  type LeaderboardSortKey,
} from "./flashpeak";

describe("parsePlayerScoreArray", () => {
  it.each([
    [["0.0"], 1, [0]],
    [["10.0"], 1, [10]],
    [["7.6", "", "8.1"], 3, [7.6, null, 8.1]],
    [["7", "8.0", "9.1", "", "6.4"], 5, [7, 8, 9.1, null, 6.4]],
  ])("accepts valid BO score slots", (values, length, expected) => {
    expect(parsePlayerScoreArray(values, length)).toEqual(expected);
  });

  it.each([
    [["-0.1"], 1],
    [["10.1"], 1],
    [["7.65"], 1],
    [["NaN"], 1],
    [["Infinity"], 1],
    [["7.6", "8.1"], 1],
    [["7.6"], 3],
    [[{}], 1],
  ])("rejects malformed or incorrectly sized arrays", (values, length) => {
    expect(() => parsePlayerScoreArray(values, length)).toThrow("player score");
  });
});

describe("readFlashpeakStatPayload", () => {
  it("prefers canonical goal and assist without double-counting aliases", () => {
    expect(readFlashpeakStatPayload({
      scores: [7.6, null, 8.1],
      goal: 3,
      goals: 99,
      assist: 4,
      assists: 88,
      passing: 28,
      defense: 12,
      blocks: 20,
      tackles: 30,
    })).toEqual({
      scores: [7.6, 8.1],
      goal: 3,
      assist: 4,
      passing: 28,
      defense: 12,
    });
  });

  it("falls back only from legacy goals and assists", () => {
    expect(readFlashpeakStatPayload({
      goals: 2,
      assists: 3,
      blocks: 9,
      tackles: 8,
    })).toEqual({
      scores: [],
      goal: 2,
      assist: 3,
      passing: 0,
      defense: 0,
    });
  });

  it("drops a malformed stored score array as a whole", () => {
    expect(readFlashpeakStatPayload({ scores: [7.6, 10.25], goal: 1 }).scores).toEqual([]);
  });
});

const row = (
  playerId: string,
  nickname: string,
  stats: unknown,
  overrides: Partial<{ teamId: string; teamName: string; position: string; matchId: string }> = {},
) => ({
  playerId,
  nickname,
  playerName: nickname,
  teamId: overrides.teamId ?? "team-a",
  teamName: overrides.teamName ?? "Alpha",
  position: overrides.position ?? "Forward",
  matchId: overrides.matchId ?? "match-1",
  stats,
});

describe("aggregateFlashpeakLeaderboard", () => {
  it("averages every valid game score instead of averaging series averages", () => {
    const result = aggregateFlashpeakLeaderboard([
      row("p1", "Naya", { scores: [10], goal: 1, assist: 2, passing: 10, defense: 3 }),
      row("p1", "Naya", { scores: [6, 7, 8], goal: 2, assist: 1, passing: 20, defense: 4 }, { matchId: "match-2" }),
    ]);

    expect(result[0]).toMatchObject({
      game: 4,
      score: 7.75,
      goal: 3,
      assist: 3,
      passing: 30,
      defense: 7,
    });
  });

  it("keeps approved rows with no score below scored players by default", () => {
    const result = aggregateFlashpeakLeaderboard([
      row("p2", "Bima", { goal: 5 }),
      row("p1", "Ari", { scores: [7.6], goal: 1 }),
    ]);

    expect(result.map(({ nickname }) => nickname)).toEqual(["Ari", "Bima"]);
    expect(result[1]).toMatchObject({ game: 0, score: null });
  });
});

const entries: FlashpeakLeaderboardEntry[] = [
  { playerId: "b", playerName: "Bima", nickname: "Bima", teamId: "b", teamName: "Beta", position: "Defender", game: 3, score: 8.1, goal: 1, assist: 2, passing: 20, defense: 12 },
  { playerId: "a", playerName: "Ari", nickname: "Ari", teamId: "a", teamName: "Alpha", position: "Forward", game: 5, score: 8.1, goal: 4, assist: 1, passing: 30, defense: 5 },
  { playerId: "c", playerName: "Cici", nickname: "Cici", teamId: "a", teamName: "Alpha", position: "Midfielder", game: 1, score: null, goal: 0, assist: 8, passing: 10, defense: 1 },
];

describe("sortFlashpeakLeaderboard", () => {
  it("uses score desc, game desc, then nickname for the default order", () => {
    expect(sortFlashpeakLeaderboard(entries).map(({ nickname }) => nickname)).toEqual(["Ari", "Bima", "Cici"]);
  });

  it.each(["game", "score", "goal", "assist", "passing", "defense"] satisfies LeaderboardSortKey[])(
    "sorts %s in both directions with nickname as the stable final tie-break",
    (key) => {
      const desc = sortFlashpeakLeaderboard(entries, key, "desc");
      const asc = sortFlashpeakLeaderboard(entries, key, "asc");
      expect(desc).toHaveLength(3);
      expect(asc).toHaveLength(3);
      expect(new Set(desc.map(({ playerId }) => playerId))).toEqual(new Set(["a", "b", "c"]));
      expect(new Set(asc.map(({ playerId }) => playerId))).toEqual(new Set(["a", "b", "c"]));
      expect(desc[0]?.[key] ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(desc[1]?.[key] ?? Number.NEGATIVE_INFINITY);
      expect(asc[0]?.[key] ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(asc[1]?.[key] ?? Number.POSITIVE_INFINITY);
    },
  );
});
