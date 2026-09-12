import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type RoundRobinConfig } from "./index";

const config: RoundRobinConfig = {
  version: 1, kind: "round_robin", legs: 1,
  points: { win: 5, draw: 2, loss: 1 }, tiebreakers: ["wins", "score_difference", "head_to_head"],
};
const teams = [{ id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 }];

describe("round robin graph", () => {
  it("pairs each even-field opponent once without playing twice in a round and retains configured scoring rules", () => {
    const graph = generateCompetitionGraph({ eventId: "league", config, teams });
    expect(graph.matches.map((m) => [m.id, m.home, m.away, m.round, m.leg])).toEqual([
      ["league:round_robin:r1:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "d", seed: 4 }, 1, 1],
      ["league:round_robin:r1:m2", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "c", seed: 3 }, 1, 1],
      ["league:round_robin:r2:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "c", seed: 3 }, 2, 1],
      ["league:round_robin:r2:m2", { kind: "team", teamId: "d", seed: 4 }, { kind: "team", teamId: "b", seed: 2 }, 2, 1],
      ["league:round_robin:r3:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "b", seed: 2 }, 3, 1],
      ["league:round_robin:r3:m2", { kind: "team", teamId: "c", seed: 3 }, { kind: "team", teamId: "d", seed: 4 }, 3, 1],
    ]);
    expect(graph.phases).toEqual([{ id: "league:phase:1", sequence: 1, kind: "round_robin", standingsRules: { legs: 1, points: { win: 5, draw: 2, loss: 1 }, tiebreakers: ["wins", "score_difference", "head_to_head"] } }]);
    expect(graph.dependencies).toEqual([]);
    expect(graph.placements).toEqual([]);
  });

  it("gives three teams alternating rest rounds and reverses home/away in the second leg", () => {
    const graph = generateCompetitionGraph({ eventId: "league", config: { ...config, legs: 2 }, teams: teams.slice(0, 3) });
    expect(graph.matches.map((m) => [m.id, m.home, m.away, m.leg])).toEqual([
      ["league:round_robin:r1:m1", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "c", seed: 3 }, 1],
      ["league:round_robin:r2:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "c", seed: 3 }, 1],
      ["league:round_robin:r3:m1", { kind: "team", teamId: "a", seed: 1 }, { kind: "team", teamId: "b", seed: 2 }, 1],
      ["league:round_robin:r4:m1", { kind: "team", teamId: "c", seed: 3 }, { kind: "team", teamId: "b", seed: 2 }, 2],
      ["league:round_robin:r5:m1", { kind: "team", teamId: "c", seed: 3 }, { kind: "team", teamId: "a", seed: 1 }, 2],
      ["league:round_robin:r6:m1", { kind: "team", teamId: "b", seed: 2 }, { kind: "team", teamId: "a", seed: 1 }, 2],
    ]);
    expect(graph.matches.every((m) => m.status === "pending" && m.bestOf === 1 && m.groupId === null)).toBe(true);
    expect(graph.phases[0].standingsRules?.legs).toBe(2);
  });
});
