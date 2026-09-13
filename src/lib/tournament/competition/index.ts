import type { CompetitionGraph, GenerateCompetitionGraphInput } from "./types";
import { bracketSize, bye, seedOrder } from "./shared";
import { generateSingleElimination } from "./single-elimination";
import { generateDoubleElimination } from "./double-elimination";
import { generateRoundRobin } from "./round-robin";
import { generateGroupPlayoffs } from "./group-playoffs";
import { validateGraphInput } from "./validation";

export type * from "./types";

export function generateCompetitionGraph(input: GenerateCompetitionGraphInput): CompetitionGraph {
  input = validateGraphInput(input);
  const graph: CompetitionGraph = {
    eventId: input.eventId,
    config: input.config,
    phases: [],
    groups: [],
    matches: [],
    dependencies: [],
    qualificationDependencies: [],
    placements: [],
  };
  if (input.config.kind === "single_elimination" || input.config.kind === "double_elimination") {
    const phaseId = `${input.eventId}:phase:1`;
    graph.phases.push({ id: phaseId, sequence: 1, kind: input.config.kind, standingsRules: null });
    const size = bracketSize(input.slotCount ?? input.teams.length);
    const entrants = seedOrder(size).map((seed) => {
      const team = input.teams.find((entry) => entry.seed === seed);
      return team ? { kind: "team" as const, teamId: team.id, seed } : bye();
    });
    if (input.config.kind === "single_elimination") {
      generateSingleElimination(graph, input.config, entrants, phaseId, input.eventId);
    } else {
      generateDoubleElimination(graph, input.config, entrants, phaseId, input.eventId);
    }
  } else if (input.config.kind === "round_robin") {
    const phaseId = `${input.eventId}:phase:1`;
    const { legs, points, tiebreakers } = input.config;
    graph.phases.push({ id: phaseId, sequence: 1, kind: "round_robin", standingsRules: { legs, points, tiebreakers } });
    generateRoundRobin(graph, input.config, input.teams, phaseId, input.eventId);
  } else if (input.config.kind === "group_playoffs") {
    generateGroupPlayoffs(graph, input.config, input.teams);
  }
  return graph;
}
