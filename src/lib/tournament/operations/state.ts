import type { Match, Prisma } from "@prisma/client";
import type { CompetitionGraph } from "../competition";
import type { ScheduleDraft, ScheduleInput } from "../scheduling";

export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export function isTerminal(match: Match) { return ["Live", "Completed"].includes(match.status) || ["live", "completed"].includes(match.scheduleStatus) || match.resultVersion > 0; }
export function matchSnapshot(matches: Match[]) {
  return matches.map(m => ({ id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, status: m.status,
    scheduleStatus: m.scheduleStatus, resultVersion: m.resultVersion,
    start: m.scheduledAt?.toISOString() ?? null, end: m.scheduledEndsAt?.toISOString() ?? null, room: m.scheduleRoom ?? null,
  })).sort((a, b) => a.id.localeCompare(b.id));
}
export type StoredSchedule = { draft: ScheduleDraft; baseMatches: ReturnType<typeof matchSnapshot>; input?: Omit<ScheduleInput, "graph"> };
export async function eventMatch(tx: Prisma.TransactionClient, eventId: string, matchId: string) {
  const match = await tx.match.findFirst({ where: { eventId, id: matchId } });
  if (!match) throw new Error("Match not found");
  return match;
}
export async function readGraph(tx: Prisma.TransactionClient, eventId: string) {
  const phase = await tx.competitionPhase.findFirst({ where: { eventId, sequence: 1 } });
  const configuration = phase?.configuration as unknown as { graph?: CompetitionGraph } | null;
  if (!configuration?.graph || configuration.graph.eventId !== eventId) throw new Error("Competition not initialized");
  return configuration.graph;
}
