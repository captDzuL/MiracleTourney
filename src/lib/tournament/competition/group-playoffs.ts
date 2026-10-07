import { generateDoubleElimination } from "./double-elimination";
import { generateRoundRobin } from "./round-robin";
import { seedOrder } from "./shared";
import { generateSingleElimination } from "./single-elimination";
import type { CompetitionGraph, GroupPlayoffsConfig, ParticipantSource, SeededTeam } from "./types";

export function generateGroupPlayoffs(graph: CompetitionGraph, config: GroupPlayoffsConfig, teams: readonly SeededTeam[]): void {
  const phaseId = `${graph.eventId}:phase:1`;
  const playoffPhaseId = `${graph.eventId}:phase:2`;
  graph.phases.push(
    { id: phaseId, sequence: 1, kind: "groups", standingsRules: config.groupStage },
    { id: playoffPhaseId, sequence: 2, kind: config.playoffs.kind, standingsRules: null },
  );
  for (let index = 0; index < config.groupCount; index++) {
    graph.groups.push({
      id: `${graph.eventId}:group:${index + 1}`, phaseId,
      label: String.fromCharCode(65 + index), sequence: index + 1,
      teams: [], qualificationCutline: config.qualifiersPerGroup,
    });
  }
  for (const team of teams) {
    const row = Math.floor((team.seed - 1) / config.groupCount);
    const column = (team.seed - 1) % config.groupCount;
    const groupIndex = row % 2 === 0 ? column : config.groupCount - 1 - column;
    graph.groups[groupIndex].teams.push({ ...team });
  }
  for (const group of graph.groups) {
    generateRoundRobin(graph, config.groupStage, group.teams, phaseId, group.id, group.id);
  }

  const qualifiers: ParticipantSource[] = [];
  for (let rank = 1; rank <= config.qualifiersPerGroup; rank++) {
    // Rank bands preserve finish priority. With avoidance enabled, all bands
    // use group order: complementary bracket seeds then come from different
    // groups (both group count and qualifier count are powers of two in v1).
    const groups = !config.playoffs.avoidImmediateGroupRematches && rank % 2 === 0
      ? [...graph.groups].reverse() : graph.groups;
    for (const group of groups) qualifiers.push({ kind: "group_rank", groupId: group.id, rank });
  }
  const entrants = seedOrder(qualifiers.length).map((seed) => qualifiers[seed - 1]);
  const prefix = `${graph.eventId}:playoffs`;
  if (config.playoffs.kind === "single_elimination") {
    generateSingleElimination(graph, config.playoffs, entrants, playoffPhaseId, prefix);
  } else {
    generateDoubleElimination(graph, config.playoffs, entrants, playoffPhaseId, prefix);
  }
}
