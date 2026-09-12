import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { CompetitionGraph } from "@/lib/tournament/competition/types";
import { competitionProjection } from "@/lib/tournament/operations/result-projection";
import type { StoredSchedule } from "@/lib/tournament/operations/state";
import type { PublicOngoingEventViewModel, PublicOngoingMatch } from "./public-ongoing-types";

export function publicOngoingEnabled() {
  return isFeatureEnabled("adaptive_public_event_v3") && isFeatureEnabled("competition_operations_v3");
}

/** Public allowlist projection. Never serialize an operations workspace or raw Prisma row. */
export async function getPublicOngoingEvent(slug: string, now = new Date()): Promise<PublicOngoingEventViewModel | null> {
  if (!publicOngoingEnabled()) return null;
  return prisma.$transaction(async tx => {
    const event = await tx.event.findFirst({ where: { slug, status: "Ongoing" }, include: { stream: true } });
    if (!event) return null;
    const [phase, matches, teams, announcements, revision] = await Promise.all([
      tx.competitionPhase.findFirst({ where: { eventId: event.id, sequence: 1 } }),
      tx.match.findMany({ where: { eventId: event.id }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
      tx.team.findMany({ where: { eventId: event.id }, select: { id: true, name: true } }),
      tx.eventAnnouncement.findMany({ where: { eventId: event.id, status: "published" }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] }),
      event.publishedScheduleVersion == null ? Promise.resolve(null) : tx.scheduleRevision.findFirst({ where: { eventId: event.id, version: event.publishedScheduleVersion, status: "published" } }),
    ]);
    const graph = (phase?.configuration as unknown as { graph?: CompetitionGraph } | null)?.graph;
    if (!graph || graph.eventId !== event.id) return null;
    const snapshot = revision?.snapshot as unknown as StoredSchedule | undefined;
    const assignments = new Map(snapshot?.draft.assignments.map(a => [a.matchId, a]));
    const names = new Map(teams.map(t => [t.id, t.name ?? t.id]));
    const nodes = new Map(graph.matches.filter(m => m.status === "pending").map(m => [m.id, m]));
    const publicMatches: PublicOngoingMatch[] = matches.filter(m => nodes.has(m.id)).map(m => {
      const node = nodes.get(m.id)!;
      const assignment = assignments.get(m.id);
      const official = m.resultVersion > 0;
      const status: PublicOngoingMatch["status"] = official ? "completed" : m.status === "Live" || m.scheduleStatus === "live" ? "live" : m.scheduleStatus === "delayed" ? "delayed" : m.scheduleStatus === "postponed" ? "postponed" : "scheduled";
      return { id: m.id, home: names.get(m.homeTeamId) ?? null, away: names.get(m.awayTeamId) ?? null, round: node.round, roundLabel: m.roundLabel, phaseId: node.phaseId, groupId: node.groupId, bracket: node.bracket, bestOf: node.bestOf,
        status, start: assignment?.start ?? null, end: assignment?.end ?? null, room: assignment?.roomId ?? null,
        scheduledLabel: assignment ? null : m.scheduledLabel ?? null,
        homeScore: official ? m.homeScore : null, awayScore: official ? m.awayScore : null, resultVersion: m.resultVersion,
        confirmedAt: official ? m.resultConfirmedAt?.toISOString() ?? null : null };
    }).sort((a, b) => (a.start ?? "~").localeCompare(b.start ?? "~") || a.round - b.round || a.id.localeCompare(b.id));
    const activeAnnouncements = announcements.filter(a => a.publishedAt && a.publishedAt <= now && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now))
      .map(a => ({ id: a.id, title: a.title, body: a.body, urgency: a.urgency ?? "info", publishedAt: a.publishedAt!.toISOString(), endsAt: a.endsAt?.toISOString() ?? null }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
    const stream = event.stream?.enabled && /^https?:\/\//i.test(event.stream.url) ? { url: event.stream.url, label: event.stream.label, platform: event.stream.platform, isLive: event.stream.isLive } : null;
    const updatedTimes = [event.updatedAt, revision?.publishedAt, ...matches.map(m => m.updatedAt), ...announcements.map(a => a.updatedAt)].filter((d): d is Date => d instanceof Date);
    const publicState = {
      mode: "ongoing" as const,
      event: { id: event.id, slug: event.slug, name: event.name, description: event.description ?? "", timezone: event.timezone, format: graph.config.kind },
      matches: publicMatches, liveMatches: publicMatches.filter(m => m.status === "live"),
      nextMatches: publicMatches.filter(m => m.status !== "live" && m.status !== "completed"),
      recentResults: publicMatches.filter(m => m.resultVersion > 0).sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? "") || a.id.localeCompare(b.id)).slice(0, 12),
      schedule: revision ? { version: revision.version, publishedAt: revision.publishedAt?.toISOString() ?? null, changes: (snapshot?.draft.impact ?? []).filter(i => i.before && i.after && (i.before.start !== i.after.start || i.before.roomId !== i.after.roomId)).map(i => ({ matchId: i.matchId, before: i.before ? { start: i.before.start, room: i.before.roomId } : null, after: i.after ? { start: i.after.start, room: i.after.roomId } : null })) } : null,
      standings: competitionProjection(graph, matches).standings.map(table => { const group = graph.groups.find(g => g.id === table.groupId); return { ...table, label: group?.label ?? "", qualificationCutline: group?.qualificationCutline ?? null, rows: table.rows.map(row => ({ ...row, name: names.get(row.teamId) ?? row.teamId })) }; }),
      announcements: activeAnnouncements, stream, leaderboardHref: `/events/${encodeURIComponent(event.slug)}/leaderboards`,
      lastUpdatedAt: new Date(Math.max(0, ...updatedTimes.map(d => d.getTime()))).toISOString(),
    };
    return { ...publicState, stateVersion: createHash("sha256").update(JSON.stringify(publicState)).digest("hex").slice(0, 24) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
