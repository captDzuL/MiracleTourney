import type { Prisma } from "@prisma/client";
import type { CompetitionGraph } from "../competition";
import { tournamentFormatConfigSchema } from "../formats/types";
import type { CompletionSourceRows } from "@/lib/completion/prisma-adapter";
import type { BackfillExisting, LegacyBackfillInput, ThirdPlaceSpec } from "./legacy-backfill-types";

type Tx = Prisma.TransactionClient;
const ROW_LIMIT = 5_000;

const PLAYER_STAT_SELECT = {
  matchId: true, playerId: true, playerName: true, teamId: true, source: true, stats: true,
  player: { select: { id: true, teamId: true, eventId: true, displayName: true, nickname: true } },
} as const;

export async function readExisting(tx: Tx, eventId: string): Promise<BackfillExisting> {
  const [phaseCount, resultRevisionCount, dependencyCount] = await Promise.all([
    tx.competitionPhase.count({ where: { eventId } }),
    tx.matchResultRevision.count({ where: { eventId } }),
    tx.matchDependency.count({ where: { eventId } }),
  ]);
  return { phaseCount, resultRevisionCount, dependencyCount };
}

/** Everything the planner needs, read through one transaction. Reads only. */
export async function loadBackfillInput(
  tx: Tx,
  eventId: string,
  options: { actorUserId: string; now: Date; thirdPlace?: ThirdPlaceSpec },
): Promise<LegacyBackfillInput> {
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
  const [teams, matches, roundConfigs, matchGames, existing, playerStats, submissions] = await Promise.all([
    tx.team.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.match.findMany({ where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }] }),
    tx.eventRoundConfig.findMany({ where: { eventId }, select: { roundLabel: true, bestOf: true } }),
    tx.matchGame.findMany({ where: { match: { eventId } }, select: { matchId: true, gameNumber: true, homeScore: true, awayScore: true } }),
    readExisting(tx, eventId),
    tx.playerStat.findMany({ where: { match: { eventId } }, select: PLAYER_STAT_SELECT, take: ROW_LIMIT }),
    tx.statSubmission.findMany({ where: { eventId, status: "approved" }, select: { matchId: true, teamId: true }, take: ROW_LIMIT }),
  ]);
  return {
    event: {
      id: event.id, slug: event.slug, format: event.format, formatConfig: event.formatConfig,
      organizerUserId: event.organizerUserId, competitionVersion: event.competitionVersion, gameId: event.gameId, gameModeId: event.gameModeId,
    },
    teams,
    matches: matches.map((m) => ({
      id: m.id, round: m.round, slot: m.slot, roundLabel: m.roundLabel, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore, winnerTeamId: m.winnerTeamId, status: m.status, resultVersion: m.resultVersion,
      scheduleMetadata: m.scheduleMetadata,
    })),
    roundConfigs,
    matchGames,
    thirdPlace: options.thirdPlace,
    actorUserId: options.actorUserId,
    now: options.now,
    existing,
    playerStats,
    approvedSubmissions: submissions,
  };
}

/** The rows the completion workspace reads for this event, as they stand in the database now. */
export async function loadCompletionRows(tx: Tx, eventId: string): Promise<CompletionSourceRows> {
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, formatConfig: true, gameId: true, gameModeId: true } });
  const format = tournamentFormatConfigSchema.safeParse(event.formatConfig);
  if (!format.success) throw new Error("Competition format is unavailable");
  const [phase, matches, revisions, incidents, teams, playerStats, submissions] = await Promise.all([
    tx.competitionPhase.findFirst({ where: { eventId, sequence: 1 }, select: { configuration: true } }),
    tx.match.findMany({ where: { eventId } }),
    tx.matchResultRevision.findMany({ where: { eventId }, orderBy: [{ matchId: "asc" }, { version: "desc" }] }),
    tx.competitionIncident.findMany({ where: { eventId, resolvedAt: null }, select: { id: true, matchId: true, resolvedAt: true } }),
    tx.team.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.playerStat.findMany({ where: { match: { eventId } }, select: PLAYER_STAT_SELECT, take: ROW_LIMIT }),
    tx.statSubmission.findMany({ where: { eventId, status: "approved" }, select: { matchId: true, teamId: true }, take: ROW_LIMIT }),
  ]);
  const graph = (phase?.configuration as unknown as { graph?: CompetitionGraph } | null)?.graph ?? null;
  return {
    event: { id: event.id, formatConfig: format.data, gameId: event.gameId, gameModeId: event.gameModeId },
    graph,
    matches: matches.map((m) => ({
      id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore,
      winnerTeamId: m.winnerTeamId, resultVersion: m.resultVersion, status: m.status, scheduleStatus: m.scheduleStatus,
    })),
    revisions,
    incidents,
    teams: teams.map(({ id, name }) => ({ id, name: name || id })),
    playerStats,
    approvedSubmissions: submissions,
  };
}
