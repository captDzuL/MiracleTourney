import type { CompetitionGraph, CompetitionMatch, ParticipantSource } from "./types";

export const bye = (): ParticipantSource => ({ kind: "bye" });

export function seedOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  return seedOrder(size / 2).flatMap((seed) => [seed, size + 1 - seed]);
}

export function bracketSize(capacity: number): number {
  return 2 ** Math.ceil(Math.log2(capacity));
}

export function outcome(match: CompetitionMatch, result: "winner" | "loser"): ParticipantSource {
  if (match.status === "empty") return bye();
  if (match.status === "bye") return result === "winner" ? match.advance! : bye();
  return { kind: "match", matchId: match.id, outcome: result };
}

export function addMatch(
  graph: CompetitionGraph,
  input: Omit<CompetitionMatch, "status" | "advance">,
): CompetitionMatch {
  const homeEmpty = input.home.kind === "bye";
  const awayEmpty = input.away.kind === "bye";
  const status = homeEmpty && awayEmpty ? "empty" : homeEmpty || awayEmpty ? "bye" : "pending";
  const match: CompetitionMatch = {
    ...input, status,
    advance: status === "bye" ? (homeEmpty ? input.away : input.home) : null,
  };
  graph.matches.push(match);
  for (const targetSlot of ["home", "away"] as const) {
    const source = match[targetSlot];
    if (source.kind === "match") {
      graph.dependencies.push({
        id: `${match.id}:${targetSlot}`,
        sourceMatchId: source.matchId,
        targetMatchId: match.id,
        outcome: source.outcome,
        targetSlot,
      });
    } else if (source.kind === "group_rank") {
      graph.qualificationDependencies.push({
        id: `${match.id}:${targetSlot}`,
        groupId: source.groupId,
        rank: source.rank,
        targetMatchId: match.id,
        targetSlot,
      });
    }
  }
  return match;
}

export function eliminationRounds(
  graph: CompetitionGraph,
  input: {
    prefix: string;
    phaseId: string;
    bracket: "single" | "upper";
    entrants: ParticipantSource[];
    bestOf: (round: number, totalRounds: number) => number;
  },
): CompetitionMatch[][] {
  let sources = input.entrants;
  const rounds: CompetitionMatch[][] = [];
  const totalRounds = Math.log2(sources.length);
  for (let round = 1; sources.length > 1; round++) {
    const matches: CompetitionMatch[] = [];
    for (let index = 0; index < sources.length; index += 2) {
      matches.push(addMatch(graph, {
        id: `${input.prefix}:${input.bracket}:r${round}:m${index / 2 + 1}`,
        phaseId: input.phaseId,
        groupId: null,
        bracket: input.bracket,
        round, slot: index / 2 + 1, leg: 1,
        bestOf: input.bestOf(round, totalRounds),
        home: sources[index], away: sources[index + 1],
      }));
    }
    rounds.push(matches);
    sources = matches.map((match) => outcome(match, "winner"));
  }
  return rounds;
}
