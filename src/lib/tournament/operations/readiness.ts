import type { Match, Prisma } from "@prisma/client";
import { isTerminal } from "./state";

/** Reconcile only readiness conditions, inside the caller's event transaction. */
export async function reconcileReadinessActions(tx: Prisma.TransactionClient, eventId: string, match: Match, now: Date) {
  const readiness = await tx.matchReadiness.findMany({ where: { eventId, matchId: match.id } });
  const deadlineDue = !isTerminal(match) && match.scheduleStatus !== "postponed" && match.scheduledAt && match.scheduledAt <= now;
  const prefix = `readiness:${match.id}:`;
  const missing = new Map([...new Set([match.homeTeamId, match.awayTeamId].filter(Boolean))]
    .filter(teamId => deadlineDue && !readiness.some(r => r.teamId === teamId && r.status === "ready"))
    .map(teamId => [`${prefix}${teamId}`, teamId]));
  const actions = await tx.competitionActionItem.findMany({ where: { eventId, matchId: match.id, resolvedAt: null } });
  for (const action of actions) if (action.conditionKey.startsWith(prefix) && !missing.has(action.conditionKey)) {
    await tx.competitionActionItem.update({ where: { id: action.id }, data: { resolvedAt: now } });
  }
  for (const [conditionKey, teamId] of missing) {
    await tx.competitionActionItem.upsert({ where: { eventId_conditionKey: { eventId, conditionKey } },
      create: { eventId, matchId: match.id, teamId, conditionKey, priority: "critical", title: "Team readiness deadline missed", detail: "Organizer review required", resolvedAt: null },
      update: { priority: "critical", resolvedAt: null },
    });
  }
}
