import type {
  BracketMatch,
  BracketVisibility,
  MatchResultInput,
  PlayerLeaderboardEntry,
  PlayerMatchStatInput,
  StatLine,
  TeamSeed,
  TeamStanding,
} from "./types";
import type { Match } from "../platform/types";

function createMatchId(prefix: string, round: number, slot: number) {
  return `${prefix}-r${round}-m${slot}`;
}

function getBracketSize(participantCap: number) {
  let size = 2;

  while (size < participantCap) {
    size *= 2;
  }

  return size;
}

function getSeedOrder(size: number): number[] {
  if (size === 2) {
    return [1, 2];
  }

  const previous = getSeedOrder(size / 2);
  const next: number[] = [];

  for (const seed of previous) {
    next.push(seed, size + 1 - seed);
  }

  return next;
}

export function generateSingleEliminationBracket(
  teams: TeamSeed[],
  slotCount: 8 | 12 | 16 | 24,
): BracketMatch[] {
  const entrants = teams.slice(0, slotCount);

  if (!entrants.length) {
    return [];
  }

  const bracketSize = getBracketSize(slotCount);
  const seededEntries: (TeamSeed | null)[] = [...entrants];

  while (seededEntries.length < bracketSize) {
    seededEntries.push(null);
  }

  const seedOrder = getSeedOrder(bracketSize);
  const orderedEntries = seedOrder.map((seed) => seededEntries[seed - 1] ?? null);
  const bracket: BracketMatch[] = [];
  let currentRoundEntries = bracketSize;
  let round = 1;

  while (currentRoundEntries >= 2) {
    const matchesInRound = currentRoundEntries / 2;

    for (let slot = 0; slot < matchesInRound; slot += 1) {
      const isFirstRound = round === 1;
      const homeEntry = isFirstRound ? orderedEntries[slot * 2] : null;
      const awayEntry = isFirstRound ? orderedEntries[slot * 2 + 1] : null;
      const byeForTeamId =
        isFirstRound && homeEntry && !awayEntry
          ? homeEntry.id
          : isFirstRound && !homeEntry && awayEntry
            ? awayEntry.id
            : undefined;

      bracket.push({
        id: createMatchId("bracket", round, slot + 1),
        round,
        slot: slot + 1,
        homeTeamId: homeEntry?.id ?? null,
        awayTeamId: awayEntry?.id ?? null,
        ...(byeForTeamId ? { byeForTeamId } : {}),
      });
    }

    currentRoundEntries = matchesInRound;
    round += 1;
  }

  return bracket;
}

function getResolvedWinner(
  match: BracketMatch,
  resultsById: Map<string, Match>,
  resultsByPosition: Map<string, Match>,
) {
  if (match.byeForTeamId) return match.byeForTeamId;

  const result =
    resultsById.get(match.id) ?? resultsByPosition.get(`${match.round}:${match.slot}`);

  if (
    result?.winnerTeamId &&
    match.homeTeamId === result.homeTeamId &&
    match.awayTeamId === result.awayTeamId
  ) {
    return result.winnerTeamId;
  }
  if (match.homeTeamId && !match.awayTeamId) return match.homeTeamId;
  if (!match.homeTeamId && match.awayTeamId) return match.awayTeamId;

  return null;
}

export function projectSingleEliminationBracket(input: {
  teams: TeamSeed[];
  slotCount: 8 | 12 | 16 | 24;
  results: Match[];
}): BracketMatch[] {
  const base = generateSingleEliminationBracket(input.teams, input.slotCount);
  const resultsById = new Map(input.results.map((match) => [match.id, match]));
  const resultsByPosition = new Map(
    input.results
      .filter((match) => match.round !== undefined && match.slot !== undefined)
      .map((match) => [`${match.round}:${match.slot}`, match]),
  );

  for (const match of base.filter((item) => item.round === 1)) {
    match.resolvedWinnerTeamId = getResolvedWinner(match, resultsById, resultsByPosition);
  }

  for (const match of base.filter((item) => item.round > 1)) {
    const previousRound = match.round - 1;
    const sourceSlotStart = (match.slot - 1) * 2 + 1;
    const leftSource =
      base.find((item) => item.round === previousRound && item.slot === sourceSlotStart) ?? null;
    const rightSource =
      base.find((item) => item.round === previousRound && item.slot === sourceSlotStart + 1) ?? null;

    match.sourceMatchIds = [leftSource?.id ?? null, rightSource?.id ?? null];
    match.homeTeamId = leftSource?.resolvedWinnerTeamId ?? null;
    match.awayTeamId = rightSource?.resolvedWinnerTeamId ?? null;
    match.resolvedWinnerTeamId = getResolvedWinner(match, resultsById, resultsByPosition);
  }

  return base;
}

export function getPublicVisibleSingleEliminationBracket(input: {
  teams: TeamSeed[];
  slotCount: 8 | 12 | 16 | 24;
  results: Match[];
}): BracketMatch[] {
  const visibilityByMatchId = new Map<string, boolean>();

  return projectSingleEliminationBracket(input)
    .map((match) => {
      const bothTeamsKnown = Boolean(match.homeTeamId && match.awayTeamId);
      const isAutoAdvanceLeaf = Boolean(match.byeForTeamId && match.round === 1);
      const sourceMatchesArePublic =
        match.round === 1 ||
        match.sourceMatchIds?.every(
          (sourceMatchId) => Boolean(sourceMatchId && visibilityByMatchId.get(sourceMatchId)),
        ) === true;
      const isPublicVisible =
        (bothTeamsKnown || isAutoAdvanceLeaf) && sourceMatchesArePublic;
      const visibility: BracketVisibility = isAutoAdvanceLeaf
        ? "auto-advance"
        : isPublicVisible
          ? "ready"
          : "hidden";

      visibilityByMatchId.set(match.id, isPublicVisible);

      return { ...match, visibility, isPublicVisible };
    })
    .filter((match) => match.isPublicVisible);
}

export function generateRoundRobinSchedule(teams: TeamSeed[]) {
  const schedule: Array<{
    id: string;
    round: number;
    homeTeamId: string;
    awayTeamId: string;
  }> = [];

  for (let homeIndex = 0; homeIndex < teams.length; homeIndex += 1) {
    for (let awayIndex = homeIndex + 1; awayIndex < teams.length; awayIndex += 1) {
      schedule.push({
        id: `league-${teams[homeIndex].id}-${teams[awayIndex].id}`,
        round: schedule.length + 1,
        homeTeamId: teams[homeIndex].id,
        awayTeamId: teams[awayIndex].id,
      });
    }
  }

  return schedule;
}

export function buildLeagueStandings(teams: TeamSeed[], results: MatchResultInput[]) {
  const lookup = new Map<string, TeamStanding>();

  for (const team of teams) {
    lookup.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDifference: 0,
      rank: 0,
    });
  }

  for (const result of results) {
    const home = lookup.get(result.homeTeamId);
    const away = lookup.get(result.awayTeamId);

    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;

    home.scoreFor += result.homeScore;
    home.scoreAgainst += result.awayScore;
    away.scoreFor += result.awayScore;
    away.scoreAgainst += result.homeScore;

    if (result.homeScore > result.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (result.awayScore > result.homeScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const standings = [...lookup.values()]
    .map((standing) => ({
      ...standing,
      scoreDifference: standing.scoreFor - standing.scoreAgainst,
    }))
    .sort((left, right) => {
      return (
        right.points - left.points ||
        right.scoreDifference - left.scoreDifference ||
        right.scoreFor - left.scoreFor ||
        left.teamName.localeCompare(right.teamName)
      );
    })
    .map((standing, index) => ({
      ...standing,
      rank: index + 1,
    }));

  return standings;
}

function mergeStats(current: StatLine, incoming: StatLine) {
  const merged = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = (merged[key] ?? 0) + value;
  }

  return merged;
}

export function aggregatePlayerLeaderboard(
  playerStats: PlayerMatchStatInput[],
  primaryMetric: string,
): PlayerLeaderboardEntry[] {
  const lookup = new Map<string, PlayerLeaderboardEntry>();

  for (const stat of playerStats) {
    const existing = lookup.get(stat.playerId);

    if (!existing) {
      lookup.set(stat.playerId, {
        playerId: stat.playerId,
        playerName: stat.playerName,
        teamId: stat.teamId,
        position: stat.position,
        gameSlug: stat.gameSlug,
        matchesPlayed: 1,
        totalStats: { ...stat.stats },
      });
      continue;
    }

    existing.matchesPlayed += 1;
    existing.totalStats = mergeStats(existing.totalStats, stat.stats);
  }

  return [...lookup.values()].sort((left, right) => {
    return (
      (right.totalStats[primaryMetric] ?? 0) - (left.totalStats[primaryMetric] ?? 0) ||
      right.matchesPlayed - left.matchesPlayed ||
      left.playerName.localeCompare(right.playerName)
    );
  });
}

export function getLiveStreamPresentation(streamUrl: string) {
  if (streamUrl.includes("youtube.com/watch?v=")) {
    const url = new URL(streamUrl);
    const videoId = url.searchParams.get("v");

    return {
      platform: "youtube" as const,
      shouldEmbed: true,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : null,
      watchUrl: streamUrl,
    };
  }

  if (streamUrl.includes("youtu.be/")) {
    const videoId = streamUrl.split("youtu.be/")[1]?.split("?")[0];

    return {
      platform: "youtube" as const,
      shouldEmbed: true,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : null,
      watchUrl: streamUrl,
    };
  }

  if (streamUrl.includes("tiktok.com")) {
    return {
      platform: "tiktok" as const,
      shouldEmbed: false,
      embedUrl: null,
      watchUrl: streamUrl,
    };
  }

  return {
    platform: "external" as const,
    shouldEmbed: false,
    embedUrl: null,
    watchUrl: streamUrl,
  };
}
