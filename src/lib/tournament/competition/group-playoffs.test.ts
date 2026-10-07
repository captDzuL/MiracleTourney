import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type GroupPlayoffsConfig } from "./index";

const config: GroupPlayoffsConfig = {
  version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2,
  groupStage: { legs: 2, points: { win: 4, draw: 2, loss: 0 }, tiebreakers: ["score_difference", "head_to_head"] },
  playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, avoidImmediateGroupRematches: true },
};
const teams = [{ id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 }, { id: "e", seed: 5 }];

describe("group playoffs graph", () => {
  it("allocates uneven groups by snake seed and preserves group legs, scoring and cutlines", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams });
    expect(graph.groups).toEqual([
      { id: "cup:group:1", phaseId: "cup:phase:1", label: "A", sequence: 1, teams: [{ id: "a", seed: 1 }, { id: "d", seed: 4 }, { id: "e", seed: 5 }], qualificationCutline: 2 },
      { id: "cup:group:2", phaseId: "cup:phase:1", label: "B", sequence: 2, teams: [{ id: "b", seed: 2 }, { id: "c", seed: 3 }], qualificationCutline: 2 },
    ]);
    expect(graph.phases).toEqual([
      { id: "cup:phase:1", sequence: 1, kind: "groups", standingsRules: { legs: 2, points: { win: 4, draw: 2, loss: 0 }, tiebreakers: ["score_difference", "head_to_head"] } },
      { id: "cup:phase:2", sequence: 2, kind: "single_elimination", standingsRules: null },
    ]);
    expect(graph.matches.filter((m) => m.groupId !== null).map((m) => [m.id, m.home, m.away])).toEqual([
      ["cup:group:1:round_robin:r1:m1", { kind: "team", teamId: "d", seed: 4 }, { kind: "team", teamId: "e", seed: 5 }],
      ["cup:group:1:round_robin:r2:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "e", seed: 5 }],
      ["cup:group:1:round_robin:r3:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "d", seed: 4 }],
      ["cup:group:1:round_robin:r4:m1", { kind: "team", teamId: "e", seed: 5 }, { kind: "team", teamId: "d", seed: 4 }],
      ["cup:group:1:round_robin:r5:m1", { kind: "team", teamId: "e", seed: 5 }, { kind: "team", teamId: "a", seed: 1 }],
      ["cup:group:1:round_robin:r6:m1", { kind: "team", teamId: "d", seed: 4 }, { kind: "team", teamId: "a", seed: 1 }],
      ["cup:group:2:round_robin:r1:m1", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "c", seed: 3 }],
      ["cup:group:2:round_robin:r2:m1", { kind: "team", teamId: "c", seed: 3 }, { kind: "team", teamId: "b", seed: 2 }],
    ]);
  });

  it("feeds A1 versus B2 and B1 versus A2 into single-elimination playoff placeholders", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams });
    expect(graph.matches.filter((m) => m.phaseId === "cup:phase:2").map((m) => [m.id, m.home, m.away, m.bestOf])).toEqual([
      ["cup:playoffs:single:r1:m1", { kind: "group_rank", groupId: "cup:group:1", rank: 1 }, { kind: "group_rank", groupId: "cup:group:2", rank: 2 }, 3],
      ["cup:playoffs:single:r1:m2", { kind: "group_rank", groupId: "cup:group:2", rank: 1 }, { kind: "group_rank", groupId: "cup:group:1", rank: 2 }, 3],
      ["cup:playoffs:single:r2:m1", { kind: "match", matchId: "cup:playoffs:single:r1:m1", outcome: "winner" }, { kind: "match", matchId: "cup:playoffs:single:r1:m2", outcome: "winner" }, 5],
    ]);
    expect(graph.qualificationDependencies).toEqual([
      { id: "cup:playoffs:single:r1:m1:home", groupId: "cup:group:1", rank: 1, targetMatchId: "cup:playoffs:single:r1:m1", targetSlot: "home" },
      { id: "cup:playoffs:single:r1:m1:away", groupId: "cup:group:2", rank: 2, targetMatchId: "cup:playoffs:single:r1:m1", targetSlot: "away" },
      { id: "cup:playoffs:single:r1:m2:home", groupId: "cup:group:2", rank: 1, targetMatchId: "cup:playoffs:single:r1:m2", targetSlot: "home" },
      { id: "cup:playoffs:single:r1:m2:away", groupId: "cup:group:1", rank: 2, targetMatchId: "cup:playoffs:single:r1:m2", targetSlot: "away" },
    ]);
    expect(graph.dependencies.map((d) => [d.id, d.sourceMatchId])).toEqual([
      ["cup:playoffs:single:r2:m1:home", "cup:playoffs:single:r1:m1"],
      ["cup:playoffs:single:r2:m1:away", "cup:playoffs:single:r1:m2"],
    ]);
  });

  it("builds a complete double-elimination playoff field with group-rank sources", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", teams, config: { ...config, playoffs: {
      version: 1, kind: "double_elimination", thirdPlace: "lower_final_loser", avoidImmediateGroupRematches: true,
      bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
    } } });
    expect(graph.matches.filter((m) => m.phaseId === "cup:phase:2").map((m) => m.id)).toEqual([
      "cup:playoffs:upper:r1:m1", "cup:playoffs:upper:r1:m2", "cup:playoffs:upper:r2:m1",
      "cup:playoffs:lower:r1:m1", "cup:playoffs:lower:r2:m1", "cup:playoffs:grand_final:r1:m1",
    ]);
    expect(graph.qualificationDependencies.map((d) => [d.id, d.groupId, d.rank])).toEqual([
      ["cup:playoffs:upper:r1:m1:home", "cup:group:1", 1], ["cup:playoffs:upper:r1:m1:away", "cup:group:2", 2],
      ["cup:playoffs:upper:r1:m2:home", "cup:group:2", 1], ["cup:playoffs:upper:r1:m2:away", "cup:group:1", 2],
    ]);
    expect(graph.placements[2]).toEqual({ rank: 3, source: { kind: "match", matchId: "cup:playoffs:lower:r2:m1", outcome: "loser" } });
  });

  it("retains serpentine qualifier seeding when immediate rematch avoidance is disabled", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", teams, config: { ...config, playoffs: { ...config.playoffs, avoidImmediateGroupRematches: false } } });
    expect(graph.qualificationDependencies.map((d) => [d.groupId, d.rank])).toEqual([
      ["cup:group:1", 1], ["cup:group:1", 2], ["cup:group:2", 1], ["cup:group:2", 2],
    ]);
  });
});
