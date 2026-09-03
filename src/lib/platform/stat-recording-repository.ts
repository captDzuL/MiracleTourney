import { prisma } from "./db";
import { getMatchStatRecording, getTeamStatRecording, type MatchStatRecording } from "./stat-recording";

/** Call with matches from the active, authorized event. Reads only persisted statistics. */
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
  const [players, rows] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: { in: teamIds }, team: { eventId } },
      select: { id: true, teamId: true },
    }),
    prisma.playerStat.findMany({
      where: { matchId: { in: matches.map(({ id }) => id) }, match: { eventId } },
      select: { matchId: true, teamId: true, playerId: true, stats: true },
    }),
  ]);

  const playersByTeam = new Map<string, { id: string }[]>();
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

  return new Map(matches.map((match) => {
    const teamStatus = (teamId: string | null | undefined) => getTeamStatRecording(
      playersByTeam.get(teamId ?? "") ?? [],
      statKeys,
      statsByMatch.get(match.id)?.get(teamId ?? "") ?? {},
    );
    const home = teamStatus(match.homeTeamId);
    const away = teamStatus(match.awayTeamId);
    return [match.id, { status: getMatchStatRecording(home, away), home, away }];
  }));
}
