import { buildCompletionSource, type CompletionSourceRows } from "@/lib/completion/prisma-adapter";
import { evaluateCompletionReadiness } from "@/lib/completion/readiness";
import type { BackfillPrediction, LegacyBackfillInput, LegacyBackfillPlan } from "./legacy-backfill-types";

type Award = keyof BackfillPrediction["awardStatisticCounts"];

/** What the completion workspace will read once the plan is written: the same rows, kept in memory. */
export function completionRowsFromPlan(plan: LegacyBackfillPlan, input: LegacyBackfillInput): CompletionSourceRows {
  const official = { resultVersion: 1, status: "Completed", scheduleStatus: "completed" };
  const legacy = input.matches.map((match) => ({
    id: match.id, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
    homeScore: match.homeScore, awayScore: match.awayScore, winnerTeamId: match.winnerTeamId, ...official,
  }));
  const created = plan.createdMatches.map((match) => ({
    id: match.id, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
    homeScore: match.homeScore, awayScore: match.awayScore, winnerTeamId: match.winnerTeamId, ...official,
  }));
  return {
    event: { id: plan.eventId, formatConfig: plan.formatConfig, gameId: input.event.gameId, gameModeId: input.event.gameModeId },
    graph: plan.graph,
    matches: [...legacy, ...created],
    revisions: plan.revisions.map((revision) => ({
      id: `revision:${revision.matchId}:${revision.version}`, matchId: revision.matchId, version: revision.version,
      homeScore: revision.homeScore, awayScore: revision.awayScore, winnerTeamId: revision.winnerTeamId,
    })),
    incidents: [],
    teams: input.teams.map(({ id, name }) => ({ id, name })),
    playerStats: input.playerStats ?? [],
    approvedSubmissions: input.approvedSubmissions ?? [],
  };
}

/** Run the real completion reader over rows: podium, blockers and validated award statistics per award. */
export function predictFromRows(rows: CompletionSourceRows): BackfillPrediction {
  const source = buildCompletionSource(rows);
  const counts = (award: Award) => source.statistics.filter((row) => row.award === award && row.validated).length;
  const final = source.facts.matches.find((fact) => fact.stage === "final");
  return {
    readiness: evaluateCompletionReadiness(source.facts),
    final: final ? { matchId: final.id, official: final.official, winnerTeamId: final.winnerTeamId, loserTeamId: final.loserTeamId } : null,
    awardStatisticCounts: { mvp: counts("mvp"), top_scorer: counts("top_scorer"), top_defender: counts("top_defender"), top_assist: counts("top_assist") },
  };
}
