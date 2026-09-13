export const FLASHPEAK_NUMERIC_STAT_KEYS = ["goal", "assist", "passing", "defense"] as const;
export type FlashpeakNumericStatKey = (typeof FLASHPEAK_NUMERIC_STAT_KEYS)[number];
export type LeaderboardSortKey = "game" | "score" | FlashpeakNumericStatKey;
export type LeaderboardSortDirection = "asc" | "desc";

export type FlashpeakStatPayload = {
  scores: Array<number | null>;
  goal: number;
  assist: number;
  passing: number;
  defense: number;
};

export type FlashpeakLeaderboardSource = {
  matchId: string;
  playerId: string;
  playerName: string;
  nickname: string;
  teamId: string;
  teamName: string;
  position: string;
  stats: unknown;
};

export type FlashpeakLeaderboardEntry = {
  playerId: string;
  playerName: string;
  nickname: string;
  teamId: string;
  teamName: string;
  position: string;
  game: number;
  score: number | null;
  goal: number;
  assist: number;
  passing: number;
  defense: number;
};

function isPlayerScore(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 10
    && Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 10;
}

function scoreValue(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("Invalid player score.");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!isPlayerScore(parsed)) throw new Error("Invalid player score.");
  return parsed;
}

export function parsePlayerScoreArray(values: readonly unknown[], expectedLength: number): Array<number | null> {
  if (!Number.isSafeInteger(expectedLength) || expectedLength < 1 || values.length !== expectedLength) {
    throw new Error("Invalid player score array length.");
  }
  return values.map(scoreValue);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function metric(input: Record<string, unknown>, canonical: FlashpeakNumericStatKey, legacy?: string): number {
  const direct = nonNegativeNumber(input[canonical]);
  if (direct !== null) return direct;
  const fallback = legacy ? nonNegativeNumber(input[legacy]) : null;
  return fallback ?? 0;
}

export function readFlashpeakStatPayload(value: unknown): FlashpeakStatPayload {
  const input = record(value) ?? {};
  let scores: number[] = [];
  if (Array.isArray(input.scores)) {
    const parsed = input.scores.map((item) => item === null ? null : isPlayerScore(item) ? item : undefined);
    if (parsed.every((item) => item !== undefined)) {
      scores = parsed.filter((item): item is number => typeof item === "number");
    }
  }
  return {
    scores,
    goal: metric(input, "goal", "goals"),
    assist: metric(input, "assist", "assists"),
    passing: metric(input, "passing"),
    defense: metric(input, "defense"),
  };
}

export function aggregateFlashpeakLeaderboard(
  rows: readonly FlashpeakLeaderboardSource[],
): FlashpeakLeaderboardEntry[] {
  const aggregates = new Map<string, FlashpeakLeaderboardEntry & { scoreTotal: number }>();
  for (const row of rows) {
    const stats = readFlashpeakStatPayload(row.stats);
    const nickname = row.nickname.trim() || row.playerName.trim() || row.playerId;
    const current = aggregates.get(row.playerId) ?? {
      playerId: row.playerId,
      playerName: row.playerName,
      nickname,
      teamId: row.teamId,
      teamName: row.teamName,
      position: row.position,
      game: 0,
      score: null,
      scoreTotal: 0,
      goal: 0,
      assist: 0,
      passing: 0,
      defense: 0,
    };
    const validScores = stats.scores.filter((score): score is number => score !== null);
    current.game += validScores.length;
    current.scoreTotal += validScores.reduce((sum, score) => sum + score, 0);
    current.score = current.game ? current.scoreTotal / current.game : null;
    current.goal += stats.goal;
    current.assist += stats.assist;
    current.passing += stats.passing;
    current.defense += stats.defense;
    aggregates.set(row.playerId, current);
  }
  return sortFlashpeakLeaderboard(
    [...aggregates.values()].map(({ scoreTotal: _scoreTotal, ...entry }) => entry),
  );
}

function nicknameCompare(left: FlashpeakLeaderboardEntry, right: FlashpeakLeaderboardEntry) {
  return left.nickname.localeCompare(right.nickname, undefined, { sensitivity: "base" })
    || left.playerId.localeCompare(right.playerId);
}

export function sortFlashpeakLeaderboard(
  entries: readonly FlashpeakLeaderboardEntry[],
  key: LeaderboardSortKey = "score",
  direction: LeaderboardSortDirection = "desc",
): FlashpeakLeaderboardEntry[] {
  const factor = direction === "desc" ? -1 : 1;
  return [...entries].sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === null && rightValue !== null) return 1;
    if (rightValue === null && leftValue !== null) return -1;
    if (leftValue !== rightValue) return (Number(leftValue) - Number(rightValue)) * factor;
    if (key === "score" && direction === "desc" && left.game !== right.game) return right.game - left.game;
    return nicknameCompare(left, right);
  });
}
