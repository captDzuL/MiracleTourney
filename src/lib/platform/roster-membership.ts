export interface RosterMember {
  id: string;
  createdAt: Date;
  removedAt: Date | null;
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

export function wasOnRosterAt(player: Pick<RosterMember, "createdAt" | "removedAt">, at: Date | null): boolean {
  if (at === null) return isActivePlayer(player);
  return player.createdAt <= at && (player.removedAt === null || player.removedAt > at);
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
