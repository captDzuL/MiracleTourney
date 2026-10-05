import React from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackToEvent } from "@/components/public-v2/BackToEvent";
import { TeamIdentity } from "@/components/TeamAvatar";
import { PublicV3Action, PublicV3SectionHeading } from "@/components/v3/public-discovery/PublicV3Primitives";
import { AdaptiveBracketBoard } from "@/components/v3/public-event/AdaptiveBracketBoard";
import { SocialBracketBoard } from "@/components/v3/public-event/SocialBracketBoard";
import { BracketPngDownloads } from "@/components/v3/public-event/BracketPngDownloads";
import { DataTable, Pill, Section } from "@/components/ui";
import { getPublicDrawingEvent, getPublicFinishedEvent } from "@/lib/events/adaptive-public-phases";
import { getPublicOngoingEvent } from "@/lib/events/public-ongoing";
import { publicMatchLabel } from "@/lib/events/public-match-label";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { readPublicSocialBracket } from "@/lib/bracket/read";
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
  if (!team) return <span className="pv-team-identity__meta font-medium text-slate-500">{fallback}</span>;

  return <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} size="sm" />;
}

function isScoreStatus(status: string) {
  return /^\d+\s*-\s*\d+(?:\s*\(BO\d+\))?$/.test(status);
}

function V3BracketPage({
  backLabel,
  children,
  description,
  event,
  locale,
  title,
}: {
  backLabel: string;
  children: React.ReactNode;
  description: string;
  event: { name: string; slug: string };
  locale?: "id" | "en";
  title: string;
}) {
  const eventHref = `${locale ? `/${locale}` : ""}/events/${event.slug}`;

  return (
    <div className="miracle-public-v3 mpv3-bracket-page">
      <div className="mpv3-directory-breadcrumb">
        <PublicV3Action href={eventHref} variant="text">← {backLabel}</PublicV3Action>
      </div>
      <div className="mpv3-directory-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function V3BracketTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="mpv3-table-wrap">
      <table className="min-w-[44rem]">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchStatePill({ status, tone, presentation = "legacy" }: { status: string; tone: "default" | "live" | "success"; presentation?: "legacy" | "v3" }) {
  if (isScoreStatus(status)) {
    if (presentation === "v3") {
      return <span className="mpv3-badge" data-status="completed">{status}</span>;
    }

    return (
      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-950 px-3 py-1 font-mono text-xs font-semibold tabular-nums text-white shadow-sm">
        {status}
      </span>
    );
  }

  if (presentation === "v3") {
    const statusKey = tone === "live" ? "live" : tone === "success" ? "completed" : "scheduled";
    return <span className="mpv3-badge" data-status={statusKey}>{status}</span>;
  }

  return <Pill tone={tone}>{status}</Pill>;
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
  presentation = "legacy",
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
  presentation?: "legacy" | "v3";
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
      className={`${presentation === "v3" ? "mpv3-bracket-match relative" : "pv-match-card bracket-match relative rounded-2xl border border-slate-200 bg-white shadow-sm"} ${
        connect ? "bracket-match--connect" : ""
      }`}
    >
      <div className={`pv-match-card__header flex items-center justify-between border-b px-4 py-3 ${presentation === "v3" ? "border-[var(--color-border)]" : "border-slate-200"}`}>
        <div>
          <p className={`pv-match-card__slot text-sm font-medium ${presentation === "v3" ? "text-[var(--color-text)]" : "text-slate-900"}`}>{t("matchCard", { n: match.slot })}</p>
          <p className={`pv-match-card__round text-xs ${presentation === "v3" ? "text-[var(--color-text-muted)]" : "text-slate-500"}`}>
            {getRoundName(match.round, totalRounds, roundNames, { playInRound })}
          </p>
        </div>
        <MatchStatePill status={state.status} tone={state.tone} presentation={presentation} />
      </div>

      <div className={`pv-match-card__body flex flex-col divide-y ${presentation === "v3" ? "divide-[var(--color-border)]" : "divide-slate-200"}`}>
        <div className="pv-match-card__team-row flex items-center justify-between gap-3 px-4 py-3">
          <span className="pv-match-card__team-slot min-w-0">
            {renderTeamSlot(teamLookup, match.homeTeamId, "TBD")}
          </span>
          <span className={`pv-match-card__side mono shrink-0 whitespace-nowrap text-right text-xs ${presentation === "v3" ? "text-[var(--color-text-muted)]" : "text-slate-500"}`}>{t("home")}</span>
        </div>
        <div className="pv-match-card__team-row flex items-center justify-between gap-3 px-4 py-3">
          <span className="pv-match-card__team-slot min-w-0">
            {renderTeamSlot(teamLookup, match.awayTeamId, match.byeForTeamId ? "BYE" : "TBD")}
          </span>
          <span className={`pv-match-card__side mono shrink-0 whitespace-nowrap text-right text-xs ${presentation === "v3" ? "text-[var(--color-text-muted)]" : "text-slate-500"}`}>{t("away")}</span>
        </div>
      </div>

      {showDetail ? (
        <details className={`pv-match-card__detail group border-t ${presentation === "v3" ? "border-[var(--color-border)]" : "border-slate-200"}`}>
          <summary className={`pv-match-card__summary flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2 text-xs ${presentation === "v3" ? "text-[var(--color-text-muted)] hover:text-[var(--color-text)]" : "text-slate-500 hover:text-slate-700"} [&::-webkit-details-marker]:hidden`}>
            <span>{t("gameDetail")}</span>
            <span className={`pv-match-card__summary-icon inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium leading-none ${presentation === "v3" ? "border-[var(--color-border-strong)] text-[var(--color-text-muted)] group-open:border-[var(--color-brand-cyan)] group-open:text-[var(--color-brand-cyan)]" : "border-slate-300 text-slate-400 group-open:border-slate-600 group-open:text-slate-600"}`}>
              i
            </span>
          </summary>
          <div className={`pv-match-card__games border-t px-4 pb-3 pt-2 ${presentation === "v3" ? "border-[var(--color-border)]" : "border-slate-100"}`}>
            {series.games.map((game) => {
              const homeWon = series.teamsSwapped
                ? game.awayScore > game.homeScore
                : game.homeScore > game.awayScore;
              const displayHome = series.teamsSwapped ? game.awayScore : game.homeScore;
              const displayAway = series.teamsSwapped ? game.homeScore : game.awayScore;
              const homeScoreClass = homeWon
                ? `pv-match-card__game-score pv-match-card__game-score--winner font-semibold tabular-nums ${presentation === "v3" ? "text-[var(--color-text)]" : "text-slate-900"}`
                : `pv-match-card__game-score tabular-nums ${presentation === "v3" ? "text-[var(--color-text-subtle)]" : "text-slate-400"}`;
              const awayScoreClass = !homeWon
                ? `pv-match-card__game-score pv-match-card__game-score--winner font-semibold tabular-nums ${presentation === "v3" ? "text-[var(--color-text)]" : "text-slate-900"}`
                : `pv-match-card__game-score tabular-nums ${presentation === "v3" ? "text-[var(--color-text-subtle)]" : "text-slate-400"}`;

              return (
                <div key={game.gameNumber} className={`pv-match-card__game-row flex items-center gap-2 border-b py-1 text-xs last:border-0 ${presentation === "v3" ? "border-[var(--color-border)]" : "border-slate-100"}`}>
                  <span className={`pv-match-card__game-label w-5 shrink-0 font-mono ${presentation === "v3" ? "text-[var(--color-text-subtle)]" : "text-slate-400"}`}>G{game.gameNumber}</span>
                  <span className={homeScoreClass}>{displayHome}</span>
                  <span className={`pv-match-card__game-separator ${presentation === "v3" ? "text-[var(--color-text-subtle)]" : "text-slate-300"}`}>-</span>
                  <span className={awayScoreClass}>{displayAway}</span>
                  <span className={`pv-match-card__game-winner ml-auto min-w-0 max-w-[90px] truncate text-right ${presentation === "v3" ? "text-[var(--color-text-subtle)]" : "text-slate-400"}`}>
                    {homeWon ? homeName : awayName} wins
                  </span>
                </div>
              );
            })}
            <div className={`pv-match-card__series mt-2 flex justify-between border-t pt-2 text-xs font-medium ${presentation === "v3" ? "border-[var(--color-border)] text-[var(--color-text-muted)]" : "border-slate-200 text-slate-600"}`}>
              <span>{t("series")}</span>
              <span>{series.homeSeriesWins} - {series.awaySeriesWins}</span>
            </div>
          </div>
        </details>
      ) : (
        <div className={`pv-match-card__schedule border-t px-4 py-3 text-xs ${presentation === "v3" ? "border-[var(--color-border)] text-[var(--color-text-muted)]" : "border-slate-200 text-slate-500"}`}>
          {t("schedule", { schedule: state.schedule })}
        </div>
      )}
    </article>
  );
}

export async function renderBracketPage(slug: string, locale?: "id" | "en") {
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
  const visualV3 = isFeatureEnabled("ui_v3_foundation");
  const socialModel = visualV3 ? await readPublicSocialBracket(slug, locale ?? "id") : null;
  const pngRounds = socialModel ? [...new Map(socialModel.matches.map(match => [match.roundKey, { key: match.roundKey, label: match.roundLabel }])).values()] : [];

  if (isFeatureEnabled("adaptive_public_event_v3")) {
    const drawing = ["Published", "Registration Closed"].includes(event.status)
      ? await getPublicDrawingEvent(slug).catch(() => null)
      : null;
    const ongoing = event.status === "Ongoing"
      ? await getPublicOngoingEvent(slug).catch(() => null)
      : null;
    const finished = event.status === "Finished"
      ? await getPublicFinishedEvent(slug).catch(() => null)
      : null;
    const view = drawing ?? ongoing ?? finished;
    const format = view?.event.format ?? event.formatConfig?.kind ?? (event.format === "League" ? "round_robin" : "single_elimination");
    const adaptiveMatches = view?.mode === "ongoing"
      ? view.matches.map((match) => ({ ...match, roundLabel: publicMatchLabel(match, locale ?? "id") }))
      : view?.matches ?? [];
    const standings = view && "standings" in view ? view.standings : [];
    const registrationSlots = !view && ["Published", "Registration Closed"].includes(event.status) ? event.participantCap : 0;

    if (visualV3 && socialModel && format !== "round_robin") {
      return (
        <V3BracketPage
          backLabel={t("backToEvent")}
          description={t("description")}
          event={event}
          locale={locale}
          title={t("title", { name: event.name })}
        >
          <SocialBracketBoard model={socialModel} />
        </V3BracketPage>
      );
    }

    if (visualV3) {
      return (
        <V3BracketPage
          backLabel={t("backToEvent")}
          description={format === "round_robin" ? t("leagueDescription") : t("description")}
          event={event}
          locale={locale}
          title={t("title", { name: event.name })}
        >
          <section className="mpv3-section mpv3-panel mpv3-panel-pad" aria-label={t("title", { name: event.name })}>
            {format === "round_robin" && socialModel ? <div className="mb-4"><BracketPngDownloads model={socialModel} rounds={pngRounds} /></div> : null}
            <AdaptiveBracketBoard
              locale={locale ?? "id"}
              format={format}
              matches={adaptiveMatches}
              standings={standings}
              registrationSlots={registrationSlots}
              presentation="v3"
            />
          </section>
        </V3BracketPage>
      );
    }

    return <>
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      <Section title={t("title", { name: event.name })} description={format === "round_robin" ? t("leagueDescription") : t("description")}>
        <AdaptiveBracketBoard locale={locale ?? "id"} format={format} matches={adaptiveMatches} standings={standings} registrationSlots={registrationSlots} />
      </Section>
    </>;
  }

  if (visualV3 && socialModel && event.format !== "League") {
    return (
      <V3BracketPage
        backLabel={t("backToEvent")}
        description={t("description")}
        event={event}
        locale={locale}
        title={t("title", { name: event.name })}
      >
        <SocialBracketBoard model={socialModel} />
      </V3BracketPage>
    );
  }

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
    const columns = [t("roundCol"), t("fixtureCol"), t("statusCol"), t("scheduleCol")];
    const rows = items.map((item) => {
      const state = getLeagueMatchState(item, event.startsAt, recordedMatches, labels);

      return [
        roundNames.roundN(item.round),
        `${renderTeamName(teamLookup, item.homeTeamId, "TBD")} vs ${renderTeamName(teamLookup, item.awayTeamId, "TBD")}`,
        <MatchStatePill key={`${item.id}-league-status`} status={state.status} tone={state.tone} presentation={visualV3 ? "v3" : "legacy"} />,
        state.schedule,
      ];
    });

    if (visualV3) {
      return (
        <V3BracketPage
          backLabel={t("backToEvent")}
          description={t("leagueDescription")}
          event={event}
          locale={locale}
          title={t("title", { name: event.name })}
        >
          <section className="mpv3-section" aria-label={t("title", { name: event.name })}>
            {socialModel ? <div className="mb-4"><BracketPngDownloads model={socialModel} rounds={pngRounds} /></div> : null}
            <V3BracketTable columns={columns} rows={rows} />
          </section>
        </V3BracketPage>
      );
    }

    return (
      <>
        <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
        <Section
          title={t("title", { name: event.name })}
          description={t("leagueDescription")}
        >
          <DataTable columns={columns} rows={rows} />
        </Section>
      </>
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

  const presentation = visualV3 ? "v3" : "legacy";
  const bracketBoard = bracketMatches.length ? (
    <div className={visualV3 ? "mpv3-bracket-scroll" : "max-w-full overflow-x-auto overscroll-x-contain pb-2"}>
      <div className={visualV3 ? "mpv3-bracket-board" : "flex min-w-max gap-5"}>
        {matchesByRound.map((roundMatches, roundIndex) => {
          const hasNextRound = roundIndex < matchesByRound.length - 1;

          return (
            <div key={roundIndex} className={visualV3 ? "mpv3-round" : "flex min-w-[280px] flex-col gap-4"}>
              <div className={visualV3 ? "mpv3-round-title" : undefined}>
                <p className={`pv-round-label mono text-xs uppercase tracking-[0.24em] ${visualV3 ? "text-[var(--mpv3-cyan)]" : "text-cyan-600"}`}>
                  {getRoundName(visibleRounds[roundIndex], totalRounds, roundNames, { playInRound })}
                </p>
                <p className={`pv-round-count mt-1 text-sm ${visualV3 ? "text-[var(--mpv3-muted)]" : "text-slate-500"}`}>
                  {t("matchCount", { count: roundMatches.length })}
                </p>
              </div>

              <div
                className={visualV3 ? "mpv3-round-matches" : "flex flex-1 flex-col justify-around gap-4"}
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
                              presentation={presentation}
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
                        presentation={presentation}
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
    <p className={visualV3 ? "mpv3-empty-state" : "text-sm text-slate-500"} role={visualV3 ? "status" : undefined}>{t("empty")}</p>
  );

  const detailColumns = [t("roundCol"), t("matchCol"), t("teamsCol"), t("statusCol"), t("scheduleCol")];
  const detailRows = bracketMatches.map((match) => {
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
      <MatchStatePill key={`${match.id}-detail-status`} status={state.status} tone={state.tone} presentation={presentation} />,
      scheduleLabel,
    ];
  });

  const connectorColor = visualV3 ? "var(--mpv3-border)" : "#cbd5e1";
  const connectorStyles = (
    <style>{`
      .bracket-match--connect::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 100%;
        width: 0.625rem;
        height: 2px;
        background: ${connectorColor};
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
        background: ${connectorColor};
      }
      .bracket-pair::after {
        content: "";
        position: absolute;
        top: 50%;
        left: calc(100% + 0.625rem);
        width: 0.625rem;
        height: 2px;
        background: ${connectorColor};
        transform: translateY(-50%);
      }
    `}</style>
  );

  const bracketSection = visualV3 ? (
    <section className="mpv3-section" aria-label={t("title", { name: event.name })}>
      {bracketBoard}
    </section>
  ) : (
    <Section title={t("title", { name: event.name })} description={t("description")}>
      {bracketBoard}
    </Section>
  );
  const detailSection = visualV3 ? (
    <section className="mpv3-section" aria-labelledby="bracket-detail-heading">
      <PublicV3SectionHeading id="bracket-detail-heading" title={t("detailTitle")} description={t("detailDescription")} />
      <V3BracketTable columns={detailColumns} rows={detailRows} />
    </section>
  ) : (
    <Section title={t("detailTitle")} description={t("detailDescription")}>
      <DataTable columns={detailColumns} rows={detailRows} />
    </Section>
  );

  if (visualV3) {
    return (
      <V3BracketPage
        backLabel={t("backToEvent")}
        description={t("description")}
        event={event}
        locale={locale}
        title={t("title", { name: event.name })}
      >
        {connectorStyles}
        {bracketSection}
        {detailSection}
      </V3BracketPage>
    );
  }

  return (
    <div className="space-y-6">
      {connectorStyles}
      <BackToEvent slug={slug} locale={locale} label={t("backToEvent")} />
      {bracketSection}
      {detailSection}
    </div>
  );
}
