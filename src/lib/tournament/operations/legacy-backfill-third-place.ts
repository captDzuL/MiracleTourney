import type { CompetitionGraph, CompetitionMatch } from "../competition";
import type { BackfillTeam, ThirdPlaceSpec } from "./legacy-backfill-types";
import { resolveSource, type NameOf, type NodeRows } from "./legacy-backfill-verify";

export type ThirdPlaceResolution = {
  node: CompetitionMatch | null;
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string;
  problems: string[];
};

/** Names are compared without case, accents and extra spaces ("Evroshëim" = "evrosheim"); the match must still be unique. */
const comparableName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function teamByName(teams: BackfillTeam[], name: string, role: string): { id: string; problems: string[] } {
  const wanted = comparableName(name);
  const found = teams.filter((team) => comparableName(team.name) === wanted);
  if (found.length === 1) return { id: found[0].id, problems: [] };
  return { id: "", problems: [found.length ? `third place ${role} "${name}" matches ${found.length} teams; the name must be unique` : `third place ${role} "${name}" is not a team of this event`] };
}

/**
 * The two named teams must be exactly the two semifinal losers, as the graph defines them.
 * Home is the loser of the first semifinal and away the loser of the second.
 */
export function resolveThirdPlace(spec: ThirdPlaceSpec, teams: BackfillTeam[], graph: CompetitionGraph, rows: NodeRows, name: NameOf): ThirdPlaceResolution {
  const node = graph.matches.find((candidate) => candidate.bracket === "third_place") ?? null;
  const winner = teamByName(teams, spec.winnerTeamName, "winner");
  const loser = teamByName(teams, spec.loserTeamName, "loser");
  const base = { node, homeTeamId: "", awayTeamId: "", winnerTeamId: winner.id, problems: [...winner.problems, ...loser.problems] };
  if (!node) return { ...base, problems: [...base.problems, "the graph has no third place match (a bracket with fewer than two rounds cannot have one)"] };
  const homeTeamId = resolveSource(node.home, graph, rows);
  const awayTeamId = resolveSource(node.away, graph, rows);
  if (!homeTeamId || !awayTeamId) return { ...base, problems: [...base.problems, "the semifinal losers are not known from the stored semifinals"] };
  if (base.problems.length) return { ...base, homeTeamId, awayTeamId };
  const named = [winner.id, loser.id].sort();
  const expected = [homeTeamId, awayTeamId].sort();
  const mismatch = winner.id === loser.id || named[0] !== expected[0] || named[1] !== expected[1]
    ? [`third place teams ${name(winner.id)} and ${name(loser.id)} are not the semifinal losers ${name(homeTeamId)} and ${name(awayTeamId)}`]
    : [];
  return { ...base, homeTeamId, awayTeamId, problems: mismatch };
}
