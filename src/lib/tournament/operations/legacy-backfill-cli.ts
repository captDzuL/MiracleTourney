import type { CompletionBlocker } from "@/lib/completion/readiness";
import type { LegacyBackfillPlan, LegacyBackfillResult, BackfillTeam } from "./legacy-backfill-types";

export type BackfillArgs = { refs: string[]; apply: boolean; actorUser: string | null; jsonPath: string | null; errors: string[] };

/** `--apply` is the only way to write. Anything unknown is an error so a typo can never turn a dry run into something else. */
export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const refs: string[] = [];
  const errors: string[] = [];
  let apply = false;
  let actorUser: string | null = null;
  let jsonPath: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--actor-user" || arg === "--json") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) errors.push(`${arg} needs a value`);
      else {
        if (arg === "--json") jsonPath = next;
        else actorUser = next;
        index += 1;
      }
    } else if (arg.startsWith("--")) errors.push(`unknown option ${arg}`);
    else refs.push(arg);
  }
  return { refs, apply, actorUser, jsonPath, errors };
}

function blockerText(blocker: CompletionBlocker, name: (id: string) => string): string {
  switch (blocker.code) {
    case "UNOFFICIAL_REQUIRED_RESULT": return `UNOFFICIAL_REQUIRED_RESULT ${blocker.stage} ${blocker.matchId}`;
    case "ACTIVE_DISPUTE": return `ACTIVE_DISPUTE ${blocker.disputeId}`;
    case "UNRESOLVED_FINAL_TIE": return `UNRESOLVED_FINAL_TIE ${blocker.teamIds.map(name).join(", ")}`;
    case "MISSING_VALIDATED_AWARD_STATISTICS": return `MISSING_VALIDATED_AWARD_STATISTICS ${blocker.award}`;
    case "INSUFFICIENT_PODIUM_STRUCTURE": return `INSUFFICIENT_PODIUM_STRUCTURE${blocker.missingStages?.length ? ` missing ${blocker.missingStages.join(", ")}` : ""}`;
  }
}

export function summarizePlan(plan: LegacyBackfillPlan) {
  return {
    formatConfig: plan.formatConfig,
    seeds: plan.seeds.length,
    graphNodes: plan.graph.matches.length,
    byeNodes: plan.graph.matches.filter((node) => node.status === "bye").length,
    matchesUpdated: plan.matchUpdates.length,
    matchesCreated: plan.createdMatches.map((match) => ({ id: match.id, round: match.round, slot: match.slot, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, winnerTeamId: match.winnerTeamId, score: `${match.homeScore}-${match.awayScore}` })),
    dependencies: plan.dependencies.length,
    revisions: plan.revisions.length,
    warnings: plan.warnings,
    notes: plan.notes,
  };
}

/** Human readable lines for one event. Team names are looked up so a person can check the champion by eye. */
export function describeBackfillResult(result: LegacyBackfillResult, teams: BackfillTeam[]): string[] {
  if (!result.ok) return [`  PROBLEMS (${result.problems.length}) - nothing can be written:`, ...result.problems.map((problem) => `    - ${problem}`)];
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? id : "(none)");
  const { plan, prediction } = result;
  const summary = summarizePlan(plan);
  const podium = prediction.readiness.podium;
  const counts = prediction.awardStatisticCounts;
  return [
    `  PLAN OK: ${summary.matchesUpdated} matches get V3 fields and a result revision, ${summary.matchesCreated.length} match created, ${summary.dependencies} dependencies, ${summary.byeNodes} bye nodes (no row)`,
    `  format config: ${JSON.stringify(summary.formatConfig)}`,
    ...summary.matchesCreated.map((match) => `  created ${match.id} (round ${match.round}): ${name(match.homeTeamId)} ${match.score} ${name(match.awayTeamId)} -> winner ${name(match.winnerTeamId)} (score is a marker only)`),
    `  final: ${name(prediction.final?.winnerTeamId)} beat ${name(prediction.final?.loserTeamId)} (official: ${prediction.final?.official ? "yes" : "NO"})`,
    `  podium: ${podium ? `1 ${name(podium.championTeamId)} / 2 ${name(podium.runnerUpTeamId)} / 3 ${name(podium.thirdPlaceTeamId)}` : "not available yet"}`,
    `  readiness: ${prediction.readiness.ready ? "READY" : "not ready"}; blockers: ${prediction.readiness.blockers.map((blocker) => blockerText(blocker, name)).join("; ") || "none"}`,
    `  validated award statistics (players): mvp ${counts.mvp}, top_scorer ${counts.top_scorer}, top_defender ${counts.top_defender}, top_assist ${counts.top_assist}`,
    ...summary.warnings.map((warning) => `  WARNING: ${warning}`),
    ...summary.notes.map((note) => `  note: ${note}`),
  ];
}
