import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type DoubleEliminationConfig } from "./index";

const config: DoubleEliminationConfig = {
  version: 1, kind: "double_elimination", thirdPlace: "lower_final_loser",
  bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 5, grandFinal: 7 },
};
const teams = [
  { id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 },
  { id: "e", seed: 5 }, { id: "f", seed: 6 }, { id: "g", seed: 7 }, { id: "h", seed: 8 },
];

describe("double elimination graph", () => {
  it("feeds upper losers into the lower bracket and awards third to the lower-final loser", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams: teams.slice(0, 4) });
    expect(graph.matches.map((m) => [m.id, m.home, m.away, m.bestOf])).toEqual([
      ["cup:upper:r1:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "d", seed: 4 }, 1],
      ["cup:upper:r1:m2", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "c", seed: 3 }, 1],
      ["cup:upper:r2:m1", { kind: "match", matchId: "cup:upper:r1:m1", outcome: "winner" }, { kind: "match", matchId: "cup:upper:r1:m2", outcome: "winner" }, 3],
      ["cup:lower:r1:m1", { kind: "match", matchId: "cup:upper:r1:m1", outcome: "loser" }, { kind: "match", matchId: "cup:upper:r1:m2", outcome: "loser" }, 1],
      ["cup:lower:r2:m1", { kind: "match", matchId: "cup:lower:r1:m1", outcome: "winner" }, { kind: "match", matchId: "cup:upper:r2:m1", outcome: "loser" }, 5],
      ["cup:grand_final:r1:m1", { kind: "match", matchId: "cup:upper:r2:m1", outcome: "winner" }, { kind: "match", matchId: "cup:lower:r2:m1", outcome: "winner" }, 7],
    ]);
    expect(graph.dependencies.map((d) => [d.id, d.sourceMatchId, d.outcome])).toEqual([
      ["cup:upper:r2:m1:home", "cup:upper:r1:m1", "winner"],
      ["cup:upper:r2:m1:away", "cup:upper:r1:m2", "winner"],
      ["cup:lower:r1:m1:home", "cup:upper:r1:m1", "loser"],
      ["cup:lower:r1:m1:away", "cup:upper:r1:m2", "loser"],
      ["cup:lower:r2:m1:home", "cup:lower:r1:m1", "winner"],
      ["cup:lower:r2:m1:away", "cup:upper:r2:m1", "loser"],
      ["cup:grand_final:r1:m1:home", "cup:upper:r2:m1", "winner"],
      ["cup:grand_final:r1:m1:away", "cup:lower:r2:m1", "winner"],
    ]);
    expect(graph.placements).toEqual([
      { rank: 1, source: { kind: "match", matchId: "cup:grand_final:r1:m1", outcome: "winner" } },
      { rank: 2, source: { kind: "match", matchId: "cup:grand_final:r1:m1", outcome: "loser" } },
      { rank: 3, source: { kind: "match", matchId: "cup:lower:r2:m1", outcome: "loser" } },
    ]);
    expect(graph.phases).toEqual([{ id: "cup:phase:1", sequence: 1, kind: "double_elimination", standingsRules: null }]);
  });

  it("crosses eight-team upper drops before consolidating the lower bracket", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams });
    expect(graph.matches).toHaveLength(14);
    expect(graph.dependencies.filter((d) => d.targetMatchId.includes(":lower:")).map((d) => [d.id, d.sourceMatchId, d.outcome])).toEqual([
      ["cup:lower:r1:m1:home", "cup:upper:r1:m1", "loser"],
      ["cup:lower:r1:m1:away", "cup:upper:r1:m2", "loser"],
      ["cup:lower:r1:m2:home", "cup:upper:r1:m3", "loser"],
      ["cup:lower:r1:m2:away", "cup:upper:r1:m4", "loser"],
      ["cup:lower:r2:m1:home", "cup:lower:r1:m1", "winner"],
      ["cup:lower:r2:m1:away", "cup:upper:r2:m2", "loser"],
      ["cup:lower:r2:m2:home", "cup:lower:r1:m2", "winner"],
      ["cup:lower:r2:m2:away", "cup:upper:r2:m1", "loser"],
      ["cup:lower:r3:m1:home", "cup:lower:r2:m1", "winner"],
      ["cup:lower:r3:m1:away", "cup:lower:r2:m2", "winner"],
      ["cup:lower:r4:m1:home", "cup:lower:r3:m1", "winner"],
      ["cup:lower:r4:m1:away", "cup:upper:r3:m1", "loser"],
    ]);
    expect(graph.matches.find((m) => m.id === "cup:lower:r4:m1")?.bestOf).toBe(5);
  });

  it("does not produce a loser for an odd-field bye", () => {
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams: teams.slice(0, 3) });
    expect(graph.matches.filter((m) => m.bracket === "lower").map((m) => [m.id, m.home, m.away, m.status, m.advance])).toEqual([
      ["cup:lower:r1:m1", { kind: "bye" }, { kind: "match", matchId: "cup:upper:r1:m2", outcome: "loser" }, "bye", { kind: "match", matchId: "cup:upper:r1:m2", outcome: "loser" }],
      ["cup:lower:r2:m1", { kind: "match", matchId: "cup:upper:r1:m2", outcome: "loser" }, { kind: "match", matchId: "cup:upper:r2:m1", outcome: "loser" }, "pending", null],
    ]);
    expect(graph.matches.filter((m) => m.status === "pending")).toHaveLength(4);
    expect(graph.dependencies.some((d) => d.sourceMatchId === "cup:upper:r1:m1")).toBe(false);
  });

  it("supports a two-team upper final feeding one grand final without an invented third place", () => {
    const graph = generateCompetitionGraph({ eventId: "duel", config, teams: teams.slice(0, 2) });
    expect(graph.matches.map((m) => [m.id, m.bestOf])).toEqual([["duel:upper:r1:m1", 3], ["duel:grand_final:r1:m1", 7]]);
    expect(graph.matches[1]).toMatchObject({ home: { kind: "match", matchId: "duel:upper:r1:m1", outcome: "winner" }, away: { kind: "match", matchId: "duel:upper:r1:m1", outcome: "loser" } });
    expect(graph.placements.map((p) => p.rank)).toEqual([1, 2]);
  });
});
