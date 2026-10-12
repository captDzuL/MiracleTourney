export interface RosterMember {
  id: string;
  createdAt: Date;
  /** Start of the current absence; null while on the roster. */
  removedAt: Date | null;
  /** Closed absences (the player left and came back), stored as ISO strings. */
  rosterGaps?: unknown;
}

export interface RosterGap {
  from: Date;
  to: Date;
}

export interface MatchClock {
  actualStartedAt?: Date | null;
  actualEndedAt?: Date | null;
  resultConfirmedAt?: Date | null;
}

/** A player replaced through an approved roster change keeps their row but is no longer on the roster. */
export function isActivePlayer(player: { removedAt: Date | null }): boolean {
  return player.removedAt === null;
}

/**
 * The moment that decides who was on a team's roster for a match. Only real
 * timestamps count; a planned time (`scheduledAt`) is not proof the match was
 * played then. Null means "not started yet": only active players count.
 */
export function matchRosterReferenceTime(match: MatchClock): Date | null {
  return match.actualStartedAt ?? match.actualEndedAt ?? match.resultConfirmedAt ?? null;
}

/** Reads the stored absences; anything malformed is ignored rather than trusted. */
export function parseRosterGaps(value: unknown): RosterGap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { from, to } = entry as { from?: unknown; to?: unknown };
    if (typeof from !== "string" || typeof to !== "string") return [];
    const gap = { from: new Date(from), to: new Date(to) };
    return Number.isNaN(gap.from.getTime()) || Number.isNaN(gap.to.getTime()) ? [] : [gap];
  });
}

export function wasOnRosterAt(player: Pick<RosterMember, "createdAt" | "removedAt" | "rosterGaps">, at: Date | null): boolean {
  if (at === null) return isActivePlayer(player);
  if (player.createdAt > at) return false;
  if (player.removedAt !== null && player.removedAt <= at) return false;
  return !parseRosterGaps(player.rosterGaps).some((gap) => gap.from <= at && at < gap.to);
}

/**
 * Roster used to judge a match: players on the roster when it started, plus anyone
 * who already has stats saved for it (they clearly played).
 */
export function rosterForMatch<T extends RosterMember>(
  players: ReadonlyArray<T>,
  at: Date | null,
  playerIdsWithStats: ReadonlySet<string>,
): T[] {
  return players.filter((player) => wasOnRosterAt(player, at) || playerIdsWithStats.has(player.id));
}
