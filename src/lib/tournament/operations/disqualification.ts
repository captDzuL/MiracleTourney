import { createHash } from "node:crypto";
import type { Match, Prisma } from "@prisma/client";
import type { CompetitionGraph } from "../competition";
import { competitionProjection, disqualifiedTeamIds } from "./result-projection";
import { canonicalPreview, resultSchedule, syncProjection, syncStandingsActions } from "./results";
import type { ParsedCommand } from "./schema";
import { isTerminal, json, readGraph } from "./state";
import { CompetitionExpectedError } from "./errors";

type DisqualifyCommand = Extract<ParsedCommand, { kind: "team_disqualify" }>;
export type DisqualificationBlocker = { code: "live_match" | "playoff_played" | "still_assigned"; matchId: string; message: string };

const isRosterTeam = (graph: CompetitionGraph, teamId: string) =>
  graph.groups.some(g => g.teams.some(t => t.id === teamId))
  || graph.matches.some(m => [m.home, m.away].some(s => s.kind === "team" && s.teamId === teamId));

/**
 * Pure planner: what disqualifying `teamId` does to the stored competition.
 * A team's matches in standings phases become void (recorded results are kept
 * as history but ignored); unplayed fixtures are cancelled; playoff slots that
 * were filled from the standings are re-derived without the team.
 */
function plan(graph: CompetitionGraph, matches: Match[], teamId: string) {
  const standingsPhases = new Set(graph.phases.filter(p => p.standingsRules).map(p => p.id));
  const node = new Map(graph.matches.map(m => [m.id, m]));
  const teamMatches = matches.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId);
  const inStandings = (m: Match) => standingsPhases.has(node.get(m.id)?.phaseId ?? "");
  const voidedMatchIds = teamMatches.filter(m => !isTerminal(m) && node.get(m.id)?.status === "pending" && inStandings(m)).map(m => m.id).sort();
  const ignoredResultMatchIds = teamMatches.filter(m => m.resultVersion > 0 && inStandings(m)).map(m => m.id).sort();
  const voided = new Set(voidedMatchIds);

  const blockers: DisqualificationBlocker[] = [];
  for (const m of teamMatches) {
    if (isTerminal(m) && m.resultVersion === 0) blockers.push({ code: "live_match", matchId: m.id, message: `Match ${m.id} is live: finish or cancel it first` });
    else if (isTerminal(m) && !inStandings(m)) blockers.push({ code: "playoff_played", matchId: m.id, message: `Team already played playoff match ${m.id}: a playoff disqualification needs a manual decision` });
  }

  const nextGraph: CompetitionGraph = {
    ...graph,
    matches: graph.matches.map(m => voided.has(m.id) ? { ...m, status: "empty" as const } : m),
    disqualifications: [...graph.disqualifications ?? [], { teamId, reason: "", actorUserId: "", disqualifiedAt: "", voidedMatchIds }],
  };
  const nextRows = matches.map(m => ({ ...m, ...(voided.has(m.id) ? { status: "Voided" } : {}) }));
  const after = competitionProjection(nextGraph, nextRows);
  const participants: { matchId: string; before: { homeTeamId: string; awayTeamId: string }; after: { homeTeamId: string; awayTeamId: string } }[] = [];
  for (const graphMatch of nextGraph.matches) {
    const row = nextRows.find(m => m.id === graphMatch.id)!;
    if (isTerminal(row)) continue;
    const homeTeamId = after.resolve(graphMatch.home), awayTeamId = after.resolve(graphMatch.away);
    if (row.homeTeamId !== homeTeamId || row.awayTeamId !== awayTeamId) {
      participants.push({ matchId: row.id, before: { homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId }, after: { homeTeamId, awayTeamId } });
      row.homeTeamId = homeTeamId; row.awayTeamId = awayTeamId;
    }
    // Still an unplayed, non-void match: the team could only be here through a
    // result that already advanced it (e.g. a completed playoff feeding this slot).
    if (!voided.has(row.id) && graphMatch.status === "pending" && (row.homeTeamId === teamId || row.awayTeamId === teamId)) {
      blockers.push({ code: "still_assigned", matchId: row.id, message: `Team still occupies match ${row.id} through an earlier result: resolve it manually` });
    }
  }
  return { nextGraph, nextRows, voidedMatchIds, ignoredResultMatchIds, blockers, participants: participants.sort((a, b) => a.matchId.localeCompare(b.matchId)), before: competitionProjection(graph, matches), after };
}

/** Called under the service's authorized repeatable-read or write transaction. */
export async function disqualificationPreview(tx: Prisma.TransactionClient, eventId: string, teamId: string, version: number) {
  const graph = await readGraph(tx, eventId);
  if (!isRosterTeam(graph, teamId) || !await tx.team.findFirst({ where: { id: teamId, eventId } })) throw new Error("Team is not part of this competition");
  if (disqualifiedTeamIds(graph).has(teamId)) throw new Error("Team is already disqualified");
  const matches = await tx.match.findMany({ where: { eventId } });
  const p = plan(graph, matches, teamId);
  const impact = {
    eventId, teamId, competitionVersion: version,
    voidedMatchIds: p.voidedMatchIds, ignoredResultMatchIds: p.ignoredResultMatchIds,
    blockers: p.blockers, participants: p.participants,
    standingsBefore: p.before.standings, standings: p.after.standings, placements: p.after.placements,
  };
  return { ...impact, token: createHash("sha256").update(JSON.stringify(canonicalPreview(impact))).digest("hex") };
}

/** Internal command handler: the caller owns authorization, CAS, audit and commit. */
export async function applyDisqualification(tx: Prisma.TransactionClient, eventId: string, actorId: string, command: DisqualifyCommand, version: number, idempotencyKey: string, now: Date) {
  const preview = await disqualificationPreview(tx, eventId, command.teamId, version - 1);
  if (preview.blockers.length) throw new Error(`Cannot disqualify team: ${preview.blockers.map(b => b.message).join("; ")}`);
  if (preview.token !== command.previewToken) throw new CompetitionExpectedError("conflict", "Disqualification preview is missing or stale: review the impact again");

  const graph = await readGraph(tx, eventId);
  const voided = new Set(preview.voidedMatchIds);
  const nextGraph: CompetitionGraph = {
    ...graph,
    matches: graph.matches.map(m => voided.has(m.id) ? { ...m, status: "empty" as const } : m),
    disqualifications: [...graph.disqualifications ?? [], { teamId: command.teamId, reason: command.reason, actorUserId: actorId, disqualifiedAt: now.toISOString(), voidedMatchIds: preview.voidedMatchIds }],
  };
  const phase = await tx.competitionPhase.findFirst({ where: { eventId, sequence: 1 } });
  if (!phase) throw new Error("Competition not initialized");
  await tx.competitionPhase.update({ where: { id: phase.id }, data: { configuration: json({ ...phase.configuration as object, graph: nextGraph }) } });
  for (const id of preview.voidedMatchIds) await tx.match.update({ where: { id }, data: { status: "Voided" } });
  if (preview.voidedMatchIds.length) await tx.competitionActionItem.updateMany({ where: { eventId, matchId: { in: preview.voidedMatchIds }, resolvedAt: null }, data: { resolvedAt: now } });

  const { matches, projection } = await syncProjection(tx, eventId, nextGraph, version, now);
  const changed = preview.participants.map(p => p.matchId).filter(id => nextGraph.matches.some(m => m.id === id && m.status === "pending"));
  if (changed.length) {
    const schedule = await resultSchedule(tx, eventId, nextGraph, matches, changed);
    if (schedule) await tx.scheduleRevision.create({ data: { eventId, version, status: "draft", snapshot: json(schedule), idempotencyKey, createdById: actorId } });
  }
  await syncStandingsActions(tx, eventId, projection, now);

  // A group that lost so many teams that it cannot fill its qualifying ranks
  // needs a human decision; the bracket size is fixed, so never guess.
  for (const table of projection.standings) {
    if (!table.groupId) continue;
    const ranks = nextGraph.qualificationDependencies.filter(d => d.groupId === table.groupId).map(d => d.rank);
    const conditionKey = `group-slot:${table.groupId}`;
    if (ranks.some(rank => rank > table.rows.length)) {
      await tx.competitionActionItem.upsert({ where: { eventId_conditionKey: { eventId, conditionKey } }, create: { eventId, conditionKey, priority: "critical", title: "Group cannot fill its qualifying slots", detail: "Too many teams were disqualified; decide how the empty playoff slots are filled", resolvedAt: null }, update: { resolvedAt: null } });
    } else {
      await tx.competitionActionItem.updateMany({ where: { eventId, conditionKey, resolvedAt: null }, data: { resolvedAt: now } });
    }
  }
  return command.teamId;
}
