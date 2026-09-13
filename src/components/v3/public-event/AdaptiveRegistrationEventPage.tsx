import React from "react";
import type { AdaptiveRegistrationEventViewModel } from "@/lib/events/adaptive-public-event";

import { OrganizerPublicCard } from "./OrganizerPublicCard";
import { PublicEventSectionNav } from "./PublicEventSectionNav";
import { PublicEventHero, type AdaptiveEventCopy } from "./PublicEventHero";
import { RegistrationEntryCta } from "./RegistrationEntryCta";
import { RegistrationOverview } from "./RegistrationOverview";
import { AdaptiveBracketBoard } from "./AdaptiveBracketBoard";

export function AdaptiveRegistrationEventPage({ view, locale, copy, readOnly = false }: {
  view: AdaptiveRegistrationEventViewModel;
  locale: "id" | "en";
  copy: AdaptiveEventCopy;
  readOnly?: boolean;
}) {
  return <div className="miracle-v3 adaptive-public-event grid min-w-0 gap-6 pb-20 lg:pb-12">
    <PublicEventHero view={view} locale={locale} copy={copy} />
    <PublicEventSectionNav
      ariaLabel={copy.publicTitle}
      labels={{
        summary: copy.summary,
        participants: copy.participants,
        requirements: copy.requirements,
        organizer: copy.organizer,
      }}
    />
    <div aria-label={locale === "id" ? "Pintasan event" : "Event shortcuts"} className="flex flex-wrap gap-2">
      {[["participants", locale === "id" ? "Peserta" : "Participants"], ["schedule", locale === "id" ? "Jadwal" : "Schedule"], ["bracket", "Bracket"], ["leaderboards", "Leaderboard"]].map(([route, label]) => <a key={route} href={`/${locale}/events/${view.event.slug}/${route}`} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold hover:bg-[var(--color-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-brand-cyan)]">{label}</a>)}
    </div>
    {!readOnly ? <RegistrationEntryCta view={view} locale={locale} /> : null}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <RegistrationOverview view={view} locale={locale} copy={copy} />
        <section className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
          <p className="mb-5 text-[var(--color-text-muted)]">{locale === "id" ? "Jadwal resmi belum diterbitkan. Seluruh posisi ditentukan organizer saat drawing." : "The official schedule has not been published. Every position is decided by the organizer during drawing."}</p>
          <AdaptiveBracketBoard locale={locale} format={view.event.formatLabel.toLocaleLowerCase().includes("league") ? "round_robin" : "single_elimination"} matches={[]} standings={[]} registrationSlots={view.registration.participantCap} />
        </section>
      </div>
      <OrganizerPublicCard view={view} locale={locale} copy={copy} />
    </div>
  </div>;
}
