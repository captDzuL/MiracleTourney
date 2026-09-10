import { notFound } from "next/navigation";

import { EventDraftForm } from "@/components/v3/events/EventDraftForm";
import { OrganizerContactForm } from "@/components/v3/events/OrganizerContactForm";
import { PreviewControls } from "@/components/v3/events/PreviewControls";
import { PublishReadiness } from "@/components/v3/events/PublishReadiness";
import { DiscardRevisionButton } from "@/components/v3/events/PublishedRevisionControls";
import { Link } from "@/i18n/navigation";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { eventDateToLocalInput } from "@/lib/events/event-datetime";
import { evaluatePublishReadiness } from "@/lib/events/publish-readiness";
import { getActiveEventEditRevisionIds } from "@/lib/events/event-revision";
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
  const routeBase = user.role === "organizer" ? "/organizer" : "/admin";
  const activeRevisions = event.status === "Published" || event.status === "Registration Closed"
    ? await getActiveEventEditRevisionIds({ eventIds: [event.id], actor: { id: user.id, role: user.role as "organizer" | "platform_admin" | "admin" } })
    : {};
  const activeRevision = activeRevisions[event.id];
  const workspaceMenu = event.status !== "Draft" ? <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
    <Link className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-[var(--color-brand-cyan)]" href={`/events/${event.slug}`}>Lihat halaman publik</Link>
    {(event.status === "Published" || event.status === "Registration Closed") && <Link className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white" href={`${routeBase}/events/${event.id}/edit`}>{activeRevision ? "Lanjutkan revisi" : "Edit event"}</Link>}
    {activeRevision && <DiscardRevisionButton revisionId={activeRevision.id} />}
  </div> : null;
  const registrationPanel = event.organizerUserId ? <OrganizerContactForm
      eventId={event.id}
      initialChannel={event.organizer?.organizerProfile?.contactChannel ?? ""}
      initialValue={event.organizer?.organizerProfile?.contactValue ?? ""}
    /> : <section className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
      <h4 className="font-extrabold text-[var(--color-text)]">Miracle contact</h4>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">This official Miracle event uses the platform contact shown to participants.</p>
      <Link className="mt-3 inline-flex text-sm font-bold text-[var(--color-brand-cyan)]" href="/admin/platform-profile">Edit Miracle contact</Link>
    </section>;
  const reviewPanel = <div className="grid gap-6">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Final step</p>
      <h3 className="mt-2 text-lg font-extrabold text-[var(--color-text)]">Review & publish</h3>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Confirm the public information, create a private preview, then publish when everything is ready.</p>
    </div>
    <div className="grid gap-6 border-t border-[var(--color-border)] pt-6 min-[700px]:grid-cols-2">
      <PublishReadiness eventId={event.id} organizerSection="review" readiness={readiness} />
      <PreviewControls eventId={event.id} locale={locale} />
    </div>
  </div>;

  return <section className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
    {workspaceMenu}
    <EventDraftForm
      eventId={event.id}
      editable={event.status === "Draft"}
      locale={locale}
      competitionOperationsEnabled={isFeatureEnabled("competition_operations_v3")}
      initialDraft={{
        name: event.name,
        slug: event.slug,
        description: event.description,
        formatConfig: event.formatConfig,
        participantCap: event.participantCap,
        prizePoolLabel: event.prizePoolLabel,
        registrationOpensAt: event.registrationOpensAt ? eventDateToLocalInput(event.registrationOpensAt, event.timezone) : null,
        registrationClosesAt: event.registrationClosesAt ? eventDateToLocalInput(event.registrationClosesAt, event.timezone) : null,
        eventStartsAt: event.eventStartsAt ? eventDateToLocalInput(event.eventStartsAt, event.timezone) : null,
        timezone: event.timezone,
        venue: event.venue,
        venueAddress: event.venueAddress,
        registrationFeeRequired: event.registrationFeeRequired,
        registrationFeeAmount: event.registrationFeeAmount,
        logoUrl: event.logoUrl,
        gameImageUrl: event.gameImageUrl,
      }}
      initialRevision={event.draftRevision}
      registrationPanel={registrationPanel}
      reviewPanel={reviewPanel}
    />
  </section>;
}
