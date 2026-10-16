import React from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EventSettingsWorkspace } from "@/components/v3/organizer/EventSettingsWorkspace";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { getManageableEventDraft } from "@/lib/events/repository";
import { getRosterChangeSettings } from "@/lib/platform/roster-change-settings";
import { RosterChangeSettingsError, RosterChangeSettingsPanel } from "@/components/v3/organizer/RosterChangeSettingsPanel";

type TFn = (key: string, values?: Record<string, string | number>) => string;

/** Fails soft: the rest of the settings page stays usable, and the panel says so if it cannot load. */
async function loadRosterChangePanel(user: Parameters<typeof getRosterChangeSettings>[0], eventId: string, query: { rcResult?: string; rcError?: string }) {
  const t = (await getTranslations("organizerMaster.settings.rosterChange")) as TFn;
  try {
    const settings = await getRosterChangeSettings(user, eventId);
    return <RosterChangeSettingsPanel eventId={eventId} settings={settings} result={query.rcResult} error={query.rcError} t={t} />;
  } catch (error) {
    console.error("Roster change panel failed to load", { name: error instanceof Error ? error.name : "unknown" });
    return <RosterChangeSettingsError t={t} />;
  }
}

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ locale: string; eventId: string }>; searchParams?: Promise<{ rcResult?: string; rcError?: string }> }) {
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
  const rosterPanel = await loadRosterChangePanel(user, eventId, (await searchParams) ?? {});
  return <EventSettingsWorkspace locale={locale} event={event} contact={{ href: contactHref }}>{rosterPanel}</EventSettingsWorkspace>;
}