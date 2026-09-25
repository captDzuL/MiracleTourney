import type { Prisma } from "@prisma/client";
import { recalculateSchedule } from "../scheduling";
import type { ParsedCommand } from "./schema";
import { eventMatch, isTerminal, json, matchSnapshot, readGraph, type StoredSchedule } from "./state";
import { CompetitionExpectedError } from "./errors";

export async function applyDelay(tx: Prisma.TransactionClient, eventId: string, actorId: string, command: Extract<ParsedCommand, { kind: "delay_preview" }>, version: number, idempotencyKey: string) {
  const graph = await readGraph(tx, eventId);
  const match = await eventMatch(tx, eventId, command.matchId);
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
  const revisions = await tx.scheduleRevision.findMany({ where: { eventId } });
  const actionable = revisions.filter(r => r.status === "draft" && r.version > (event.publishedScheduleVersion ?? -1)).sort((a, b) => b.version - a.version)[0];
  const source = command.sourceRevision;
  const revision = source && revisions.find(r => r.id === source.id && r.version === source.version && r.status === source.status);
  if (!source || !revision || source.version >= version || (source.status === "draft" ? actionable?.id !== source.id : actionable || event.publishedScheduleVersion !== source.version)) throw new CompetitionExpectedError("conflict", "Schedule source revision is stale: reload the current preview");
  const stored = revision.snapshot as unknown as StoredSchedule;
  const original = stored.draft.assignments.find(a => a.matchId === match.id);
  if (!stored.input || !original || event.publishedScheduleVersion == null) throw new Error("Publish an initial schedule before reviewing a delay");
  const live = match.status === "Live" || match.scheduleStatus === "live";
  if (match.resultVersion > 0 || match.status === "Completed" || match.scheduleStatus === "completed" || !live && (match.scheduleStatus === "locked" || stored.input.lockedMatchIds?.includes(match.id))) throw new Error("Cannot move a completed or locked match");
  if (Date.parse(command.estimatedEnd) <= Date.parse(original.end)) throw new Error("The revised estimate must be later than the reviewed end");
  const matches = await tx.match.findMany({ where: { eventId } });
  const playableIds = new Set(graph.matches.filter(m => m.status === "pending").map(m => m.id));
  const playable = matches.filter(m => playableIds.has(m.id));
  if (!playableIds.has(match.id)) throw new Error("Match is not playable");
  const estimates = { ...stored.delayEstimates, [match.id]: new Date(command.estimatedEnd).toISOString() };
  const assignments = new Map(stored.draft.assignments.map(a => [a.matchId, { ...a }]));
  // Persisted live/completed start and room are authoritative. A reviewed overrun
  // changes only expected occupancy end, and becomes public only on publication.
  for (const row of playable.filter(isTerminal)) {
    if (!row.scheduledAt || !row.scheduledEndsAt || !row.scheduleRoom) throw new Error("Protected match has no published assignment");
    const end = row.status === "Live" || row.scheduleStatus === "live" ? estimates[row.id] ?? row.scheduledEndsAt.toISOString() : row.scheduledEndsAt.toISOString();
    assignments.set(row.id, { matchId: row.id, roomId: row.scheduleRoom, start: row.scheduledAt.toISOString(), end });
  }
  const revised = { ...original, ...(live ? assignments.get(match.id)! : {}), end: estimates[match.id] };
  if (live) assignments.set(match.id, revised);
  const overrides = new Map((stored.input.manualOverrides ?? []).filter(a => playableIds.has(a.matchId) && !isTerminal(playable.find(m => m.id === a.matchId)!)).map(a => [a.matchId, a]));
  if (!live) overrides.set(match.id, revised);
  const input = { ...stored.input, manualOverrides: [...overrides.values()], lockedMatchIds: [...new Set([...(stored.input.lockedMatchIds ?? []).filter(id => playableIds.has(id)), ...playable.filter(m => m.scheduleStatus === "locked").map(m => m.id)])] };
  const draft = recalculateSchedule({ ...input, graph, existingAssignments: [...assignments.values()], changedMatchIds: [match.id], matchStates: Object.fromEntries(playable.map(m => [m.id, isTerminal(m) ? m.status === "Live" || m.scheduleStatus === "live" ? "live" : "completed" : "scheduled"])) });
  if (live) {
    draft.affectedMatchIds = [...new Set([match.id, ...draft.affectedMatchIds])];
    draft.impact = [{ matchId: match.id, before: original, after: revised, delayMinutes: 0 }, ...draft.impact.filter(i => i.matchId !== match.id)];
  }
  await tx.match.update({ where: { id: match.id }, data: { scheduleStatus: "delayed" } });
  const baseMatches = matchSnapshot(matches.map(m => m.id === match.id ? { ...m, scheduleStatus: "delayed" as const } : m));
  const saved = await tx.scheduleRevision.create({ data: { eventId, version, status: "draft", snapshot: json({ draft, input, baseMatches, delayEstimates: estimates }), idempotencyKey, createdById: actorId } });
  await tx.competitionActionItem.upsert({ where: { eventId_conditionKey: { eventId, conditionKey: `delay:${match.id}` } }, create: { eventId, matchId: match.id, conditionKey: `delay:${match.id}`, priority: "urgent", title: "Review delayed match schedule", detail: command.reason, resolvedAt: null }, update: { detail: command.reason, resolvedAt: null } });
  return saved.id;
}
