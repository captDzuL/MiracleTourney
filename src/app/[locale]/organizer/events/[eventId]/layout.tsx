import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { EventWorkspaceShell } from "@/components/v3/EventWorkspaceShell";
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
  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();
  const overview = `/${user.role === "organizer" ? "organizer" : "admin"}/events/${event.id}/overview`;
  const labels = locale === "id" ? ["Identitas", "Format & Jadwal", "Registrasi", "Halaman Publik", "Tinjau & Terbitkan"] : ["Identity", "Format & schedule", "Registration", "Public page", "Review & publish"];
  const sections = ["identity", "format", "registration", "public", "review"];
  return <EventWorkspaceShell eventTitle={event.name} navigation={sections.map((section, index) => ({ href: `${overview}#section-${section}`, label: labels[index] }))} organizerLabel={user.name}>{children}</EventWorkspaceShell>;
}