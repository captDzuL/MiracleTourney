import React from "react";
import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";

import { OrganizerPublicCard } from "./OrganizerPublicCard";
import { PublicEventSectionNav } from "./PublicEventSectionNav";
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
    <PublicEventSectionNav
      ariaLabel={copy.publicTitle}
      labels={{
        summary: copy.summary,
        participants: copy.participants,
        requirements: copy.requirements,
        organizer: copy.organizer,
      }}
    />
    {!readOnly ? <RegistrationEntryCta view={view} locale={locale} /> : null}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <RegistrationOverview view={view} locale={locale} copy={copy} />
      <OrganizerPublicCard view={view} locale={locale} copy={copy} />
    </div>
  </div>;
}