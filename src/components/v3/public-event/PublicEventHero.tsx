import React from "react";
import { CalendarDays, MapPin, ShieldCheck, Trophy, Users } from "lucide-react";

import { ShareButton } from "@/components/ShareButton";
import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";

export type AdaptiveEventCopy = {
  registrationOpen: string;
  registrationUpcoming: string;
  registrationFull: string;
  registrationClosed: string;
  organizedBy: string;
  verified: string;
  share: string;
  startsAt: string;
  timezone: string;
  venue: string;
  prize: string;
  slots: string;
  summary: string;
  participants: string;
  requirements: string;
  organizer: string;
  registrationPeriod: string;
  opens: string;
  closes: string;
  capacity: string;
  activeTeams: string;
  pendingReview: string;
  remaining: string;
  fee: string;
  roster: string;
  rosterValue: string;
  uidIgn: string;
  howToTitle: string;
  steps: string[];
  description: string;
  format: string;
  contact: string;
  contactHint: string;
  importantInfo: string;
  teamCount: string;
  publicTitle: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "EV";
}

function fact(value: string, label: string, icon: React.ReactNode) {
  return <div className="min-w-0 border-t border-[var(--color-border)] pt-3">
    <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{icon}{label}</dt>
    <dd className="mt-2 break-words text-sm font-semibold text-[var(--color-text)]">{value}</dd>
  </div>;
}

export function PublicEventHero({ view, locale, copy }: {
  view: AdaptivePublicEventViewModel;
  locale: "id" | "en";
  copy: AdaptiveEventCopy;
}) {
  const statusLabel = view.registration.availability === "upcoming"
    ? copy.registrationUpcoming
    : view.registration.availability === "full"
      ? copy.registrationFull
      : view.registration.availability === "closed"
        ? copy.registrationClosed
        : copy.registrationOpen;
  const start = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "long", timeStyle: "short", timeZone: view.event.timezone,
  }).format(new Date(view.event.eventStartsAt));

  return <section className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,.92fr)]">
      <div className="order-2 flex min-w-0 flex-col p-5 sm:p-8 lg:order-1 lg:p-10">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
          <span className="rounded-full bg-[var(--color-brand-violet)] px-3 py-1.5 text-white">{statusLabel}</span>
          <span className="text-[var(--color-brand-cyan)]">{view.event.gameName} · {view.event.modeName}</span>
        </div>
        <div className="mt-7 flex items-center gap-3">
          <div data-testid="adaptive-event-logo" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] text-lg font-extrabold text-[var(--color-brand-cream)]">
            {view.event.logoUrl ? <img src={view.event.logoUrl} alt="" className="h-full w-full object-contain" /> : <span>{initials(view.event.name)}</span>}
          </div>
          <div className="min-w-0 text-sm text-[var(--color-text-muted)]">
            <p>{copy.organizedBy}</p>
            <p className="flex flex-wrap items-center gap-1.5 font-bold text-[var(--color-text)]">
              {view.organizer.name}
              {view.organizer.verified ? <ShieldCheck className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-label={copy.verified} /> : null}
            </p>
          </div>
        </div>
        <h1 className="mt-6 max-w-4xl text-3xl font-extrabold leading-tight text-[var(--color-text)] sm:text-5xl">{view.event.name}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-text-muted)] sm:text-base">{view.event.description}</p>
        <div className="mt-6"><ShareButton /></div>
        <dl className="mt-auto grid gap-4 pt-8 sm:grid-cols-2 xl:grid-cols-3">
          {fact(start, copy.startsAt, <CalendarDays className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-hidden />)}
          {fact(view.event.timezone === "Asia/Jakarta" ? "WIB" : view.event.timezone, copy.timezone, <CalendarDays className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-hidden />)}
          {fact(view.event.venue, copy.venue, <MapPin className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-hidden />)}
          {fact(view.event.prize ?? "—", copy.prize, <Trophy className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-hidden />)}
          {fact(`${view.registration.occupiedSlots}/${view.registration.participantCap}`, copy.slots, <Users className="h-4 w-4 text-[var(--color-brand-cyan)]" aria-hidden />)}
        </dl>
      </div>
      <div data-testid="adaptive-event-poster" className="relative order-1 min-h-64 overflow-hidden border-b border-[var(--color-border)] bg-[linear-gradient(145deg,#101c2e,#39217c)] lg:order-2 lg:min-h-[36rem] lg:border-b-0 lg:border-l">
        {view.event.posterUrl ? <img src={view.event.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-7xl font-extrabold text-white/20">{initials(view.event.name)}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <p className="absolute bottom-5 left-5 rounded-full border border-white/25 bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">{view.event.formatLabel}</p>
      </div>
    </div>
  </section>;
}