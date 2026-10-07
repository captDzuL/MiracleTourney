import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type SingleEliminationConfig } from "./index";

const config: SingleEliminationConfig = {
  version: 1, kind: "single_elimination", thirdPlace: "required",
  bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 3, final: 5 },
};
const teams = [
  { id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 },
  { id: "d", seed: 4 }, { id: "e", seed: 5 },
];

describe("single elimination graph", () => {
  it("seeds five entrants in eight slots and advances byes without inventing losers", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams });
    expect(graph.matches.map((m) => [m.id, m.home, m.away, m.status, m.bestOf])).toEqual([
      ["cup:single:r1:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "bye" }, "bye", 1],
      ["cup:single:r1:m2", { kind: "team", teamId: "d", seed: 4 }, { kind: "team", teamId: "e", seed: 5 }, "pending", 1],
      ["cup:single:r1:m3", { kind: "team", teamId: "b", seed: 2 }, { kind: "bye" }, "bye", 1],
      ["cup:single:r1:m4", { kind: "team", teamId: "c", seed: 3 }, { kind: "bye" }, "bye", 1],
      ["cup:single:r2:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "match", matchId: "cup:single:r1:m2", outcome: "winner" }, "pending", 3],
      ["cup:single:r2:m2", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "c", seed: 3 }, "pending", 3],
      ["cup:single:r3:m1", { kind: "match", matchId: "cup:single:r2:m1", outcome: "winner" }, { kind: "match", matchId: "cup:single:r2:m2", outcome: "winner" }, "pending", 5],
      ["cup:third_place:r1:m1", { kind: "match", matchId: "cup:single:r2:m1", outcome: "loser" }, { kind: "match", matchId: "cup:single:r2:m2", outcome: "loser" }, "pending", 3],
    ]);
    expect(graph.dependencies).toEqual([
      { id: "cup:single:r2:m1:away", sourceMatchId: "cup:single:r1:m2", targetMatchId: "cup:single:r2:m1", outcome: "winner", targetSlot: "away" },
      { id: "cup:single:r3:m1:home", sourceMatchId: "cup:single:r2:m1", targetMatchId: "cup:single:r3:m1", outcome: "winner", targetSlot: "home" },
      { id: "cup:single:r3:m1:away", sourceMatchId: "cup:single:r2:m2", targetMatchId: "cup:single:r3:m1", outcome: "winner", targetSlot: "away" },
      { id: "cup:third_place:r1:m1:home", sourceMatchId: "cup:single:r2:m1", targetMatchId: "cup:third_place:r1:m1", outcome: "loser", targetSlot: "home" },
      { id: "cup:third_place:r1:m1:away", sourceMatchId: "cup:single:r2:m2", targetMatchId: "cup:third_place:r1:m1", outcome: "loser", targetSlot: "away" },
    ]);
    expect(graph.placements).toEqual([
      { rank: 1, source: { kind: "match", matchId: "cup:single:r3:m1", outcome: "winner" } },
      { rank: 2, source: { kind: "match", matchId: "cup:single:r3:m1", outcome: "loser" } },
      { rank: 3, source: { kind: "match", matchId: "cup:third_place:r1:m1", outcome: "winner" } },
    ]);
  });

  it("keeps the configured capacity and propagates chained and empty byes", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config: { ...config, thirdPlace: "none" }, teams: teams.slice(0, 2), slotCount: 8 });
    expect(graph.matches.map((m) => [m.id, m.status, m.advance])).toEqual([
      ["cup:single:r1:m1", "bye", { kind: "team", teamId: "a", seed: 1 }],
      ["cup:single:r1:m2", "empty", null],
      ["cup:single:r1:m3", "bye", { kind: "team", teamId: "b", seed: 2 }],
      ["cup:single:r1:m4", "empty", null],
      ["cup:single:r2:m1", "bye", { kind: "team", teamId: "a", seed: 1 }],
      ["cup:single:r2:m2", "bye", { kind: "team", teamId: "b", seed: 2 }],
      ["cup:single:r3:m1", "pending", null],
    ]);
    expect(graph.matches[6]).toMatchObject({ home: { kind: "team", teamId: "a", seed: 1 }, away: { kind: "team", teamId: "b", seed: 2 } });
    expect(graph.dependencies).toEqual([]);
    expect(graph.placements.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("gives a two-team final the final best-of and no third-place match", () => {
    const graph = generateCompetitionGraph({ eventId: "duel", config, teams: teams.slice(0, 2) });
    expect(graph.matches).toHaveLength(1);
    expect(graph.matches[0]).toMatchObject({ id: "duel:single:r1:m1", bestOf: 5 });
    expect(graph.phases).toEqual([{ id: "duel:phase:1", sequence: 1, kind: "single_elimination", standingsRules: null }]);
  });

  it("omits an impossible bronze match in a larger bracket with only two teams", () => {
    const graph = generateCompetitionGraph({ eventId: "duel", config, teams: teams.slice(0, 2), slotCount: 8 });
    expect(graph.matches.filter((m) => m.bracket === "third_place")).toEqual([]);
    expect(graph.placements.map((p) => p.rank)).toEqual([1, 2]);
  });
});
