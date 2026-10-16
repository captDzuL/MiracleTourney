// Player stats reads: form context, completed matches, Flashpeak leaderboard.
// Moved out of platform/repository.ts without changes (refactor PR 2.10).

import { getStatKeysForMode } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { aggregateFlashpeakLeaderboard, parsePlayerScoreArray } from "@/lib/player-stats/flashpeak";
import type { FlashpeakLeaderboardEntry, FlashpeakLeaderboardSource } from "@/lib/player-stats/flashpeak";
import { resolvePlayerScoreGameNumbers } from "@/lib/player-stats/form";
import type { PlayerStatPayloadMap } from "@/lib/player-stats/form";

export type CompletedMatchRow = {
  matchId: string;
  matchLabel: string;
  slot: number | null;
  eventId: string;
  eventName: string;
  gameId: string;
  gameModeId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  scoreGameNumbers: number[] | null;
  submission: {
    id: string;
    status: string;
    rejectionNote: string | null;
    stats: PlayerStatPayloadMap;
  } | null;
};

export type PlayerStatFormContext = {
  match: {
    id: string;
    eventId: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
  };
  allowedStatKeys: string[];
  scoreGameNumbers: number[] | null;
};

export async function getPlayerStatFormContext(matchId: string, eventId: string): Promise<PlayerStatFormContext> {
  const match = await prisma.match.findFirst({
    where: { id: matchId, eventId, status: "Completed" },
    select: {
      id: true,
      eventId: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      roundLabel: true,
      resultSnapshot: true,
      games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
      event: { select: { gameId: true, gameModeId: true } },
    },
  });
  if (!match) throw new Error("Completed match not found.");
  const allowedStatKeys = getStatKeysForMode(match.event.gameModeId, match.event.gameId);
  if (match.event.gameId !== "game-flashpeak") {
    return {
      match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      allowedStatKeys,
      scoreGameNumbers: null,
    };
  }
  const roundConfig = await prisma.eventRoundConfig.findUnique({
    where: { eventId_roundLabel: { eventId, roundLabel: match.roundLabel } },
    select: { bestOf: true },
  });
  const snapshotBestOf = match.resultSnapshot && typeof match.resultSnapshot === "object" && !Array.isArray(match.resultSnapshot)
    && Number.isSafeInteger((match.resultSnapshot as { bestOf?: unknown }).bestOf)
    ? Number((match.resultSnapshot as { bestOf: number }).bestOf)
    : null;
  const scoreGameNumbers = resolvePlayerScoreGameNumbers({
    matchGames: match.games,
    resultSnapshot: match.resultSnapshot,
    roundBestOf: roundConfig?.bestOf ?? snapshotBestOf ?? 1,
  });
  return {
    match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
    allowedStatKeys,
    scoreGameNumbers,
  };
}

/**
 * Reads the V3 Flashpeak leaderboard from completed matches only.
 *
 * This public discovery path intentionally has no demo fallback: an unavailable
 * database must produce an honest empty/error state instead of invented players.
 */
export type FlashpeakLeaderboardReadResult = {
  status: "ready" | "empty" | "error";
  entries: FlashpeakLeaderboardEntry[];
};

export async function getFlashpeakLeaderboardForEventResult(
  eventId: string,
): Promise<FlashpeakLeaderboardReadResult> {
  try {
    const rows = await prisma.playerStat.findMany({
      where: {
        gameSlug: "flashpeak",
        match: { eventId, status: "Completed" },
      },
      select: {
        matchId: true,
        teamId: true,
        stats: true,
        match: {
          select: {
            resultSnapshot: true,
            games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
          },
        },
        player: {
          select: {
            id: true,
            displayName: true,
            nickname: true,
            position: true,
            team: { select: { id: true, name: true, eventId: true } },
          },
        },
      },
    });
    const sources: FlashpeakLeaderboardSource[] = rows.flatMap((row) => {
      const stored = row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? row.stats as Record<string, unknown>
        : null;
      try {
        if (row.teamId !== row.player.team.id || row.player.team.eventId !== eventId) {
          throw new Error("PlayerStat roster identity does not match its event.");
        }
        if (stored && "scores" in stored) {
          const gameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: row.match.games,
            resultSnapshot: row.match.resultSnapshot,
            roundBestOf: 1,
          });
          if (!Array.isArray(stored.scores)) throw new Error("Invalid stored player score array.");
          parsePlayerScoreArray(stored.scores, gameNumbers.length);
        }
      } catch (error) {
        console.error("Ignoring invalid Flashpeak PlayerStat row", { eventId, matchId: row.matchId, playerId: row.player.id, error });
        return [];
      }
      return [{
        matchId: row.matchId,
        playerId: row.player.id,
        playerName: row.player.displayName,
        nickname: row.player.nickname,
        teamId: row.player.team.id,
        teamName: row.player.team.name,
        position: row.player.position,
        stats: row.stats,
      }];
    });
    const entries = aggregateFlashpeakLeaderboard(sources);
    if (rows.length === 0) return { status: "empty", entries };
    if (sources.length === 0 || entries.length === 0) return { status: "error", entries: [] };
    return { status: "ready", entries };
  } catch (error) {
    console.error("Failed to load Flashpeak leaderboard", { eventId, error });
    return { status: "error", entries: [] };
  }
}

export async function getFlashpeakLeaderboardForEvent(
  eventId: string,
): Promise<FlashpeakLeaderboardEntry[]> {
  return (await getFlashpeakLeaderboardForEventResult(eventId)).entries;
}

/**
 * Returns all completed matches where the captain's teams participated, including stat submission status.
 * Batches event/team/submission lookups in a single `Promise.all` to avoid N+1 queries.
 */
export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]> {
  const captainTeams = await prisma.team.findMany({
    where: { captainId },
    select: { id: true, name: true, eventId: true },
  });
  if (captainTeams.length === 0) return [];

  const eventTeams = captainTeams.filter((team): team is (typeof captainTeams)[number] & { eventId: string } => Boolean(team.eventId));
  if (eventTeams.length === 0) return [];

  const teamIds = eventTeams.map((t) => t.id);
  const eventIds = [...new Set(eventTeams.map((t) => t.eventId))];

  const [matches, events, allTeams, submissions, roundConfigs] = await Promise.all([
    prisma.match.findMany({
      where: {
        eventId: { in: eventIds },
        status: "Completed",
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
      include: { games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } } },
    }),
    prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true, gameId: true, gameModeId: true },
    }),
    prisma.team.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, name: true, eventId: true },
    }),
    prisma.statSubmission.findMany({
      where: { teamId: { in: teamIds } },
    }),
    prisma.eventRoundConfig.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, roundLabel: true, bestOf: true },
    }),
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e]));
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));
  const submissionMap = new Map(submissions.map((s) => [`${s.matchId}::${s.teamId}`, s]));

  return matches.flatMap((match) => {
    const rows: CompletedMatchRow[] = [];
    for (const team of captainTeams) {
      const isHome = match.homeTeamId === team.id;
      const isAway = match.awayTeamId === team.id;
      if (!isHome && !isAway) continue;

      const event = eventMap.get(match.eventId);
      if (!event) continue;

      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = teamMap.get(opponentId);
      const submission = submissionMap.get(`${match.id}::${team.id}`) ?? null;
      const roundBestOf = roundConfigs.find((config) => config.eventId === event.id && config.roundLabel === match.roundLabel)?.bestOf ?? 1;
      let scoreGameNumbers: number[] | null = null;
      if (event.gameId === "game-flashpeak") {
        try {
          scoreGameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: match.games,
            resultSnapshot: match.resultSnapshot,
            roundBestOf,
          });
        } catch {
          scoreGameNumbers = [];
        }
      }

      rows.push({
        matchId: match.id,
        matchLabel: match.roundLabel,
        slot: match.slot,
        eventId: event.id,
        eventName: event.name,
        gameId: event.gameId,
        gameModeId: event.gameModeId,
        teamId: team.id,
        teamName: team.name,
        opponentName: opponent?.name ?? "Unknown",
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        scoreGameNumbers,
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              rejectionNote: submission.rejectionNote,
              stats: submission.stats as PlayerStatPayloadMap,
            }
          : null,
      });
    }
    return rows;
  });
}

/**
 * Verifies that a captain-submitted stat form targets one of their completed matches.
 * Hidden form IDs are attacker-controlled, so every relationship is rechecked server-side.
 */
export async function assertCaptainCanSubmitStats(input: {
  captainId: string;
  matchId: string;
  teamId: string;
  eventId: string;
}): Promise<void> {
  const match = await prisma.match.findFirst({
    where: {
      id: input.matchId,
      eventId: input.eventId,
      status: "Completed",
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });
  if (!match) {
    throw new Error("Not authorized");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: input.teamId,
      eventId: input.eventId,
      captainId: input.captainId,
    },
    select: { id: true },
  });
  if (!team) {
    throw new Error("Not authorized");
  }
}
