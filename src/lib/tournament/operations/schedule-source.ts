import type { Match, Prisma } from "@prisma/client";
import type { ScheduleAssignment } from "../scheduling";
import type { ParsedCommand } from "./schema";
import { isTerminal, type StoredSchedule } from "./state";

/** Called inside the authorized event CAS transaction; revision snapshots are immutable. */
export async function scheduleBaseline(tx: Prisma.TransactionClient, eventId: string, version: number, input: Extract<ParsedCommand, { kind: "schedule_save" }>["input"], matches: Match[]): Promise<ScheduleAssignment[]> {
  const baseline = new Map(matches.flatMap(m => m.scheduledAt && m.scheduledEndsAt && m.scheduleRoom
    ? [[m.id, { matchId: m.id, roomId: m.scheduleRoom, start: m.scheduledAt.toISOString(), end: m.scheduledEndsAt.toISOString() }] as const] : []));
  const source = input.sourceRevision;
  if (!source) {
    if (input.lockedMatchIds?.length) throw new Error("Schedule source revision is required for assignment locks");
    return [...baseline.values()];
  }
  const [event, revision, drafts] = await Promise.all([
    tx.event.findUnique({ where: { id: eventId } }),
    tx.scheduleRevision.findFirst({ where: { eventId, id: source.id, version: source.version, status: source.status } }),
    tx.scheduleRevision.findMany({ where: { eventId, status: "draft" }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true } }),
  ]);
  const latestDraft = drafts.filter(d => d.version > (event?.publishedScheduleVersion ?? -1)).sort((a, b) => b.version - a.version)[0];
  if (!revision || source.version >= version || (source.status === "draft"
    ? latestDraft?.id !== source.id
    : event?.publishedScheduleVersion !== source.version || !!latestDraft)) {
    throw new Error("Schedule source revision is stale: reload the current preview");
  }
  const reviewed = (revision.snapshot as unknown as StoredSchedule).draft.assignments;
  for (const matchId of input.lockedMatchIds ?? []) {
    const match = matches.find(m => m.id === matchId);
    const assignment = reviewed.find(a => a.matchId === matchId);
    if (!match || !assignment) throw new Error("Schedule source revision does not contain the locked match assignment");
    // A reviewed preview must never replace a persisted operational protection.
    if (!isTerminal(match) && match.scheduleStatus !== "locked") baseline.set(matchId, assignment);
  }
  return [...baseline.values()];
}
