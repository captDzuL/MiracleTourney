import type { Prisma } from "@prisma/client";
import type { StoredSchedule } from "./state";

/** Recover obligations from immutable review history, even if an older draft
 * omitted metadata. Explicit action resolution is the only unpublished release. */
export async function outstandingDelayEstimates(tx: Prisma.TransactionClient, eventId: string) {
  const [actions, revisions] = await Promise.all([
    tx.competitionActionItem.findMany({ where: { eventId, resolvedAt: null } }),
    tx.scheduleRevision.findMany({ where: { eventId } }),
  ]);
  const active = new Set(actions.map(a => a.conditionKey));
  const estimates: Record<string, string> = {};
  for (const revision of revisions.sort((a, b) => b.version - a.version)) {
    for (const [id, end] of Object.entries((revision.snapshot as unknown as StoredSchedule).delayEstimates ?? {})) {
      if (active.has(`delay:${id}`) && !estimates[id]) estimates[id] = end;
    }
  }
  return estimates;
}
