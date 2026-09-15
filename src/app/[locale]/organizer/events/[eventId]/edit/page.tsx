import { getEventEditorTranslator } from "@/components/v3/events/event-editor-translations";
import { notFound } from "next/navigation";
import { OrganizerEventSetup } from "@/components/v3/organizer/OrganizerEventSetup";
import { evaluatePublishReadiness } from "@/lib/events/publish-readiness";

import { EventDraftForm } from "@/components/v3/events/EventDraftForm";
import { PublishedRevisionControls } from "@/components/v3/events/PublishedRevisionControls";
import { RevisionVisualEditor } from "@/components/v3/events/RevisionVisualEditor";
import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { savePublishedEventRevisionAction, updatePublishedEventSlugAction } from "@/lib/actions/event-revision-actions";
import { requireAnyRole } from "@/lib/auth/session";
import {
  eventRevisionPayloadSchema,
  getEventRevisionFieldLocks,
  startEventEditRevision,
} from "@/lib/events/event-revision";
import { eventDateToLocalInput } from "@/lib/events/event-datetime";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGameModeDisplayLabel } from "@/lib/platform/config";
import { getGameModes, getManageableEventDraft, getPlatformProfile } from "@/lib/platform/repository";

type EditEventPageProps = { params: Promise<{ locale: string; eventId: string }> };

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { locale, eventId } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");

  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();
  const t = getEventEditorTranslator(locale);
  const basePath = isFeatureEnabled("organizer_master_shell_v3") || user.role === "organizer" ? "organizer" : "admin";
  const workspaceHref = `/${locale}/${basePath}/events/${event.id}/overview`;

  if (event.status === "Draft") {
    if (!isFeatureEnabled("organizer_master_shell_v3")) return redirectToActiveLocale(`/${basePath}/events/${event.id}/overview`);
    const platformProfile = event.organizerUserId ? null : await getPlatformProfile();
    const readiness = evaluatePublishReadiness({ ...event, platformProfile });
    return OrganizerEventSetup({ event, user, locale, readiness });
  }
  if (event.status === "Ongoing" || event.status === "Finished") {
    return <section className="grid gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">{t("eventLocked")}</p>
        <h2 className="mt-2 text-2xl font-extrabold text-[var(--color-text)]">{t("eventCannotEdit")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-subtle)]">{event.status === "Ongoing" ? t("eventOngoingLocked") : t("eventFinishedLocked")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white" href={`/${basePath}/events/${event.id}/overview`}>{t("workspaceBack")}</Link>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)]" href={`/events/${event.slug}`}>{t("viewPublic")}</Link>
      </div>
    </section>;
  }

  const actor = { id: user.id, role: user.role as "organizer" | "platform_admin" | "admin" };
  const started = await startEventEditRevision({ eventId: event.id, actor });
  if (started.status === "not_found") notFound();
  if (started.status === "not_editable") {
    return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-text)]">{t("revisionUnavailable")}<Link className="font-bold text-[var(--color-brand-cyan)]" href={`/${basePath}/events/${event.id}/overview`}>{t("workspaceBack")}</Link></section>;
  }

  const revision = started.revision;
  const payload = eventRevisionPayloadSchema.parse(revision.payload);
  const locks = getEventRevisionFieldLocks({
    status: event.status,
    registrationClosesAt: event.registrationClosesAt,
    matchCount: event._count.matches,
  });
  const fieldLocks = { ...locks, slug: "slug_published" };
  const timezone = payload.timezone;
  const platformProfile = event.organizerUserId ? null : await getPlatformProfile();
  const contact = event.organizerUserId
    ? event.organizer?.organizerProfile
    : platformProfile;
  const registrationPanel = <section className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
    <h4 className="font-extrabold text-[var(--color-text)]">{t("organizerContact")}</h4>
    <p className="mt-1 text-sm text-[var(--color-text-subtle)]">{contact ? `${contact.contactChannel}: ${contact.contactValue}` : t("contactMissing")}</p>
    <p className="mt-2 text-xs leading-5 text-[var(--color-text-subtle)]">{t("contactShared")}</p>
  </section>;
  const reviewPanel = <PublishedRevisionControls
    eventId={event.id}
    locale={locale}
    publicSlug={event.slug}
    revisionId={revision.id}
    workspaceHref={workspaceHref}
  />;

  const adminSlugEditor = user.role !== "organizer" ? <form action={updatePublishedEventSlugAction} className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-end">
    <input name="eventId" type="hidden" value={event.id} /><input name="locale" type="hidden" value={locale} />
    <label className="grid gap-1.5 text-sm font-bold text-[var(--color-text)]">{t("adminSlug")}<input className="h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]" defaultValue={event.slug} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
    <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]" type="submit">{t("changeSlug")}</button>
    <p className="text-xs leading-5 text-[var(--color-text-subtle)] min-[700px]:col-span-2">{t("changeSlugHint")}</p>
  </form> : null;

  return <section className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
    <div className="rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] bg-[var(--color-surface-subtle)] p-4">
      <p className="text-sm font-extrabold text-[var(--color-brand-cyan)]">{t("activeRevision")}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{t("autosaveRevision")}</p>
    </div>
    {adminSlugEditor}
    <EventDraftForm
      competitionOperationsEnabled={isFeatureEnabled("competition_operations_v3")}
      editorLabel={t("privateRevision")}
      eventId={event.id}
      fieldLocks={fieldLocks}
      gameModes={getGameModes().map((mode) => ({ id: mode.id, label: getGameModeDisplayLabel(mode.id) }))}
      initialDraft={{
        name: payload.name,
        slug: event.slug,
        description: payload.description,
        gameModeId: payload.gameModeId,
        formatConfig: payload.formatConfig,
        participantCap: payload.participantCap,
        prizePoolLabel: payload.prizePoolLabel,
        registrationOpensAt: payload.registrationOpensAt ? eventDateToLocalInput(new Date(payload.registrationOpensAt), timezone) : null,
        registrationClosesAt: payload.registrationClosesAt ? eventDateToLocalInput(new Date(payload.registrationClosesAt), timezone) : null,
        eventStartsAt: payload.eventStartsAt ? eventDateToLocalInput(new Date(payload.eventStartsAt), timezone) : null,
        timezone,
        venue: payload.venue,
        venueAddress: payload.venueAddress,
        registrationFeeRequired: payload.registrationFeeRequired,
        registrationFeeAmount: payload.registrationFeeAmount,
        logoUrl: payload.logoUrl,
        gameImageUrl: payload.gameImageUrl,
      }}
      initialRevision={revision.revision}
      journalNamespace="event-edit-revision"
      locale={locale}
      registrationPanel={registrationPanel}
      reviewPanel={reviewPanel}
      saveDraft={savePublishedEventRevisionAction}
      saveTargetId={revision.id}
      visualEditor={<RevisionVisualEditor eventId={event.id} locale={locale} logoUrl={payload.logoUrl} posterUrl={payload.gameImageUrl} revisionId={revision.id} />}
    />
  </section>;
}
