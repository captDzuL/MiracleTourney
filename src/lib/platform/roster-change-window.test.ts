import type { Match } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { generateCompetitionGraph, type CompetitionGraph, type GroupPlayoffsConfig } from "../tournament/competition";
import { graphFromPhaseConfiguration, resolveRosterChangeWindow, type RosterChangeWindowInput } from "./roster-change-window";

const groupPlayoffs: GroupPlayoffsConfig = {
  version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2,
  groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference", "head_to_head"] },
  playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, avoidImmediateGroupRematches: true },
};
const teams = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `t${n}`, seed: n }));
const groupGraph = generateCompetitionGraph({ eventId: "cup", config: { ...groupPlayoffs, groupCount: 2, qualifiersPerGroup: 2 }, teams });

function dbMatch(graph: CompetitionGraph, graphMatchId: string, overrides: Partial<Match> = {}): Match {
  const node = graph.matches.find((m) => m.id === graphMatchId)!;
  const teamOf = (source: typeof node.home) => (source.kind === "team" ? source.teamId : "");
  return {
    id: graphMatchId, status: "Scheduled", scheduleStatus: "unscheduled", resultVersion: 0,
    homeTeamId: teamOf(node.home), awayTeamId: teamOf(node.away), homeScore: 0, awayScore: 0, winnerTeamId: null,
    ...overrides,
  } as unknown as Match;
}

function groupMatchIds(graph: CompetitionGraph) {
  return graph.matches.filter((m) => m.groupId !== null).map((m) => m.id);
}
function playoffMatchIds(graph: CompetitionGraph) {
  return graph.matches.filter((m) => m.groupId === null).map((m) => m.id);
}
function completed(graph: CompetitionGraph, id: string): Match {
  const node = graph.matches.find((m) => m.id === id)!;
  const home = node.home.kind === "team" ? node.home.teamId : "";
  const away = node.away.kind === "team" ? node.away.teamId : "";
  return dbMatch(graph, id, { status: "Completed", resultVersion: 1, homeScore: 2, awayScore: 1, winnerTeamId: home, homeTeamId: home, awayTeamId: away });
}

function input(overrides: Partial<RosterChangeWindowInput> = {}): RosterChangeWindowInput {
  return {
    baseLocked: true,
    eventStatus: "Registration Closed",
    rosterChangeLimit: 2,
    graph: groupGraph,
    matches: [...groupMatchIds(groupGraph), ...playoffMatchIds(groupGraph)].map((id) => dbMatch(groupGraph, id)),
    ...overrides,
  };
}

describe("resolveRosterChangeWindow", () => {
  it("is free while the legacy lock is not active, whatever the limit is", () => {
    expect(resolveRosterChangeWindow(input({ baseLocked: false, rosterChangeLimit: 0 }))).toBe("free");
    expect(resolveRosterChangeWindow(input({ baseLocked: false, graph: null }))).toBe("free");
  });

  it("stays locked when the organizer left the limit at 0 (default)", () => {
    expect(resolveRosterChangeWindow(input({ rosterChangeLimit: 0 }))).toBe("locked");
  });

  it("is limited once the drawing is published and no playoff match has started", () => {
    expect(resolveRosterChangeWindow(input())).toBe("limited");
  });

  it("stays limited while group matches are live or completed", () => {
    const ids = groupMatchIds(groupGraph);
    const matches = [
      completed(groupGraph, ids[0]),
      dbMatch(groupGraph, ids[1], { status: "Live" }),
      ...ids.slice(2).map((id) => dbMatch(groupGraph, id)),
      ...playoffMatchIds(groupGraph).map((id) => dbMatch(groupGraph, id)),
    ];
    expect(resolveRosterChangeWindow(input({ matches }))).toBe("limited");
  });

  it("stays limited after every group table is complete, until a playoff match starts", () => {
    // A team whose group is done can still field its best roster for the playoffs.
    const matches = [
      ...groupMatchIds(groupGraph).map((id) => completed(groupGraph, id)),
      ...playoffMatchIds(groupGraph).map((id) => dbMatch(groupGraph, id)),
    ];
    expect(resolveRosterChangeWindow(input({ matches }))).toBe("limited");
  });

  it("locks once the first playoff match is live", () => {
    const matches = [
      ...groupMatchIds(groupGraph).map((id) => completed(groupGraph, id)),
      ...playoffMatchIds(groupGraph).map((id, index) => dbMatch(groupGraph, id, index === 0 ? { status: "Live" } : {})),
    ];
    expect(resolveRosterChangeWindow(input({ matches }))).toBe("locked");
  });

  it("locks once a playoff match has a recorded result", () => {
    const [first, ...rest] = playoffMatchIds(groupGraph);
    const matches = [
      ...groupMatchIds(groupGraph).map((id) => completed(groupGraph, id)),
      dbMatch(groupGraph, first, { resultVersion: 1 }),
      ...rest.map((id) => dbMatch(groupGraph, id)),
    ];
    expect(resolveRosterChangeWindow(input({ matches }))).toBe("locked");
  });

  it("locks as soon as any playoff match is live, even while group matches are open", () => {
    const [firstPlayoff, ...restPlayoff] = playoffMatchIds(groupGraph);
    const matches = [
      ...groupMatchIds(groupGraph).map((id) => dbMatch(groupGraph, id)),
      dbMatch(groupGraph, firstPlayoff, { status: "Live" }),
      ...restPlayoff.map((id) => dbMatch(groupGraph, id)),
    ];
    expect(resolveRosterChangeWindow(input({ matches }))).toBe("locked");
  });

  it("locks a finished event", () => {
    expect(resolveRosterChangeWindow(input({ eventStatus: "Finished" }))).toBe("locked");
  });

  it("fails closed when the competition graph is missing (legacy event)", () => {
    expect(resolveRosterChangeWindow(input({ graph: null }))).toBe("locked");
  });

  it("fails closed when the stored graph is malformed before the window is judged", () => {
    const broken = { ...groupGraph, phases: [null], matches: [undefined] } as unknown as CompetitionGraph;
    expect(resolveRosterChangeWindow(input({ graph: broken, matches: [] }))).toBe("locked");
  });

  it.each([
    ["single_elimination", { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 } }],
    ["round_robin", { version: 1, kind: "round_robin", legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference"] }],
  ] as const)("stays locked for %s even with a positive limit", (_kind, config) => {
    const graph = generateCompetitionGraph({ eventId: "cup", config: config as never, teams });
    const matches = graph.matches.map((m) => dbMatch(graph, m.id));
    expect(resolveRosterChangeWindow(input({ graph, matches }))).toBe("locked");
  });

  it("is not affected by a disqualified team: the rule is about the stage, per-team checks live in the request flow", () => {
    const source = groupGraph.matches.find((match) => match.groupId !== null)!.home;
    if (source.kind !== "team") throw new Error("fixture");
    const graph: CompetitionGraph = {
      ...groupGraph,
      disqualifications: [{ teamId: source.teamId, reason: "x", actorUserId: "u", disqualifiedAt: "2026-10-11T00:00:00.000Z", voidedMatchIds: [] }],
    };
    expect(resolveRosterChangeWindow(input({ graph }))).toBe("limited");
  });
});

describe("graphFromPhaseConfiguration", () => {
  it("returns the stored graph for the same event", () => {
    expect(graphFromPhaseConfiguration({ graph: groupGraph }, "cup")).toBe(groupGraph);
  });

  it.each([
    ["null configuration", null],
    ["a non-object", "graph"],
    ["an array", []],
    ["no graph", {}],
    ["a graph without matches", { graph: { eventId: "cup", phases: [] } }],
  ])("returns null for %s", (_name, configuration) => {
    expect(graphFromPhaseConfiguration(configuration, "cup")).toBeNull();
  });

  it("returns null when the graph belongs to another event", () => {
    expect(graphFromPhaseConfiguration({ graph: groupGraph }, "other-event")).toBeNull();
  });
});
