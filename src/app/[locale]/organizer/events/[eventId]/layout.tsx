import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EventWorkspaceShell } from "@/components/v3/EventWorkspaceShell";
import { OrganizerMasterShell } from "@/components/v3/organizer/OrganizerMasterShell";
import { readOrganizerWorkspaceSummary } from "@/lib/organizer/workspace-read";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft } from "@/lib/platform/repository";

type EventLayoutProps = { children: ReactNode; params: Promise<{ locale: string; eventId: string }> };

export default async function EventLayout({ children, params }: EventLayoutProps) {
  const { locale, eventId } = await params;
  if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("organizer_workspace_v3")) notFound();
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  if (isFeatureEnabled("organizer_master_shell_v3")) {
    const summary = await readOrganizerWorkspaceSummary(eventId, user);
    if (!summary) notFound();
    const sections = ["identity", "format", "registration", "public", "review"] as const;
    const t = await getTranslations({ locale, namespace: "organizerMaster.setup" });
    const wrapper = (base: string) => <EventWorkspaceShell eventTitle={summary.event.title} organizerLabel={user.name} navigation={sections.map(section => ({ href: `${base}#section-${section}`, label: t(section) }))} operations={isFeatureEnabled("competition_operations_v3") ? { eventId, locale } : undefined}>{children}</EventWorkspaceShell>;
    return <OrganizerMasterShell summary={summary} locale={locale} setup={wrapper(`/organizer/events/${eventId}/edit`)} legacy={wrapper(`/admin/events/${eventId}/overview`)}>{children}</OrganizerMasterShell>;
  }
  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();
  const overview = `/${user.role === "organizer" ? "organizer" : "admin"}/events/${event.id}/overview`;
  const labels = locale === "id" ? ["Identitas", "Format & Jadwal", "Registrasi", "Halaman Publik", "Tinjau & Terbitkan"] : ["Identity", "Format & schedule", "Registration", "Public page", "Review & publish"];
  const sections = ["identity", "format", "registration", "public", "review"];
  return <EventWorkspaceShell eventTitle={event.name} navigation={sections.map((section, index) => ({ href: `${overview}#section-${section}`, label: labels[index] }))} organizerLabel={user.name} operations={isFeatureEnabled("competition_operations_v3") ? { eventId: event.id, locale } : undefined}>{children}</EventWorkspaceShell>;
}
