import React from "react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AnnouncementsWorkspace } from "@/components/v3/organizer/AnnouncementsWorkspace";
import { mutateCompetitionWorkspaceAction } from "@/lib/actions/competition-v3-actions";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { readCompetitionWorkspace } from "@/lib/competition/workspace-read";
import { getManageableEventDraft } from "@/lib/platform/repository";

export default async function AnnouncementsPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  const event = await getManageableEventDraft(user, eventId);
  if (!event) notFound();
  const workspace = await readCompetitionWorkspace(eventId);
  return <AnnouncementsWorkspace action={mutateCompetitionWorkspaceAction} eventId={eventId} version={workspace.event.version} announcements={workspace.announcements} audit={workspace.audit} />;
}