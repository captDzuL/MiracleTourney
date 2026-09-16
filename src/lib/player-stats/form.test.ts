import { describe, expect, it } from "vitest";

import {
  getPlayerStatNumericValue,
  parsePlayerStatForm,
  resolvePlayerScoreGameNumbers,
  validatePlayerStatPayload,
} from "./form";

function form(entries: Array<[string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parsePlayerStatForm", () => {
  it("builds the same Flashpeak JSON shape for captain and organizer forms", () => {
    const data = form([
      ["stat_player-1_goal", "3"],
      ["stat_player-1_assist", "4"],
      ["stat_player-1_passing", "28"],
      ["stat_player-1_defense", "12"],
      ["score_player-1_1", "7.6"],
      ["score_player-1_2", ""],
      ["score_player-1_3", "8.1"],
    ]);

    expect(parsePlayerStatForm(data, {
      allowedStatKeys: ["goal", "assist", "passing", "defense"],
      scoreSlotCount: 3,
    })).toEqual({
      "player-1": {
        scores: [7.6, null, 8.1],
        goal: 3,
        assist: 4,
        passing: 28,
        defense: 12,
      },
    });
  });

  it("keeps the existing numeric-only shape for games without player scores", () => {
    expect(parsePlayerStatForm(form([
      ["stat_player-1_kills", "8"],
      ["stat_player-1_assists", "3"],
    ]), {
      allowedStatKeys: ["kills", "assists"],
      scoreSlotCount: null,
    })).toEqual({ "player-1": { kills: 8, assists: 3 } });
  });

  it.each([
    [["stat_player-1_blocks", "1"]],
    [["stat_player-1_tackles", "1"]],
    [["stat_player-1_goal", "-1"]],
    [["stat_player-1_goal", "1.5"]],
    [["score_player-1_1", "10.1"]],
    [["score_player-1_1", "7.65"]],
    [["score_player-1_2", "7.6"]],
    [["score___proto___1", "7.6"]],
  ])("rejects unsupported or invalid fields without a partial payload", (entry) => {
    expect(() => parsePlayerStatForm(form([entry as [string, string]]), {
      allowedStatKeys: ["goal", "assist", "passing", "defense"],
      scoreSlotCount: 1,
    })).toThrow();
  });
});

describe("validatePlayerStatPayload", () => {
  it("rejects an empty submission instead of approving no player data", () => {
    expect(() => validatePlayerStatPayload({}, { allowedStatKeys: ["goal"], scoreSlotCount: 1 })).toThrow("payload");
  });
  const options = {
    allowedStatKeys: ["goal", "assist", "passing", "defense"],
    scoreSlotCount: 3,
  } as const;

  it("accepts a canonical BO3 payload", () => {
    expect(() => validatePlayerStatPayload({
      "player-1": { scores: [7.6, null, 8.1], goal: 3, assist: 4, passing: 28, defense: 12 },
    }, options)).not.toThrow();
  });

  it.each([
    [{ "foreign-player": { scores: [7.6], goal: 1, assist: 0, passing: 1, defense: 0 } }, "score array"],
    [{ "player-1": { scores: [7.65, null, 8.1], goal: 1, assist: 0, passing: 1, defense: 0 } }, "score"],
    [{ "player-1": { scores: [7.6, null, 8.1], goals: 3, assist: 0, passing: 1, defense: 0 } }, "statistic"],
  ])("rejects malformed canonical payloads", (payload, message) => {
    expect(() => validatePlayerStatPayload(payload as never, options)).toThrow(message);
  });
});

describe("getPlayerStatNumericValue", () => {
  it("carries legacy goals and assists forward without mapping blocks or tackles", () => {
    const stored = { goals: 3, assists: 4, blocks: 9, tackles: 8 };
    expect(getPlayerStatNumericValue(stored, "goal")).toBe(3);
    expect(getPlayerStatNumericValue(stored, "assist")).toBe(4);
    expect(getPlayerStatNumericValue(stored, "defense")).toBe(0);
  });

  it("prefers canonical values over legacy aliases", () => {
    expect(getPlayerStatNumericValue({ goal: 2, goals: 99 }, "goal")).toBe(2);
  });
});

describe("resolvePlayerScoreGameNumbers", () => {
  it("prefers persisted MatchGame order", () => {
    expect(resolvePlayerScoreGameNumbers({
      matchGames: [{ gameNumber: 2 }, { gameNumber: 1 }],
      resultSnapshot: { games: [{ gameNumber: 1 }] },
      roundBestOf: 1,
    })).toEqual([1, 2]);
  });

  it("uses an authoritative result snapshot for pre-backfill Match Day results", () => {
    expect(resolvePlayerScoreGameNumbers({
      matchGames: [],
      resultSnapshot: { games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] },
      roundBestOf: 5,
    })).toEqual([1, 2, 3]);
  });

  it("exposes one slot only for a known legacy BO1", () => {
    expect(resolvePlayerScoreGameNumbers({ matchGames: [], resultSnapshot: null, roundBestOf: 1 })).toEqual([1]);
    expect(() => resolvePlayerScoreGameNumbers({ matchGames: [], resultSnapshot: null, roundBestOf: 3 })).toThrow("MatchGame");
  });
});
