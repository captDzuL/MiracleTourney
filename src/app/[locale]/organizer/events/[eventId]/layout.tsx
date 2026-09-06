import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { EventWorkspaceShell } from "@/components/v3/EventWorkspaceShell";
import { OrganizerContactForm } from "@/components/v3/events/OrganizerContactForm";
import { PreviewControls } from "@/components/v3/events/PreviewControls";
import { PublishReadiness } from "@/components/v3/events/PublishReadiness";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { evaluatePublishReadiness } from "@/lib/events/publish-readiness";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft } from "@/lib/platform/repository";

type EventLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; eventId: string }>;
};

export default async function EventLayout({ children, params }: EventLayoutProps) {
  const { locale, eventId } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");

  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();

  const overview = `/organizer/events/${event.id}/overview`;
  const readiness = evaluatePublishReadiness(event);
  const labels = locale === "id"
    ? ["Identitas", "Jadwal", "Registrasi", "Visual", "Format"]
    : ["Identity", "Schedule", "Registration", "Visuals", "Format"];
  const sections = ["identity", "schedule", "registration", "visuals", "format"];

  return <EventWorkspaceShell
    eventTitle={event.name}
    navigation={sections.map((section, index) => ({
      href: `${overview}#section-${section}`,
      label: labels[index],
    }))}
    nextAction={<div className="grid gap-6">
      <OrganizerContactForm
        eventId={event.id}
        initialChannel={event.organizer?.organizerProfile?.contactChannel}
        initialValue={event.organizer?.organizerProfile?.contactValue}
      />
      <PublishReadiness eventId={event.id} readiness={readiness} />
      <PreviewControls eventId={event.id} locale={locale} />
    </div>}
    organizerLabel={user.name}
  >
    {children}
  </EventWorkspaceShell>;
}