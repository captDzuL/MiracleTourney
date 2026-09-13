import { Prisma } from "@prisma/client";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/platform/db";
import type { CompetitionGraph } from "@/lib/tournament/competition";
import { tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";
import { competitionProjection } from "@/lib/tournament/operations/result-projection";
import type { StoredSchedule } from "@/lib/tournament/operations/state";
import type { CompetitionWorkspaceState } from "./workspace-types";
import { diagnoseLegacyCompetition } from "@/lib/tournament/operations/legacy-compatibility";

export async function readCompetitionWorkspace(eventId: string): Promise<CompetitionWorkspaceState> {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  if (!isFeatureEnabled("competition_operations_v3") || !isFeatureEnabled("organizer_workspace_v3")) throw new Error("Competition operations are unavailable");
  const authorized = <T>(read: (tx: Prisma.TransactionClient, event: NonNullable<Awaited<ReturnType<typeof prisma.event.findUnique>>>) => Promise<T>) => prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || user.role === "organizer" && event.organizerUserId !== user.id) throw new Error("Not authorized");
    return read(tx, event);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const core = await authorized(async (tx, event) => {
    const [matches, phases, teams, readiness, actions, revisions, published, roundConfigs, matchGames, resultRevisionCount] = await Promise.all([
      tx.match.findMany({ where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }] }),
      tx.competitionPhase.findMany({ where: { eventId }, orderBy: { sequence: "asc" } }),
      tx.team.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      tx.matchReadiness.findMany({ where: { eventId } }),
      tx.competitionActionItem.findMany({ where: { eventId, resolvedAt: null }, orderBy: { createdAt: "asc" } }),
      tx.scheduleRevision.findMany({ where: { eventId, status: "draft", version: { gt: event.publishedScheduleVersion ?? -1 } }, orderBy: { version: "desc" }, take: 1 }),
      event.publishedScheduleVersion == null ? Promise.resolve(null) : tx.scheduleRevision.findFirst({ where: { eventId, version: event.publishedScheduleVersion, status: "published" } }),
      tx.eventRoundConfig.findMany({ where: { eventId }, select: { eventId: true, roundLabel: true, bestOf: true } }),
      tx.matchGame.findMany({ where: { match: { eventId } }, select: { matchId: true } }),
      tx.matchResultRevision.count({ where: { eventId } }),
    ]);
    const graph = (phases.find(p => p.sequence === 1)?.configuration as unknown as { graph?: CompetitionGraph } | null)?.graph ?? null;
    if (graph && graph.eventId !== eventId) throw new Error("Invalid competition state");
    const config = tournamentFormatConfigSchema.safeParse(event.formatConfig);
    const legacy = !graph && (matches.length > 0 || roundConfigs.length > 0 || matchGames.length > 0 || resultRevisionCount > 0 || !config.success) ? diagnoseLegacyCompetition(event, teams.map((t, i) => ({ id: t.id, seed: i + 1 })), matches, { roundConfigs, matchGames, resultRevisionCount }) : null;
    const revision = revisions.sort((a, b) => b.version - a.version)[0];
    const priority: Record<(typeof actions)[number]["priority"], number> = { critical: 0, urgent: 1, attention_soon: 2 };
    const orderedActions = actions.sort((a, b) => priority[a.priority] - priority[b.priority]
      || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
      || a.id.localeCompare(b.id));
    return {
      compatibility: legacy ? { status: legacy.status, reason: legacy.reason } : null,
      event: { id: event.id, name: event.name ?? "", version: event.competitionVersion, timezone: event.timezone ?? "Asia/Jakarta", startsAt: event.eventStartsAt?.toISOString() ?? null, publishedScheduleVersion: event.publishedScheduleVersion, config: config.success ? config.data : null },
      graph, teams: teams.map(t => ({ id: t.id, name: t.name ?? t.id })),
      matches: matches.map(m => ({ id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0, status: m.status, scheduleStatus: m.scheduleStatus, resultVersion: m.resultVersion, bestOf: graph?.matches.find(n => n.id === m.id)?.bestOf ?? 1, roundLabel: m.roundLabel, phaseId: m.phaseId ?? null, groupId: m.groupId ?? null, start: m.scheduledAt?.toISOString() ?? null, end: m.scheduledEndsAt?.toISOString() ?? null, room: m.scheduleRoom ?? null, games: (m.resultSnapshot as unknown as { games?: CompetitionWorkspaceState["matches"][number]["games"] } | null)?.games ?? [] })),
      standings: graph ? competitionProjection(graph, matches).standings : [],
      readiness: readiness.map(r => ({ matchId: r.matchId, teamId: r.teamId, status: r.status, note: r.note ?? null })),
      actions: orderedActions.map(a => ({ id: a.id, matchId: a.matchId ?? null, priority: a.priority, title: a.title, detail: a.detail ?? null })),
      schedule: revision ? { id: revision.id, version: revision.version, ...revision.snapshot as unknown as StoredSchedule } : null,
      publishedSchedule: published ? { id: published.id, version: published.version, ...published.snapshot as unknown as StoredSchedule } : null,
    };
  });
  // Auxiliary transactions recheck ownership and isolate partial failures.
  const [incidents, announcements, audit] = await Promise.allSettled([
    authorized(async tx => (await tx.competitionIncident.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take: 100 })).map(i => ({ id: i.id, matchId: i.matchId ?? null, kind: i.kind, description: i.description, resolvedAt: i.resolvedAt?.toISOString() ?? null }))),
    authorized(async tx => (await tx.eventAnnouncement.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take: 100 })).map(a => ({ id: a.id, title: a.title, body: a.body, status: a.status, urgency: a.urgency ?? "info" }))),
    authorized(async tx => (await tx.competitionAuditLog.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take: 100 })).map(a => ({ id: a.id, matchId: a.matchId ?? null, action: a.action, reason: a.reason ?? null, actor: a.actorUserId ?? null, at: a.createdAt?.toISOString() ?? null }))),
  ]);
  for (const result of [incidents, announcements, audit]) if (result.status === "rejected" && result.reason instanceof Error && result.reason.message === "Not authorized") throw result.reason;
  return { ...core, incidents: incidents.status === "fulfilled" ? incidents.value : [], announcements: announcements.status === "fulfilled" ? announcements.value : [], audit: audit.status === "fulfilled" ? audit.value : [], unavailableSections: [incidents.status === "rejected" ? "incidents" : "", announcements.status === "rejected" ? "announcements" : "", audit.status === "rejected" ? "audit" : ""].filter(Boolean) };
}
