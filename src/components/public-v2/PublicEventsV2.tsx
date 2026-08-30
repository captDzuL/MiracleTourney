import Link from "next/link";

import { EventVisual } from "@/components/public-v2/EventVisual";
import { getDefaultModeLabel } from "@/lib/platform/config";
import type { Event, Game, Team } from "@/lib/platform/types";

export type PublicEventsV2Labels = {
  title: string;
  description: string;
  allGames: string;
  teams: string;
  noEvents: string;
  issue: string;
  organizer: string;
  prizePool: string;
  entryFee: string;
};

export type PublicEventsV2Filters = {
  statuses: Array<{ id: string; label: string }>;
  activeStatus: string;
  activeGame: string;
};

export type PublicEventsV2Props = {
  events: Event[];
  games: Game[];
  teamsByEvent: Map<string, Team[]>;
  filters: PublicEventsV2Filters;
  href: (next: { game?: string; status?: string }) => string;
  locale?: "id" | "en";
  labels: PublicEventsV2Labels;
};

function issueNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function filterClass(active: boolean) {
  return [
    "pv-eyebrow shrink-0 border px-3 py-2 text-[11px] transition",
    active
      ? "border-[var(--pv-lime)] bg-[var(--pv-lime)] text-[#0b0f10]"
      : "border-[var(--pv-rule)] text-[var(--pv-ink-muted)] hover:border-[var(--pv-lime)] hover:text-[var(--pv-ink)]",
  ].join(" ");
}

export function PublicEventsV2({ events, games, teamsByEvent, filters, href, locale, labels }: PublicEventsV2Props) {
  const gameFilters = [{ id: "all", name: labels.allGames }, ...games];
  const localePrefix = locale ? `/${locale}` : "";

  return (
    <div className="pv-events grid gap-8 pb-12">
      <header className="grid gap-3 border-b border-[var(--pv-rule)] pb-6">
        <p className="pv-eyebrow">{labels.issue}</p>
        <h1>{labels.title}</h1>
        <p className="pv-muted max-w-2xl text-sm leading-6">{labels.description}</p>
      </header>

      <div className="grid gap-3">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {filters.statuses.map((status) => (
            <Link
              key={status.id}
              data-testid="pv-status-filter"
              href={href({ status: status.id })}
              aria-current={filters.activeStatus === status.id ? "page" : undefined}
              className={filterClass(filters.activeStatus === status.id)}
            >
              {status.label}
            </Link>
          ))}
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {gameFilters.map((game) => (
            <Link
              key={game.id}
              data-testid="pv-game-filter"
              href={href({ game: game.id })}
              aria-current={filters.activeGame === game.id ? "page" : undefined}
              className={filterClass(filters.activeGame === game.id)}
            >
              {game.name}
            </Link>
          ))}
        </div>
      </div>

      {events.length > 0 ? (
        <ul data-testid="pv-event-list" className="grid gap-5">
          {events.map((event, index) => {
            const game = games.find((entry) => entry.id === event.gameId);
            const teams = teamsByEvent.get(event.id) ?? [];
            return (
              <li
                key={event.id}
                data-testid="pv-event-row"
                className="border border-[var(--pv-rule)] bg-[var(--pv-canvas-raised)]"
              >
                <Link
                  href={`${localePrefix}/events/${event.slug}`}
                  className="grid gap-0 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]"
                >
                  <div className="relative">
                    <EventVisual
                      event={event}
                      alt=""
                      headingRenderedByCaller
                      ghostNumber={issueNumber(index)}
                      sizes="(max-width: 768px) 100vw, 240px"
                      className="aspect-[16/9] w-full md:aspect-[3/4] md:h-full"
                    />
                    <span className="pv-display pointer-events-none absolute left-3 top-2 text-3xl leading-none text-[var(--pv-ink)] opacity-70">
                      {issueNumber(index)}
                    </span>
                  </div>

                  <div className="grid content-start gap-3 p-5">
                    <p className="pv-eyebrow text-[var(--pv-lime)]">
                      {event.status} / {game?.name ?? event.gameId}
                    </p>
                    <h2 className="pv-wordmark">{event.name}</h2>
                    <p className="pv-muted line-clamp-3 text-sm leading-6">{event.description}</p>
                    <p className="pv-eyebrow text-[var(--pv-ink-muted)]">
                      {labels.organizer}: {event.organizerName ?? "Miracle Organizer"}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--pv-rule)] pt-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="pv-eyebrow text-[var(--pv-ink-muted)]">{getDefaultModeLabel(event.gameModeId, event.gameId)}</dt>
                        <dd className="font-semibold">{event.format}</dd>
                      </div>
                      <div>
                        <dt className="pv-eyebrow text-[var(--pv-ink-muted)]">{labels.teams}</dt>
                        <dd className="font-semibold">
                          {teams.length}/{event.participantCap}
                        </dd>
                      </div>
                      <div>
                        <dt className="pv-eyebrow text-[var(--pv-ink-muted)]">{event.registrationWindow}</dt>
                        <dd className="font-semibold">{event.startsAt}</dd>
                      </div>
                      {event.prizePoolLabel ? (
                        <div>
                          <dt className="pv-eyebrow text-[var(--pv-ink-muted)]">{labels.prizePool}</dt>
                          <dd className="font-semibold">{event.prizePoolLabel}</dd>
                        </div>
                      ) : null}
                      {event.registrationFeeRequired && event.registrationFeeLabel ? (
                        <div>
                          <dt className="pv-eyebrow text-[var(--pv-ink-muted)]">{labels.entryFee}</dt>
                          <dd className="font-semibold">{event.registrationFeeLabel}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pv-muted border border-[var(--pv-rule)] p-5 text-sm">{labels.noEvents}</p>
      )}
    </div>
  );
}
