import { addMatch, bye } from "./shared";
import type { CompetitionGraph, ParticipantSource, SeededTeam, StandingsRules } from "./types";

export function generateRoundRobin(
  graph: CompetitionGraph,
  rules: StandingsRules,
  teams: readonly SeededTeam[],
  phaseId: string,
  prefix: string,
  groupId: string | null = null,
): void {
  const entrants: ParticipantSource[] = teams.map((team) => ({ kind: "team", teamId: team.id, seed: team.seed }));
  if (entrants.length % 2) entrants.push(bye());
  const roundsPerLeg = entrants.length - 1;
  for (let leg = 1; leg <= rules.legs; leg++) {
    let rotation = [...entrants];
    for (let localRound = 1; localRound <= roundsPerLeg; localRound++) {
      const round = (leg - 1) * roundsPerLeg + localRound;
      let slot = 0;
      for (let index = 0; index < rotation.length / 2; index++) {
        const left = rotation[index];
        const right = rotation[rotation.length - 1 - index];
        if (left.kind === "bye" || right.kind === "bye") continue;
        slot++;
        addMatch(graph, {
          id: `${prefix}:round_robin:r${round}:m${slot}`, phaseId, groupId,
          bracket: "round_robin", round, slot, leg, bestOf: 1,
          home: leg === 1 ? left : right, away: leg === 1 ? right : left,
        });
      }
      rotation = [rotation[0], rotation.at(-1)!, ...rotation.slice(1, -1)];
    }
  }
}
