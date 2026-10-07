"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OrganizerWorkspaceLifecycle } from "@/lib/organizer/workspace-types";

type SelectorProps = {
  events: { id: string; name: string; lifecycle: OrganizerWorkspaceLifecycle }[];
  locale: "id" | "en";
  labels: { select: string; search: string; empty: string; noResults: string; lifecycle: Record<OrganizerWorkspaceLifecycle, string> };
};
const lifecycleOrder: OrganizerWorkspaceLifecycle[] = ["draft", "registration", "drawing", "ongoing", "finished"];

export function OrganizerEventSelector({ events, locale, labels }: SelectorProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = events.filter(event => event.name.toLocaleLowerCase(locale).includes(normalizedQuery));
  return <details className="group min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)]">
    <summary className="miracle-focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold">
      {labels.select}<ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="grid min-w-0 gap-2 border-t border-[var(--color-border)] p-3">
      <label htmlFor={searchId} className="text-sm font-bold">{labels.search}</label>
      <input id={searchId} type="search" value={query} onInput={event => setQuery(event.currentTarget.value)} className="miracle-focus-ring min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-base text-[var(--color-text)]" />
      <nav aria-label={labels.select} className="grid max-h-80 min-w-0 gap-4 overflow-y-auto">
        {lifecycleOrder.map(lifecycle => {
          const group = matches.filter(event => event.lifecycle === lifecycle);
          return group.length > 0 && <section key={lifecycle} aria-label={labels.lifecycle[lifecycle]} className="grid min-w-0 gap-2">
            <h3 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-xs font-extrabold text-[var(--color-accent-cream-foreground)]">{labels.lifecycle[lifecycle]}</h3>
            {group.map(event => <Link key={event.id} locale={locale} href={`/organizer/events/${encodeURIComponent(event.id)}/overview`} className="miracle-focus-ring flex min-h-11 min-w-0 items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 py-2 text-sm font-bold transition-colors hover:border-[var(--color-accent-cyan-foreground)]"><span className="min-w-0 break-words">{event.name}</span></Link>)}
          </section>;
        })}
        {matches.length === 0 && <p role="status" className="p-2 text-sm text-[var(--color-text-muted)]">{events.length ? labels.noResults : labels.empty}</p>}
      </nav>
    </div>
  </details>;
}
