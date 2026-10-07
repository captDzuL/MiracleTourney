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
import { createServerMilestoneLogger, withServerActionLog } from "@/lib/observability/logger";

const REGISTRATION_ROUTE_OPERATION = "registration_workspace_render";
const REGISTRATION_ROUTE_PATH = "/organizer/events/:eventId/registration";

export default async function OrganizerRegistrationPage({ params, searchParams }: { params: Promise<{ locale: string; eventId: string }>; searchParams?: Promise<QueryInput> }) {
 const { locale, eventId } = await params;
 if ((locale !== "id" && locale !== "en") || !isFeatureEnabled("registration_workspace_v3")) notFound();
 setRequestLocale(locale);
 return withServerActionLog(REGISTRATION_ROUTE_OPERATION, REGISTRATION_ROUTE_PATH, ({ requestId }) => renderOrganizerRegistrationPage({ locale, eventId, searchParams, requestId }));
}

async function renderOrganizerRegistrationPage({ locale, eventId, searchParams, requestId }: { locale: "id" | "en"; eventId: string; searchParams?: Promise<QueryInput>; requestId: string }) {
 const trace = createServerMilestoneLogger({ operation: REGISTRATION_ROUTE_OPERATION, route: REGISTRATION_ROUTE_PATH, requestId });
 trace("route_enter", { locale, resourceId: eventId });
 let user;
 try {
  user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
 } catch (error) {
  trace("route_return", { locale, resourceId: eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
  throw error;
 }
 if (!user) {
  trace("route_return", { locale, resourceId: eventId, status: 302 });
  return redirectToActiveLocale("/login");
 }
 if (user.role === "organizer" && user.mustChangePassword) {
  trace("route_return", { locale, resourceId: eventId, status: 302 });
  return redirectToActiveLocale("/organizer/change-password");
 }
 try {
  await assertUserCanManageEvent(user, eventId);
 } catch (error) {
  trace("route_return", { locale, resourceId: eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
  throw error;
 }
 let query: ReturnType<typeof normalizeRegistrationQuery>;
 try {
  query = normalizeRegistrationQuery(await searchParams);
 } catch (error) {
  trace("route_return", { locale, resourceId: eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
  throw error;
 }
 const base = { locale, eventId, query } as const;
 try {
  const context = await getRegistrationImportEventContext(user, eventId);
  trace("route_context_done", { locale, resourceId: eventId, status: context ? 200 : 404 });
  if (!context) {
   const result = <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  const common = { ...base, capacity: context.participantCap, acceptedCount: context.teams.length };
  if (query.view === "queue") {
   const queue = await getEventRegistrationQueue({ user, eventId, status: (query.status === "approved" ? "accepted" : query.status === "expired" ? "needs_correction" : query.status || undefined) as RegistrationStatus | undefined, source: query.source as RegistrationSource || undefined, query: query.q, page: query.page });
   const visible = new Set(queue.items.map(item => item.teamId));
   const result = <RegistrationWorkspace {...common} queue={queue} teams={context.teams.filter(team => visible.has(team.id))} />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  if (query.view === "import") {
   const history = await getEventImportHistory({ user, eventId });
   trace("route_history_done", { locale, resourceId: eventId, counts: { historyCount: history.length } });
   const result = <RegistrationWorkspace {...common} history={history} />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  if (query.view === "payments") {
   const payments = await getEventPaymentReview({ user, eventId, status: query.status as TeamRegistrationRequestStatus || undefined });
   const result = <RegistrationWorkspace {...common} payments={payments} />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  const qris = await getEventQris({ user, eventId });
  const result = <RegistrationWorkspace {...common} qris={qris} />;
  trace("route_return", { locale, resourceId: eventId });
  return result;
 } catch {
  trace("route_return", { locale, resourceId: eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
  return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;
 }
}
