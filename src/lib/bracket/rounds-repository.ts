// Round configs and per-match games.
// Moved out of platform/repository.ts without changes (refactor PR 2.6).

import { getProjectedBracketMatches, legacyResultTransaction } from "@/lib/bracket/repository";
import { games } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { CACHE_TAGS } from "@/lib/platform/shared/constants";
import { mapEvent } from "@/lib/platform/shared/mappers";
import type { EventRoundConfig, MatchGame } from "@/lib/platform/types";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/** Returns all Best-of-N round configurations for an event (one per round label). Cached 30s under tag "teams". */
export const getEventRoundConfigs = cache(
  unstable_cache(
    async (eventId: string): Promise<EventRoundConfig[]> => {
      try {
        const rows = await prisma.eventRoundConfig.findMany({ where: { eventId } });
        return rows.map((r) => ({ id: r.id, eventId: r.eventId, roundLabel: r.roundLabel, bestOf: r.bestOf }));
      } catch {
        return [];
      }
    },
    ["event-round-configs"],
    { revalidate: 30, tags: [CACHE_TAGS.teams] },
  ),
);

/** Creates or updates the Best-of-N setting for a specific round label within an event. */
export async function upsertRoundConfig(eventId: string, roundLabel: string, bestOf: number): Promise<void> {
  if (![1, 3, 5].includes(bestOf)) throw new Error("Invalid event round configuration");
  await legacyResultTransaction(eventId, tx => tx.eventRoundConfig.upsert({
    where: { eventId_roundLabel: { eventId, roundLabel } },
    update: { bestOf },
    create: { eventId, roundLabel, bestOf },
  }));
}

/** Returns per-game scores for a single match, ordered by game number ascending. */
export async function getMatchGames(matchId: string): Promise<MatchGame[]> {
  const rows = await prisma.matchGame.findMany({ where: { matchId }, orderBy: { gameNumber: "asc" } });
  return rows.map((r) => ({ id: r.id, matchId: r.matchId, gameNumber: r.gameNumber, homeScore: r.homeScore, awayScore: r.awayScore }));
}

export const _getMatchGamesForEventCached = cache(
  unstable_cache(
    async (eventId: string): Promise<Array<{ matchId: string; games: MatchGame[] }>> => {
      let rows;
      try {
        rows = await prisma.matchGame.findMany({
          where: { match: { eventId } },
          orderBy: { gameNumber: "asc" },
        });
      } catch {
        return [];
      }
      const acc: Record<string, MatchGame[]> = {};
      for (const row of rows) {
        (acc[row.matchId] ??= []).push({ id: row.id, matchId: row.matchId, gameNumber: row.gameNumber, homeScore: row.homeScore, awayScore: row.awayScore });
      }
      return Object.entries(acc).map(([matchId, games]) => ({ matchId, games }));
    },
    ["match-games-for-event"],
    { revalidate: 30, tags: [CACHE_TAGS.teams] },
  ),
);

/**
 * Fetches all per-game scores for every match in an event in one query.
 * Returns a Map keyed by matchId for O(1) lookup during bracket page rendering.
 * Cached 30s under tag "teams" so score detail panels stay fresh after match saves.
 */
export async function getMatchGamesForEvent(eventId: string): Promise<Map<string, MatchGame[]>> {
  try {
    const entries = await _getMatchGamesForEventCached(eventId);
    return new Map(entries.map((e) => [e.matchId, e.games]));
  } catch {
    return new Map();
  }
}

/**
 * Saves per-game scores for a Best-of-N match. Automatically stops counting games once
 * a series winner is reached (`ceil(bestOf / 2)` wins). Upserts the parent Match row
 * with series win counts and deletes+recreates MatchGame rows atomically.
 * Throws if the match or event is not found.
 */
export async function setMatchGames(
  matchId: string,
  eventId: string,
  games: { gameNumber: number; homeScore: number; awayScore: number }[],
): Promise<void> {
  return legacyResultTransaction(eventId, tx => setLegacyMatchGames(tx, matchId, eventId, games));
}

export async function setLegacyMatchGames(
  prisma: Prisma.TransactionClient,
  matchId: string,
  eventId: string,
  games: { gameNumber: number; homeScore: number; awayScore: number }[],
): Promise<void> {
  let homeTeamId: string;
  let awayTeamId: string;
  let roundLabel: string;
  let round: number | null = null;
  let slot: number | null = null;

  const existingRow = await prisma.match.findFirst({ where: { id: matchId, eventId } });
  if (existingRow?.phaseId || (existingRow?.resultVersion ?? 0) > 0) {
    throw new Error("Use the versioned competition operation to submit or correct this result.");
  }
  if (existingRow) {
    homeTeamId = existingRow.homeTeamId;
    awayTeamId = existingRow.awayTeamId;
    roundLabel = existingRow.roundLabel;
    round = existingRow.round;
    slot = existingRow.slot;
  } else {
    const fullEvent = await prisma.event.findUnique({ where: { id: eventId } });
    if (!fullEvent) throw new Error("Event not found");
    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }), prisma);
    const projMatch = projected.find((m) => m.id === matchId);
    if (!projMatch) throw new Error("Match not found");
    homeTeamId = projMatch.homeTeamId;
    awayTeamId = projMatch.awayTeamId;
    roundLabel = projMatch.roundLabel;
    round = projMatch.round ?? null;
    slot = projMatch.slot ?? null;
  }

  const roundRule = await prisma.eventRoundConfig.findUnique({
    where: { eventId_roundLabel: { eventId, roundLabel } },
    select: { bestOf: true },
  });
  const bestOf = roundRule?.bestOf ?? 1;
  if (![1, 3, 5].includes(bestOf)) throw new Error("Invalid event round configuration");
  const winsNeeded = Math.ceil(bestOf / 2);
  let homeWins = 0;
  let awayWins = 0;
  const playedGames: typeof games = [];

  for (const game of [...games].sort((a, b) => a.gameNumber - b.gameNumber)) {
    if (playedGames.length >= bestOf || homeWins >= winsNeeded || awayWins >= winsNeeded) break;
    playedGames.push(game);
    if (game.homeScore > game.awayScore) homeWins++;
    else if (game.awayScore > game.homeScore) awayWins++;
  }

  const winnerTeamId =
    homeWins >= winsNeeded ? homeTeamId : awayWins >= winsNeeded ? awayTeamId : null;

    await prisma.match.upsert({
      where: { id: matchId },
      update: {
        homeScore: homeWins,
        awayScore: awayWins,
        status: winnerTeamId ? "Completed" : "Scheduled",
        winnerTeamId,
      },
      create: {
        id: matchId, eventId, roundLabel, homeTeamId, awayTeamId,
        homeScore: homeWins, awayScore: awayWins,
        status: winnerTeamId ? "Completed" : "Scheduled",
        round, slot, winnerTeamId,
      },
    });
    await prisma.matchGame.deleteMany({ where: { matchId } });
    await prisma.matchGame.createMany({
      data: playedGames.map((g) => ({ matchId, gameNumber: g.gameNumber, homeScore: g.homeScore, awayScore: g.awayScore })),
    });
}
