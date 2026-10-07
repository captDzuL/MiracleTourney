import { addMatch, eliminationRounds, outcome } from "./shared";
import type { CompetitionGraph, ParticipantSource, SingleEliminationConfig } from "./types";

/** Entrants are in bracket position order, including explicit bye slots. */
export function generateSingleElimination(
  graph: CompetitionGraph,
  config: SingleEliminationConfig,
  entrants: ParticipantSource[],
  phaseId: string,
  prefix: string,
): void {
  const rounds = eliminationRounds(graph, {
    prefix, phaseId, bracket: "single", entrants,
    bestOf: (round, total) => round === total ? config.bestOf.final
      : round === total - 1 ? config.bestOf.semifinals : config.bestOf.earlyRounds,
  });
  const final = rounds.at(-1)![0];
  graph.placements.push(
    { rank: 1, source: outcome(final, "winner") },
    { rank: 2, source: outcome(final, "loser") },
  );
  if (config.thirdPlace === "required" && rounds.length > 1) {
    const semifinals = rounds.at(-2)!;
    const home = outcome(semifinals[0], "loser");
    const away = outcome(semifinals[1], "loser");
    if (home.kind === "bye" && away.kind === "bye") return;
    const thirdPlace = addMatch(graph, {
      id: `${prefix}:third_place:r1:m1`, phaseId, groupId: null,
      bracket: "third_place", round: 1, slot: 1, leg: 1, bestOf: config.bestOf.thirdPlace,
      home, away,
    });
    graph.placements.push({ rank: 3, source: outcome(thirdPlace, "winner") });
  }
}
