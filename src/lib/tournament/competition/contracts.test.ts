import { describe, expect, it } from "vitest";
import { TOURNAMENT_FORMAT_PRESETS } from "../formats/types";
import { generateCompetitionGraph } from "./index";

describe("shared competition graph contracts", () => {
  it.each(Object.values(TOURNAMENT_FORMAT_PRESETS))("keeps $kind output stable across seeded input order and repeat generation", (config) => {
    const teams = [
      { id: "a", seed: 1 }, { id: "b", seed: 2 }, { id: "c", seed: 3 }, { id: "d", seed: 4 },
      { id: "e", seed: 5 }, { id: "f", seed: 6 }, { id: "g", seed: 7 }, { id: "h", seed: 8 },
    ];
    const original = structuredClone({ config, teams });
    const first = generateCompetitionGraph({ eventId: "cup", config, teams, hasOfficialResults: false });
    const reordered = generateCompetitionGraph({ eventId: "cup", config, teams: [...teams].reverse() });
    expect(reordered).toEqual(first);
    expect(generateCompetitionGraph({ eventId: "cup", config, teams })).toEqual(first);
    expect({ config, teams }).toEqual(original);
    expect(new Set(first.matches.map((m) => m.id)).size).toBe(first.matches.length);
    const seen = new Set<string>();
    for (const match of first.matches) {
      for (const source of [match.home, match.away]) {
        if (source.kind === "match") expect(seen.has(source.matchId)).toBe(true);
      }
      seen.add(match.id);
    }
    const allDependencies = [...first.dependencies, ...first.qualificationDependencies];
    expect(new Set(allDependencies.map((d) => d.id)).size).toBe(allDependencies.length);
    for (const dependency of allDependencies) {
      expect(seen.has(dependency.targetMatchId)).toBe(true);
    }
  });

  it.each([
    [2, 1, 2], [3, 2, 4], [5, 4, 8], [8, 7, 14], [12, 11, 22], [17, 16, 32], [256, 255, 510],
  ])("creates the hand-counted playable elimination matches for %i teams", (count, single, double) => {
    const teams = Array.from({ length: count }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 }));
    expect(generateCompetitionGraph({ eventId: "cup", config: TOURNAMENT_FORMAT_PRESETS.singleElimination, teams }).matches.filter((m) => m.status === "pending")).toHaveLength(single);
    expect(generateCompetitionGraph({ eventId: "cup", config: TOURNAMENT_FORMAT_PRESETS.doubleElimination, teams }).matches.filter((m) => m.status === "pending")).toHaveLength(double);
  });

  it("keeps every first-round playoff pairing cross-group at the maximum v1 qualification field", () => {
    const preset = TOURNAMENT_FORMAT_PRESETS.groupPlayoffs;
    if (preset.kind !== "group_playoffs") throw new Error("Wrong fixture format");
    const config = { ...preset, groupCount: 16, qualifiersPerGroup: 8 };
    const teams = Array.from({ length: 128 }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 }));
    const graph = generateCompetitionGraph({ eventId: "cup", config, teams });
    const firstRound = graph.matches.filter((m) => m.phaseId === "cup:phase:2" && m.round === 1);
    expect(firstRound).toHaveLength(64);
    expect(graph.qualificationDependencies).toHaveLength(128);
    for (const match of firstRound) {
      expect(match.home.kind).toBe("group_rank");
      expect(match.away.kind).toBe("group_rank");
      if (match.home.kind === "group_rank" && match.away.kind === "group_rank") {
        expect(match.home.groupId).not.toBe(match.away.groupId);
      }
    }
  });
});
