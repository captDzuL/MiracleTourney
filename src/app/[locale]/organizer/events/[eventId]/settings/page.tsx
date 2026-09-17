import React from "react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EventSettingsWorkspace } from "@/components/v3/organizer/EventSettingsWorkspace";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { getManageableEventDraft } from "@/lib/platform/repository";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();
  const contactHref = user.role === "organizer" && event.organizerUserId === user.id
    ? `/${locale}/organizer/profile`
    : event.organizerUserId == null && (user.role === "platform_admin" || user.role === "admin")
      ? `/${locale}/admin/platform-profile`
      : null;
  return <EventSettingsWorkspace locale={locale} event={event} contact={{ href: contactHref }} />;
}