import { prisma } from "./db";
import { rosterForMatch, matchRosterReferenceTime, type RosterMember } from "./roster-membership";
import { getMatchStatRecording, getTeamStatRecording, type MatchStatRecording } from "./stat-recording";

type TeamPlayer = RosterMember & { teamId: string };

/**
 * Call with matches from the active, authorized event. Reads only persisted statistics.
 * Each match is judged against the roster it had when it started, so a roster
 * change later in the group stage does not flip older matches back to "partial".
 */
export async function getMatchStatRecordings(
  eventId: string,
  matches: ReadonlyArray<{ id: string; homeTeamId?: string | null; awayTeamId?: string | null }>,
  statKeys: readonly string[],
): Promise<Map<string, MatchStatRecording>> {
  if (!matches.length) return new Map();
  if (!statKeys.length) {
    return new Map(matches.map(({ id }) => [id, { status: "notRequired", home: "notRequired", away: "notRequired" }]));
  }

  const teamIds = [...new Set(matches.flatMap((match) => [match.homeTeamId, match.awayTeamId])
    .filter((id): id is string => Boolean(id)))];
  const matchIds = matches.map(({ id }) => id);
  const [players, rows, clocks] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: { in: teamIds }, team: { eventId } },
      select: { id: true, teamId: true, createdAt: true, removedAt: true, rosterGaps: true },
    }),
    prisma.playerStat.findMany({
      where: { matchId: { in: matchIds }, match: { eventId } },
      select: { matchId: true, teamId: true, playerId: true, stats: true },
    }),
    prisma.match.findMany({
      where: { id: { in: matchIds }, eventId },
      select: { id: true, actualStartedAt: true, actualEndedAt: true, resultConfirmedAt: true },
    }),
  ]);

  const playersByTeam = new Map<string, TeamPlayer[]>();
  for (const player of players) {
    const roster = playersByTeam.get(player.teamId) ?? [];
    roster.push(player);
    playersByTeam.set(player.teamId, roster);
  }
  const statsByMatch = new Map<string, Map<string, Record<string, unknown>>>();
  for (const row of rows) {
    const teams = statsByMatch.get(row.matchId) ?? new Map<string, Record<string, unknown>>();
    const stats = teams.get(row.teamId) ?? {};
    stats[row.playerId] = row.stats;
    teams.set(row.teamId, stats);
    statsByMatch.set(row.matchId, teams);
  }
  const referenceTimeByMatch = new Map(clocks.map((clock) => [clock.id, matchRosterReferenceTime(clock)]));

  return new Map(matches.map((match) => {
    const teamStatus = (teamId: string | null | undefined) => {
      const stats = statsByMatch.get(match.id)?.get(teamId ?? "") ?? {};
      const roster = rosterForMatch(
        playersByTeam.get(teamId ?? "") ?? [],
        referenceTimeByMatch.get(match.id) ?? null,
        new Set(Object.keys(stats)),
      );
      return getTeamStatRecording(roster, statKeys, stats);
    };
    const home = teamStatus(match.homeTeamId);
    const away = teamStatus(match.awayTeamId);
    return [match.id, { status: getMatchStatRecording(home, away), home, away }];
  }));
}

export type MatchTeamRosterPlayer = { id: string; nickname: string; position: string };

/**
 * Roster each team had when each completed match started, keyed `matchId::teamId`.
 * Call with pairs from an already authorized reader (for example the captain's own teams).
 */
export async function getMatchTeamRosters(
  pairs: ReadonlyArray<{ matchId: string; teamId: string }>,
): Promise<Map<string, MatchTeamRosterPlayer[]>> {
  if (!pairs.length) return new Map();

  const teamIds = [...new Set(pairs.map(({ teamId }) => teamId))];
  const matchIds = [...new Set(pairs.map(({ matchId }) => matchId))];
  const [players, rows, clocks] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, teamId: true, nickname: true, position: true, createdAt: true, removedAt: true, rosterGaps: true },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    }),
    prisma.playerStat.findMany({
      where: { matchId: { in: matchIds }, teamId: { in: teamIds } },
      select: { matchId: true, teamId: true, playerId: true },
    }),
    prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, actualStartedAt: true, actualEndedAt: true, resultConfirmedAt: true },
    }),
  ]);

  const referenceTimeByMatch = new Map(clocks.map((clock) => [clock.id, matchRosterReferenceTime(clock)]));
  const playerIdsWithStats = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.matchId}::${row.teamId}`;
    playerIdsWithStats.set(key, (playerIdsWithStats.get(key) ?? new Set()).add(row.playerId));
  }

  return new Map(pairs.map(({ matchId, teamId }) => {
    const key = `${matchId}::${teamId}`;
    const roster = rosterForMatch(
      players.filter((player) => player.teamId === teamId),
      referenceTimeByMatch.get(matchId) ?? null,
      playerIdsWithStats.get(key) ?? new Set(),
    );
    return [key, roster.map(({ id, nickname, position }) => ({ id, nickname, position }))];
  }));
}
