import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireAnyRole } from "@/lib/auth/session";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent, getRegistrationImportEventContext } from "@/lib/platform/repository";
import { getEventRegistrationQueue, getEventImportHistory, getEventPaymentReview, getEventQris } from "@/lib/registration/organizer-workspace-read";
import type { RegistrationStatus, RegistrationSource } from "@/lib/registration/records";
import type { TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { RegistrationWorkspace } from "@/components/v3/organizer/registration/RegistrationWorkspace";
import { normalizeRegistrationQuery, type QueryInput } from "@/components/v3/organizer/registration/query";
export default async function OrganizerRegistrationPage({ params, searchParams }: { params: Promise<{ locale: string; eventId: string }>; searchParams?: Promise<QueryInput> }) {
 const { locale, eventId } = await params;
 if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("registration_workspace_v3")) notFound();
 setRequestLocale(locale);
 const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
 if (!user) return redirectToActiveLocale("/login");
 if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
 await assertUserCanManageEvent(user, eventId);
 const query = normalizeRegistrationQuery(await searchParams);
 const base = { locale, eventId, query } as const;
 try {
  const context = await getRegistrationImportEventContext(user, eventId);
  if (!context) return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;
  const common = { ...base, capacity: context.participantCap, acceptedCount: context.teams.length };
  if (query.view === "queue") {
   const queue = await getEventRegistrationQueue({ user, eventId, status: (query.status === "approved" ? "accepted" : query.status === "expired" ? "needs_correction" : query.status || undefined) as RegistrationStatus | undefined, source: query.source as RegistrationSource || undefined, query: query.q, page: query.page });
   const visible = new Set(queue.items.map(item => item.teamId));
   return <RegistrationWorkspace {...common} queue={queue} teams={context.teams.filter(team => visible.has(team.id))} />;
  }
  if (query.view === "import") return <RegistrationWorkspace {...common} history={await getEventImportHistory({ user, eventId })} />;
  if (query.view === "payments") return <RegistrationWorkspace {...common} payments={await getEventPaymentReview({ user, eventId, status: query.status as TeamRegistrationRequestStatus || undefined })} />;
  return <RegistrationWorkspace {...common} qris={await getEventQris({ user, eventId })} />;
 } catch { return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />; }
}
