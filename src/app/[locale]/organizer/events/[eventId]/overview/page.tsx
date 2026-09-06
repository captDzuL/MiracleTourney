import { notFound } from "next/navigation";

import { EventDraftForm } from "@/components/v3/events/EventDraftForm";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { eventDateToLocalInput } from "@/lib/events/event-datetime";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft } from "@/lib/platform/repository";

type OverviewPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
};

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { locale, eventId } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");

  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();

  return <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
      <EventDraftForm
        eventId={event.id}
        locale={locale}
        competitionOperationsEnabled={isFeatureEnabled("competition_operations_v3")}
        initialDraft={{
          name: event.name,
          slug: event.slug,
          description: event.description,
          formatConfig: event.formatConfig,
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
      />
    </section>;
}