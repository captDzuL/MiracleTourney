import { ArrowRight } from "lucide-react";

import { ConfettiField } from "@/components/public-v2/ConfettiField";
import { EventVisual } from "@/components/public-v2/EventVisual";
import { Link } from "@/i18n/navigation";
import { getDefaultModeLabel } from "@/lib/platform/config";
import type { Event, Game, Match, Team } from "@/lib/platform/types";

export type PublicHomeV2Labels = {
  ongoing: string;
  upNext: string;
  finished?: string;
  exploreEvent: string;
  allEvents: string;
  allGames: string;
  teams: string;
  eventDrop: string;
  liveFeed: string;
  tickerEmpty: string;
  noEvents: string;
  issue: string;
};

export type PublicHomeV2Match = Pick<Match, "id"> & {
  homeTeamId: string | null;
  awayTeamId: string | null;
} & Partial<Pick<Match, "roundLabel" | "homeScore" | "awayScore" | "status">>;

export type PublicHomeV2Props = {
  events: Event[];
  games: Game[];
  featuredEvent?: Event;
  featuredGame?: Game;
  featuredTeams: Team[];
  featuredBracket: PublicHomeV2Match[];
  gameFilter: string;
  labels: PublicHomeV2Labels;
};

function issueNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function statusLabel(event: Event, labels: PublicHomeV2Labels) {
  if (event.status === "Ongoing") return labels.ongoing;
  if (event.status === "Finished") return labels.finished ?? event.status;
  return labels.upNext;
}

export function PublicHomeV2({
  events,
  games,
  featuredEvent,
  featuredGame,
  featuredTeams,
  featuredBracket,
  gameFilter,
  labels,
}: PublicHomeV2Props) {
  const railEvents = events.filter((event) => event.id !== featuredEvent?.id);
  const ticker = featuredEvent?.status === "Ongoing" ? featuredBracket.slice(0, 3) : [];
  const teamName = (teamId: string | null) => featuredTeams.find((team) => team.id === teamId)?.name ?? "TBD";
  const filters = [{ id: "all", name: labels.allGames }, ...games];

  return (
    <div className="pv-home grid gap-10 pb-12">
      <section className="pv-hero pv-grain relative isolate overflow-hidden bg-[var(--pv-canvas-raised)]">
        <div className="relative z-[2] grid gap-6 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end">
          <div className="relative flex h-full flex-col justify-end gap-4 lg:self-stretch">
            {featuredEvent ? <ConfettiField /> : null}
            <p className="pv-eyebrow" data-testid="pv-hero-eyebrow">
              {featuredEvent ? (
                <>
                  {labels.issue} {issueNumber(0)} <span aria-hidden="true">/</span> {statusLabel(featuredEvent, labels)}
                  {featuredGame ? (
                    <>
                      {" "}
                      <span aria-hidden="true">/</span> {featuredGame.name}
                    </>
                  ) : null}
                </>
              ) : (
                labels.eventDrop
              )}
            </p>

            <h1 className="pv-wordmark text-[clamp(2.75rem,9vw,6rem)]">
              {featuredEvent ? featuredEvent.name : labels.eventDrop}
            </h1>

            {featuredEvent ? (
              <p className="pv-muted text-sm" data-testid="pv-hero-meta">
                {[
                  featuredGame?.name,
                  getDefaultModeLabel(featuredEvent.gameModeId, featuredEvent.gameId),
                  featuredEvent.startsAt,
                  `${featuredTeams.length}/${featuredEvent.participantCap} ${labels.teams}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : (
              <p className="pv-muted text-sm">{labels.noEvents}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {featuredEvent ? (
                <Link
                  className="pv-button"
                  data-testid="pv-hero-primary-cta"
                  href={`/events/${featuredEvent.slug}`}
                >
                  {labels.exploreEvent}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
              <Link className="pv-button pv-button--ghost" data-testid="pv-hero-secondary-cta" href="/events">
                {labels.allEvents}
              </Link>
            </div>
          </div>

          {featuredEvent ? (
            <div className="relative">
              <EventVisual
                event={featuredEvent}
                alt={featuredEvent.name}
                priority
                headingRenderedByCaller
                framed
                ghostNumber={issueNumber(0)}
                sizes="(max-width: 768px) 100vw, 45vw"
                className="aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
              />
            </div>
          ) : null}
        </div>

        <div className="relative z-[2] border-t border-[var(--pv-rule)] px-5 py-4 md:px-8">
          <p className="pv-eyebrow mb-3 flex items-center gap-2">
            {ticker.length > 0 ? <span className="pv-live-dot" aria-hidden="true" /> : null}
            {labels.liveFeed}
          </p>
          {ticker.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {ticker.map((match) => (
                <li
                  key={match.id}
                  data-testid="pv-ticker-row"
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border border-[var(--pv-rule)] px-3 py-2.5 text-sm"
                >
                  <span className="pv-eyebrow">{match.roundLabel}</span>
                  <span className="truncate font-semibold">{teamName(match.homeTeamId)}</span>
                  <span className="pv-display text-lg text-[var(--pv-lime)]">
                    {match.status === "Completed" ? `${match.homeScore}-${match.awayScore}` : "VS"}
                  </span>
                  <span className="truncate text-right font-semibold">{teamName(match.awayTeamId)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pv-muted text-sm">{labels.tickerEmpty}</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 px-5 md:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[clamp(1.75rem,4vw,2.75rem)]">{labels.eventDrop}</h2>
          <Link className="pv-eyebrow underline-offset-4 hover:underline" href="/events">
            {labels.allEvents}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((game) => {
            const active = gameFilter === game.id;
            return (
              <Link
                key={game.id}
                data-testid="pv-game-filter"
                href={game.id === "all" ? "/" : `/?game=${game.id}`}
                aria-current={active ? "page" : undefined}
                className={`pv-eyebrow border px-3 py-2 ${
                  active
                    ? "border-[var(--pv-lime)] text-[var(--pv-lime)]"
                    : "border-[var(--pv-rule)] hover:border-[var(--pv-ink-muted)]"
                }`}
              >
                {game.name}
              </Link>
            );
          })}
        </div>

        {railEvents.length > 0 ? (
          <ul
            data-testid="pv-event-rail"
            className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0"
          >
            {railEvents.map((event, index) => {
              const game = games.find((entry) => entry.id === event.gameId);
              return (
                <li
                  key={event.id}
                  data-testid="pv-event-card"
                  className="w-[78%] shrink-0 snap-start border border-[var(--pv-rule)] bg-[var(--pv-canvas-raised)] sm:w-[52%] md:w-auto"
                >
                  <Link className="grid gap-3" href={`/events/${event.slug}`}>
                    <div className="relative">
                      <EventVisual
                        event={event}
                        alt={event.name}
                        headingRenderedByCaller
                        ghostNumber={issueNumber(index + 1)}
                        sizes="(max-width: 768px) 78vw, 30vw"
                        className="aspect-[3/4] w-full"
                      />
                      <span
                        aria-hidden="true"
                        className="pv-display absolute right-2 top-1 text-3xl leading-none text-[var(--pv-ink)] opacity-70"
                      >
                        {issueNumber(index + 1)}
                      </span>
                    </div>
                    <div className="grid gap-2 px-3 pb-4">
                      <p className="pv-eyebrow">
                        {statusLabel(event, labels)} <span aria-hidden="true">/</span> {game?.name ?? event.gameId}
                      </p>
                      <h3 className="pv-wordmark text-2xl">{event.name}</h3>
                      <p className="pv-muted text-xs">
                        {event.participantCap} {labels.teams} <span aria-hidden="true">·</span> {event.format}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pv-muted text-sm">{labels.noEvents}</p>
        )}
      </section>
    </div>
  );
}
