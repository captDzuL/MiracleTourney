import { notFound } from "next/navigation";

import { DataTable, Pill, Section } from "@/components/ui";
import {
  getMatchesForEvent,
  getBracketPreview,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  getTeamsForEvent,
} from "@/lib/platform/demo-store";
import type { Match } from "@/lib/platform/types";
import type { BracketMatch } from "@/lib/tournament/types";

export const dynamic = "force-dynamic";

function getRoundName(round: number, totalRounds: number) {
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

function isRecordedForMatch(
  match: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,
  recorded: Match | undefined,
) {
  return Boolean(
    recorded &&
      match.homeTeamId &&
      match.awayTeamId &&
      match.homeTeamId === recorded.homeTeamId &&
      match.awayTeamId === recorded.awayTeamId,
  );
}

function getBracketMatchState(
  match: BracketMatch,
  eventStartsAt: string,
  recordedMatches: Map<string, Match>,
) {
  if (match.byeForTeamId) {
    return {
      status: "Bye",
      schedule: "Auto-advance",
      tone: "success" as const,
    };
  }

  const candidate = recordedMatches.get(`${match.round}:${match.slot}`);
  const recorded = isRecordedForMatch(match, candidate) ? candidate : undefined;

  if (recorded?.status === "Completed") {
    return {
      status: `${recorded.homeScore} - ${recorded.awayScore}`,
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
  const recorded = recordedMatches.find((candidate) => isRecordedForMatch(match, candidate));

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

export default async function BracketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getPublicEventBySlug(slug);
  if (!event) notFound();

  const teams = getTeamsForEvent(event.id);
  const teamLookup = new Map(teams.map((team) => [team.id, team.name]));
  const items = getPublicVisibleBracketPreview(event.id);
  const recordedMatches = getMatchesForEvent(event.id);

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
  const fullBracket = event.format === "Single Elimination"
    ? (getBracketPreview(event.id) as BracketMatch[])
    : [];
  const totalRounds = Math.max(
    ...(event.format === "Single Elimination" ? fullBracket : bracketMatches).map((match) => match.round),
    1,
  );
  const visibleRounds = [...new Set(bracketMatches.map((match) => match.round))];
  const matchesByRound = visibleRounds.map((round) =>
    bracketMatches.filter((match) => match.round === round),
  );
  const recordedByRound = buildRecordedMatchLookup(recordedMatches);

  return (
    <div className="space-y-6">
      <Section
        title={`${event.name} bracket`}
        description="Single-elimination events now render as a proper round-by-round bracket so byes and advancing slots are easier to read."
      >
        {bracketMatches.length ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-5">
              {matchesByRound.map((roundMatches, roundIndex) => (
                <div key={roundIndex} className="flex min-w-[280px] flex-col gap-4">
                  <div>
                    <p className="mono text-xs uppercase tracking-[0.24em] text-cyan-600">
                      {getRoundName(visibleRounds[roundIndex], totalRounds)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {roundMatches.length} match{roundMatches.length > 1 ? "es" : ""}
                    </p>
                  </div>

                  <div
                    className="flex flex-1 flex-col justify-around gap-4"
                    style={{ paddingTop: `${roundIndex * 2.5}rem`, paddingBottom: `${roundIndex * 2.5}rem` }}
                  >
                    {roundMatches.map((match) => {
                      const state = getBracketMatchState(match, event.startsAt, recordedByRound);
                      const homeName = renderTeamName(teamLookup, match.homeTeamId, "TBD");
                      const awayName = renderTeamName(teamLookup, match.awayTeamId, match.byeForTeamId ? "BYE" : "TBD");

                      return (
                        <article
                          key={match.id}
                          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Match {match.slot}</p>
                              <p className="text-xs text-slate-500">{getRoundName(match.round, totalRounds)}</p>
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

                          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                            Schedule: {state.schedule}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
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
            const state = getBracketMatchState(match, event.startsAt, recordedByRound);

            return [
              getRoundName(match.round, totalRounds),
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
