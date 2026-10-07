import { describe, expect, it } from "vitest";
import { buildFixtureGraph, createSyntheticSchedule } from "../../scripts/operations/testing-fixture-recovery";
import { scoreResult } from "../../src/lib/tournament/operations/results";

const event = { id: "event-closed", slug: "flashpeak-revision-closed", status: "Registration Closed", format: "Single Elimination" };
const teams = Array.from({ length: 4 }, (_, index) => ({
  id: `team-flashpeak-revision-closed-${index + 1}`,
  eventId: event.id,
  source: "demo",
}));
const matches = [
  { id: "event-closed:single:r1:m1", eventId: event.id, roundLabel: "single 1", round: 1, slot: 1, homeTeamId: teams[0].id, awayTeamId: teams[3].id, status: "Scheduled", homeScore: 0, awayScore: 0, winnerTeamId: null },
  { id: "event-closed:single:r1:m2", eventId: event.id, roundLabel: "single 1", round: 1, slot: 2, homeTeamId: teams[1].id, awayTeamId: teams[2].id, status: "Scheduled", homeScore: 0, awayScore: 0, winnerTeamId: null },
  { id: "event-closed:single:r2:m1", eventId: event.id, roundLabel: "single 2", round: 2, slot: 3, homeTeamId: "", awayTeamId: "", status: "Scheduled", homeScore: 0, awayScore: 0, winnerTeamId: null },
];

describe("synthetic fixture graph gate", () => {
  it("uses the runtime BO3 scorer to reject games after a completed series", () => {
    const match = { homeTeamId: "a", awayTeamId: "b" } as Parameters<typeof scoreResult>[0];
    const graphMatch = { status: "pending", bestOf: 3, bracket: "single" } as Parameters<typeof scoreResult>[1];
    expect(() => scoreResult(match, graphMatch, [
      { gameNumber: 1, homeScore: 2, awayScore: 0 },
      { gameNumber: 2, homeScore: 2, awayScore: 0 },
      { gameNumber: 3, homeScore: 2, awayScore: 0 },
    ])).toThrow("Games submitted after the best-of series ended");
  });

  it("accepts the existing four-team match IDs and sides without replacing them", () => {
    const plan = buildFixtureGraph(event, teams, matches);
    expect(plan.graph.matches.map((match) => match.id)).toEqual(matches.map((match) => match.id));
    expect(plan.graph.dependencies).toHaveLength(2);
  });

  it("rejects a changed first-round side before metadata can be written", () => {
    const changed = matches.map((match, index) => index === 0 ? { ...match, awayTeamId: teams[2].id } : match);
    expect(() => buildFixtureGraph(event, teams, changed)).toThrow("FIXTURE_DRIFT");
  });

  it("rejects an extra match outside the exact deterministic graph", () => {
    expect(() => buildFixtureGraph(event, teams, [...matches, { ...matches[0], id: "foreign" }])).toThrow("FIXTURE_DRIFT");
  });

  it("plans and revalidates a fixed assignment for an already-live match", () => {
    const risingEvent = { id: "event-rising", slug: "flashpeak-rising-64", status: "Ongoing", format: "Single Elimination" };
    const risingTeams = Array.from({ length: 8 }, (_, index) => ({ id: `team-flashpeak-rising-64-${index + 1}`, eventId: risingEvent.id, source: "demo" }));
    const graph = buildFixtureGraph(risingEvent, risingTeams, [
      ["r1:m1", 1, 8], ["r1:m2", 4, 5], ["r1:m3", 2, 7], ["r1:m4", 3, 6],
      ["r2:m1", 0, 0], ["r2:m2", 0, 0], ["r3:m1", 0, 0],
    ].map(([suffix, home, away], index) => ({
      id: `${risingEvent.id}:single:${suffix}`, eventId: risingEvent.id,
      roundLabel: `single ${index < 4 ? 1 : index < 6 ? 2 : 3}`,
      round: index < 4 ? 1 : index < 6 ? 2 : 3, slot: index + 1,
      homeTeamId: home ? risingTeams[Number(home) - 1].id : "",
      awayTeamId: away ? risingTeams[Number(away) - 1].id : "",
      status: index === 0 ? "Live" : "Scheduled", homeScore: 0, awayScore: 0, winnerTeamId: null,
    }))).graph;
    const draft = createSyntheticSchedule(graph, graph.matches.map((node, index) => ({ id: node.id, status: index === 0 ? "Live" : "Scheduled" })), {
      timezone: "Asia/Jakarta", eventWindow: { start: "2026-08-12T02:00:00.000Z", end: "2026-08-13T02:00:00.000Z" },
      matchDurationMinutes: 45, bufferMinutes: 10, minimumRestMinutes: 15, rooms: ["Flashpeak Arena A", "Flashpeak Arena B"],
    });
    expect(draft.feasible).toBe(true);
    expect(draft.assignments).toHaveLength(7);
    expect(draft.assignments.some((assignment) => assignment.matchId === "event-rising:single:r1:m1")).toBe(true);
  });
});
