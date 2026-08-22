import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EventVisual } from "@/components/public-v2/EventVisual";
import type { PublicHomeV2Match } from "@/components/public-v2/PublicHomeV2";
import { ShareButton } from "@/components/ShareButton";
import type { Event, Game, GameMode, Team } from "@/lib/platform/types";

export type PublicEventDetailV2Labels = {
  liveNow: string;
  organizer: string;
  issue: string;
  teamCount: string;
  register: string;
  quickLinks: string;
  participants: string;
  bracket: string;
  standings: string;
  leaderboards: string;
};

export type PublicEventDetailV2Props = {
  event: Event;
  game: Game;
  mode: GameMode;
  teams: Team[];
  bracket: PublicHomeV2Match[];
  locale?: "id" | "en";
  labels: PublicEventDetailV2Labels;
  children?: React.ReactNode;
};

const SECTIONS = ["participants", "bracket", "standings", "leaderboards"] as const;

function sectionHref(slug: string, section: (typeof SECTIONS)[number], locale?: "id" | "en") {
  const prefix = locale ? `/${locale}` : "";
  return `${prefix}/events/${slug}/${section}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--pv-rule)] pt-3">
      <p className="pv-eyebrow text-[var(--pv-ink-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function PublicEventDetailV2({
  event,
  game,
  mode,
  teams,
  bracket,
  locale,
  labels,
  children,
}: PublicEventDetailV2Props) {
  const isLive = Boolean(event.stream?.enabled && event.stream.isLive);
  const sectionLabels: Record<(typeof SECTIONS)[number], string> = {
    participants: labels.participants,
    bracket: labels.bracket,
    standings: labels.standings,
    leaderboards: labels.leaderboards,
  };

  return (
    <div className="pv-event-detail grid gap-8 pb-12">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,42%)] lg:items-start">
        <div className="grid content-start gap-4">
          <p className="pv-eyebrow text-[var(--pv-lime)]">
            {isLive ? labels.liveNow : event.status} / {game.name}
          </p>
          <h1>{event.name}</h1>
          <p className="pv-muted max-w-2xl text-sm leading-7">{event.description}</p>
          <p className="pv-eyebrow text-[var(--pv-ink-muted)]">
            {labels.organizer}: {event.organizerName ?? "Miracle Organizer"}
          </p>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label={event.registrationWindow} value={event.startsAt} />
            <Fact label={labels.teamCount} value={`${teams.length}/${event.participantCap}`} />
            <Fact label={mode.name} value={event.format} />
            <Fact label={event.registrationFeeLabel ?? event.venue} value={event.prizePoolLabel ?? event.venue} />
          </dl>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <ShareButton />
            {event.registrationUrl ? (
              <a
                data-testid="pv-detail-register"
                className="pv-button"
                href={event.registrationUrl}
                target="_blank"
                rel="noreferrer"
              >
                {labels.register}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="relative">
          <EventVisual
            event={event}
            alt=""
            priority
            headingRenderedByCaller
            sizes="(max-width: 1024px) 100vw, 42vw"
            className="aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
          />
          <span className="pv-display pointer-events-none absolute right-4 top-3 text-4xl leading-none text-[var(--pv-ink)] opacity-70">
            {labels.issue} {String(bracket.length).padStart(2, "0")}
          </span>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl">{labels.quickLinks}</h2>
        <ul className="grid gap-px border border-[var(--pv-rule)] bg-[var(--pv-rule)] sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <li key={section} className="bg-[var(--pv-canvas-raised)]">
              <Link
                data-testid="pv-detail-quick-link"
                href={sectionHref(event.slug, section, locale)}
                className="flex items-center justify-between gap-3 px-4 py-4 text-sm font-semibold transition hover:text-[var(--pv-lime)]"
              >
                {sectionLabels[section]}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {children ? <div className="pv-event-detail__extras grid gap-6">{children}</div> : null}
    </div>
  );
}
