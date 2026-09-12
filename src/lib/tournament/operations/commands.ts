import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { generateCompetitionGraph } from "../competition";
import { getLegacyTournamentFormat } from "../formats/types";
import { planSchedule } from "../scheduling";
import type { ParsedCommand } from "./schema";
import { json, isTerminal, matchSnapshot, eventMatch, readGraph, type StoredSchedule } from "./state";
import { applyResult } from "./results";

function requireReason(value: string | undefined) { if (!value?.trim()) throw new Error("An override or resolution reason is required"); }

/** Internal: must run only after authorization and event CAS in execute(). */
export async function applyCommand(tx: Prisma.TransactionClient, eventId: string, actorId: string, command: ParsedCommand, version: number, idempotencyKey: string, now: Date): Promise<string | undefined> {
  switch (command.kind) {
    case "result_submit":
    case "result_correct":
      return applyResult(tx, eventId, actorId, command, version, idempotencyKey, now);
    case "initialize": {
      if (await tx.matchResultRevision.count({ where: { eventId } }) || await tx.match.count({ where: { eventId, resultVersion: { gt: 0 } } })) throw new Error("Competition has official results");
      if (await tx.match.count({ where: { eventId } }) || await tx.competitionPhase.count({ where: { eventId } })) throw new Error("Competition already initialized");
      const teams = await tx.team.findMany({ where: { eventId, id: { in: command.teams.map(t => t.id) } } });
      if (teams.length !== command.teams.length) throw new Error("Teams must belong to the event");
      const graph = generateCompetitionGraph({ eventId, ...command });
      for (const phase of graph.phases) await tx.competitionPhase.create({ data: {
        id: phase.id, eventId, label: phase.kind, sequence: phase.sequence, status: "draft",
        configuration: json({ ...phase, ...(phase.sequence === 1 ? { graph } : {}) }),
      } });
      for (const group of graph.groups) {
        await tx.competitionGroup.create({ data: { id: group.id, eventId, phaseId: group.phaseId, label: group.label, sequence: group.sequence } });
        for (const team of group.teams) await tx.competitionGroupMember.create({ data: { eventId, groupId: group.id, teamId: team.id, seed: team.seed } });
      }
      // Legacy round/slot uniqueness is event-wide. Keep the structural round
      // in metadata and assign separate ordinals per phase/bracket round.
      const rounds = new Map<string, number>();
      for (const [index, match] of graph.matches.entries()) {
        const key = `${match.phaseId}:${match.bracket}:${match.round}:${match.leg}`;
        if (!rounds.has(key)) rounds.set(key, rounds.size + 1);
        await tx.match.create({ data: {
          id: match.id, eventId, phaseId: match.phaseId, groupId: match.groupId,
          roundLabel: `${match.bracket} ${match.round}`, round: rounds.get(key), slot: index + 1,
          homeTeamId: match.home.kind === "team" ? match.home.teamId : "",
          awayTeamId: match.away.kind === "team" ? match.away.teamId : "",
          status: match.status === "pending" ? "Scheduled" : "Bye", scheduleStatus: "estimated", resultVersion: 0,
          scheduleMetadata: json({ graphMatch: match }),
        } });
      }
      for (const dependency of graph.dependencies) await tx.matchDependency.create({ data: { ...dependency, eventId } });
      await tx.event.update({ where: { id: eventId }, data: { formatConfig: json(graph.config), format: getLegacyTournamentFormat(graph.config) } });
      return graph.phases[0].id;
    }
    case "schedule_save": {
      if (command.input.manualOverrides?.length) requireReason(command.reason);
      const graph = await readGraph(tx, eventId);
      const matches = await tx.match.findMany({ where: { eventId } });
      const playable = matches.filter(m => graph.matches.some(g => g.id === m.id && g.status === "pending"));
      const draft = planSchedule({
        ...command.input, graph,
        existingAssignments: playable.flatMap(m => m.scheduledAt && m.scheduledEndsAt && m.scheduleRoom ? [{ matchId: m.id, roomId: m.scheduleRoom, start: m.scheduledAt.toISOString(), end: m.scheduledEndsAt.toISOString() }] : []),
        lockedMatchIds: [...new Set([...command.input.lockedMatchIds ?? [], ...playable.filter(m => m.scheduleStatus === "locked").map(m => m.id)])],
        matchStates: Object.fromEntries(playable.map(m => [m.id, isTerminal(m) ? (m.scheduleStatus === "live" || m.status === "Live" ? "live" : "completed") : "scheduled"])),
      });
      const revision = await tx.scheduleRevision.create({ data: { eventId, version, status: "draft", snapshot: json({ draft, input: command.input, baseMatches: matchSnapshot(matches) }), idempotencyKey, createdById: actorId } });
      return revision.id;
    }
    case "schedule_publish": {
      const revision = await tx.scheduleRevision.findFirst({ where: { id: command.revisionId, eventId, status: "draft" } });
      if (!revision) throw new Error("Schedule draft not found");
      const { draft, baseMatches } = revision.snapshot as unknown as StoredSchedule;
      if (!draft.feasible || draft.conflicts.length) throw new Error("Schedule has unresolved conflicts");
      const matches = await tx.match.findMany({ where: { eventId } });
      if (!isDeepStrictEqual(baseMatches, matchSnapshot(matches))) throw new Error("Schedule review is stale: save a new draft");
      for (const assignment of draft.assignments) {
        const match = matches.find(m => m.id === assignment.matchId);
        if (!match) throw new Error("Match not found");
        await tx.match.update({ where: { id: match.id }, data: {
          scheduledAt: new Date(assignment.start), scheduledEndsAt: new Date(assignment.end), scheduleRoom: assignment.roomId,
          scheduleVersion: revision.version,
          scheduleStatus: isTerminal(match) || match.scheduleStatus === "locked" ? match.scheduleStatus : "confirmed",
        } });
      }
      await tx.scheduleRevision.update({ where: { id: revision.id }, data: { status: "published", publishedAt: now, publishedById: actorId } });
      await tx.event.update({ where: { id: eventId }, data: { publishedScheduleVersion: revision.version } });
      return revision.id;
    }
    case "match_timing": {
      requireReason(command.reason);
      const match = await eventMatch(tx, eventId, command.matchId);
      if (isTerminal(match)) throw new Error("Cannot move a live or completed match");
      await tx.match.update({ where: { id: match.id }, data: { scheduleStatus: command.status } });
      return match.id;
    }
    case "readiness_update": {
      const match = await eventMatch(tx, eventId, command.matchId);
      if (isTerminal(match)) throw new Error("Cannot change readiness for a live or completed match");
      if (![match.homeTeamId, match.awayTeamId].includes(command.teamId)) throw new Error("Team is not a match participant");
      const prior = await tx.matchReadiness.findUnique({ where: { matchId_teamId: { matchId: match.id, teamId: command.teamId } } });
      const data = { status: command.status, actor: "organizer" as const, actorUserId: actorId, note: command.note ?? null,
        checkedInAt: command.status === "checked_in" || command.status === "ready" ? prior?.checkedInAt ?? now : prior?.checkedInAt ?? null,
        readyAt: command.status === "ready" ? prior?.readyAt ?? now : null };
      const readiness = await tx.matchReadiness.upsert({ where: { matchId_teamId: { matchId: match.id, teamId: command.teamId } },
        create: { eventId, matchId: match.id, teamId: command.teamId, ...data }, update: data });
      if (command.status === "ready") await tx.competitionActionItem.updateMany({ where: { eventId, conditionKey: `readiness:${match.id}:${command.teamId}`, resolvedAt: null }, data: { resolvedAt: now } });
      return readiness.id;
    }
    case "readiness_deadline": {
      const match = await eventMatch(tx, eventId, command.matchId);
      // Published match start is the v1 readiness deadline. This command never
      // changes match/result state and never awards a walkover.
      if (isTerminal(match) || match.scheduleStatus === "postponed" || !match.scheduledAt || match.scheduledAt > now) return match.id;
      const readiness = await tx.matchReadiness.findMany({ where: { eventId, matchId: match.id } });
      for (const teamId of new Set([match.homeTeamId, match.awayTeamId].filter(Boolean))) {
        if (readiness.some(r => r.teamId === teamId && r.status === "ready")) continue;
        const conditionKey = `readiness:${match.id}:${teamId}`;
        await tx.competitionActionItem.upsert({ where: { eventId_conditionKey: { eventId, conditionKey } },
          create: { eventId, matchId: match.id, teamId, conditionKey, priority: "critical", title: "Team readiness deadline missed", detail: "Organizer review required", resolvedAt: null },
          update: { priority: "critical", resolvedAt: null },
        });
      }
      return match.id;
    }
    case "match_start": {
      const match = await eventMatch(tx, eventId, command.matchId);
      if (isTerminal(match)) throw new Error("Match is already live or completed");
      if (!match.homeTeamId || !match.awayTeamId || match.homeTeamId === match.awayTeamId || match.status === "Bye") throw new Error("Match participants are unresolved");
      const event = await tx.event.findUnique({ where: { id: eventId } });
      const revision = event?.publishedScheduleVersion == null ? null : await tx.scheduleRevision.findFirst({
        where: { eventId, version: event.publishedScheduleVersion, status: "published" },
      });
      const schedule = revision?.snapshot as unknown as StoredSchedule | undefined;
      const assignment = schedule?.draft?.assignments.find(a => a.matchId === match.id);
      // A readiness override cannot create a live match without the immutable
      // assignment future schedule recalculations need to preserve.
      if (!revision || !assignment || match.scheduleVersion !== revision.version ||
          !match.scheduleRoom?.trim() || !match.scheduledAt || !match.scheduledEndsAt ||
          !(match.scheduledEndsAt.getTime() > match.scheduledAt.getTime()) ||
          assignment.roomId !== match.scheduleRoom ||
          Date.parse(assignment.start) !== match.scheduledAt.getTime() ||
          Date.parse(assignment.end) !== match.scheduledEndsAt.getTime()) {
        throw new Error("Match requires a complete published schedule assignment from the selected revision");
      }
      const readiness = await tx.matchReadiness.findMany({ where: { eventId, matchId: match.id } });
      if (![match.homeTeamId, match.awayTeamId].every(teamId => readiness.some(r => r.teamId === teamId && r.status === "ready"))) {
        if (!command.reason) throw new Error("Both participants must be ready or supply an override reason");
        requireReason(command.reason);
      }
      await tx.match.update({ where: { id: match.id }, data: { status: "Live", scheduleStatus: "live" } });
      await tx.competitionActionItem.updateMany({ where: { eventId, matchId: match.id, conditionKey: { in: [match.homeTeamId, match.awayTeamId].map(teamId => `readiness:${match.id}:${teamId}`) }, resolvedAt: null }, data: { resolvedAt: now } });
      return match.id;
    }
    case "incident_report": {
      if (command.matchId) await eventMatch(tx, eventId, command.matchId);
      const incident = await tx.competitionIncident.create({ data: { eventId, matchId: command.matchId, reportedById: actorId, kind: command.incidentKind, description: command.description, resolvedAt: null } });
      return incident.id;
    }
    case "incident_resolve": {
      requireReason(command.reason);
      const incident = await tx.competitionIncident.findFirst({ where: { eventId, id: command.incidentId } });
      if (!incident) throw new Error("Incident not found");
      await tx.competitionIncident.update({ where: { id: incident.id }, data: { resolvedAt: now } });
      return incident.id;
    }
    case "action_resolve": {
      requireReason(command.reason);
      const action = await tx.competitionActionItem.findFirst({ where: { eventId, id: command.actionId } });
      if (!action) throw new Error("Action not found");
      await tx.competitionActionItem.update({ where: { id: action.id }, data: { resolvedAt: now } });
      return action.id;
    }
    case "announcement_save": {
      if (command.startsAt && command.endsAt && Date.parse(command.startsAt) >= Date.parse(command.endsAt)) throw new Error("Announcement end must follow start");
      const announcement = await tx.eventAnnouncement.create({ data: { eventId, title: command.title, body: command.body, status: "draft", createdById: actorId, startsAt: command.startsAt ? new Date(command.startsAt) : null, endsAt: command.endsAt ? new Date(command.endsAt) : null } });
      return announcement.id;
    }
    case "announcement_publish":
    case "announcement_unpublish": {
      const announcement = await tx.eventAnnouncement.findFirst({ where: { eventId, id: command.announcementId } });
      if (!announcement) throw new Error("Announcement not found");
      const publishing = command.kind === "announcement_publish";
      await tx.eventAnnouncement.update({ where: { id: announcement.id }, data: { status: publishing ? "published" : "draft", publishedAt: publishing ? now : null, publishedById: publishing ? actorId : null } });
      return announcement.id;
    }
  }
}
