import { describe, expect, it } from "vitest";
import { deriveAwardCandidates, type CompletionStatistic } from "./awards";

const row = (overrides: Partial<CompletionStatistic> = {}): CompletionStatistic => ({
  award: "mvp", playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha",
  value: 5, validated: true, status: "published", ...overrides,
});

describe("deriveAwardCandidates", () => {
  // Catches a negative metric becoming a winner when there are no valid alternatives.
  it("leaves an award unawarded when its only published metric is negative", () => {
    expect(deriveAwardCandidates([row({ value: -0.5 })])).toEqual({
      mvp: [], top_scorer: [], top_defender: [], top_assist: [],
    });
  });

  // Catches ranking draft/unvalidated/invalid values or mixing award metrics.
  it("ranks only published validated non-negative finite values for each award", () => {
    const result = deriveAwardCandidates([
      row(), row({ playerId: "draft", status: "draft", value: 99 }),
      row({ playerId: "unvalidated", validated: false, value: 100 }),
      row({ playerId: "infinity", value: Infinity }), row({ playerId: "nan", value: NaN }),
      row({ award: "top_scorer", value: 3 }), row({ award: "top_defender", value: 0 }),
      row({ award: "top_defender", playerId: "negative", value: -1 }),
      row({ award: "top_assist", value: 7 }),
    ]);
    expect(result).toEqual({
      mvp: [{ playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 5 }],
      top_scorer: [{ playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 3 }],
      top_defender: [{ playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 0 }],
      top_assist: [{ playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 7 }],
    });
  });

  // Catches dropping tied leaders, selecting lower values, or mutating caller order.
  it("returns every tied top player in deterministic player-ID order", () => {
    const stats = Object.freeze([
      Object.freeze(row({ playerId: "player-z", playerName: "Zed", teamId: "team-z", teamName: "Zulu" })),
      Object.freeze(row({ playerId: "player-low", value: 4 })), Object.freeze(row()),
    ]);
    expect(deriveAwardCandidates(stats)).toEqual({
      mvp: [
        { playerId: "player-a", playerName: "Ari", teamId: "team-a", teamName: "Alpha", value: 5 },
        { playerId: "player-z", playerName: "Zed", teamId: "team-z", teamName: "Zulu", value: 5 },
      ], top_scorer: [], top_defender: [], top_assist: [],
    });
    expect(stats[0].playerId).toBe("player-z");
  });
});
