import { describe, expect, it } from "vitest";

import {
  derivePodium,
  type CompletionFacts,
} from "@/lib/completion/podium";

describe("derivePodium", () => {
  it("derives a single-elimination podium from the final and third-place match", () => {
    const result = derivePodium({
      formatKind: "single_elimination",
      matches: [
        { id: "final-1", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "third-1", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: {
        championTeamId: "team-a",
        runnerUpTeamId: "team-b",
        thirdPlaceTeamId: "team-c",
      },
      blockers: [],
    });
  });

  it("does not invent single-elimination third place when its deterministic match source is absent", () => {
    const result = derivePodium({
      formatKind: "single_elimination",
      matches: [
        { id: "final-1", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: null,
      blockers: [{ code: "INSUFFICIENT_PODIUM_STRUCTURE", missingStages: ["third_place"] }],
    });
  });

  it("uses only the latest supplied revision for each semantic match stage", () => {
    const result = derivePodium({
      formatKind: "single_elimination",
      matches: [
        { id: "final-v1", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "final-v2", stage: "final", official: true, winnerTeamId: "team-b", loserTeamId: "team-a", revision: 2 },
        { id: "third-v1", stage: "third_place", official: false, winnerTeamId: "team-d", loserTeamId: "team-c", revision: 1 },
        { id: "third-v3", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 3 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: {
        championTeamId: "team-b",
        runnerUpTeamId: "team-a",
        thirdPlaceTeamId: "team-c",
      },
      blockers: [],
    });
  });

  it("derives a double-elimination podium from the grand final and lower final", () => {
    const result = derivePodium({
      formatKind: "double_elimination",
      matches: [
        { id: "grand-final", stage: "grand_final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "lower-final", stage: "lower_final", official: true, winnerTeamId: "team-b", loserTeamId: "team-c", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: {
        championTeamId: "team-a",
        runnerUpTeamId: "team-b",
        thirdPlaceTeamId: "team-c",
      },
      blockers: [],
    });
  });

  it("blocks a double-elimination podium when the lower-final winner does not reach the grand final", () => {
    const result = derivePodium({
      formatKind: "double_elimination",
      matches: [
        { id: "grand-final", stage: "grand_final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "lower-final", stage: "lower_final", official: true, winnerTeamId: "team-x", loserTeamId: "team-c", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: null,
      blockers: [{
        code: "INSUFFICIENT_PODIUM_STRUCTURE",
        matchIds: ["grand-final", "lower-final"],
        teamIds: ["team-b", "team-x"],
      }],
    });
  });

  it("derives a round-robin podium from locked standings ranked one through three", () => {
    const result = derivePodium({
      formatKind: "round_robin",
      matches: [],
      standings: [
        { rank: 3, teamId: "team-c", locked: true, unresolvedTie: false },
        { rank: 1, teamId: "team-a", locked: true, unresolvedTie: false },
        { rank: 2, teamId: "team-b", locked: true, unresolvedTie: false },
        { rank: 4, teamId: "team-d", locked: false, unresolvedTie: false },
      ],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: {
        championTeamId: "team-a",
        runnerUpTeamId: "team-b",
        thirdPlaceTeamId: "team-c",
      },
      blockers: [],
    });
  });

  it("reports the affected teams when a final round-robin rank is tied", () => {
    const result = derivePodium({
      formatKind: "round_robin",
      matches: [],
      standings: [
        { rank: 1, teamId: "team-a", locked: true, unresolvedTie: false },
        { rank: 2, teamId: "team-b", locked: true, unresolvedTie: true },
        { rank: 2, teamId: "team-c", locked: true, unresolvedTie: true },
        { rank: 4, teamId: "team-d", locked: true, unresolvedTie: false },
      ],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: null,
      blockers: [{ code: "UNRESOLVED_FINAL_TIE", teamIds: ["team-b", "team-c"] }],
    });
  });

  it("does not derive a round-robin podium from unlocked final standings", () => {
    const result = derivePodium({
      formatKind: "round_robin",
      matches: [],
      standings: [
        { rank: 1, teamId: "team-a", locked: true, unresolvedTie: false },
        { rank: 2, teamId: "team-b", locked: false, unresolvedTie: false },
        { rank: 3, teamId: "team-c", locked: true, unresolvedTie: false },
      ],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result).toEqual({
      podium: null,
      blockers: [{ code: "INSUFFICIENT_PODIUM_STRUCTURE", teamIds: ["team-b"] }],
    });
  });

  it("uses single-elimination playoff facts for Group + Playoffs", () => {
    const result = derivePodium({
      formatKind: "group_playoffs",
      playoffFormatKind: "single_elimination",
      matches: [
        { id: "playoff-final", stage: "final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "playoff-third", stage: "third_place", official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 },
      ],
      standings: [
        { rank: 1, teamId: "group-winner", locked: true, unresolvedTie: false },
      ],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result.podium).toEqual({
      championTeamId: "team-a",
      runnerUpTeamId: "team-b",
      thirdPlaceTeamId: "team-c",
    });
    expect(result.blockers).toEqual([]);
  });

  it("uses double-elimination playoff facts for Group + Playoffs", () => {
    const result = derivePodium({
      formatKind: "group_playoffs",
      playoffFormatKind: "double_elimination",
      matches: [
        { id: "playoff-grand-final", stage: "grand_final", official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 1 },
        { id: "playoff-lower-final", stage: "lower_final", official: true, winnerTeamId: "team-b", loserTeamId: "team-c", revision: 1 },
      ],
      standings: [],
      activeDisputes: [],
      validatedAwardStatistics: ["mvp", "top_scorer", "top_defender", "top_assist"],
    });

    expect(result.podium).toEqual({
      championTeamId: "team-a",
      runnerUpTeamId: "team-b",
      thirdPlaceTeamId: "team-c",
    });
    expect(result.blockers).toEqual([]);
  });

  it("does not mutate frozen input facts while selecting corrected results", () => {
    const input = Object.freeze({
      formatKind: "single_elimination" as const,
      matches: Object.freeze([
        Object.freeze({ id: "final-v1", stage: "final" as const, official: true, winnerTeamId: "team-b", loserTeamId: "team-a", revision: 1 }),
        Object.freeze({ id: "final-v2", stage: "final" as const, official: true, winnerTeamId: "team-a", loserTeamId: "team-b", revision: 2 }),
        Object.freeze({ id: "third-v1", stage: "third_place" as const, official: true, winnerTeamId: "team-c", loserTeamId: "team-d", revision: 1 }),
      ]),
      standings: Object.freeze([]),
      activeDisputes: Object.freeze([]),
      validatedAwardStatistics: Object.freeze(["mvp", "top_scorer", "top_defender", "top_assist"] as const),
    }) satisfies CompletionFacts;

    expect(() => derivePodium(input)).not.toThrow();
    expect(input.matches.map(({ id }) => id)).toEqual(["final-v1", "final-v2", "third-v1"]);
  });
});
