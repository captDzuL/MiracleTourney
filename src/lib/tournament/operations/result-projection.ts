import type { Match } from "@prisma/client";
import type { CompetitionGraph, ParticipantSource, StandingsRules } from "../competition/types";

export type Standing = { teamId: string; played: number; wins: number; draws: number; losses: number; points: number; scoreFor: number; scoreAgainst: number; scoreDifference: number; rank: number; tied: boolean };
export type StandingsTable = { groupId: string | null; phaseId: string; complete: boolean; rows: Standing[] };

function rankTeams(teamIds: string[], results: Match[], rules: StandingsRules): Standing[] {
  const rows = teamIds.map(teamId => ({ teamId, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, rank: 0, tied: false }));
  for (const m of results) for (const home of [true, false]) {
    const row = rows.find(r => r.teamId === (home ? m.homeTeamId : m.awayTeamId))!;
    const own = home ? m.homeScore : m.awayScore, other = home ? m.awayScore : m.homeScore;
    row.played++; row.scoreFor += own; row.scoreAgainst += other; row.scoreDifference += own - other;
    if (own > other) { row.wins++; row.points += rules.points.win; }
    else if (own < other) { row.losses++; row.points += rules.points.loss; }
    else { row.draws++; row.points += rules.points.draw; }
  }
  // Refine tied buckets in configured order. Head-to-head uses a mini-table
  // across the whole tied bucket; IDs only stabilize display, never qualify ties.
  const split = (bucket: Standing[], metric: (row: Standing) => number) => {
    const sorted = [...bucket].sort((a, b) => metric(b) - metric(a) || a.teamId.localeCompare(b.teamId));
    const groups: Standing[][] = [];
    for (const row of sorted) {
      if (!groups.length || metric(groups.at(-1)![0]) !== metric(row)) groups.push([]);
      groups.at(-1)!.push(row);
    }
    return groups;
  };
  let buckets = split(rows, r => r.points);
  for (const rule of rules.tiebreakers) {
    if (rule === "tiebreak_match") break;
    buckets = buckets.flatMap(bucket => {
      const ids = new Set(bucket.map(r => r.teamId));
      const metric = (row: Standing) => {
        if (rule === "score_difference") return row.scoreDifference;
        if (rule === "score_for") return row.scoreFor;
        if (rule === "wins") return row.wins;
        return results.filter(m => ids.has(m.homeTeamId) && ids.has(m.awayTeamId)).reduce((sum, m) => {
          if (![m.homeTeamId, m.awayTeamId].includes(row.teamId)) return sum;
          if (m.homeScore === m.awayScore) return sum + rules.points.draw;
          return sum + (m.winnerTeamId === row.teamId ? rules.points.win : rules.points.loss);
        }, 0);
      };
      return split(bucket, metric);
    });
  }
  let rank = 1;
  return buckets.flatMap(bucket => { const result = bucket.map(row => ({ ...row, rank, tied: bucket.length > 1 })); rank += bucket.length; return result; });
}

export function competitionProjection(graph: CompetitionGraph, matches: Match[]) {
  const standings: StandingsTable[] = [];
  for (const phase of graph.phases.filter(p => p.standingsRules)) {
    const groups = graph.groups.filter(g => g.phaseId === phase.id);
    for (const groupId of groups.length ? groups.map(g => g.id) : [null]) {
      const fixtures = graph.matches.filter(m => m.phaseId === phase.id && m.groupId === groupId);
      const ids = new Set(fixtures.map(m => m.id));
      const results = matches.filter(m => ids.has(m.id) && m.resultVersion > 0);
      const teams = groupId ? graph.groups.find(g => g.id === groupId)!.teams.map(t => t.id) : [...new Set(fixtures.flatMap(m => [m.home, m.away].flatMap(s => s.kind === "team" ? [s.teamId] : [])))];
      standings.push({ phaseId: phase.id, groupId, complete: results.length === fixtures.length, rows: rankTeams(teams, results, phase.standingsRules!) });
    }
  }
  const resolve = (source: ParticipantSource): string => {
    if (source.kind === "team") return source.teamId;
    if (source.kind === "bye") return "";
    if (source.kind === "group_rank") {
      const table = standings.find(t => t.groupId === source.groupId);
      const row = table?.rows.find(r => r.rank === source.rank);
      return table?.complete && row && !row.tied ? row.teamId : "";
    }
    const match = matches.find(m => m.id === source.matchId);
    if (!match || !match.resultVersion || !match.winnerTeamId) return "";
    return source.outcome === "winner" ? match.winnerTeamId : match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  };
  return { standings, resolve, placements: graph.placements.map(p => ({ rank: p.rank, teamId: resolve(p.source) || null })) };
}

export function dependentMatchIds(graph: CompetitionGraph, matchId: string): string[] {
  const visited = new Set<string>([matchId]);
  const visit = (id: string) => {
    const groupId = graph.matches.find(m => m.id === id)?.groupId;
    const targets = [...graph.dependencies.filter(d => d.sourceMatchId === id).map(d => d.targetMatchId), ...graph.qualificationDependencies.filter(d => groupId && d.groupId === groupId).map(d => d.targetMatchId)];
    for (const target of targets) if (!visited.has(target)) { visited.add(target); visit(target); }
  };
  visit(matchId); visited.delete(matchId); return [...visited].sort();
}
