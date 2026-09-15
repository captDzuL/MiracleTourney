import { OrganizerEventSelector } from "./OrganizerEventSelector";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Event } from "@/lib/platform/types";
import { eventLifecycle, lifecycleAction, OrganizerEventCard, organizerControl, type OrganizerTranslator } from "./OrganizerEventCard";

export function OrganizerCommandCenter({ events, teamCounts, activeRevisions, organizerName, hasProfile, locale, t }: {
  events: Event[]; teamCounts: Map<string, number>; activeRevisions: Record<string, { id: string; revision: number }>;
  organizerName: string; hasProfile: boolean; locale: "id" | "en"; t: OrganizerTranslator;
}) {
  const drafts = events.filter(event => event.status === "Draft");
  const ongoing = events.filter(event => event.status === "Ongoing");
  // Only known unfinished setup and saved private revisions belong in this queue.
  const attention = events.filter(event => event.status === "Draft" || activeRevisions[event.id]);
  return <div className="miracle-v3 panel-scope mx-auto grid w-full min-w-0 max-w-6xl gap-6 p-4 sm:p-6 text-[var(--color-text)]">
    <header className="grid min-w-0 gap-5 border-b border-[var(--color-border)] pb-6 min-[700px]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-accent-cream-foreground)]">{t("shell.title")}</p><h1 style={{ fontFamily: "var(--font-miracle-v3)" }} className="mt-2 break-words text-3xl font-extrabold">{t("commandCenter.title")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{t("commandCenter.description")}</p></div>
      <Link locale={locale} href="/organizer/events/new" className={`${organizerControl} self-start bg-[var(--color-brand-violet)] text-[var(--color-on-accent)]`}><Plus aria-hidden="true" className="size-4" />{t("commandCenter.createEvent")}</Link>
    </header>
    <OrganizerEventSelector events={events.map(event => ({ id: event.id, name: event.name, lifecycle: eventLifecycle[event.status] }))} locale={locale} labels={{
      select: t("commandCenter.selectEvent"), search: t("commandCenter.searchEvents"),
      empty: t("commandCenter.empty"), noResults: t("commandCenter.noMatchingEvents"),
      lifecycle: { draft: t("lifecycle.draft"), registration: t("lifecycle.registration"), drawing: t("lifecycle.drawing"), ongoing: t("lifecycle.ongoing"), finished: t("lifecycle.finished") },
    }} />
    <section aria-label={t("commandCenter.counts")} className="grid min-w-0 grid-cols-1 gap-3 min-[480px]:grid-cols-3">
      {([["allEvents", events.length], ["drafts", drafts.length], ["ongoing", ongoing.length]] as const).map(([key, count]) => <div key={key} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><p className="text-sm text-[var(--color-text-muted)]">{t(`commandCenter.${key}`)}</p><p className="mt-2 text-3xl font-extrabold">{count}</p></div>)}
    </section>
    <div className="grid min-w-0 gap-5 min-[980px]:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("overview.needsAction")}</h2>
        {attention.length ? <ul className="mt-3 grid gap-3">{attention.map(event => <li key={event.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"><div className="min-w-0"><p className="break-words font-bold">{event.name}</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">{t(event.status === "Draft" ? "commandCenter.privateDraft" : "commandCenter.activeRevision")}</p></div><Link locale={locale} className={organizerControl} href={`/organizer/events/${encodeURIComponent(event.id)}/${event.status === "Draft" ? lifecycleAction.draft : "edit"}`}>{t(event.status === "Draft" ? "commandCenter.actions.draft" : "commandCenter.continueRevision")}</Link></li>)}</ul> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t("commandCenter.noAttention")}</p>}
      </section>
      <aside className="grid min-w-0 content-start gap-3 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-5"><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-xs font-extrabold uppercase tracking-wide text-[var(--color-accent-cream-foreground)]">{t("commandCenter.profile")}</h2><p className="break-words font-bold">{organizerName}</p>{!hasProfile && <p className="text-sm text-[var(--color-text-muted)]">{t("commandCenter.profileMissing")}</p>}<Link locale={locale} className={organizerControl} href="/organizer/profile">{t(hasProfile ? "commandCenter.editProfile" : "commandCenter.setupProfile")}</Link></aside>
    </div>
    <section className="grid min-w-0 gap-4"><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-xl font-extrabold">{t("commandCenter.allEvents")}</h2>{events.length ? <div className="grid min-w-0 gap-4 min-[700px]:grid-cols-2">{events.map(event => <OrganizerEventCard key={event.id} event={event} teamCount={teamCounts.get(event.id) ?? 0} hasActiveRevision={Boolean(activeRevisions[event.id])} locale={locale} t={t} />)}</div> : <p className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-text-muted)]">{t("commandCenter.empty")}</p>}</section>
  </div>;
}
