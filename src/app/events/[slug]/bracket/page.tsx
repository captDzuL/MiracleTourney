import { notFound } from "next/navigation";

import { DataTable, Pill, Section } from "@/components/ui";
import {
  getEventRoundConfigs,
  getMatchesForEvent,
  getMatchGamesForEvent,
  getBracketPreview,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import type { Match, MatchGame } from "@/lib/platform/types";
import type { BracketMatch } from "@/lib/tournament/types";

export const revalidate = 30;

function getRoundName(
  round: number,
  totalRounds: number,
  options?: {
    playInRound?: number | null;
  },
) {
  if (options?.playInRound === round) return "Play-in Round";

  const roundsRemaining = totalRounds - round + 1;

  if (roundsRemaining === 1) return "Final";
  if (roundsRemaining === 2) return "Semifinal";
  if (roundsRemaining === 3) return "Quarterfinal";
  if (roundsRemaining === 4) return "Round of 16";

  return `Round ${round}`;
}

function buildRecordedMatchLookup(matches: Match[]) {
  const lookup = new Map<string, Match>();

  for (const match of matches) {
    if (match.round === undefined || match.slot === undefined) continue;
    lookup.set(`${match.round}:${match.slot}`, match);
  }

  return lookup;
}

function getBracketMatchState(
  match: BracketMatch,
  eventStartsAt: string,
  recordedMatches: Map<string, Match>,
  roundConfigMap: Map<string, number>,
) {
  if (match.byeForTeamId) {
    return {
      status: "Bye",
      schedule: "Auto-advance",
      tone: "success" as const,
    };
  }

  const candidate = recordedMatches.get(`${match.round}:${match.slot}`);

  // Verify that the recorded match's teams match the projected teams — required to guard
  // against showing stale scores when the projection has TBD or different teams at this
  // slot. Also accept the swapped order to handle non-deterministic home/away assignment
  // that can occur when team cache ordering changes between requests.
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
  const recorded = (teamsExact || teamsSwapped) ? candidate : undefined;

  if (recorded?.status === "Completed") {
    const bestOf = roundConfigMap.get(recorded.roundLabel) ?? 1;
    const homeScore = teamsSwapped ? recorded.awayScore : recorded.homeScore;
    const awayScore = teamsSwapped ? recorded.homeScore : recorded.awayScore;
    const scoreLabel =
      bestOf > 1
        ? `${homeScore} - ${awayScore} (BO${bestOf})`
        : `${homeScore} - ${awayScore}`;
    return {
      status: scoreLabel,
      schedule: recorded.roundLabel,
      tone: "default" as const,
    };
  }

  if (match.homeTeamId && match.awayTeamId) {
    return {
      status: "Ready",
      schedule: `${eventStartsAt} onwards`,
      tone: "default" as const,
    };
  }

  return {
    status: "Waiting",
    schedule: "TBD by admin",
    tone: "default" as const,
  };
}

function getLeagueMatchState(
  match: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,
  eventStartsAt: string,
  recordedMatches: Match[],
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
    status: "Scheduled",
    schedule: recorded?.scheduledLabel ?? `${eventStartsAt} onwards`,
    tone: "default" as const,
  };
}

function renderTeamName(teamLookup: Map<string, string>, teamId: string | null, fallback: string) {
  if (!teamId) return fallback;
  return teamLookup.get(teamId) ?? fallback;
}

// Kelompokkan match yang berdekatan dalam satu round menjadi pasangan,
// karena 2 match yang berdampingan itu yang hasilnya maju ke 1 slot
// di round berikutnya. Asumsi: `roundMatches` sudah terurut berdasar slot.
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
}: {
  match: BracketMatch;
  totalRounds: number;
  playInRound: number | null;
  eventStartsAt: string;
  recordedByRound: Map<string, Match>;
  teamLookup: Map<string, string>;
  roundConfigMap: Map<string, number>;
  gamesMap: Map<string, MatchGame[]>;
  connect: boolean;
}) {
  const state = getBracketMatchState(match, eventStartsAt, recordedByRound, roundConfigMap);
  const homeName = renderTeamName(teamLookup, match.homeTeamId, "TBD");
  const awayName = renderTeamName(teamLookup, match.awayTeamId, match.byeForTeamId ? "BYE" : "TBD");

  const candidate = recordedByRound.get(`${match.round}:${match.slot}`);
  const games = candidate ? (gamesMap.get(candidate.id) ?? []) : [];
  const bestOf = candidate ? (roundConfigMap.get(candidate.roundLabel) ?? 1) : 1;
  const teamsSwapped =
    candidate &&
    match.homeTeamId &&
    match.awayTeamId &&
    candidate.homeTeamId === match.awayTeamId &&
    candidate.awayTeamId === match.homeTeamId;
  const homeSeriesWins = teamsSwapped ? (candidate?.awayScore ?? 0) : (candidate?.homeScore ?? 0);
  const awaySeriesWins = teamsSwapped ? (candidate?.homeScore ?? 0) : (candidate?.awayScore ?? 0);

  const showDetail = bestOf > 1 && games.length > 0 && state.tone === "default" && state.status !== "Ready" && state.status !== "Waiting";

  return (
    <article
      className={`bracket-match relative rounded-2xl border border-slate-200 bg-white shadow-sm ${
        connect ? "bracket-match--connect" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Match {match.slot}</p>
          <p className="text-xs text-slate-500">
            {getRoundName(match.round, totalRounds, { playInRound })}
          </p>
        </div>
        <Pill tone={state.tone}>{state.status}</Pill>
      </div>

      <div className="divide-y divide-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-medium text-slate-900">{homeName}</span>
          <span className="mono text-xs text-slate-500">HOME</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-medium text-slate-900">{awayName}</span>
          <span className="mono text-xs text-slate-500">AWAY</span>
        </div>
      </div>

      {showDetail ? (
        <details className="group border-t border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs text-slate-500 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
            <span>Game detail</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] leading-none text-slate-400 group-open:border-slate-600 group-open:text-slate-600">
              ⓘ
            </span>
          </summary>
          <div className="border-t border-slate-100 px-4 pb-3 pt-2">
            {games.map((game) => {
              const homeWon = teamsSwapped
                ? game.awayScore > game.homeScore
                : game.homeScore > game.awayScore;
              const displayHome = teamsSwapped ? game.awayScore : game.homeScore;
              const displayAway = teamsSwapped ? game.homeScore : game.awayScore;
              return (
                <div key={game.gameNumber} className="flex items-center gap-2 border-b border-slate-100 py-1 text-xs last:border-0">
                  <span className="w-5 font-mono text-slate-400">G{game.gameNumber}</span>
                  <span className={homeWon ? "font-medium text-slate-900" : "text-slate-400"}>{displayHome}</span>
                  <span className="text-slate-300">–</span>
                  <span className={!homeWon ? "font-medium text-slate-900" : "text-slate-400"}>{displayAway}</span>
                  <span className="ml-auto max-w-[90px] truncate text-slate-400">{homeWon ? homeName : awayName} wins</span>
                </div>
              );
            })}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xs font-medium text-slate-600">
              <span>Series</span>
              <span>{homeSeriesWins} – {awaySeriesWins}</span>
            </div>
          </div>
        </details>
      ) : (
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Schedule: {state.schedule}
        </div>
      )}
    </article>
  );
}

export default async function BracketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const [teams, items, recordedMatches, roundConfigs, gamesMap] = await Promise.all([
    getTeamsForEvent(event.id),
    getPublicVisibleBracketPreview(event.id),
    getMatchesForEvent(event.id),
    getEventRoundConfigs(event.id),
    getMatchGamesForEvent(event.id),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((c) => [c.roundLabel, c.bestOf]));
  const teamLookup = new Map(teams.map((team) => [team.id, team.name]));

  if (event.format === "League") {
    return (
      <Section
        title={`${event.name} bracket / fixtures`}
        description="League events stay in fixture-list mode so admins and viewers can scan each pairing quickly."
      >
        <DataTable
          columns={["Round", "Fixture", "Status", "Schedule"]}
          rows={items.map((item) => {
            const state = getLeagueMatchState(item, event.startsAt, recordedMatches);

            return [
              `Round ${item.round}`,
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
  // For Ongoing/Finished events, getPublicVisibleBracketPreview already returns the full projected bracket.
  // Only call getBracketPreview separately for pre-start events where public view shows fewer rounds.
  const fullBracket = event.format === "Single Elimination" &&
    event.status !== "Ongoing" && event.status !== "Finished"
    ? (await getBracketPreview(event.id) as BracketMatch[])
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

  // Build a set of child-pair keys → parent match IDs among VISIBLE matches only.
  // A pair [A, B] has a visible parent when a visible round-N+1 match lists both
  // A.id and B.id in its sourceMatchIds.  Used to suppress tree-line connectors
  // for pairs whose parent is hidden (e.g. a round-2 slot that awaits a real match).
  const visibleParentPairs = new Set<string>();
  for (const match of bracketMatches) {
    const [left, right] = match.sourceMatchIds ?? [];
    if (left && right) visibleParentPairs.add([left, right].sort().join("|"));
  }

  return (
    <div className="space-y-6">
      {/* Style garis penghubung bracket. Di-scope lewat class
          .bracket-match / .bracket-pair di bawah. */}
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
        title={`${event.name} bracket`}
        description="Single-elimination events now render as a proper round-by-round bracket, connected with tree lines so it's clear how each pairing advances."
      >
        {bracketMatches.length ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-5">
              {matchesByRound.map((roundMatches, roundIndex) => {
                // "Next round" di sini artinya kolom berikutnya yang benar-benar
                // dirender (visibleRounds), bukan totalRounds — karena play-in
                // round bisa membuat visibleRounds tidak berurutan penuh.
                const hasNextRound = roundIndex < matchesByRound.length - 1;

                return (
                  <div key={roundIndex} className="flex min-w-[280px] flex-col gap-4">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.24em] text-cyan-600">
                        {getRoundName(visibleRounds[roundIndex], totalRounds, { playInRound })}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {roundMatches.length} match{roundMatches.length > 1 ? "es" : ""}
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
                            />
                          ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Bracket will appear once teams are available for this event.</p>
        )}
      </Section>

      <Section
        title="Bracket detail"
        description="Detail mode stays available below the visual bracket, now with clearer status and schedule columns."
      >
        <DataTable
          columns={["Round", "Match", "Teams", "Status", "Schedule"]}
          rows={bracketMatches.map((match) => {
            const state = getBracketMatchState(match, event.startsAt, recordedByRound, roundConfigMap);

            return [
              getRoundName(match.round, totalRounds, { playInRound }),
              `Match ${match.slot}`,
              `${renderTeamName(teamLookup, match.homeTeamId, "TBD")} vs ${renderTeamName(
                teamLookup,
                match.awayTeamId,
                match.byeForTeamId ? "BYE" : "TBD",
              )}`,
              <Pill key={`${match.id}-detail-status`} tone={state.tone}>
                {state.status}
              </Pill>,
              state.schedule,
            ];
          })}
        />
      </Section>
    </div>
  );
}
