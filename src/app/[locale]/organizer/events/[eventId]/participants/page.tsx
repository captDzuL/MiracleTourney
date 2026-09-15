import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireAnyRole } from "@/lib/auth/session";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent, getRegistrationImportEventContext } from "@/lib/platform/repository";
import { getEventRegistrationQueue } from "@/lib/registration/organizer-workspace-read";
import type { RegistrationSource } from "@/lib/registration/records";
import { RegistrationWorkspace } from "@/components/v3/organizer/registration/RegistrationWorkspace";
import { normalizeRegistrationQuery, type QueryInput } from "@/components/v3/organizer/registration/query";
export default async function OrganizerParticipantsPage({ params, searchParams }: { params: Promise<{ locale: string; eventId: string }>; searchParams?: Promise<QueryInput> }) {
 const { locale, eventId } = await params;
 if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("registration_workspace_v3")) notFound();
 setRequestLocale(locale);
 const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
 if (!user) return redirectToActiveLocale("/login");
 if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
 await assertUserCanManageEvent(user, eventId);
 const query = normalizeRegistrationQuery(await searchParams); query.status = query.status ? "accepted" : "";
 const base = { locale, eventId, query, participants: true } as const;
 try {
  const [context, queue] = await Promise.all([getRegistrationImportEventContext(user, eventId), getEventRegistrationQueue({ user, eventId, status: "accepted", source: query.source as RegistrationSource || undefined, query: query.q, page: query.page })]);
  if (!context) return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;
  const visible = new Set(queue.items.map(item => item.teamId));
  return <RegistrationWorkspace {...base} capacity={context.participantCap} acceptedCount={context.teams.length} queue={queue} teams={context.teams.filter(team => visible.has(team.id))} />;
 } catch { return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />; }
}
