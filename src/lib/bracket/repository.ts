// Matches, bracket lock, bracket preview, standings and match results.
// Moved out of platform/repository.ts without changes (refactor PR 2.5).

import { getBracketSlotCount } from "@/lib/events/repository";
import { findGameConfig, getGamePrimaryStatKey } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { CACHE_TAGS } from "@/lib/platform/shared/constants";
import { mapEvent, mapMatch, mapTeam } from "@/lib/platform/shared/mappers";
import { readEventRosterLocked } from "@/lib/platform/shared/tx";
import type { Event, Match } from "@/lib/platform/types";
import { getTeamsForEvent } from "@/lib/teams/repository";
import { aggregatePlayerLeaderboard, buildLeagueStandings, generateRoundRobinSchedule, getPublicVisibleSingleEliminationBracket, projectSingleEliminationBracket } from "@/lib/tournament/engine";
import type { BracketMatch, MatchResultInput, PlayerMatchStatInput } from "@/lib/tournament/types";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/**
 * Cached (30s, tag "teams") match list for an event. Busted alongside teams so bracket
 * projection always reflects fresh results after any match mutation.
 * Also memoised per-request via React cache.
 */
export const getMatchesForEvent = cache(
  unstable_cache(
    async (eventId: string): Promise<Match[]> => {
      const rows = await prisma.match.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
      return rows.map(mapMatch);
    },
    ["matches-for-event"],
    { revalidate: 30, tags: [CACHE_TAGS.teams] },
  ),
);

/** Returns true for every format once the public drawing or tournament is authoritative. */
export async function isEventBracketLocked(eventId: string): Promise<boolean> {
  return readEventRosterLocked(prisma, eventId);
}

export function getBracketRoundLabel(round: number, totalRounds: number) {
  const roundsRemaining = totalRounds - round + 1;
  if (roundsRemaining === 1) return "Final";
  if (roundsRemaining === 2) return "Semifinal";
  if (roundsRemaining === 3) return "Quarterfinal";
  if (roundsRemaining === 4) return "Round of 16";
  return `Round ${round}`;
}

export async function getProjectedBracketMatches(event: Event, database?: Prisma.TransactionClient): Promise<Match[]> {
  const teams = database
    ? (await database.team.findMany({ where: { eventId: event.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(mapTeam)
    : await getTeamsForEvent(event.id);
  const existingMatches = database
    ? (await database.match.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } })).map(mapMatch)
    : await getMatchesForEvent(event.id);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const bracket = projectSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: getBracketSlotCount(teams.length),
    results: existingMatches,
    eventId: event.id,
  }) as BracketMatch[];
  const existingBySlot = new Map(
    existingMatches
      .filter((m) => m.round != null && m.slot != null)
      .map((m) => [`${m.round}:${m.slot}`, m]),
  );
  const totalRounds = Math.max(...bracket.map((match) => match.round), 1);

  return bracket
    .filter((match) => Boolean(match.homeTeamId && match.awayTeamId))
    .map((match) => {
      const existing = match.round != null && match.slot != null
        ? existingBySlot.get(`${match.round}:${match.slot}`)
        : undefined;
      const aligned = existing ?? null;
      return {
        id: match.id, eventId: event.id,
        roundLabel: getBracketRoundLabel(match.round, totalRounds),
        homeTeamId: match.homeTeamId!, awayTeamId: match.awayTeamId!,
        homeScore: aligned?.homeScore ?? 0, awayScore: aligned?.awayScore ?? 0,
        status: aligned?.status ?? "Scheduled",
        round: match.round, slot: match.slot,
        winnerTeamId: aligned?.winnerTeamId ?? null,
      } satisfies Match;
    })
    .sort((l, r) => (l.round! - r.round!) || (l.slot! - r.slot!));
}

/**
 * Returns the admin-facing list of bracket matches for an event object.
 * For single-elimination: projects the bracket and merges recorded results.
 * For league: returns stored matches with round/slot set.
 */
export async function getBracketManageableMatchesForEvent(event: Event): Promise<Match[]> {
  if (event.format === "Single Elimination") {
    return getProjectedBracketMatches(event);
  }
  const rows = await prisma.match.findMany({
    where: { eventId: event.id, round: { not: null }, slot: { not: null } },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  return rows.map(mapMatch);
}

/**
 * Saves a BO1 match result (direct scores). Draws are rejected for single-elimination.
 * If the match row doesn't exist yet, it is created from the projected bracket.
 * Returns null if the event or match is not found.
 */
export async function legacyResultTransaction<T>(eventId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    // Serialize with V3's event CAS and invalidate a concurrent initializer's
    // snapshot. Rejection rolls the version increment back with the write.
    const locked = await tx.event.updateMany({ where: { id: eventId }, data: { competitionVersion: { increment: 1 } } });
    if (locked.count !== 1) throw new Error("Event not found");
    const completion = await tx.tournamentCompletion.findUnique({
      where: { eventId },
      select: { status: true },
    });
    if (completion?.status === "completed") throw new Error("Tournament completion locks competitive writes");
    if (await tx.competitionPhase.count({ where: { eventId } })) throw new Error("Use the versioned competition operation to submit or correct this result.");
    return work(tx);
  });
}

export async function setMatchResult(input: {
  eventId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}): Promise<Match | null> {
  return legacyResultTransaction(input.eventId, tx => setLegacyMatchResult(tx, input));
}

export async function setLegacyMatchResult(prisma: Prisma.TransactionClient, input: { eventId: string; matchId: string; homeScore: number; awayScore: number }): Promise<Match | null> {
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { format: true } });
  if (!event) return null;

  if (event.format === "Single Elimination" && input.homeScore === input.awayScore) {
    throw new Error("Single elimination matches cannot end in a draw.");
  }

  const existingRow = await prisma.match.findFirst({
    where: { id: input.matchId, eventId: input.eventId },
  });
  if (existingRow?.phaseId || (existingRow?.resultVersion ?? 0) > 0) {
    throw new Error("Use the versioned competition operation to submit or correct this result.");
  }

  let homeTeamId: string;
  let awayTeamId: string;
  let roundLabel: string;
  let round: number | null = null;
  let slot: number | null = null;

  if (existingRow) {
    homeTeamId = existingRow.homeTeamId;
    awayTeamId = existingRow.awayTeamId;
    roundLabel = existingRow.roundLabel;
    round = existingRow.round;
    slot = existingRow.slot;
  } else if (event.format === "Single Elimination") {
    const fullEvent = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!fullEvent) return null;
    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }));
    const projMatch = projected.find((m) => m.id === input.matchId);
    if (!projMatch) return null;
    homeTeamId = projMatch.homeTeamId;
    awayTeamId = projMatch.awayTeamId;
    roundLabel = projMatch.roundLabel;
    round = projMatch.round ?? null;
    slot = projMatch.slot ?? null;
  } else {
    return null;
  }

  // A drawn match (only possible outside Single Elimination) has no winner.
  const winnerTeamId = input.homeScore > input.awayScore ? homeTeamId : input.awayScore > input.homeScore ? awayTeamId : null;

  const row = await prisma.match.upsert({
    where: { id: input.matchId },
    update: { homeScore: input.homeScore, awayScore: input.awayScore, status: "Completed", winnerTeamId },
    create: {
      id: input.matchId, eventId: input.eventId, roundLabel, homeTeamId, awayTeamId,
      homeScore: input.homeScore, awayScore: input.awayScore,
      status: "Completed", round, slot, winnerTeamId,
    },
  });

  return mapMatch(row);
}

export const _getLeaderboardForEvent = unstable_cache(
  async (eventId: string, gameId: string) => {
    const game = findGameConfig(gameId);
    if (!game) return [];

    const metric = getGamePrimaryStatKey(game.id);
    const playerIds = (await prisma.player.findMany({ where: { eventId }, select: { id: true } })).map((p) => p.id);
    const stats = await prisma.playerStat.findMany({
      where: { gameSlug: game.slug, playerId: { in: playerIds } },
    });

    const statInputs: PlayerMatchStatInput[] = stats.map((s) => ({
      matchId: s.matchId,
      playerId: s.playerId,
      playerName: s.playerName,
      teamId: s.teamId,
      position: s.position,
      gameSlug: s.gameSlug,
      stats: s.stats as Record<string, number>,
    }));

    return aggregatePlayerLeaderboard(statInputs, metric);
  },
  ["leaderboard-for-event"],
  { revalidate: 60, tags: [CACHE_TAGS.stats] },
);

/**
 * Returns the player leaderboard for an event, aggregated from approved stat submissions.
 * Cached (60s, tag "stats"). Primary metric is "goals" for Flashpeak, "points" for others.
 */
export async function getLeaderboardForEvent(eventId: string, gameId?: string) {
  const resolvedGameId = gameId ?? (await prisma.event.findUnique({ where: { id: eventId }, select: { gameId: true } }))?.gameId;
  if (!resolvedGameId) return [];
  return _getLeaderboardForEvent(eventId, resolvedGameId);
}

/** Computes league standings from completed match results for an event. Ranked by points → score diff → score for. */
export async function getTeamStandings(eventId: string) {
  const teams = await getTeamsForEvent(eventId);
  const matches = await getMatchesForEvent(eventId);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const results: MatchResultInput[] = matches
    .filter((match) => match.status === "Completed")
    .map((match) => ({
      id: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    }));

  return buildLeagueStandings(teamSeeds, results);
}

/**
 * Returns the fully projected bracket (all rounds, including downstream TBD slots).
 * For single-elimination: uses `projectSingleEliminationBracket` with all results applied.
 * For league: returns the round-robin schedule. Used internally and in the admin bracket view.
 */
export async function getBracketPreview(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return [];

  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));

  if (event.format === "Single Elimination") {
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount: getBracketSlotCount(teams.length),
      results: matches,
      eventId,
    });
  }

  return generateRoundRobinSchedule(teamSeeds);
}

/**
 * Returns the public-visible bracket. Before kickoff (Published/Registration Closed),
 * hides downstream rounds until both teams are known. After kickoff (Ongoing/Finished),
 * shows the full projected bracket including TBD placeholders for undecided rounds.
 */
export async function getPublicVisibleBracketPreview(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.format !== "Single Elimination") return getBracketPreview(eventId);

  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const slotCount = getBracketSlotCount(teams.length);

  // Once the event is live (or finished), the bracket is locked in — show the
  // fully projected bracket so every round's cards render (including TBD
  // placeholders for rounds that haven't been decided yet), instead of the
  // "only reveal what's already determined" view used before kickoff.
  if (event.status === "Ongoing" || event.status === "Finished") {
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount,
      results: matches,
      eventId,
    });
  }

  return getPublicVisibleSingleEliminationBracket({
    teams: teamSeeds,
    slotCount,
    results: matches,
    eventId,
  });
}
