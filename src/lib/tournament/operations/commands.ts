import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { generateCompetitionGraph } from "../competition";
import { getLegacyTournamentFormat } from "../formats/types";
import { planSchedule } from "../scheduling";
import type { ParsedCommand } from "./schema";
import { json, isTerminal, matchSnapshot, eventMatch, readGraph, type StoredSchedule } from "./state";
import { applyResult } from "./results";
import { reconcileReadinessActions } from "./readiness";
import { scheduleBaseline } from "./schedule-source";
import { diagnoseLegacyCompetition } from "./legacy-compatibility";
import { applyDelay } from "./delay";
import { outstandingDelayEstimates } from "./delay-estimates";
import { withOperationStage, type OperationStageReporter } from "./observability";

function requireReason(value: string | undefined) { if (!value?.trim()) throw new Error("An override or resolution reason is required"); }

type DrawingInput = {
  config: Extract<ParsedCommand, { kind: "drawing_save" }>["config"];
  teams: Extract<ParsedCommand, { kind: "drawing_save" }>["teams"];
  slotCount?: number;
};

function validateDrawingTeams(teams: DrawingInput["teams"]) {
  if (new Set(teams.map((team) => team.id)).size !== teams.length) {
    throw new Error("Drawing teams must be unique");
  }
  if (new Set(teams.map((team) => team.seed)).size !== teams.length) {
    throw new Error("Drawing seeds must be unique");
  }
}

async function persistDrawing(
  tx: Prisma.TransactionClient,
  eventId: string,
  command: DrawingInput,
  status: "draft" | "active",
  reporter?: OperationStageReporter,
) {
  await withOperationStage(reporter, "drawing_validate", { teamCount: command.teams.length }, () => validateDrawingTeams(command.teams));
  const teams = await withOperationStage(reporter, "drawing_roster", { requestedTeamCount: command.teams.length }, () => tx.team.findMany({
    where: { eventId },
    select: { id: true },
  }));
  const authoritativeIds = new Set(teams.map((team) => team.id));
  if (teams.length !== command.teams.length
    || command.teams.some((team) => !authoritativeIds.has(team.id))) {
    throw new Error("Teams must match the complete authoritative roster for the event");
  }
  const graph = await withOperationStage(reporter, "drawing_graph", { teamCount: command.teams.length }, () => generateCompetitionGraph({ eventId, ...command }));
  await withOperationStage(reporter, "drawing_phases", { phaseCount: graph.phases.length }, async () => {
    for (const phase of graph.phases) await tx.competitionPhase.create({ data: {
      id: phase.id,
      eventId,
      label: phase.kind,
      sequence: phase.sequence,
      status,
      configuration: json({
        ...phase,
        ...(phase.sequence === 1 ? {
          graph,
          drawing: { teams: command.teams.map((team) => ({ id: team.id, seed: team.seed })) },
        } : {}),
      }),
    } });
  });
  await withOperationStage(reporter, "drawing_groups", { groupCount: graph.groups.length, memberCount: graph.groups.reduce((total, group) => total + group.teams.length, 0) }, async () => {
    for (const group of graph.groups) {
      await tx.competitionGroup.create({ data: {
        id: group.id,
        eventId,
        phaseId: group.phaseId,
        label: group.label,
        sequence: group.sequence,
      } });
      for (const team of group.teams) await tx.competitionGroupMember.create({ data: {
        eventId,
        groupId: group.id,
        teamId: team.id,
        seed: team.seed,
      } });
    }
  });
  const rounds = new Map<string, number>();
  await withOperationStage(reporter, "drawing_matches", { matchCount: graph.matches.length }, async () => {
    for (const [index, match] of graph.matches.entries()) {
      const key = `${match.phaseId}:${match.bracket}:${match.round}:${match.leg}`;
      if (!rounds.has(key)) rounds.set(key, rounds.size + 1);
      await tx.match.create({ data: {
        id: match.id,
        eventId,
        phaseId: match.phaseId,
        groupId: match.groupId,
        roundLabel: `${match.bracket} ${match.round}`,
        round: rounds.get(key),
        slot: index + 1,
        homeTeamId: match.home.kind === "team" ? match.home.teamId : "",
        awayTeamId: match.away.kind === "team" ? match.away.teamId : "",
        status: match.status === "pending" ? "Scheduled" : "Bye",
        scheduleStatus: "estimated",
        resultVersion: 0,
        scheduleMetadata: json({ graphMatch: match }),
      } });
    }
  });
  await withOperationStage(reporter, "drawing_dependencies", { dependencyCount: graph.dependencies.length }, async () => {
    for (const dependency of graph.dependencies) {
      await tx.matchDependency.create({ data: { ...dependency, eventId } });
    }
  });
  await withOperationStage(reporter, "drawing_event", undefined, () => tx.event.update({ where: { id: eventId }, data: {
    formatConfig: json(graph.config),
    format: getLegacyTournamentFormat(graph.config),
  } }));
  return graph.phases[0].id;
}

async function assertDrawingMutable(tx: Prisma.TransactionClient, eventId: string) {
  const [event, phases, publishedScheduleCount, resultRevisionCount, terminalMatchCount] = await Promise.all([
    tx.event.findUniqueOrThrow({ where: { id: eventId } }),
    tx.competitionPhase.findMany({ where: { eventId } }),
    tx.scheduleRevision.count({ where: { eventId, status: "published" } }),
    tx.matchResultRevision.count({ where: { eventId } }),
    tx.match.count({ where: { eventId, status: { in: ["Live", "Completed"] } } }),
  ]);
  if (phases.some((phase) => phase.status !== "draft")
    || event.publishedScheduleVersion != null
    || publishedScheduleCount
    || resultRevisionCount
    || terminalMatchCount) {
    throw new Error("Drawing is locked after publication, official schedule, live match, or result");
  }
}

async function clearDrawingDraft(tx: Prisma.TransactionClient, eventId: string) {
  await tx.scheduleRevision.deleteMany({ where: { eventId, status: "draft" } });
  await tx.matchReadiness.deleteMany({ where: { eventId } });
  await tx.matchDependency.deleteMany({ where: { eventId } });
  await tx.matchGame.deleteMany({ where: { match: { eventId } } });
  await tx.match.deleteMany({ where: { eventId } });
  await tx.competitionGroupMember.deleteMany({ where: { eventId } });
  await tx.competitionGroup.deleteMany({ where: { eventId } });
  await tx.competitionPhase.deleteMany({ where: { eventId, status: "draft" } });
}

async function requirePublishedDrawing(tx: Prisma.TransactionClient, eventId: string) {
  const phase = await tx.competitionPhase.findFirst({ where: { eventId, status: "active" } });
  if (!phase) throw new Error("Drawing must be published before this operation");
}

/** Internal: must run only after authorization and event CAS in execute(). */
export async function applyCommand(tx: Prisma.TransactionClient, eventId: string, actorId: string, command: ParsedCommand, version: number, idempotencyKey: string, now: Date, readinessActor: "organizer" | "captain" = "organizer", reporter?: OperationStageReporter): Promise<string | undefined> {
  if (["schedule_publish", "match_start", "result_submit", "result_correct"].includes(command.kind)) {
    await requirePublishedDrawing(tx, eventId);
  }
  if (["readiness_update", "readiness_deadline", "match_start", "match_timing"].includes(command.kind)) {
    const graph = await readGraph(tx, eventId);
    if (!("matchId" in command) || !graph.matches.some(m => m.id === command.matchId)) throw new Error("Match not found in competition");
  }
  switch (command.kind) {
    case "delay_preview": return applyDelay(tx, eventId, actorId, command, version, idempotencyKey);
    case "legacy_upgrade": {
      if (await tx.competitionPhase.count({ where: { eventId } })) throw new Error("Competition already initialized");
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      const [matches, resultRevisions, matchGames, roundConfigs, teams] = await Promise.all([
        tx.match.findMany({ where: { eventId } }),
        tx.matchResultRevision.count({ where: { eventId } }),
        tx.matchGame.findMany({ where: { match: { eventId } }, select: { matchId: true } }),
        tx.eventRoundConfig.findMany({ where: { eventId }, select: { eventId: true, roundLabel: true, bestOf: true } }),
        tx.team.findMany({ where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      ]);
      const seeded = teams.map((t, i) => ({ id: t.id, seed: i + 1 }));
      const diagnosis = diagnoseLegacyCompetition(event, seeded, matches, { roundConfigs, matchGames, resultRevisionCount: resultRevisions });
      if (!diagnosis.graph) throw new Error(`Legacy competition cannot be upgraded: ${diagnosis.reason}`);
      const graph = diagnosis.graph;
      if (!matches.length) return applyCommand(tx, eventId, actorId, { kind: "initialize", config: graph.config, teams: seeded }, version, idempotencyKey, now, readinessActor, reporter);
      for (const phase of graph.phases) await tx.competitionPhase.create({ data: { id: phase.id, eventId, label: phase.kind, sequence: phase.sequence, status: "active", configuration: json({ ...phase, graph }) } });
      for (const match of graph.matches) await tx.match.update({ where: { id: match.id }, data: { phaseId: match.phaseId, scheduleMetadata: json({ graphMatch: match }) } });
      for (const dependency of graph.dependencies) await tx.matchDependency.create({ data: { ...dependency, eventId } });
      await tx.event.update({ where: { id: eventId }, data: { formatConfig: json(graph.config) } });
      return graph.phases[0].id;
    }
    case "result_submit":
    case "result_correct":
      return applyResult(tx, eventId, actorId, command, version, idempotencyKey, now);
    case "drawing_save": {
      await withOperationStage(reporter, "drawing_assert_mutable", undefined, () => assertDrawingMutable(tx, eventId));
      await withOperationStage(reporter, "drawing_clear_draft", undefined, () => clearDrawingDraft(tx, eventId));
      return persistDrawing(tx, eventId, command, "draft", reporter);
    }
    case "drawing_publish": {
      const phases = await tx.competitionPhase.findMany({ where: { eventId } });
      if (!phases.length || phases.some((phase) => phase.status !== "draft")) {
        throw new Error("Drawing draft not found or drawing is locked");
      }
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      if (event.status !== "Registration Closed") {
        throw new Error("Drawing can be published only after registration is closed");
      }
      const firstPhase = phases.slice().sort((left, right) => left.sequence - right.sequence)[0];
      const configuration = firstPhase.configuration && typeof firstPhase.configuration === "object" && !Array.isArray(firstPhase.configuration)
        ? firstPhase.configuration as { drawing?: { teams?: Array<{ id?: unknown }> } }
        : null;
      const draftIds = Array.isArray(configuration?.drawing?.teams)
        ? configuration.drawing.teams.flatMap((team) => typeof team.id === "string" ? [team.id] : [])
        : [];
      const currentTeams = await tx.team.findMany({ where: { eventId }, select: { id: true } });
      const currentIds = new Set(currentTeams.map((team) => team.id));
      if (draftIds.length !== currentTeams.length || draftIds.some((id) => !currentIds.has(id))) {
        throw new Error("Drawing roster changed after the draft was saved; save a new draft");
      }
      await tx.competitionPhase.updateMany({
        where: { eventId, status: "draft" },
        data: { status: "active" },
      });
      return String(firstPhase.id);
    }
    case "drawing_reset":
      await withOperationStage(reporter, "drawing_assert_mutable", undefined, () => assertDrawingMutable(tx, eventId));
      await withOperationStage(reporter, "drawing_clear_draft", undefined, () => clearDrawingDraft(tx, eventId));
      return undefined;
    case "initialize": {
      if (await tx.matchResultRevision.count({ where: { eventId } }) || await tx.match.count({ where: { eventId, resultVersion: { gt: 0 } } })) throw new Error("Competition has official results");
      if (await tx.match.count({ where: { eventId } }) || await tx.competitionPhase.count({ where: { eventId } })) throw new Error("Competition already initialized");
      return persistDrawing(tx, eventId, command, "active", reporter);
    }
    case "schedule_save": {
      if (command.input.manualOverrides?.length) requireReason(command.reason);
      const graph = await readGraph(tx, eventId);
      const matches = await tx.match.findMany({ where: { eventId } });
      const playable = matches.filter(m => graph.matches.some(g => g.id === m.id && g.status === "pending"));
      const existingAssignments = await scheduleBaseline(tx, eventId, version, command.input, playable);
      const source = command.input.sourceRevision ? await tx.scheduleRevision.findFirst({ where: { eventId, id: command.input.sourceRevision.id } }) : null;
      const stored = source?.snapshot as unknown as StoredSchedule | undefined;
      const delayEstimates = await outstandingDelayEstimates(tx, eventId);
      const overrides = new Map((command.input.manualOverrides ?? []).map(a => [a.matchId, a]));
      for (const [id, end] of Object.entries(delayEstimates)) {
        const match = playable.find(m => m.id === id);
        const assignment = stored?.draft.assignments.find(a => a.matchId === id);
        if (match && assignment && !isTerminal(match) && match.scheduleStatus !== "locked" && !overrides.has(id)) {
          overrides.set(id, { ...assignment, end: Date.parse(assignment.end) >= Date.parse(end) ? assignment.end : end });
        }
      }
      const input = { ...command.input, manualOverrides: [...overrides.values()] };
      const draft = planSchedule({
        ...input, graph,
        existingAssignments,
        lockedMatchIds: [...new Set([...command.input.lockedMatchIds ?? [], ...playable.filter(m => m.scheduleStatus === "locked").map(m => m.id)])],
        matchStates: Object.fromEntries(playable.map(m => [m.id, isTerminal(m) ? (m.scheduleStatus === "live" || m.status === "Live" ? "live" : "completed") : "scheduled"])),
      });
      const revision = await tx.scheduleRevision.create({ data: { eventId, version, status: "draft", snapshot: json({ draft, input, baseMatches: matchSnapshot(matches), ...(Object.keys(delayEstimates).length ? { delayEstimates } : {}) }), idempotencyKey, createdById: actorId } });
      return revision.id;
    }
    case "schedule_publish": {
      const revision = await tx.scheduleRevision.findFirst({ where: { id: command.revisionId, eventId, status: "draft" } });
      if (!revision) throw new Error("Schedule draft not found");
      const latest = (await tx.scheduleRevision.findMany({ where: { eventId, status: "draft" } })).sort((a, b) => b.version - a.version)[0];
      const selectedEvent = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      const hasPendingDelay = !!(latest?.snapshot as unknown as StoredSchedule | undefined)?.delayEstimates || !!(revision.snapshot as unknown as StoredSchedule).delayEstimates;
      if (hasPendingDelay && latest?.id !== revision.id || revision.version <= (selectedEvent.publishedScheduleVersion ?? -1)) throw new Error("Schedule draft is superseded or stale: review the latest revision");
      const { draft, baseMatches, delayEstimates } = revision.snapshot as unknown as StoredSchedule;
      if (!draft.feasible || draft.conflicts.length) throw new Error("Schedule has unresolved conflicts");
      const matches = await tx.match.findMany({ where: { eventId } });
      if (!isDeepStrictEqual(baseMatches, matchSnapshot(matches))) throw new Error("Schedule review is stale: save a new draft");
      const requiredEstimates = await outstandingDelayEstimates(tx, eventId);
      for (const [id, end] of Object.entries(requiredEstimates)) {
        if (!draft.assignments.some(a => a.matchId === id && Date.parse(a.end) >= Date.parse(end))) throw new Error("An active delay estimate is missing or shortened: preserve it or explicitly resolve the delay before publishing");
      }
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
      const representedDelays = Object.entries(delayEstimates ?? {}).filter(([id, end]) => draft.assignments.some(a => a.matchId === id && Date.parse(a.end) >= Date.parse(end))).map(([id]) => `delay:${id}`);
      await tx.competitionActionItem.updateMany({ where: { eventId, conditionKey: { in: representedDelays }, resolvedAt: null }, data: { resolvedAt: now } });
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
      const data = { status: command.status, actor: readinessActor, actorUserId: actorId, note: command.note ?? null,
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
      await reconcileReadinessActions(tx, eventId, match, now);
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
      await tx.match.update({ where: { id: match.id }, data: { status: "Live", scheduleStatus: "live", actualStartedAt: match.actualStartedAt ?? now } });
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
      if (command.announcementId) {
        const existing = await tx.eventAnnouncement.findFirst({ where: { eventId, id: command.announcementId } });
        if (!existing) throw new Error("Announcement not found");
        if (existing.status === "published") throw new Error("Unpublish the announcement before editing its draft");
        const startsAt = command.startsAt ? new Date(command.startsAt) : existing.startsAt;
        const endsAt = command.endsAt ? new Date(command.endsAt) : existing.endsAt;
        if (startsAt && endsAt && startsAt >= endsAt) throw new Error("Announcement end must follow start");
        await tx.eventAnnouncement.update({ where: { id: existing.id }, data: { title: command.title, body: command.body, urgency: command.urgency ?? existing.urgency ?? "info", startsAt, endsAt } });
        return existing.id;
      }
      const announcement = await tx.eventAnnouncement.create({ data: { eventId, title: command.title, body: command.body, urgency: command.urgency ?? "info", status: "draft", createdById: actorId, startsAt: command.startsAt ? new Date(command.startsAt) : null, endsAt: command.endsAt ? new Date(command.endsAt) : null } });
      return announcement.id;
    }
    case "announcement_publish":
    case "announcement_unpublish": {
      const announcement = await tx.eventAnnouncement.findFirst({ where: { eventId, id: command.announcementId } });
      if (!announcement) throw new Error("Announcement not found");
      const publishing = command.kind === "announcement_publish";
      await tx.eventAnnouncement.update({ where: { id: announcement.id }, data: { status: publishing ? "published" : "draft", publishedAt: publishing ? now : null, publishedById: publishing ? actorId : null, ...(command.kind === "announcement_publish" && command.urgency ? { urgency: command.urgency } : {}) } });
      return announcement.id;
    }
  }
}
