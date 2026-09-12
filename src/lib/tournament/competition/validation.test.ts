import { describe, expect, it } from "vitest";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import { generateCompetitionGraph, type GenerateCompetitionGraphInput, type TournamentFormatConfig } from "./index";

const teams = [{ id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 }];
const base = { eventId: "cup", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams };

describe("competition graph input boundary", () => {
  it.each([
    ["no teams", { teams: [] }, "Team count"],
    ["one team", { teams: teams.slice(0, 1) }, "Team count"],
    ["over 256 teams", { teams: Array.from({ length: 257 }, (_, i) => ({ id: `t${i}`, seed: i + 1 })) }, "Team count"],
    ["duplicate team", { teams: [{ id: "a", seed: 1 }, { id: "a", seed: 2 }] }, "Team IDs"],
    ["blank team", { teams: [{ id: " ", seed: 1 }, { id: "b", seed: 2 }] }, "Team IDs"],
    ["duplicate seed", { teams: [{ id: "a", seed: 1 }, { id: "b", seed: 1 }] }, "Seeds"],
    ["missing seed", { teams: [{ id: "a", seed: 1 }, { id: "b", seed: 3 }] }, "Seeds"],
    ["zero seed", { teams: [{ id: "a", seed: 0 }, { id: "b", seed: 1 }] }, "Seeds"],
    ["negative seed", { teams: [{ id: "a", seed: -1 }, { id: "b", seed: 2 }] }, "Seeds"],
    ["fractional seed", { teams: [{ id: "a", seed: 1.5 }, { id: "b", seed: 2 }] }, "Seeds"],
    ["NaN seed", { teams: [{ id: "a", seed: NaN }, { id: "b", seed: 2 }] }, "Seeds"],
    ["capacity smaller than field", { slotCount: 3 }, "Slot count"],
    ["fractional capacity", { slotCount: 4.5 }, "Slot count"],
    ["infinite capacity", { slotCount: Infinity }, "Slot count"],
    ["over 256 capacity", { slotCount: 257 }, "Slot count"],
    ["empty event", { eventId: " " }, "Event ID"],
    ["unused round-robin capacity", { config: TOURNAMENT_FORMAT_PRESETS.roundRobin, slotCount: 8 }, "Slot count"],
    ["too few teams per group", { config: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs }, "Each group"],
  ] satisfies [string, Partial<GenerateCompetitionGraphInput>, string][])("rejects %s", (_label, overrides, message) => {
    expect(() => generateCompetitionGraph({ ...base, ...overrides })).toThrow(message);
  });

  it("validates persisted v1 configuration at runtime", () => {
    const config = { ...TOURNAMENT_FORMAT_PRESETS.roundRobin, legs: 3 } as unknown as TournamentFormatConfig;
    expect(() => generateCompetitionGraph({ ...base, config })).toThrow();
  });

  it.each(Object.values(TOURNAMENT_FORMAT_PRESETS))("blocks $kind regeneration after any official result", (config) => {
    const input = { ...base, config, teams: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, seed: i + 1 })), hasOfficialResults: true };
    expect(() => generateCompetitionGraph(input)).toThrow("Cannot regenerate a competition with official results");
  });

  it("returns detached config data so a draft edit cannot mutate the source config", () => {
    const config = structuredClone(TOURNAMENT_FORMAT_PRESETS.roundRobin);
    const graph = generateCompetitionGraph({ ...base, config });
    if (graph.config.kind !== "round_robin") throw new Error("Wrong fixture format");
    graph.config.points.win = 99;
    graph.phases[0].standingsRules!.tiebreakers.reverse();
    expect(config).toMatchObject({ points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["head_to_head", "score_difference", "score_for", "wins", "tiebreak_match"] });
  });
});
