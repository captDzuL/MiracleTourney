import { describe, expect, it } from "vitest";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";
import { buildGraphSocialBracket, buildLegacySocialBracket } from "./model";

const event = { id: "event", slug: "cup", name: "Cup", logoUrl: null, format: "Single Elimination", status: "Ongoing" };
const appearance = { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 };
const teams = [
  { id: "alpha", name: "Same", logoUrl: "/alpha.png", logoText: "A" },
  { id: "beta", name: "Same", logoUrl: "/beta.png", logoText: "B" },
  { id: "gamma", name: "Gamma", logoUrl: null, logoText: "G" },
];
const source = (matchId: string) => ({ kind: "match" as const, matchId, outcome: "winner" as const });
const team = (teamId: string) => ({ kind: "team" as const, teamId, seed: 1 });
const graph = {
  eventId: "event",
  config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  phases: [{ id: "phase", sequence: 1, kind: "single_elimination", standingsRules: null }],
  groups: [],
  matches: [
    { id: "semi", phaseId: "phase", groupId: null, bracket: "single", round: 1, slot: 1, leg: 1, bestOf: 3, home: team("alpha"), away: team("beta"), status: "pending", advance: null },
    { id: "final", phaseId: "phase", groupId: null, bracket: "single", round: 2, slot: 1, leg: 1, bestOf: 5, home: source("semi"), away: team("gamma"), status: "pending", advance: null },
  ],
  dependencies: [{ id: "edge", sourceMatchId: "semi", targetMatchId: "final", outcome: "winner", targetSlot: "home" }],
  qualificationDependencies: [],
  placements: [{ rank: 1, source: source("final") }],
} as CompetitionGraph;
const result = (id: string, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number, winnerTeamId: string | null, resultVersion = 1) =>
  ({ id, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId, resultVersion, status: "Completed", scheduleStatus: "estimated", scheduledAt: null, resultSnapshot: null });

describe("social bracket model", () => {
  it("uses team IDs for logos and explicit match sources for waiting slots", () => {
    const model = buildGraphSocialBracket({ event, appearance, locale: "id", graph, teams, results: [result("semi", "alpha", "beta", 2, 1, "alpha")] });
    expect(model.matches.find(m => m.id === "semi")?.home.team).toMatchObject({ id: "alpha", logoUrl: "/alpha.png" });
    expect(model.matches.find(m => m.id === "semi")?.away.team).toMatchObject({ id: "beta", logoUrl: "/beta.png" });
    expect(model.matches.find(m => m.id === "final")?.home).toMatchObject({ sourceMatchId: "semi", outcome: "winner" });
    expect(model.champion).toBeNull();
  });

  it("awards a champion only for a completed decisive official final", () => {
    const base = [result("semi", "alpha", "beta", 2, 1, "alpha")];
    const done = buildGraphSocialBracket({ event, appearance, locale: "en", graph, teams, results: [...base, result("final", "alpha", "gamma", 3, 1, "alpha")] });
    expect(done.champion?.id).toBe("alpha");
    expect(done.matches.find(m => m.id === "final")?.bestOf).toBe(5);
    expect(buildGraphSocialBracket({ event, appearance, locale: "en", graph, teams, results: [...base, result("final", "alpha", "gamma", 2, 2, "alpha")] }).champion).toBeNull();
    expect(buildGraphSocialBracket({ event, appearance, locale: "en", graph, teams, results: [...base, result("final", "alpha", "gamma", 3, 1, "alpha", 0)] }).champion).toBeNull();
  });

  it("keeps private graph nodes out of a public model", () => {
    const model = buildGraphSocialBracket({ event, appearance, locale: "id", graph, teams, results: [], visibleMatchIds: new Set(["semi"]) });
    expect(model.matches.map(m => m.id)).toEqual(["semi"]);
    expect(JSON.stringify(model)).not.toContain("final");
  });

  it("does not expose a hidden parent through a downstream waiting slot", () => {
    const model = buildGraphSocialBracket({ event, appearance, locale: "en", graph, teams,
      visibleMatchIds: new Set(["final"]),
      results: [result("final", "alpha", "gamma", 0, 0, null, 0)] });
    expect(model.matches[0]?.home.team).toBeNull();
    expect(model.matches[0]?.home.sourceMatchId).toBeNull();
    expect(model.matches[0]?.home.label).toBe("Waiting for team");
    expect(JSON.stringify(model)).not.toContain("semi");
  });
  it("does not promote an upper final over an unfinished grand final", () => {
    const doubleGraph = { ...graph, matches: [
      { ...graph.matches[0], id: "upper", bracket: "upper" as const },
      { ...graph.matches[1], id: "grand", bracket: "grand_final" as const, home: source("upper") },
    ], placements: [{ rank: 1, source: source("grand") }] } as CompetitionGraph;
    const model = buildGraphSocialBracket({ event, appearance, locale: "id", graph: doubleGraph, teams, results: [result("upper", "alpha", "beta", 2, 1, "alpha")] });
    expect(model.champion).toBeNull();
  });

  it("keeps legacy league fixtures out of elimination champion logic", () => {
    const model = buildLegacySocialBracket({ event: { ...event, format: "League", status: "Finished" },
      appearance, locale: "en", teams,
      matches: [{ id: "league-final", round: 2, slot: 1, homeTeamId: "alpha", awayTeamId: "beta" }],
      results: [{ ...result("league-final", "alpha", "beta", 2, 1, "alpha"), round: 2, slot: 1 }],
      roundConfigs: [], gamesByMatch: new Map() });
    expect(model.matches[0]?.bracket).toBe("round_robin");
    expect(model.matches[0]?.roundKey).toBe("round_robin:2");
    expect(model.champion).toBeNull();
  });
  it("keeps future semifinal BO configuration when the visible slice omits the final", () => {
    const model = buildLegacySocialBracket({ event, appearance, locale: "en", teams, totalRounds: 5,
      matches: [{ id: "future-semi", round: 4, slot: 1, homeTeamId: null, awayTeamId: null }],
      results: [], roundConfigs: [{ roundLabel: "Semifinal", bestOf: 5 }], gamesByMatch: new Map() });
    expect(model.matches[0]).toMatchObject({ roundLabel: "Semifinal", bestOf: 5, status: "scheduled" });
    expect(model.champion).toBeNull();
  });
  it.each([
    ["Live", "estimated", "live"],
    ["Scheduled", "delayed", "delayed"],
    ["Scheduled", "postponed", "postponed"],
  ] as const)("preserves legacy %s/%s match status as %s", (matchStatus, scheduleStatus, expected) => {
    const model = buildLegacySocialBracket({ event, appearance, locale: "en", teams,
      matches: [{ id: "semi", round: 1, slot: 1, homeTeamId: "alpha", awayTeamId: "beta" }],
      results: [{ ...result("semi", "alpha", "beta", 0, 0, null, 0), status: matchStatus, scheduleStatus }],
      roundConfigs: [], gamesByMatch: new Map() });
    expect(model.matches[0]?.status).toBe(expected);
  });
  it("preserves legacy bye and BO games without treating a bye as the champion", () => {
    const model = buildLegacySocialBracket({ event, appearance, locale: "id", teams, matches: [
      { id: "bye", round: 1, slot: 1, homeTeamId: "alpha", awayTeamId: null, byeForTeamId: "alpha", sourceMatchIds: [null, null] },
      { id: "final", round: 2, slot: 1, homeTeamId: "alpha", awayTeamId: "gamma", sourceMatchIds: ["bye", null] },
    ], results: [], roundConfigs: [{ roundLabel: "Final", bestOf: 3 }], gamesByMatch: new Map() });
    expect(model.matches[0]?.status).toBe("bye");
    expect(model.matches[1]?.home.sourceMatchId).toBe("bye");
    expect(model.champion).toBeNull();
  });
});

describe("competition format decisions", () => {
  it("shows group qualifiers and names the completed playoff winner", () => {
    const playoffGraph = { ...graph,
      groups: [{ id: "group-a", phaseId: "group-phase", label: "Group A", sequence: 1, teams: [{ id: "alpha", seed: 1 }], qualificationCutline: 1 }],
      matches: [{ ...graph.matches[1], id: "playoff-final", round: 1,
        home: { kind: "group_rank", groupId: "group-a", rank: 1 }, away: team("gamma") }],
      placements: [{ rank: 1, source: source("playoff-final") }],
    } as CompetitionGraph;
    const model = buildGraphSocialBracket({ event, appearance, locale: "en", graph: playoffGraph, teams,
      results: [result("playoff-final", "alpha", "gamma", 3, 1, "alpha")] });
    expect(model.matches[0]?.home.label).toBe("Same");
    expect(model.champion?.id).toBe("alpha");
  });

  it("withholds a finished league title when first place is tied", () => {
    const leagueGraph = { ...graph,
      config: TOURNAMENT_FORMAT_PRESETS.roundRobin,
      phases: [{ id: "phase", sequence: 1, kind: "round_robin", standingsRules: TOURNAMENT_FORMAT_PRESETS.roundRobin }],
      matches: [
        { ...graph.matches[0], id: "ab", bracket: "round_robin", home: team("alpha"), away: team("beta") },
        { ...graph.matches[0], id: "bc", bracket: "round_robin", home: team("beta"), away: team("gamma") },
        { ...graph.matches[0], id: "ca", bracket: "round_robin", home: team("gamma"), away: team("alpha") },
      ],
      placements: [],
    } as CompetitionGraph;
    const model = buildGraphSocialBracket({ event: { ...event, status: "Finished" }, appearance, locale: "en",
      graph: leagueGraph, teams, results: [
        result("ab", "alpha", "beta", 0, 0, null),
        result("bc", "beta", "gamma", 0, 0, null),
        result("ca", "gamma", "alpha", 0, 0, null),
      ] });
    expect(model.matches).toHaveLength(3);
    expect(model.champion).toBeNull();
  });
  it("awards a league only after finished complete untied standings", () => {
    const rules = { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference"] };
    const leagueGraph = { ...graph,
      config: TOURNAMENT_FORMAT_PRESETS.roundRobin,
      phases: [{ id: "phase", sequence: 1, kind: "round_robin", standingsRules: rules }],
      matches: [{ ...graph.matches[0], id: "league-match", bracket: "round_robin", home: team("alpha"), away: team("beta") }],
      placements: [],
    } as CompetitionGraph;
    const finish = { ...event, status: "Finished" };
    const full = buildGraphSocialBracket({ event: finish, appearance, locale: "id", graph: leagueGraph, teams,
      results: [result("league-match", "alpha", "beta", 2, 1, "alpha")] });
    expect(full.matches.map(m => m.id)).toEqual(["league-match"]);
    expect(full.champion?.id).toBe("alpha");
    expect(buildGraphSocialBracket({ event, appearance, locale: "id", graph: leagueGraph, teams,
      results: [result("league-match", "alpha", "beta", 2, 1, "alpha")] }).champion).toBeNull();
    expect(buildGraphSocialBracket({ event: finish, appearance, locale: "id", graph: leagueGraph, teams, results: [] }).champion).toBeNull();
  });
});
