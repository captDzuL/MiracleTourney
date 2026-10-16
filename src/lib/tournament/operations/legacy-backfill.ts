import type { Match } from "@prisma/client";
import { generateCompetitionGraph, type CompetitionGraph, type CompetitionMatch, type SeededTeam, type SingleEliminationConfig } from "../competition";
import { tournamentFormatConfigSchema } from "../formats/types";
import { competitionProjection } from "./result-projection";
import { deriveBackfillConfig } from "./legacy-backfill-config";
import { completionRowsFromPlan, predictFromRows } from "./legacy-backfill-readiness";
import { inferBackfillSeeds } from "./legacy-backfill-seeds";
import { resolveThirdPlace, type ThirdPlaceResolution } from "./legacy-backfill-third-place";
import {
  mapRowsToNodes, orientedGames, participantProblems, resultProblems, rewriteGraphIds, teamNamer, type NameOf, type NodeRows,
} from "./legacy-backfill-verify";
import type {
  BackfillGame, BackfillMatch, BackfillMatchCreate, BackfillMatchUpdate, BackfillPhase, BackfillRevision, LegacyBackfillInput,
  LegacyBackfillPlan, LegacyBackfillResult, ScoreSnapshot,
} from "./legacy-backfill-types";

export const BACKFILL_REASON = "Hasil dipindahkan dari data lama";
export const THIRD_PLACE_LABEL = "Third Place";
const THIRD_PLACE_LABEL_PATTERN = /third|3rd|ketiga|perunggu|bronze/i;
const revisionKey = (matchId: string) => `legacy-backfill:${matchId}:1`;
const plainObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type BackfillGuard = { action: "proceed" } | { action: "skip"; reason: string };

/** Idempotence: once any V3 structure exists the backfill must not run again. */
export function evaluateBackfillGuard(existing: { phaseCount: number; resultRevisionCount: number; dependencyCount: number }): BackfillGuard {
  if (existing.phaseCount > 0) return { action: "skip", reason: `already has ${existing.phaseCount} competition phase(s); nothing to backfill` };
  if (existing.resultRevisionCount > 0) return { action: "skip", reason: `already has ${existing.resultRevisionCount} result revision(s); refusing to add another history` };
  if (existing.dependencyCount > 0) return { action: "skip", reason: `already has ${existing.dependencyCount} match dependenc(ies); refusing to add more` };
  return { action: "proceed" };
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function matchRowProblems(matches: BackfillMatch[]): string[] {
  const unplaced = matches.filter((m) => !Number.isInteger(m.round) || !Number.isInteger(m.slot) || (m.round ?? 0) < 1 || (m.slot ?? 0) < 1)
    .map((m) => `match ${m.id} has no usable round and slot`);
  const samePlace = duplicates(matches.map((m) => `${m.round}:${m.slot}`)).map((place) => `more than one match at round:slot ${place}`);
  const sameId = duplicates(matches.map((m) => m.id)).map((id) => `match id ${id} is listed twice`);
  const thirdPlace = matches.filter((m) => THIRD_PLACE_LABEL_PATTERN.test(m.roundLabel))
    .map((m) => `match ${m.id} ("${m.roundLabel}") is already a third place match; this backfill does not handle stored third place rows`);
  return [...unplaced, ...samePlace, ...sameId, ...thirdPlace];
}

function inputProblems(input: LegacyBackfillInput): string[] {
  const { event, teams, matches, matchGames } = input;
  const guard = evaluateBackfillGuard(input.existing ?? { phaseCount: 0, resultRevisionCount: 0, dependencyCount: 0 });
  const matchIds = new Set(matches.map((m) => m.id));
  const existing = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  return [
    ...event.format !== "Single Elimination" ? [`format is "${event.format}"; only "Single Elimination" can be backfilled`] : [],
    ...existing.success && existing.data.kind !== "single_elimination" ? [`stored format config is ${existing.data.kind}`] : [],
    ...!input.actorUserId.trim() ? ["an actor user id is required for the result history"] : [],
    ...guard.action === "skip" ? [guard.reason] : [],
    ...teams.length < 2 ? ["an event needs at least two teams"] : [],
    ...duplicates(teams.map((t) => t.id)).map((id) => `team id ${id} is listed twice`),
    ...matches.length ? [] : ["the event has no stored matches"],
    ...matchRowProblems(matches),
    ...matchGames.filter((g) => !matchIds.has(g.matchId)).map((g) => `game ${g.gameNumber} belongs to match ${g.matchId}, which is not a match of this event`),
    ...input.thirdPlace && (!input.thirdPlace.winnerTeamName.trim() || !input.thirdPlace.loserTeamName.trim()) ? ["third place needs both team names"] : [],
  ];
}

function buildGraph(eventId: string, config: SingleEliminationConfig, seeds: SeededTeam[], size: number): { graph: CompetitionGraph | null; problems: string[] } {
  try {
    return { graph: generateCompetitionGraph({ eventId, config, teams: seeds, slotCount: size }), problems: [] };
  } catch (error) {
    return { graph: null, problems: [`the graph cannot be generated from the inferred seeds: ${message(error)}`] };
  }
}

function snapshotOf(row: BackfillMatch, bestOf: number, games: BackfillGame[]): ScoreSnapshot {
  return {
    bestOf,
    games: [...orientedGames(row, games).games].sort((a, b) => a.gameNumber - b.gameNumber).map((g) => ({ gameNumber: g.gameNumber, homeScore: g.homeScore, awayScore: g.awayScore })),
    homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId, homeScore: row.homeScore, awayScore: row.awayScore,
    winnerTeamId: row.winnerTeamId, loserTeamId: row.winnerTeamId === row.homeTeamId ? row.awayTeamId : row.homeTeamId,
  };
}

function thirdPlaceSnapshot(resolution: ThirdPlaceResolution): ScoreSnapshot {
  const homeWon = resolution.winnerTeamId === resolution.homeTeamId;
  return {
    bestOf: 1, games: [], homeTeamId: resolution.homeTeamId, awayTeamId: resolution.awayTeamId,
    homeScore: homeWon ? 1 : 0, awayScore: homeWon ? 0 : 1, winnerTeamId: resolution.winnerTeamId,
    loserTeamId: homeWon ? resolution.awayTeamId : resolution.homeTeamId, scoreRecorded: false,
  };
}

function legacyWrites(rewritten: CompetitionGraph, rows: NodeRows, input: LegacyBackfillInput, phaseId: string) {
  const nodeById = new Map(rewritten.matches.map((node) => [node.id, node]));
  const entries = [...rows.values()].map((row) => ({ row, node: nodeById.get(row.id)!, snapshot: snapshotOf(row, nodeById.get(row.id)!.bestOf, input.matchGames.filter((g) => g.matchId === row.id)) }));
  const matchUpdates: BackfillMatchUpdate[] = entries.map(({ row, node, snapshot }) => ({
    matchId: row.id,
    data: { phaseId, scheduleMetadata: { ...plainObject(row.scheduleMetadata), graphMatch: node }, resultVersion: 1, resultSnapshot: snapshot, resultConfirmedAt: input.now, scheduleStatus: "completed" },
  }));
  const revisions: BackfillRevision[] = entries.map(({ row, snapshot }) => revisionOf(input, row.id, snapshot, BACKFILL_REASON));
  return { matchUpdates, revisions };
}

function revisionOf(input: LegacyBackfillInput, matchId: string, snapshot: ScoreSnapshot, reason: string): BackfillRevision {
  return {
    eventId: input.event.id, matchId, version: 1, homeScore: snapshot.homeScore, awayScore: snapshot.awayScore,
    winnerTeamId: snapshot.winnerTeamId, scoreSnapshot: snapshot, actorUserId: input.actorUserId, reason, idempotencyKey: revisionKey(matchId),
  };
}

function thirdPlaceWrites(resolution: ThirdPlaceResolution, rewritten: CompetitionGraph, input: LegacyBackfillInput, phaseId: string, totalRounds: number) {
  const node = rewritten.matches.find((candidate) => candidate.bracket === "third_place") as CompetitionMatch;
  const snapshot = thirdPlaceSnapshot(resolution);
  const created: BackfillMatchCreate = {
    id: node.id, eventId: input.event.id, phaseId, roundLabel: THIRD_PLACE_LABEL, round: totalRounds + 1, slot: 1,
    homeTeamId: snapshot.homeTeamId, awayTeamId: snapshot.awayTeamId, homeScore: snapshot.homeScore, awayScore: snapshot.awayScore,
    winnerTeamId: resolution.winnerTeamId, status: "Completed", scheduleStatus: "completed", resultVersion: 1,
    resultSnapshot: snapshot, resultConfirmedAt: input.now, scheduleMetadata: { graphMatch: node },
  };
  const reason = `${BACKFILL_REASON}. Skor 1-0 hanya penanda pemenang karena skor asli tidak tercatat. ${input.thirdPlace?.reason ?? ""}`.trim();
  return { created, revision: revisionOf(input, node.id, snapshot, reason) };
}

function phaseOf(rewritten: CompetitionGraph, rows: Pick<Match, "id" | "homeTeamId" | "awayTeamId" | "homeScore" | "awayScore" | "winnerTeamId">[], version: number): BackfillPhase {
  const phase = rewritten.phases[0];
  const projection = competitionProjection(rewritten, rows.map((row) => ({ ...row, resultVersion: 1 })) as unknown as Match[]);
  return {
    id: phase.id, eventId: rewritten.eventId, label: phase.kind, sequence: phase.sequence, status: "active",
    configuration: { ...phase, graph: rewritten, projection: { version, standings: projection.standings, placements: projection.placements } },
  };
}

function warningsOf(input: LegacyBackfillInput): string[] {
  const mirrored = input.matches.filter((row) => {
    const games = input.matchGames.filter((g) => g.matchId === row.id);
    return games.length > 0 && orientedGames(row, games).mirrored;
  });
  return [
    ...input.event.organizerUserId ? [] : ["organizerUserId is NULL: no organizer owns this event, so organizer access checks fail until an owner is set"],
    ...mirrored.length ? [`${mirrored.length} match(es) had game rows with home and away swapped against the series score and winner; mirrored in the result snapshot only, stored games are untouched: ${mirrored.map((row) => row.id).join(", ")}`] : [],
  ];
}

type Verified = { problems: string[]; rewritten: CompetitionGraph | null; rows: NodeRows; third: ThirdPlaceResolution | null };

function verifyAgainstGraph(input: LegacyBackfillInput, graph: CompetitionGraph, name: NameOf): Verified {
  const mapped = mapRowsToNodes(graph, input.matches);
  const structural = [...mapped.problems, ...participantProblems(graph, mapped.rows, name), ...resultProblems(graph, mapped.rows, input.matchGames, name)];
  const third = input.thirdPlace ? resolveThirdPlace(input.thirdPlace, input.teams, graph, mapped.rows, name) : null;
  const idMap = new Map([...mapped.rows].map(([nodeId, row]) => [nodeId, row.id]));
  const rewritten = rewriteGraphIds(graph, idMap);
  const allIds = rewritten.matches.map((node) => node.id);
  const clashes = duplicates(allIds).map((id) => `match id ${id} appears twice in the graph`);
  const existingIds = new Set(input.matches.map((m) => m.id));
  const thirdClash = third?.node && existingIds.has(third.node.id) ? [`third place id ${third.node.id} is already a stored match`] : [];
  return { problems: [...structural, ...third?.problems ?? [], ...clashes, ...thirdClash], rewritten, rows: mapped.rows, third };
}

function assemble(input: LegacyBackfillInput, config: SingleEliminationConfig, notes: string[], seeds: SeededTeam[], totalRounds: number, verified: Verified): LegacyBackfillResult {
  const rewritten = verified.rewritten as CompetitionGraph;
  const phaseId = rewritten.phases[0].id;
  const legacy = legacyWrites(rewritten, verified.rows, input, phaseId);
  const third = verified.third && verified.third.node ? thirdPlaceWrites(verified.third, rewritten, input, phaseId, totalRounds) : null;
  const createdMatches = third ? [third.created] : [];
  const revisions = third ? [...legacy.revisions, third.revision] : legacy.revisions;
  const rowIds = new Set([...input.matches.map((m) => m.id), ...createdMatches.map((m) => m.id)]);
  const dependencies = rewritten.dependencies.map((d) => ({ ...d, eventId: input.event.id }));
  const dangling = dependencies.filter((d) => !rowIds.has(d.sourceMatchId) || !rowIds.has(d.targetMatchId)).map((d) => `dependency ${d.id} points at a match that has no row`);
  if (dangling.length) return { ok: false, problems: dangling };
  const phaseRows = [...input.matches, ...createdMatches];
  const plan: LegacyBackfillPlan = {
    eventId: input.event.id, competitionVersion: input.event.competitionVersion, formatConfig: config, seeds, graph: rewritten,
    phase: phaseOf(rewritten, phaseRows, input.event.competitionVersion + 1), matchUpdates: legacy.matchUpdates, createdMatches, dependencies, revisions,
    actorUserId: input.actorUserId, warnings: warningsOf(input), notes,
  };
  const prediction = predictFromRows(completionRowsFromPlan(plan, input));
  if (!prediction.final?.official) return { ok: false, problems: ["after the backfill the completion reader does not see an official final (internal inconsistency)"] };
  return { ok: true, plan, prediction };
}

/**
 * Plan how a finished old single-elimination event is moved into the V3 data model. Pure: it reads the
 * given rows and returns every write, or every problem found. Nothing is guessed: a bracket that does not
 * match the generated graph exactly is reported, not repaired.
 */
export function planLegacyBackfill(input: LegacyBackfillInput): LegacyBackfillResult {
  const early = inputProblems(input);
  const usable = input.matches.length > 0 && !input.matches.some((m) => !Number.isInteger(m.round) || !Number.isInteger(m.slot));
  if (!usable) return { ok: false, problems: early };
  const inferred = inferBackfillSeeds(input.teams, input.matches);
  const derived = deriveBackfillConfig({
    matches: input.matches, roundConfigs: input.roundConfigs, totalRounds: inferred.rounds,
    withThirdPlace: Boolean(input.thirdPlace), existingConfig: input.event.formatConfig,
  });
  const upfront = [...early, ...inferred.problems, ...derived.problems];
  if (upfront.length || !derived.config) return { ok: false, problems: upfront };
  const built = buildGraph(input.event.id, derived.config, inferred.seeds, inferred.size);
  if (!built.graph) return { ok: false, problems: built.problems };
  const verified = verifyAgainstGraph(input, built.graph, teamNamer(input.teams));
  if (verified.problems.length) return { ok: false, problems: verified.problems };
  return assemble(input, derived.config, derived.notes, inferred.seeds, inferred.rounds, verified);
}
