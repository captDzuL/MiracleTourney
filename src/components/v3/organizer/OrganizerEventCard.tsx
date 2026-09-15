import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { findGameConfig } from "@/lib/platform/config";
import type { Event } from "@/lib/platform/types";
import type { OrganizerWorkspaceLifecycle } from "@/lib/organizer/workspace-types";

export type OrganizerTranslator = (key: string, values?: Record<string, string | number>) => string;
export const eventLifecycle: Record<Event["status"], OrganizerWorkspaceLifecycle> = {
  Draft: "draft", Published: "registration", "Registration Closed": "drawing", Ongoing: "ongoing", Finished: "finished",
};
export const lifecycleAction: Record<OrganizerWorkspaceLifecycle, string> = {
  draft: "edit", registration: "registration", drawing: "competition", ongoing: "match-control", finished: "completion",
};
export const organizerControl = "miracle-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-bold transition-colors hover:border-[var(--color-accent-cyan-foreground)]";

export function OrganizerEventCard({ event, teamCount, hasActiveRevision, locale, t }: {
  event: Event; teamCount: number; hasActiveRevision: boolean; locale: "id" | "en"; t: OrganizerTranslator;
}) {
  const lifecycle = eventLifecycle[event.status];
  const base = `/organizer/events/${encodeURIComponent(event.id)}`;
  return <article className="grid min-w-0 content-start gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[var(--color-text-muted)]">{findGameConfig(event.gameId)?.name ?? t("commandCenter.unknownGame")} · {t(event.format === "League" ? "formats.league" : "formats.singleElimination")}</p>
        <h3 style={{ fontFamily: "var(--font-miracle-v3)" }} className="mt-2 break-words text-lg font-extrabold">{event.name}</h3>
      </div>
      <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs font-bold text-[var(--color-accent-cream-foreground)]">{t(`lifecycle.${lifecycle}`)}</span>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="min-w-0 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-muted)]">{t("commandCenter.teams")}</dt><dd className="mt-1 font-extrabold">{teamCount} / {event.participantCap}</dd></div>
      <div className="min-w-0 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-muted)]">{t("shell.publication")}</dt><dd className="mt-1 font-bold">{t(lifecycle === "draft" ? "publication.private" : "publication.published")}</dd></div>
    </dl>
    {hasActiveRevision && <p className="text-sm text-[var(--color-accent-cream-foreground)]">{t("commandCenter.activeRevision")}</p>}
    <div className="flex flex-wrap gap-2">
      <Link locale={locale} className={`${organizerControl} bg-[var(--color-brand-cyan)] text-[var(--color-on-accent)] hover:brightness-110`} href={`${base}/${lifecycleAction[lifecycle]}`}>{t(`commandCenter.actions.${lifecycle}`)}<ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /></Link>
      <Link locale={locale} className={organizerControl} href={`${base}/overview`}>{t("overview.open")}</Link>
      {hasActiveRevision && <Link locale={locale} className={organizerControl} href={`${base}/edit`}>{t("commandCenter.continueRevision")}</Link>}
      {lifecycle !== "draft" && <Link locale={locale} className={organizerControl} href={`/events/${event.slug}`}>{t("commandCenter.publicPage")}</Link>}
    </div>
  </article>;
}
