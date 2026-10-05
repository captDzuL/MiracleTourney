import type { CompetitionGraph, ParticipantSource } from "@/lib/tournament/competition/types";
import { competitionProjection } from "@/lib/tournament/operations/result-projection";
import type { BracketMatch } from "@/lib/tournament/types";
import type { SocialBracketMatch, SocialBracketModel, BracketTeam, BracketSlot, BracketAppearance } from "./types";

type EventInput = SocialBracketModel["event"];
type TeamInput = { id: string; name: string; logoUrl?: string | null; logoText?: string | null };
type ResultInput = {
  id: string; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number;
  winnerTeamId?: string | null; resultVersion?: number; status?: string; scheduleStatus?: string;
  scheduledAt?: Date | null; scheduledLabel?: string | null; resultSnapshot?: unknown;
  round?: number | null; slot?: number | null; roundLabel?: string;
};
type BaseInput = { event: EventInput; appearance: BracketAppearance; locale: "id" | "en"; teams: TeamInput[]; preview?: boolean };

function identities(teams: TeamInput[]) {
  return new Map(teams.map((team) => [team.id, {
    id: team.id,
    name: team.name,
    logoUrl: team.logoUrl || null,
    initials: team.logoText?.trim() || team.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join(""),
  } satisfies BracketTeam]));
}
function waiting(locale: "id" | "en") { return locale === "id" ? "Menunggu tim" : "Waiting for team"; }
function sourceLabel(source: ParticipantSource, locale: "id" | "en", sourceName?: string) {
  if (source.kind === "match") return locale === "id"
    ? `${source.outcome === "winner" ? "Pemenang" : "Kalah"} ${sourceName ?? source.matchId}`
    : `${source.outcome === "winner" ? "Winner" : "Loser"} of ${sourceName ?? source.matchId}`;
  if (source.kind === "group_rank") return locale === "id" ? `Peringkat ${source.rank} ${sourceName ?? "grup"}` : `${sourceName ?? "Group"} rank ${source.rank}`;
  if (source.kind === "bye") return locale === "id" ? "Lolos otomatis" : "Automatic advance";
  return waiting(locale);
}
function status(result: ResultInput | undefined, bye = false): SocialBracketMatch["status"] {
  if (bye) return "bye";
  if (result?.resultVersion && result.resultVersion > 0 && result.winnerTeamId && result.homeScore !== result.awayScore) return "completed";
  if (result?.status === "Live" || result?.scheduleStatus === "live") return "live";
  if (result?.scheduleStatus === "delayed") return "delayed";
  if (result?.scheduleStatus === "postponed") return "postponed";
  return "scheduled";
}
function games(result: ResultInput | undefined) {
  const snapshot = result?.resultSnapshot as { games?: Array<{ number?: number; gameNumber?: number; homeScore: number; awayScore: number }> } | null | undefined;
  return (snapshot?.games ?? []).map((game) => ({
    number: game.number ?? game.gameNumber ?? 1, homeScore: game.homeScore, awayScore: game.awayScore,
  }));
}
function roundLabel(bracket: string, round: number, maxRound: number, locale: "id" | "en") {
  if (bracket === "grand_final") return locale === "id" ? "Grand Final" : "Grand Final";
  if (bracket === "third_place") return locale === "id" ? "Perebutan Juara 3" : "Third Place";
  if (bracket === "round_robin") return locale === "id" ? `Babak ${round}` : `Round ${round}`;
  const prefix = bracket === "upper" ? (locale === "id" ? "Upper" : "Upper") : bracket === "lower" ? "Lower" : "";
  const remaining = maxRound - round;
  const stage = remaining === 0 ? "Final" : remaining === 1 ? (locale === "id" ? "Semifinal" : "Semifinal") : remaining === 2 ? (locale === "id" ? "Perempat Final" : "Quarterfinal") : remaining === 3 ? (locale === "id" ? "Babak 16 Besar" : "Round of 16") : locale === "id" ? `Babak ${round}` : `Round ${round}`;
  return prefix ? `${prefix} ${stage}` : stage;
}
function safeChampion(id: string | null | undefined, byTeam: Map<string, BracketTeam>) {
  return id ? byTeam.get(id) ?? null : null;
}

export function buildGraphSocialBracket(input: BaseInput & {
  graph: CompetitionGraph; results: ResultInput[]; visibleMatchIds?: Set<string>;
}): SocialBracketModel {
  const { event, appearance, locale, graph, results } = input;
  const byTeam = identities(input.teams);
  const byResult = new Map(results.map((result) => [result.id, result]));
  const visible = input.visibleMatchIds ?? new Set(graph.matches.filter((match) => match.status !== "empty").map((match) => match.id));
  const displayed = graph.matches.filter((match) => visible.has(match.id) && match.status !== "empty");
  const matchNumbers = new Map(displayed.map((match, index) => [match.id, index + 1]));
  const maxByBracket = new Map<string, number>();
  for (const match of displayed) maxByBracket.set(match.bracket, Math.max(maxByBracket.get(match.bracket) ?? 0, match.round));
  const slotFor = (source: ParticipantSource, rowId: string, side: "home" | "away"): BracketSlot => {
    const row = byResult.get(rowId);
    const sourceMatchId = source.kind === "match" && visible.has(source.matchId) ? source.matchId : null;
    const hiddenSource = source.kind === "match" && !sourceMatchId;
    const teamId = hiddenSource ? null : row?.[`${side}TeamId`] || (source.kind === "team" ? source.teamId : null);
    const team = safeChampion(teamId, byTeam);
    const exposedSource = source.kind === "match" && !sourceMatchId ? null : source;
    return { team, label: team?.name ?? (exposedSource ? sourceLabel(exposedSource, locale, exposedSource.kind === "match" ? `Match ${matchNumbers.get(exposedSource.matchId) ?? "?"}` : exposedSource.kind === "group_rank" ? graph.groups.find((group) => group.id === exposedSource.groupId)?.label : undefined) : waiting(locale)),
      sourceMatchId, outcome: sourceMatchId && source.kind === "match" ? source.outcome : null };
  };
  const matches: SocialBracketMatch[] = displayed.map((node) => {
    const row = byResult.get(node.id);
    const official = Boolean(row?.resultVersion && row.resultVersion > 0);
    const matchStatus = status(row, node.status === "bye");
    return {
      id: node.id, roundKey: `${node.bracket}:${node.round}`, roundLabel: roundLabel(node.bracket, node.round, maxByBracket.get(node.bracket) ?? node.round, locale),
      round: node.round, slot: node.slot, bracket: node.bracket,
      home: slotFor(node.home, node.id, "home"), away: slotFor(node.away, node.id, "away"),
      homeScore: official ? row!.homeScore : null, awayScore: official ? row!.awayScore : null,
      winnerTeamId: matchStatus === "completed" ? row!.winnerTeamId ?? null : null,
      status: matchStatus, bestOf: node.bestOf, schedule: row?.scheduledAt?.toISOString() ?? row?.scheduledLabel ?? null,
      games: official ? games(row) : [],
    };
  });
  const placement = graph.placements.find((entry) => entry.rank === 1)?.source;
  let champion: BracketTeam | null = null;
  if (placement?.kind === "match" && placement.outcome === "winner" && visible.has(placement.matchId)) {
    const final = matches.find((match) => match.id === placement.matchId);
    if (final?.status === "completed") champion = safeChampion(final.winnerTeamId, byTeam);
  } else if (event.status === "Finished" && graph.config.kind === "round_robin") {
    const projection = competitionProjection(graph, results as never);
    const table = projection.standings.find((standing) => standing.groupId === null);
    const first = table?.rows.find((row) => row.rank === 1 && !row.tied);
    if (table?.complete && first) champion = safeChampion(first.teamId, byTeam);
  }
  return { event, locale, appearance, matches, champion, preview: Boolean(input.preview) };
}

export function buildLegacySocialBracket(input: BaseInput & {
  matches: BracketMatch[]; results: ResultInput[]; totalRounds?: number;
  roundConfigs: Array<{ roundLabel: string; bestOf: number }>;
  gamesByMatch: Map<string, Array<{ gameNumber: number; homeScore: number; awayScore: number }>>;
}): SocialBracketModel {
  const { event, appearance, locale } = input;
  const byTeam = identities(input.teams);
  const byResult = new Map(input.results.map((row) => [row.id, row]));
  const byPosition = new Map(input.results.filter((row) => row.round && row.slot).map((row) => [`${row.round}:${row.slot}`, row]));
  const visible = new Set(input.matches.map((match) => match.id));
  const matchNumbers = new Map(input.matches.map((match, index) => [match.id, index + 1]));
  const bracket = event.format === "League" ? "round_robin" : "single";
  const maxRound = Math.max(input.totalRounds ?? 1, ...input.matches.map((match) => match.round));
  const playInRound = input.matches.find((match) => Boolean(match.byeForTeamId))?.round ?? null;
  const matchRows: SocialBracketMatch[] = input.matches.map((match) => {
    const candidate = byResult.get(match.id) ?? byPosition.get(`${match.round}:${match.slot}`);
    const aligned = candidate && ((candidate.homeTeamId === match.homeTeamId && candidate.awayTeamId === match.awayTeamId)
      || (candidate.homeTeamId === match.awayTeamId && candidate.awayTeamId === match.homeTeamId));
    const row = aligned ? candidate : undefined;
    const swapped = Boolean(row && row.homeTeamId === match.awayTeamId && row.awayTeamId === match.homeTeamId);
    const official = row?.status === "Completed" && Boolean(row.winnerTeamId) && row.homeScore !== row.awayScore;
    const englishRoundLabel = playInRound === match.round ? "Play-in Round" : roundLabel(bracket, match.round, maxRound, "en");
    const config = input.roundConfigs.find((item) => item.roundLabel === englishRoundLabel)
      ?? input.roundConfigs.find((item) => item.roundLabel === row?.roundLabel);
    const matchGames = row ? input.gamesByMatch.get(row.id) ?? [] : [];
    const wins = matchGames.reduce((total, game) => {
      if (game.homeScore > game.awayScore) total.home++;
      if (game.awayScore > game.homeScore) total.away++;
      return total;
    }, { home: 0, away: 0 });
    const homeScore = matchGames.length && (config?.bestOf ?? 1) > 1 ? (swapped ? wins.away : wins.home) : row ? (swapped ? row.awayScore : row.homeScore) : null;
    const awayScore = matchGames.length && (config?.bestOf ?? 1) > 1 ? (swapped ? wins.home : wins.away) : row ? (swapped ? row.homeScore : row.awayScore) : null;
    const makeSlot = (teamId: string | null, sourceId: string | null, bye: boolean): BracketSlot => {
      const team = safeChampion(teamId, byTeam);
      const sourceMatchId = sourceId && visible.has(sourceId) ? sourceId : null;
      return { team, label: team?.name ?? (bye ? (locale === "id" ? "Lolos otomatis" : "Automatic advance") : sourceMatchId ? sourceLabel({ kind: "match", matchId: sourceMatchId, outcome: "winner" }, locale, `Match ${matchNumbers.get(sourceMatchId) ?? "?"}`) : waiting(locale)), sourceMatchId, outcome: sourceMatchId ? "winner" : null };
    };
    return {
      id: match.id, roundKey: `${bracket}:${match.round}`, roundLabel: playInRound === match.round ? (locale === "id" ? "Babak Play-in" : "Play-in Round") : roundLabel(bracket, match.round, maxRound, locale),
      round: match.round, slot: match.slot, bracket,
      home: makeSlot(match.homeTeamId, match.sourceMatchIds?.[0] ?? null, false),
      away: makeSlot(match.awayTeamId, match.sourceMatchIds?.[1] ?? null, Boolean(match.byeForTeamId)),
      homeScore: official ? homeScore : null, awayScore: official ? awayScore : null,
      winnerTeamId: official ? row!.winnerTeamId ?? null : null,
      status: match.byeForTeamId ? "bye" : official ? "completed" : status(row),
      bestOf: config?.bestOf ?? 1, schedule: row?.scheduledLabel ?? null,
      games: matchGames.map((game) => ({ number: game.gameNumber, homeScore: swapped ? game.awayScore : game.homeScore, awayScore: swapped ? game.homeScore : game.awayScore })),
    };
  });
  const final = matchRows.find((match) => match.round === maxRound && match.slot === 1);
  return { event, locale, appearance, matches: matchRows,
    champion: event.format !== "League" && event.status === "Finished" && final?.status === "completed" ? safeChampion(final.winnerTeamId, byTeam) : null,
    preview: Boolean(input.preview) };
}
