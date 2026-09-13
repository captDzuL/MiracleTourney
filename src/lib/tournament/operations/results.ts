import { createHash } from "node:crypto";
import type { Match, Prisma } from "@prisma/client";
import type { CompetitionGraph, CompetitionMatch } from "../competition";
import { recalculateSchedule } from "../scheduling";
import { competitionProjection, dependentMatchIds } from "./result-projection";
import type { ParsedCommand } from "./schema";
import { eventMatch, isTerminal, json, matchSnapshot, readGraph, type StoredSchedule } from "./state";
import { reconcileReadinessActions } from "./readiness";

export type ResultGame = { gameNumber: number; homeScore: number; awayScore: number };
type ResultCommand = Extract<ParsedCommand, { kind: "result_submit" | "result_correct" }>;

// Preview collections carry explicit identity/order fields (matchId, rank,
// gameNumber). Canonicalize their content, including nested collections and
// object keys, so database/presentation order cannot invalidate a review.
function canonicalPreview(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPreview).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalPreview(nested)]));
  return value;
}

function scoreResult(match: Match, graphMatch: CompetitionMatch | undefined, input: ResultGame[]) {
  if (!graphMatch || graphMatch.status !== "pending" || !match.homeTeamId || !match.awayTeamId || match.homeTeamId === match.awayTeamId) throw new Error("Match participants are unresolved or this is a bye");
  const games = [...input].sort((a, b) => a.gameNumber - b.gameNumber);
  const bestOf = graphMatch.bestOf;
  if (!games.length || games.length > bestOf || games.some((g, i) => g.gameNumber !== i + 1)) throw new Error("Invalid best-of game sequence");
  let homeScore = 0, awayScore = 0;
  if (bestOf === 1) {
    homeScore = games[0].homeScore; awayScore = games[0].awayScore;
    if (homeScore === awayScore && graphMatch.bracket !== "round_robin") throw new Error("Elimination games cannot draw");
  } else {
    const needed = Math.ceil(bestOf / 2);
    for (const game of games) {
      if (homeScore >= needed || awayScore >= needed) throw new Error("Games submitted after the best-of series ended");
      if (game.homeScore === game.awayScore) throw new Error("Best-of games cannot draw");
      if (game.homeScore > game.awayScore) homeScore++; else awayScore++;
    }
    if (Math.max(homeScore, awayScore) !== needed) throw new Error("Best-of series is incomplete");
  }
  const winnerTeamId = homeScore === awayScore ? null : homeScore > awayScore ? match.homeTeamId : match.awayTeamId;
  const loserTeamId = !winnerTeamId ? null : winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  return { bestOf, games, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, homeScore, awayScore, winnerTeamId, loserTeamId };
}

function projectedMatches(graph: CompetitionGraph, matches: Match[], matchId: string, score: ReturnType<typeof scoreResult>) {
  const next = matches.map(m => m.id === matchId ? { ...m, ...score, status: "Completed", scheduleStatus: "completed" as const, resultVersion: m.resultVersion + 1 } : { ...m });
  const projection = competitionProjection(graph, next);
  for (const node of graph.matches) {
    const row = next.find(m => m.id === node.id)!;
    if (!row.resultVersion && !isTerminal(row)) { row.homeTeamId = projection.resolve(node.home); row.awayTeamId = projection.resolve(node.away); }
  }
  return { next, projection };
}

async function resultSchedule(tx: Prisma.TransactionClient, eventId: string, graph: CompetitionGraph, matches: Match[], changedMatchId: string) {
  const revisions = await tx.scheduleRevision.findMany({ where: { eventId } });
  const revision = revisions.sort((a, b) => b.version - a.version)[0];
  if (!revision) return null;
  const stored = revision.snapshot as unknown as StoredSchedule;
  // Older Task 4 snapshots lack the planner input. Keep them immutable and
  // expose a review conflict instead of inventing scheduling constraints.
  if (!stored.input) return { draft: { ...stored.draft, feasible: false, conflicts: [{ code: "MISSING_SCHEDULE_INPUT", matchIds: [changedMatchId], message: "Save a new schedule draft with scheduling constraints." }] }, baseMatches: matchSnapshot(matches) };
  const playable = matches.filter(m => graph.matches.some(g => g.id === m.id && g.status === "pending"));
  const assignments = new Map(stored.draft.assignments.map(a => [a.matchId, a]));
  for (const m of playable.filter(isTerminal)) if (m.scheduledAt && m.scheduledEndsAt && m.scheduleRoom) assignments.set(m.id, { matchId: m.id, roomId: m.scheduleRoom, start: m.scheduledAt.toISOString(), end: (m.status === "Live" || m.scheduleStatus === "live" ? stored.delayEstimates?.[m.id] : undefined) ?? m.scheduledEndsAt.toISOString() });
  const draft = recalculateSchedule({ ...stored.input, graph,
    existingAssignments: [...assignments.values()],
    lockedMatchIds: [...new Set([...stored.input.lockedMatchIds ?? [], ...playable.filter(m => m.scheduleStatus === "locked").map(m => m.id)])],
    matchStates: Object.fromEntries(playable.map(m => [m.id, isTerminal(m) ? m.status === "Live" || m.scheduleStatus === "live" ? "live" : "completed" : "scheduled"])),
    changedMatchIds: [changedMatchId],
  });
  return { draft, input: stored.input, baseMatches: matchSnapshot(matches), ...(stored.delayEstimates ? { delayEstimates: stored.delayEstimates } : {}) };
}

/** Called under the service's authorized repeatable-read or write transaction. */
export async function correctionPreview(tx: Prisma.TransactionClient, eventId: string, matchId: string, games: ResultGame[], version: number) {
  const graph = await readGraph(tx, eventId);
  const matches = await tx.match.findMany({ where: { eventId } });
  const match = matches.find(m => m.id === matchId);
  if (!match || !match.resultVersion) throw new Error("Official result not found for correction");
  const score = scoreResult(match, graph.matches.find(m => m.id === matchId), games);
  const affectedMatchIds = dependentMatchIds(graph, matchId);
  const blockedMatchIds = matches.filter(m => affectedMatchIds.includes(m.id) && isTerminal(m)).map(m => m.id).sort();
  const { next, projection } = projectedMatches(graph, matches, matchId, score);
  const schedule = await resultSchedule(tx, eventId, graph, next, matchId);
  const impact = { eventId, matchId, competitionVersion: version, resultVersion: match.resultVersion, score,
    affectedMatchIds, blockedMatchIds,
    participants: next.filter(m => affectedMatchIds.includes(m.id)).map(m => ({ matchId: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId })).sort((a, b) => a.matchId.localeCompare(b.matchId)),
    standings: projection.standings, placements: projection.placements, schedule: schedule?.draft ?? null,
  };
  return { ...impact, token: createHash("sha256").update(JSON.stringify(canonicalPreview(impact))).digest("hex") };
}

/** Internal command handler: the caller owns authorization, CAS, audit and commit. */
export async function applyResult(tx: Prisma.TransactionClient, eventId: string, actorId: string, command: ResultCommand, version: number, idempotencyKey: string, now: Date) {
  const graph = await readGraph(tx, eventId);
  const match = await eventMatch(tx, eventId, command.matchId);
  const score = scoreResult(match, graph.matches.find(m => m.id === match.id), command.games);
  if (command.kind === "result_correct") {
    const preview = await correctionPreview(tx, eventId, match.id, command.games, version - 1);
    if (preview.blockedMatchIds.length) throw new Error("Cannot correct a result with a live or completed dependent match");
    if (preview.token !== command.previewToken) throw new Error("Correction preview is missing or stale: review the impact again");
  } else {
    if (match.resultVersion > 0 || match.status === "Completed") throw new Error("Official result already exists: use correction");
    if (!match.actualStartedAt || match.status !== "Live" || !["live", "delayed"].includes(match.scheduleStatus)) throw new Error("Official result requires a started match");
  }

  const revision = await tx.matchResultRevision.create({ data: {
    eventId, matchId: match.id, version: match.resultVersion + 1, homeScore: score.homeScore, awayScore: score.awayScore,
    winnerTeamId: score.winnerTeamId, scoreSnapshot: json(score), actorUserId: actorId,
    reason: command.kind === "result_correct" ? command.reason : "Official result submission", idempotencyKey,
  } });
  await tx.match.update({ where: { id: match.id }, data: {
    homeScore: score.homeScore, awayScore: score.awayScore, winnerTeamId: score.winnerTeamId,
    status: "Completed", scheduleStatus: "completed", resultVersion: revision.version,
    resultSnapshot: json(score), resultConfirmedAt: now,
    ...(command.kind === "result_submit" ? { actualEndedAt: match.actualEndedAt ?? now } : {}),
  } });
  await tx.matchGame.deleteMany({ where: { matchId: match.id } });
  await tx.matchGame.createMany({
    data: score.games.map((game) => ({
      matchId: match.id,
      gameNumber: game.gameNumber,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    })),
  });
  const matches = await tx.match.findMany({ where: { eventId } });
  const projection = competitionProjection(graph, matches);
  for (const node of graph.matches) {
    const row = matches.find(m => m.id === node.id)!;
    const homeTeamId = projection.resolve(node.home), awayTeamId = projection.resolve(node.away);
    if (!isTerminal(row) && (row.homeTeamId !== homeTeamId || row.awayTeamId !== awayTeamId)) {
      await tx.match.update({ where: { id: row.id }, data: { homeTeamId, awayTeamId } });
      // Participant changes invalidate previously collected readiness, including
      // teams removed by a correction. Old readiness must never start new slots.
      await tx.matchReadiness.updateMany({ where: { eventId, matchId: row.id }, data: { status: "pending", readyAt: null, checkedInAt: null } });
      row.homeTeamId = homeTeamId; row.awayTeamId = awayTeamId;
      await reconcileReadinessActions(tx, eventId, row, now);
    }
  }
  for (const phase of await tx.competitionPhase.findMany({ where: { eventId } })) {
    await tx.competitionPhase.update({ where: { id: phase.id }, data: { configuration: json({ ...phase.configuration as object, projection: { version, standings: projection.standings.filter(t => t.phaseId === phase.id), placements: projection.placements } }) } });
  }
  const schedule = await resultSchedule(tx, eventId, graph, matches, match.id);
  if (schedule) await tx.scheduleRevision.create({ data: { eventId, version, status: "draft", snapshot: json(schedule), idempotencyKey, createdById: actorId } });
  await tx.competitionActionItem.updateMany({ where: { eventId, matchId: match.id, conditionKey: { in: [`result:${match.id}`, ...[match.homeTeamId, match.awayTeamId].map(id => `readiness:${match.id}:${id}`)] }, resolvedAt: null }, data: { resolvedAt: now } });
  for (const table of projection.standings) {
    const conditionKey = `standings-tie:${table.groupId ?? table.phaseId}`;
    if (table.complete && table.rows.some(r => r.tied)) await tx.competitionActionItem.upsert({ where: { eventId_conditionKey: { eventId, conditionKey } }, create: { eventId, conditionKey, priority: "critical", title: "Standings require a tiebreak decision", detail: "Unresolved ranks cannot qualify automatically", resolvedAt: null }, update: { resolvedAt: null } });
    else await tx.competitionActionItem.updateMany({ where: { eventId, conditionKey, resolvedAt: null }, data: { resolvedAt: now } });
  }
  return revision.id;
}
