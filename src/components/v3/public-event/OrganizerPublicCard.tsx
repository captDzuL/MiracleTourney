import React from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

import type { AdaptivePublicEventViewModel } from "@/lib/events/adaptive-public-event";
import type { AdaptiveEventCopy } from "./PublicEventHero";

function localizeDetail(detail: string, locale: "id" | "en") {
  if (locale === "en") return detail;
  return detail
    .replace(/^Early rounds/, "Babak awal")
    .replace(/^Semifinals/, "Semifinal")
    .replace(/^Final/, "Final")
    .replace(/^Third-place match/, "Perebutan juara tiga")
    .replace(/^Upper final/, "Final upper bracket")
    .replace(/^Lower final/, "Final lower bracket")
    .replace(/^Grand final/, "Grand final")
    .replace(/^(\d+) groups$/, "$1 grup")
    .replace(/^Top (\d+) qualify from each group$/, "$1 tim terbaik dari setiap grup lolos")
    .replace(/^Single round-robin$/, "Satu putaran round-robin")
    .replace(/^Double round-robin$/, "Dua putaran round-robin")
    .replace(/^Single round-robin group stage$/, "Fase grup satu putaran")
    .replace(/^Double round-robin group stage$/, "Fase grup dua putaran")
    .replace(/^Single-elimination playoffs$/, "Playoff single elimination")
    .replace(/^Double-elimination playoffs$/, "Playoff double elimination")
    .replace(/ points$/, " poin");
}

export function OrganizerPublicCard({ view, locale, copy }: { view: AdaptivePublicEventViewModel; locale: "id" | "en"; copy: AdaptiveEventCopy }) {
  const contact = <span className="break-all font-extrabold text-[var(--color-brand-cyan)]">{view.organizer.contactValue || "—"}</span>;
  return <aside id="organizer" className="grid content-start gap-5">
    <section className="rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-brand-cream)]">{copy.organizer}</p>
      <h2 className="mt-3 flex items-center gap-2 text-xl font-extrabold">{view.organizer.name}{view.organizer.verified ? <ShieldCheck className="h-5 w-5 text-[var(--color-brand-cyan)]" aria-label={copy.verified} /> : null}</h2>
      <div className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] bg-[color-mix(in_srgb,var(--color-brand-cyan)_8%,transparent)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{copy.contact} · {view.organizer.contactChannel}</p>
        <div className="mt-2">
          {view.organizer.contactHref ? <a href={view.organizer.contactHref} className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline">{contact}<ExternalLink className="h-4 w-4 shrink-0" aria-hidden /></a> : contact}
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{copy.contactHint}</p>
      </div>
    </section>

    <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
      <h2 className="text-lg font-extrabold">{copy.importantInfo}</h2>
      <p className="mt-4 font-bold">{view.event.formatLabel}</p>
      <ul className="mt-3 grid gap-2 text-sm text-[var(--color-text-muted)]">
        {view.event.formatDetails.map((detail) => <li key={detail}>• {localizeDetail(detail, locale)}</li>)}
      </ul>
    </section>
  </aside>;
}