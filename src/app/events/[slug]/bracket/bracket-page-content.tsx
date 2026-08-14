import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { TeamIdentity } from "@/components/TeamAvatar";
import { DataTable, Pill, Section } from "@/components/ui";
import {
  getBracketPreview,
  getEventRoundConfigs,
  getMatchesForEvent,
  getMatchGamesForEvent,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import type { Match, MatchGame, Team } from "@/lib/platform/types";
import type { BracketMatch } from "@/lib/tournament/types";

type TFn = (key: string, values?: Record<string, string | number>) => string;

interface MatchStateLabels {
  bye: string;
  autoAdvance: string;
  ready: string;
  onwards: (date: string) => string;
  waiting: string;
  tbdByAdmin: string;
  scheduled: string;
}

interface RoundNames {
  playIn: string;
  final: string;
  semifinal: string;
  quarterfinal: string;
  roundOf16: string;
  roundN: (n: number) => string;
}

interface SeriesSummary {
  bestOf: number;
  games: MatchGame[];
  teamsSwapped: boolean;
  homeSeriesWins: number;
  awaySeriesWins: number;
}

function getRoundName(
  round: number,
  totalRounds: number,
  names: RoundNames,
  options?: { playInRound?: number | null },
) {
  if (options?.playInRound === round) return names.playIn;

  const roundsRemaining = totalRounds - round + 1;

  if (roundsRemaining === 1) return names.final;
  if (roundsRemaining === 2) return names.semifinal;
  if (roundsRemaining === 3) return names.quarterfinal;
  if (roundsRemaining === 4) return names.roundOf16;

  return names.roundN(round);
}

function buildRecordedMatchLookup(matches: Match[]) {
  const lookup = new Map<string, Match>();

  for (const match of matches) {
    if (match.round === undefined || match.slot === undefined) continue;
    lookup.set(`${match.round}:${match.slot}`, match);
  }

  return lookup;
}

function getRecordedBracketMatch(match: BracketMatch, recordedMatches: Map<string, Match>) {
  const candidate = recordedMatches.get(`${match.round}:${match.slot}`);

  const teamsExact =
    candidate &&
    match.homeTeamId &&
    match.awayTeamId &&
    candidate.homeTeamId === match.homeTeamId &&
    candidate.awayTeamId === match.awayTeamId;
  const teamsSwapped =
    !teamsExact &&
    candidate &&
    match.homeTeamId &&
    match.awayTeamId &&
    candidate.homeTeamId === match.awayTeamId &&
    candidate.awayTeamId === match.homeTeamId;

  return {
    recorded: (teamsExact || teamsSwapped) ? candidate : undefined,
    teamsSwapped: Boolean(teamsSwapped),
  };
}

function getSeriesSummary(
  match: BracketMatch,
  recordedMatches: Map<string, Match>,
  roundConfigMap: Map<string, number>,
  gamesMap: Map<string, MatchGame[]>,
): SeriesSummary {
  const { recorded, teamsSwapped } = getRecordedBracketMatch(match, recordedMatches);
  const games = recorded ? (gamesMap.get(recorded.id) ?? []) : [];
  const bestOf = recorded ? (roundConfigMap.get(recorded.roundLabel) ?? 1) : 1;
  const homeSeriesWins = teamsSwapped ? (recorded?.awayScore ?? 0) : (recorded?.homeScore ?? 0);
  const awaySeriesWins = teamsSwapped ? (recorded?.homeScore ?? 0) : (recorded?.awayScore ?? 0);

  return {
    bestOf,
    games,
    teamsSwapped,
    homeSeriesWins,
    awaySeriesWins,
  };
}

function formatSeriesGameSummary(game: MatchGame, series: SeriesSummary) {
  const displayHome = series.teamsSwapped ? game.awayScore : game.homeScore;
  const displayAway = series.teamsSwapped ? game.homeScore : game.awayScore;

  return `G${game.gameNumber} ${displayHome}-${displayAway}`;
}

function getBracketMatchState(
  match: BracketMatch,
  eventStartsAt: string,
  recordedMatches: Map<string, Match>,
  roundConfigMap: Map<string, number>,
  gamesMap: Map<string, MatchGame[]>,
  labels: MatchStateLabels,
) {
  if (match.byeForTeamId) {
    return {
      status: labels.bye,
      schedule: labels.autoAdvance,
      tone: "success" as const,
    };
  }

  const { recorded } = getRecordedBracketMatch(match, recordedMatches);
  const series = getSeriesSummary(match, recordedMatches, roundConfigMap, gamesMap);

  if (recorded?.status === "Completed") {
    const scoreLabel =
      series.bestOf > 1
        ? `${series.homeSeriesWins} - ${series.awaySeriesWins} (BO${series.bestOf})`
        : `${series.homeSeriesWins} - ${series.awaySeriesWins}`;
    return {
      status: scoreLabel,
      schedule: recorded.roundLabel,
      tone: "default" as const,
    };
  }

  if (recorded && series.bestOf > 1 && series.games.length > 0) {
    return {
      status: `${series.homeSeriesWins} - ${series.awaySeriesWins} (BO${series.bestOf})`,
      schedule: recorded.roundLabel,
      tone: "default" as const,
    };
  }

  if (match.homeTeamId && match.awayTeamId) {
    return {
      status: labels.ready,
      schedule: labels.onwards(eventStartsAt),
      tone: "default" as const,
    };
  }

  return {
    status: labels.waiting,
    schedule: labels.tbdByAdmin,
    tone: "default" as const,
  };
}

function getLeagueMatchState(
  match: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,
  eventStartsAt: string,
  recordedMatches: Match[],
  labels: MatchStateLabels,
) {
  const recorded = recordedMatches.find(
    (candidate) =>
      candidate &&
      match.homeTeamId &&
      match.awayTeamId &&
      candidate.homeTeamId === match.homeTeamId &&
      candidate.awayTeamId === match.awayTeamId,
  );

  if (recorded?.status === "Completed") {
    return {
      status: `${recorded.homeScore} - ${recorded.awayScore}`,
      schedule: recorded.roundLabel,
      tone: "default" as const,
    };
  }

  return {
    status: labels.scheduled,
    schedule: recorded?.scheduledLabel ?? labels.onwards(eventStartsAt),
    tone: "default" as const,
  };
}

function renderTeamName(teamLookup: Map<string, Team>, teamId: string | null, fallback: string) {
  if (!teamId) return fallback;
  return teamLookup.get(teamId)?.name ?? fallback;
}

function renderTeamSlot(teamLookup: Map<string, Team>, teamId: string | null, fallback: string) {
  const team = teamId ? teamLookup.get(teamId) : undefined;
  if (!team) return <span className="font-medium text-slate-500">{fallback}</span>;

  return <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} size="sm" />;
}

function chunkIntoPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push(items.slice(i, i + 2));
  }
  return pairs;
}

function MatchCard({
  match,
  totalRounds,
  playInRound,
  eventStartsAt,
  recordedByRound,
  teamLookup,
  roundConfigMap,
  gamesMap,
  connect,
  labels,
  roundNames,
  t,
}: {
  match: BracketMatch;
  totalRounds: number;
  playInRound: number | null;
  eventStartsAt: string;
  recordedByRound: Map<string, Match>;
  teamLookup: Map<string, Team>;
  roundConfigMap: Map<string, number>;
  gamesMap: Map<string, MatchGame[]>;
  connect: boolean;
  labels: MatchStateLabels;
  roundNames: RoundNames;
  t: TFn;
}) {
  const state = getBracketMatchState(
    match,
    eventStartsAt,
    recordedByRound,
    roundConfigMap,
    gamesMap,
    labels,
  );
  const series = getSeriesSummary(match, recordedByRound, roundConfigMap, gamesMap);
  const homeName = renderTeamName(teamLookup, match.homeTeamId, "TBD");
  const awayName = renderTeamName(teamLookup, match.awayTeamId, match.byeForTeamId ? "BYE" : "TBD");
  const showDetail = series.bestOf > 1 && series.games.length > 0;

  return (
    <article
      className={`bracket-match relative rounded-2xl border border-slate-200 bg-white shadow-sm ${
        connect ? "bracket-match--connect" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{t("matchCard", { n: match.slot })}</p>
          <p className="text-xs text-slate-500">
            {getRoundName(match.round, totalRounds, roundNames, { playInRound })}
          </p>
        </div>
        <Pill tone={state.tone}>{state.status}</Pill>
      </div>

      <div className="divide-y divide-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          {renderTeamSlot(teamLookup, match.homeTeamId, "TBD")}
          <span className="mono text-xs text-slate-500">{t("home")}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          {renderTeamSlot(teamLookup, match.awayTeamId, match.byeForTeamId ? "BYE" : "TBD")}
          <span className="mono text-xs text-slate-500">{t("away")}</span>
        </div>
      </div>

      {showDetail ? (
        <details className="group border-t border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs text-slate-500 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
            <span>{t("gameDetail")}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-medium leading-none text-slate-400 group-open:border-slate-600 group-open:text-slate-600">
              i
            </span>
          </summary>
          <div className="border-t border-slate-100 px-4 pb-3 pt-2">
            {series.games.map((game) => {
              const homeWon = series.teamsSwapped
                ? game.awayScore > game.homeScore
                : game.homeScore > game.awayScore;
              const displayHome = series.teamsSwapped ? game.awayScore : game.homeScore;
              const displayAway = series.teamsSwapped ? game.homeScore : game.awayScore;

              return (
                <div key={game.gameNumber} className="flex items-center gap-2 border-b border-slate-100 py-1 text-xs last:border-0">
                  <span className="w-5 font-mono text-slate-400">G{game.gameNumber}</span>
                  <span className={homeWon ? "font-medium text-slate-900" : "text-slate-400"}>{displayHome}</span>
                  <span className="text-slate-300">-</span>
                  <span className={!homeWon ? "font-medium text-slate-900" : "text-slate-400"}>{displayAway}</span>
                  <span className="ml-auto max-w-[90px] truncate text-slate-400">
                    {homeWon ? homeName : awayName} wins
                  </span>
                </div>
              );
            })}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xs font-medium text-slate-600">
              <span>{t("series")}</span>
              <span>{series.homeSeriesWins} - {series.awaySeriesWins}</span>
            </div>
          </div>
        </details>
      ) : (
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          {t("schedule", { schedule: state.schedule })}
        </div>
      )}
    </article>
  );
}

export async function renderBracketPage(slug: string) {
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const t: TFn = await getTranslations("bracket");

  const labels: MatchStateLabels = {
    bye: t("bye"),
    autoAdvance: t("autoAdvance"),
    ready: t("ready"),
    onwards: (date: string) => t("onwards", { date }),
    waiting: t("waiting"),
    tbdByAdmin: t("tbdByAdmin"),
    scheduled: t("scheduled"),
  };
  const roundNames: RoundNames = {
    playIn: t("playIn"),
    final: t("final"),
    semifinal: t("semifinal"),
    quarterfinal: t("quarterfinal"),
    roundOf16: t("roundOf16"),
    roundN: (n: number) => t("round", { n }),
  };

  const [teams, items, recordedMatches, roundConfigs, gamesMap] = await Promise.all([
    getTeamsForEvent(event.id),
    getPublicVisibleBracketPreview(event.id),
    getMatchesForEvent(event.id),
    getEventRoundConfigs(event.id),
    getMatchGamesForEvent(event.id),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((c) => [c.roundLabel, c.bestOf]));
  const teamLookup = new Map(teams.map((team) => [team.id, team]));

  if (event.format === "League") {
    return (
      <Section
        title={t("title", { name: event.name })}
        description={t("leagueDescription")}
      >
        <DataTable
          columns={[t("roundCol"), t("fixtureCol"), t("statusCol"), t("scheduleCol")]}
          rows={items.map((item) => {
            const state = getLeagueMatchState(item, event.startsAt, recordedMatches, labels);

            return [
              roundNames.roundN(item.round),
              `${renderTeamName(teamLookup, item.homeTeamId, "TBD")} vs ${renderTeamName(teamLookup, item.awayTeamId, "TBD")}`,
              <Pill key={`${item.id}-league-status`} tone={state.tone}>
                {state.status}
              </Pill>,
              state.schedule,
            ];
          })}
        />
      </Section>
    );
  }

  const bracketMatches = items as BracketMatch[];
  const fullBracket = event.format === "Single Elimination" &&
    event.status !== "Ongoing" && event.status !== "Finished"
    ? await getBracketPreview(event.id) as BracketMatch[]
    : bracketMatches;
  const totalRounds = Math.max(
    ...(event.format === "Single Elimination" ? fullBracket : bracketMatches).map((match) => match.round),
    1,
  );
  const visibleRounds = [...new Set(bracketMatches.map((match) => match.round))];
  const playInRound =
    visibleRounds.find((round) =>
      bracketMatches.some((match) => match.round === round && Boolean(match.byeForTeamId)),
    ) ?? null;
  const matchesByRound = visibleRounds.map((round) =>
    bracketMatches.filter((match) => match.round === round),
  );
  const recordedByRound = buildRecordedMatchLookup(recordedMatches);

  const visibleParentPairs = new Set<string>();
  for (const match of bracketMatches) {
    const [left, right] = match.sourceMatchIds ?? [];
    if (left && right) visibleParentPairs.add([left, right].sort().join("|"));
  }

  return (
    <div className="space-y-6">
      <style>{`
        .bracket-match--connect::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 100%;
          width: 0.625rem;
          height: 2px;
          background: #cbd5e1;
          transform: translateY(-50%);
        }
        .bracket-pair {
          position: relative;
        }
        .bracket-pair::before {
          content: "";
          position: absolute;
          top: 25%;
          bottom: 25%;
          left: calc(100% + 0.625rem);
          width: 2px;
          background: #cbd5e1;
        }
        .bracket-pair::after {
          content: "";
          position: absolute;
          top: 50%;
          left: calc(100% + 0.625rem);
          width: 0.625rem;
          height: 2px;
          background: #cbd5e1;
          transform: translateY(-50%);
        }
      `}</style>

      <Section
        title={t("title", { name: event.name })}
        description={t("description")}
      >
        {bracketMatches.length ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-5">
              {matchesByRound.map((roundMatches, roundIndex) => {
                const hasNextRound = roundIndex < matchesByRound.length - 1;

                return (
                  <div key={roundIndex} className="flex min-w-[280px] flex-col gap-4">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.24em] text-cyan-600">
                        {getRoundName(visibleRounds[roundIndex], totalRounds, roundNames, { playInRound })}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {t("matchCount", { count: roundMatches.length })}
                      </p>
                    </div>

                    <div
                      className="flex flex-1 flex-col justify-around gap-4"
                      style={{ paddingTop: `${roundIndex * 2.5}rem`, paddingBottom: `${roundIndex * 2.5}rem` }}
                    >
                      {hasNextRound
                        ? chunkIntoPairs(roundMatches).map((pair, pairIndex) => {
                            const pairKey = pair.map((m) => m.id).sort().join("|");
                            const hasVisibleParent = pair.length === 2 && visibleParentPairs.has(pairKey);

                            return (
                              <div
                                key={`pair-${roundIndex}-${pairIndex}`}
                                className={`${hasVisibleParent ? "bracket-pair" : ""} flex flex-1 flex-col justify-around gap-4`}
                              >
                                {pair.map((match) => (
                                  <MatchCard
                                    key={match.id}
                                    match={match}
                                    totalRounds={totalRounds}
                                    playInRound={playInRound}
                                    eventStartsAt={event.startsAt}
                                    recordedByRound={recordedByRound}
                                    teamLookup={teamLookup}
                                    roundConfigMap={roundConfigMap}
                                    gamesMap={gamesMap}
                                    connect={hasVisibleParent}
                                    labels={labels}
                                    roundNames={roundNames}
                                    t={t}
                                  />
                                ))}
                              </div>
                            );
                          })
                        : roundMatches.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              totalRounds={totalRounds}
                              playInRound={playInRound}
                              eventStartsAt={event.startsAt}
                              recordedByRound={recordedByRound}
                              teamLookup={teamLookup}
                              roundConfigMap={roundConfigMap}
                              gamesMap={gamesMap}
                              connect={false}
                              labels={labels}
                              roundNames={roundNames}
                              t={t}
                            />
                          ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("empty")}</p>
        )}
      </Section>

      <Section
        title={t("detailTitle")}
        description={t("detailDescription")}
      >
        <DataTable
          columns={[t("roundCol"), t("matchCol"), t("teamsCol"), t("statusCol"), t("scheduleCol")]}
          rows={bracketMatches.map((match) => {
            const state = getBracketMatchState(
              match,
              event.startsAt,
              recordedByRound,
              roundConfigMap,
              gamesMap,
              labels,
            );
            const series = getSeriesSummary(match, recordedByRound, roundConfigMap, gamesMap);
            const scheduleLabel = series.bestOf > 1 && series.games.length > 0
              ? `${state.schedule} | ${series.games.map((game) => formatSeriesGameSummary(game, series)).join(" | ")}`
              : state.schedule;

            return [
              getRoundName(match.round, totalRounds, roundNames, { playInRound }),
              t("matchCard", { n: match.slot }),
              `${renderTeamName(teamLookup, match.homeTeamId, "TBD")} vs ${renderTeamName(
                teamLookup,
                match.awayTeamId,
                match.byeForTeamId ? "BYE" : "TBD",
              )}`,
              <Pill key={`${match.id}-detail-status`} tone={state.tone}>
                {state.status}
              </Pill>,
              scheduleLabel,
            ];
          })}
        />
      </Section>
    </div>
  );
}
