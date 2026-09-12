import { addMatch, eliminationRounds, outcome } from "./shared";
import type { CompetitionGraph, CompetitionMatch, DoubleEliminationConfig, ParticipantSource } from "./types";

/** v1 uses one grand final, with no reset; third place is the lower-final loser. */
export function generateDoubleElimination(
  graph: CompetitionGraph,
  config: DoubleEliminationConfig,
  entrants: ParticipantSource[],
  phaseId: string,
  prefix: string,
): void {
  const upper = eliminationRounds(graph, {
    prefix, phaseId, bracket: "upper", entrants,
    bestOf: (round, total) => round === total ? config.bestOf.upperFinal : config.bestOf.earlyRounds,
  });
  const upperFinal = upper.at(-1)![0];
  let lower: CompetitionMatch[] = [];
  const lowerMatch = (round: number, slot: number, home: ParticipantSource, away: ParticipantSource) =>
    addMatch(graph, {
      id: `${prefix}:lower:r${round}:m${slot}`, phaseId, groupId: null,
      bracket: "lower", round, slot, leg: 1,
      bestOf: round === 2 * (upper.length - 1) ? config.bestOf.lowerFinal : config.bestOf.earlyRounds,
      home, away,
    });

  // First-round upper losers meet; each later upper round drops into a lower
  // injection round. Between injections, surviving lower teams play each other.
  for (let index = 0; index + 1 < upper[0].length; index += 2) {
    lower.push(lowerMatch(1, index / 2 + 1, outcome(upper[0][index], "loser"), outcome(upper[0][index + 1], "loser")));
  }
  for (let upperRound = 2; upperRound <= upper.length; upperRound++) {
    const drops = upper[upperRound - 1];
    lower = lower.map((match, index) => lowerMatch(
      2 * upperRound - 2, index + 1,
      outcome(match, "winner"), outcome(drops[drops.length - 1 - index], "loser"),
    ));
    if (upperRound < upper.length) {
      const consolidated: CompetitionMatch[] = [];
      for (let index = 0; index < lower.length; index += 2) {
        consolidated.push(lowerMatch(2 * upperRound - 1, index / 2 + 1, outcome(lower[index], "winner"), outcome(lower[index + 1], "winner")));
      }
      lower = consolidated;
    }
  }
  const lowerFinal = lower[0];
  const grandFinal = addMatch(graph, {
    id: `${prefix}:grand_final:r1:m1`, phaseId, groupId: null,
    bracket: "grand_final", round: 1, slot: 1, leg: 1, bestOf: config.bestOf.grandFinal,
    home: outcome(upperFinal, "winner"),
    away: lowerFinal ? outcome(lowerFinal, "winner") : outcome(upperFinal, "loser"),
  });
  graph.placements.push(
    { rank: 1, source: outcome(grandFinal, "winner") },
    { rank: 2, source: outcome(grandFinal, "loser") },
  );
  if (lowerFinal && lowerFinal.status === "pending") {
    graph.placements.push({ rank: 3, source: outcome(lowerFinal, "loser") });
  }
}
