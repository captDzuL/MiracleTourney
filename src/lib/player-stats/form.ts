import { parsePlayerScoreArray } from "./flashpeak";

export type PlayerStatJsonValue = number | Array<number | null>;
export type PlayerStatPayloadMap = Record<string, Record<string, PlayerStatJsonValue>>;

const FORBIDDEN_TOKENS = new Set(["__proto__", "constructor", "prototype"]);

function safeToken(value: string) {
  return /^[a-zA-Z0-9_-]+$/.test(value) && !FORBIDDEN_TOKENS.has(value);
}

function text(value: FormDataEntryValue) {
  if (typeof value !== "string") throw new Error("Invalid player statistic value.");
  return value;
}

function numericStat(value: FormDataEntryValue) {
  const parsed = Number(text(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 9999) {
    throw new Error("Invalid player statistic value.");
  }
  return parsed;
}

function storedRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function getPlayerStatNumericValue(value: unknown, statKey: string): number {
  const stats = storedRecord(value);
  if (!stats) return 0;
  const canonical = stats[statKey];
  if (typeof canonical === "number" && Number.isFinite(canonical) && canonical >= 0) return canonical;
  const legacyKey = statKey === "goal" ? "goals" : statKey === "assist" ? "assists" : null;
  const legacy = legacyKey ? stats[legacyKey] : undefined;
  return typeof legacy === "number" && Number.isFinite(legacy) && legacy >= 0 ? legacy : 0;
}

export function validatePlayerStatPayload(
  statsMap: PlayerStatPayloadMap,
  options: { allowedStatKeys: readonly string[]; scoreSlotCount: number | null },
): void {
  const allowed = new Set(options.allowedStatKeys);
  for (const [playerId, rawPayload] of Object.entries(statsMap)) {
    if (!safeToken(playerId)) throw new Error("Invalid player statistic field.");
    const payload = storedRecord(rawPayload);
    if (!payload) throw new Error("Invalid player statistic payload.");

    for (const [key, value] of Object.entries(payload)) {
      if (key === "scores") {
        if (options.scoreSlotCount === null || !Array.isArray(value)) {
          throw new Error("Invalid player score array.");
        }
        parsePlayerScoreArray(value, options.scoreSlotCount);
        continue;
      }
      if (!safeToken(key) || !allowed.has(key)
        || typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 9999) {
        throw new Error("Invalid player statistic value.");
      }
    }

    if (options.scoreSlotCount !== null && !("scores" in payload)) {
      throw new Error("Invalid player score array.");
    }
    for (const key of allowed) {
      if (!(key in payload)) throw new Error("Invalid player statistic payload.");
    }
  }
}

function orderedGameNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const gameNumbers = value.map((row) => row && typeof row === "object" && !Array.isArray(row)
    ? (row as { gameNumber?: unknown }).gameNumber
    : undefined);
  if (gameNumbers.some((gameNumber) => !Number.isSafeInteger(gameNumber) || Number(gameNumber) < 1)) return [];
  const ordered = [...new Set(gameNumbers as number[])].sort((left, right) => left - right);
  return ordered.every((gameNumber, index) => gameNumber === index + 1) ? ordered : [];
}

export function resolvePlayerScoreGameNumbers(input: {
  matchGames: readonly { gameNumber: number }[];
  resultSnapshot: unknown;
  roundBestOf: number | null;
}): number[] {
  const persisted = orderedGameNumbers(input.matchGames);
  if (persisted.length) return persisted;
  const snapshot = input.resultSnapshot && typeof input.resultSnapshot === "object" && !Array.isArray(input.resultSnapshot)
    ? orderedGameNumbers((input.resultSnapshot as { games?: unknown }).games)
    : [];
  if (snapshot.length) return snapshot;
  if (input.roundBestOf === 1) return [1];
  throw new Error("Completed MatchGame rows are required before entering player scores.");
}

export function parsePlayerStatForm(
  formData: FormData,
  options: {
    allowedStatKeys: readonly string[];
    scoreSlotCount: number | null;
  },
): PlayerStatPayloadMap {
  const allowed = new Set(options.allowedStatKeys);
  const stats = new Map<string, Map<string, number>>();
  const scores = new Map<string, Map<number, unknown>>();

  for (const [field, rawValue] of formData.entries()) {
    const statMatch = field.match(/^stat_(.+)_([^_]+)$/);
    if (statMatch) {
      const [, playerId, statKey] = statMatch;
      if (!safeToken(playerId) || !safeToken(statKey) || !allowed.has(statKey)) {
        throw new Error("Invalid stat field name.");
      }
      const player = stats.get(playerId) ?? new Map<string, number>();
      if (player.has(statKey)) throw new Error("Duplicate player statistic field.");
      player.set(statKey, numericStat(rawValue));
      stats.set(playerId, player);
      continue;
    }

    const scoreMatch = field.match(/^score_(.+)_([1-9][0-9]*)$/);
    if (scoreMatch) {
      if (options.scoreSlotCount === null) throw new Error("Player scores are unavailable for this match.");
      const playerId = scoreMatch[1];
      const gameNumber = Number(scoreMatch[2]);
      if (!safeToken(playerId) || gameNumber > options.scoreSlotCount) {
        throw new Error("Invalid player score field.");
      }
      const player = scores.get(playerId) ?? new Map<number, unknown>();
      if (player.has(gameNumber)) throw new Error("Duplicate player score field.");
      player.set(gameNumber, text(rawValue));
      scores.set(playerId, player);
    }
  }

  const playerIds = new Set([...stats.keys(), ...scores.keys()]);
  const result: PlayerStatPayloadMap = Object.create(null) as PlayerStatPayloadMap;
  for (const playerId of playerIds) {
    const payload: Record<string, PlayerStatJsonValue> = Object.create(null) as Record<string, PlayerStatJsonValue>;
    if (options.scoreSlotCount !== null) {
      const values = Array.from(
        { length: options.scoreSlotCount },
        (_, index) => scores.get(playerId)?.get(index + 1),
      );
      if (values.some((value) => value === undefined)) {
        throw new Error("Invalid player score array length.");
      }
      payload.scores = parsePlayerScoreArray(values, options.scoreSlotCount);
    }
    for (const [key, value] of stats.get(playerId) ?? []) payload[key] = value;
    result[playerId] = payload;
  }
  return result;
}
