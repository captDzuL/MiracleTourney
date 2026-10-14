import type { CompetitionGraph, CompetitionMatch, ParticipantSource } from "../competition";
import type { BackfillGame, BackfillMatch, BackfillTeam } from "./legacy-backfill-types";

export type NodeRows = Map<string, BackfillMatch>;
export type NameOf = (teamId: string | null | undefined) => string;

const position = (round: number | null, slot: number | null) => `${round}:${slot}`;
const where = (node: CompetitionMatch) => `round ${node.round} slot ${node.slot}`;
const bracketNodes = (graph: CompetitionGraph) => graph.matches.filter((node) => node.bracket === "single");

export const teamNamer = (teams: BackfillTeam[]): NameOf => {
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return (teamId) => (teamId ? `"${names.get(teamId) ?? teamId}"` : "(empty)");
};

/** Every stored row must sit on exactly one real graph match, and every real graph match needs a row. */
export function mapRowsToNodes(graph: CompetitionGraph, matches: BackfillMatch[]): { rows: NodeRows; problems: string[] } {
  const nodes = bracketNodes(graph);
  const rowAt = new Map(matches.map((match) => [position(match.round, match.slot), match]));
  const nodeAt = new Map(nodes.map((node) => [position(node.round, node.slot), node]));
  const unmatchedRows = matches.filter((match) => nodeAt.get(position(match.round, match.slot))?.status !== "pending")
    .map((match) => `round ${match.round} slot ${match.slot}: stored match ${match.id} has no real match at this place in the graph`);
  const missing = nodes.filter((node) => node.status === "pending" && !rowAt.has(position(node.round, node.slot)))
    .map((node) => `${where(node)}: the graph expects a match but none is stored`);
  const rows: NodeRows = new Map(nodes.flatMap((node) => {
    const row = rowAt.get(position(node.round, node.slot));
    return node.status === "pending" && row ? [[node.id, row] as const] : [];
  }));
  const countProblem = rows.size === matches.length ? [] : [`${matches.length} stored matches but ${rows.size} map onto the graph`];
  return { rows, problems: [...unmatchedRows, ...missing, ...countProblem] };
}

/** Who a participant slot should hold given the stored winners of the feeding matches. */
export function resolveSource(source: ParticipantSource, graph: CompetitionGraph, rows: NodeRows): string {
  if (source.kind === "team") return source.teamId;
  if (source.kind !== "match") return "";
  const feeder = graph.matches.find((node) => node.id === source.matchId);
  const row = feeder ? rows.get(feeder.id) : undefined;
  if (!row?.winnerTeamId) return "";
  if (source.outcome === "winner") return row.winnerTeamId;
  return row.winnerTeamId === row.homeTeamId ? row.awayTeamId : row.winnerTeamId === row.awayTeamId ? row.homeTeamId : "";
}

/** Round 1 must hold the seeded teams; later rounds must hold exactly the winners of the feeder matches. */
export function participantProblems(graph: CompetitionGraph, rows: NodeRows, name: NameOf): string[] {
  return bracketNodes(graph).flatMap((node) => {
    const row = rows.get(node.id);
    if (!row) return [];
    return (["home", "away"] as const).flatMap((side) => {
      const expected = resolveSource(node[side], graph, rows);
      const actual = side === "home" ? row.homeTeamId : row.awayTeamId;
      if (expected && expected === actual) return [];
      return [`${where(node)}: ${side} is ${name(actual)} but the bracket requires ${expected ? name(expected) : "a team decided by an earlier match"}`];
    });
  });
}

function scoreProblems(row: BackfillMatch, bestOf: number): string[] {
  const winnerIsHome = row.winnerTeamId === row.homeTeamId;
  const [winnerScore, loserScore] = winnerIsHome ? [row.homeScore, row.awayScore] : [row.awayScore, row.homeScore];
  if (bestOf === 1) return winnerScore > loserScore ? [] : [`score ${row.homeScore}-${row.awayScore} does not give the winner more points (best-of 1)`];
  const needed = Math.ceil(bestOf / 2);
  return winnerScore === needed && loserScore < needed
    ? []
    : [`score ${row.homeScore}-${row.awayScore} is not a finished best-of-${bestOf} series (the winner needs ${needed} games and the loser fewer)`];
}

/**
 * Some old matches stored their games with home and away swapped, while the series score and winner agree
 * with each other. When the games tally is exactly the mirror of the series score, read them mirrored.
 */
export function orientedGames(row: BackfillMatch, games: BackfillGame[]): { games: BackfillGame[]; mirrored: boolean } {
  const homeWins = games.filter((game) => game.homeScore > game.awayScore).length;
  const awayWins = games.filter((game) => game.awayScore > game.homeScore).length;
  const asStored = homeWins === row.homeScore && awayWins === row.awayScore;
  const swapped = homeWins === row.awayScore && awayWins === row.homeScore && row.homeScore !== row.awayScore;
  if (asStored || !swapped) return { games, mirrored: false };
  return { games: games.map((game) => ({ ...game, homeScore: game.awayScore, awayScore: game.homeScore })), mirrored: true };
}

function gameProblems(row: BackfillMatch, bestOf: number, stored: BackfillGame[]): string[] {
  if (!stored.length) return [];
  const ordered = [...orientedGames(row, [...stored].sort((a, b) => a.gameNumber - b.gameNumber)).games];
  if (ordered.some((game, index) => game.gameNumber !== index + 1)) return ["stored game numbers are not 1, 2, 3 ... without gaps"];
  if (ordered.length > bestOf) return [`${ordered.length} games stored but the round is best-of ${bestOf}`];
  const homeWins = ordered.filter((game) => game.homeScore > game.awayScore).length;
  const awayWins = ordered.filter((game) => game.awayScore > game.homeScore).length;
  if (bestOf === 1) {
    const [game] = ordered;
    return ordered.length === 1 && game.homeScore === row.homeScore && game.awayScore === row.awayScore
      ? []
      : [`best-of 1 round has ${ordered.length} stored game(s) that do not equal the score ${row.homeScore}-${row.awayScore}`];
  }
  return homeWins === row.homeScore && awayWins === row.awayScore ? [] : [`stored games give ${homeWins}-${awayWins} but the series score is ${row.homeScore}-${row.awayScore}`];
}

function rowProblems(row: BackfillMatch, bestOf: number, games: BackfillGame[], name: NameOf): string[] {
  const state = [
    ...row.status !== "Completed" ? [`status is "${row.status}", expected "Completed"`] : [],
    ...row.resultVersion !== 0 ? [`already has result version ${row.resultVersion}`] : [],
    ...!row.homeTeamId || !row.awayTeamId || row.homeTeamId === row.awayTeamId ? ["home and away must be two different teams"] : [],
  ];
  if (!row.winnerTeamId) return [...state, "has no winner"];
  if (![row.homeTeamId, row.awayTeamId].includes(row.winnerTeamId)) return [...state, `winner ${name(row.winnerTeamId)} is not one of the two teams`];
  return [...state, ...scoreProblems(row, bestOf), ...gameProblems(row, bestOf, games)];
}

/** Winner, score and game consistency for every stored row, with the best-of the derived config gives it. */
export function resultProblems(graph: CompetitionGraph, rows: NodeRows, games: BackfillGame[], name: NameOf): string[] {
  return graph.matches.flatMap((node) => {
    const row = rows.get(node.id);
    if (!row) return [];
    return rowProblems(row, node.bestOf, games.filter((game) => game.matchId === row.id), name)
      .map((problem) => `${where(node)} (${row.id}): ${problem}`);
  });
}

/** Re-point graph ids at the stored match ids. Bye nodes and anything unmapped keep their generated id. */
export function rewriteGraphIds(graph: CompetitionGraph, idMap: Map<string, string>): CompetitionGraph {
  const id = (value: string) => idMap.get(value) ?? value;
  const source = (value: ParticipantSource): ParticipantSource => value.kind === "match" ? { ...value, matchId: id(value.matchId) } : value;
  return {
    ...graph,
    matches: graph.matches.map((node) => ({ ...node, id: id(node.id), home: source(node.home), away: source(node.away), advance: node.advance ? source(node.advance) : null })),
    dependencies: graph.dependencies.map((dependency) => ({ ...dependency, sourceMatchId: id(dependency.sourceMatchId), targetMatchId: id(dependency.targetMatchId) })),
    placements: graph.placements.map((placement) => ({ ...placement, source: source(placement.source) })),
  };
}
