import { OrganizerEventSetup } from "@/components/v3/organizer/OrganizerEventSetup";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { lifecycleAction, organizerControl } from "@/components/v3/organizer/OrganizerEventCard";
import { readOrganizerWorkspaceSummary } from "@/lib/organizer/workspace-read";

import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { evaluatePublishReadiness } from "@/lib/events/publish-readiness";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft, getPlatformProfile } from "@/lib/platform/repository";

type OverviewPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
};

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { locale, eventId } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");

  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();

  const platformProfile = event.organizerUserId ? null : await getPlatformProfile();
  const readiness = evaluatePublishReadiness({ ...event, platformProfile });
  if (isFeatureEnabled("organizer_master_shell_v3")) {
    const summary = await readOrganizerWorkspaceSummary(eventId, user);
    if (!summary) notFound();
    const t = await getTranslations({ locale, namespace: "organizerMaster" });
    const base = `/organizer/events/${encodeURIComponent(event.id)}`;
    const now = Date.now();
    const milestone = [
      { label: "registrationOpens", date: event.registrationOpensAt },
      { label: "registrationCloses", date: event.registrationClosesAt },
      { label: "eventStarts", date: event.eventStartsAt },
    ].filter((item): item is { label: string; date: Date } => item.date instanceof Date && item.date.getTime() >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    const requirements = [...new Set(readiness.incomplete.map(item => item.section))];
    const setupSections = { identity: "identity", schedule: "format", registration: "registration", organizer: "registration" };
    const panel = "min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
    return <div className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-2xl font-extrabold">{t("overview.title")}</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("overview.description")}</p></div>
        <Link locale={locale} href={`${base}/${lifecycleAction[summary.lifecycle]}`} className={`${organizerControl} bg-[var(--color-brand-cyan)] text-[var(--color-on-accent)]`}>{t(`commandCenter.actions.${summary.lifecycle}`)}</Link>
      </header>
      <dl className="grid min-w-0 gap-3 min-[620px]:grid-cols-3">
        <div className={panel}><dt className="text-sm text-[var(--color-text-muted)]">{t("shell.lifecycle")}</dt><dd className="mt-2 text-lg font-extrabold">{t(`lifecycle.${summary.lifecycle}`)}</dd></div>
        <div className={panel}><dt className="text-sm text-[var(--color-text-muted)]">{t("eventSummary.participants")}</dt><dd className="mt-2 text-lg font-extrabold">{summary.badges.participants ?? 0} / {event.participantCap}</dd></div>
        <div className={panel}><dt className="text-sm text-[var(--color-text-muted)]">{t("shell.publication")}</dt><dd className="mt-2 text-lg font-extrabold">{t(`publication.${summary.publication}`)}</dd></div>
      </dl>
      <div className="grid min-w-0 gap-5 min-[780px]:grid-cols-2">
        <section className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("eventSummary.readiness")}</h2><p className="mt-3 text-sm">{t(readiness.ready ? "eventSummary.requirementsMet" : "eventSummary.incomplete", { count: readiness.incomplete.length })}</p>
          {requirements.length > 0 && <ul className="mt-3 grid gap-2">{requirements.map(section => <li key={section}><Link locale={locale} className={organizerControl} href={`${base}/edit#section-${setupSections[section]}`}>{t("eventSummary.readinessSection", { section: t(`eventSummary.sections.${section}`) })}</Link></li>)}</ul>}
        </section>
        <section className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("eventSummary.nextMilestone")}</h2>{milestone ? <div className="mt-3"><p className="text-sm text-[var(--color-text-muted)]">{t(`eventSummary.${milestone.label}`)}</p><time className="mt-2 block font-bold" dateTime={milestone.date.toISOString()}>{new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(milestone.date)}</time><p className="mt-1 text-xs text-[var(--color-text-muted)]">{event.timezone}</p></div> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t("eventSummary.noMilestone")}</p>}</section>
      </div>
      <section className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("overview.blockers")}</h2>{summary.blockers.length ? <ul className="mt-3 grid gap-3">{summary.blockers.map(blocker => <li key={blocker.code} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"><p className="text-sm">{t(blocker.message)}</p>{blocker.href && <Link locale={locale} className={organizerControl} href={blocker.href}>{t("blockers.review")}</Link>}</li>)}</ul> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t("eventSummary.noBlockers")}</p>}</section>
      {summary.publication !== "private" && <div><Link locale={locale} href={`/events/${event.slug}`} className={organizerControl}>{t("commandCenter.publicPage")}</Link></div>}
    </div>;
  }
  return OrganizerEventSetup({ event, user, locale, readiness });
}
