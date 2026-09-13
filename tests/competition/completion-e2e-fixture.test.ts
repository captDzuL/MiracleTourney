import { describe, expect, it } from "vitest";

import { fixtureGraph } from "../e2e/helpers/completion";

describe("Completion E2E fixture graph", () => {
  it("builds Group + Playoffs with groups, qualification dependencies, and every generated match", () => {
    const eventId = "fixture-group-playoffs";
    const teamIds = ["team-1", "team-2", "team-3", "team-4"];
    const { graph, matches } = fixtureGraph(eventId, `${eventId}:phase:1`, "group_playoffs", teamIds);

    expect(graph.phases.map(({ sequence, kind }) => ({ sequence, kind }))).toEqual([
      { sequence: 1, kind: "groups" },
      { sequence: 2, kind: "single_elimination" },
    ]);
    expect(graph.groups.map(({ sequence, teams }) => ({
      sequence,
      teams: teams.map(({ id }) => id),
    }))).toEqual([
      { sequence: 1, teams: ["team-1", "team-4"] },
      { sequence: 2, teams: ["team-2", "team-3"] },
    ]);
    expect(graph.matches.filter(({ groupId }) => groupId !== null)).toHaveLength(2);
    expect(graph.qualificationDependencies).toHaveLength(4);
    expect(new Set(matches.map(({ id }) => id))).toEqual(new Set(graph.matches.map(({ id }) => id)));
    expect(matches.every(({ homeTeamId, awayTeamId }) => teamIds.includes(homeTeamId) && teamIds.includes(awayTeamId))).toBe(true);
    expect(new Set(matches.map(({ round, slot }) => `${round}:${slot}`))).toHaveLength(matches.length);
    expect(graph.placements.map(({ rank }) => rank)).toEqual([1, 2, 3]);
  });
});
