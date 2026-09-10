import React from "react";
import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";

import { OrganizerPublicCard } from "./OrganizerPublicCard";
import { PublicEventHero, type AdaptiveEventCopy } from "./PublicEventHero";
import { RegistrationEntryCta } from "./RegistrationEntryCta";
import { RegistrationOverview } from "./RegistrationOverview";

export function AdaptiveRegistrationEventPage({ view, locale, copy, readOnly = false }: {
  view: AdaptivePublicEventViewModel;
  locale: "id" | "en";
  copy: AdaptiveEventCopy;
  readOnly?: boolean;
}) {
  return <div className="miracle-v3 adaptive-public-event grid min-w-0 gap-6 pb-20 lg:pb-12">
    <PublicEventHero view={view} locale={locale} copy={copy} />
    <nav aria-label={copy.publicTitle} className="overflow-x-auto border-y border-[var(--color-border)]">
      <div className="flex min-w-max gap-7 py-4 text-sm font-bold">
        <a href="#summary" className="min-h-11 content-center hover:text-[var(--color-brand-cyan)]">{copy.summary}</a>
        <a href="#participants" className="min-h-11 content-center hover:text-[var(--color-brand-cyan)]">{copy.participants}</a>
        <a href="#requirements" className="min-h-11 content-center hover:text-[var(--color-brand-cyan)]">{copy.requirements}</a>
        <a href="#organizer" className="min-h-11 content-center hover:text-[var(--color-brand-cyan)]">{copy.organizer}</a>
      </div>
    </nav>
    {!readOnly ? <RegistrationEntryCta view={view} locale={locale} /> : null}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <RegistrationOverview view={view} locale={locale} copy={copy} />
      <OrganizerPublicCard view={view} locale={locale} copy={copy} />
    </div>
  </div>;
}