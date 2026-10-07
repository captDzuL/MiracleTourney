import { describe, expect, it } from "vitest";

import {
  evaluateCompletionReadiness,
  type CompletionFacts,
} from "@/lib/completion/readiness";

describe("evaluateCompletionReadiness", () => {
  it("is ready only when the three-team podium and all completion gates are satisfied", () => {
    const result = evaluateCompletionReadiness({
      formatKind: "single_elimination",
      matches: [
        { id: "final", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "third", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      ready: true,
      podium: {
        championTeamId: "team-a",
        runnerUpTeamId: "team-b",
        thirdPlaceTeamId: "team-c",
      },
      blockers: [],
    });
  });

  it("blocks the latest required result when it is not official", () => {
    const result = evaluateCompletionReadiness({
      formatKind: "single_elimination",
      matches: [
        { id: "final-v1", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "final-v2", stage: "final", official: false, winnerTeamId: "team-b", loserTeamId: "team-a", revision: 2 },
        { id: "third", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([{
      code: "UNOFFICIAL_REQUIRED_RESULT",
      matchId: "final-v2",
      stage: "final",
    }]);
  });

  it("blocks active disputes and preserves their affected identifiers", () => {
    const result = evaluateCompletionReadiness({
      formatKind: "double_elimination",
      matches: [
        { id: "grand-final", stage: "grand_final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "lower-final", stage: "lower_final", official: true, winnerTeamId: "team-b", loserTeamId: "team-c", revision: 1 },
      ],
      standings: [],
      activeDisputes: [
        { id: "dispute-2", matchId: "lower-final", teamIds: ["team-c", "team-b"] },
        { id: "dispute-1", matchId: "grand-final", teamIds: ["team-a"] },
      ],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      { code: "ACTIVE_DISPUTE", disputeId: "dispute-1", matchId: "grand-final", teamIds: ["team-a"] },
      { code: "ACTIVE_DISPUTE", disputeId: "dispute-2", matchId: "lower-final", teamIds: ["team-b", "team-c"] },
    ]);
  });

  it("names each missing validated award statistic in stable award order", () => {
    const result = evaluateCompletionReadiness({
      formatKind: "round_robin",
      matches: [],
      standings: [
        { rank: 1, teamId: "team-a", locked: true, unresolvedTie: false },
        { rank: 2, teamId: "team-b", locked: true, unresolvedTie: false },
        { rank: 3, teamId: "team-c", locked: true, unresolvedTie: false },
      ],
      activeDisputes: [],
      validatedAwardStatistics: [],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "mvp" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "top_scorer" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "top_defender" },
      { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "top_assist" },
    ]);
  });

  it("orders independent blockers deterministically without mutating their source facts", () => {
    const input = Object.freeze({
      formatKind: "single_elimination" as const,
      matches: Object.freeze([
        Object.freeze({ id: "final", stage: "final" as const, official: false, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 }),
      ]),
      standings: Object.freeze([]),
      activeDisputes: Object.freeze([
        Object.freeze({ id: "dispute-z", matchId: "final", teamIds: Object.freeze(["team-b", "team-a"]) }),
      ]),
      validatedAwardStatistics: Object.freeze(["top_assist"] as const),
    }) satisfies CompletionFacts;

    const result = evaluateCompletionReadiness(input);

    expect(result).toEqual({
      ready: false,
      podium: null,
      blockers: [
        { code: "UNOFFICIAL_REQUIRED_RESULT", matchId: "final", stage: "final" },
        { code: "ACTIVE_DISPUTE", disputeId: "dispute-z", matchId: "final", teamIds: ["team-a", "team-b"] },
        { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "mvp" },
        { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "top_scorer" },
        { code: "MISSING_VALIDATED_AWARD_STATISTICS", award: "top_defender" },
        { code: "INSUFFICIENT_PODIUM_STRUCTURE", missingStages: ["third_place"] },
      ],
    });
    expect(input.activeDisputes[0].teamIds).toEqual(["team-b", "team-a"]);
  });
});
