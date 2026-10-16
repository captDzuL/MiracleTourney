import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireAnyRole } from "@/lib/auth/session";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getRegistrationImportEventContext } from "@/lib/imports/repository";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { getEventRegistrationQueue, getEventImportHistory, getEventPaymentReview, getEventQris } from "@/lib/registration/organizer-workspace-read";
import { filterRegistrationRecords, type RegistrationStatus, type RegistrationSource } from "@/lib/registration/records";
import { getSoloDrawPanelData, getSoloEventSummary, listSoloPaymentEntries, listSoloRegistrationRecords } from "@/lib/solo/organizer-read";
import type { TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { RegistrationWorkspace } from "@/components/v3/organizer/registration/RegistrationWorkspace";
import { normalizeRegistrationQuery, type QueryInput } from "@/components/v3/organizer/registration/query";
import { createServerMilestoneLogger, withServerActionLog } from "@/lib/observability/logger";

const REGISTRATION_ROUTE_OPERATION = "registration_workspace_render";
const REGISTRATION_ROUTE_PATH = "/organizer/events/:eventId/registration";

/** The tabs a team event and a solo event do not have fall back to the list. */
function availableView(view: ReturnType<typeof normalizeRegistrationQuery>["view"], solo: boolean) {
 if (solo && view === "import") return "queue";
 if (!solo && view === "draw") return "queue";
 return view;
}

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
  const solo = await getSoloEventSummary(eventId);
  query = { ...query, view: availableView(query.view, solo !== null) };
  const common = { ...base, query, capacity: context.participantCap, acceptedCount: context.teams.length };
  const soloOnly = solo ? { solo: { summary: solo } } : {};
  if (query.view === "queue") {
   const filter = { status: (query.status === "approved" ? "accepted" : query.status === "expired" ? "needs_correction" : query.status || undefined) as RegistrationStatus | undefined, source: query.source as RegistrationSource || undefined, query: query.q, page: query.page };
   if (solo) {
    // A solo player whose time ran out is "expired", not a team's "needs correction".
    const soloStatus = (query.status === "approved" ? "accepted" : query.status || undefined) as RegistrationStatus | undefined;
    const queue = filterRegistrationRecords(await listSoloRegistrationRecords(user, eventId), { ...filter, status: soloStatus });
    const result = <RegistrationWorkspace {...common} {...soloOnly} queue={queue} teams={[]} />;
    trace("route_return", { locale, resourceId: eventId });
    return result;
   }
   const queue = await getEventRegistrationQueue({ user, eventId, ...filter });
   const visible = new Set(queue.items.map(item => item.teamId));
   const result = <RegistrationWorkspace {...common} queue={queue} teams={context.teams.filter(team => visible.has(team.id))} />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  if (query.view === "draw" && solo) {
   const draw = await getSoloDrawPanelData({ user, eventId, status: solo.status });
   const result = <RegistrationWorkspace {...common} solo={{ summary: solo, draw }} />;
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
   const status = query.status as TeamRegistrationRequestStatus || undefined;
   const payments = solo ? await listSoloPaymentEntries(user, eventId, status) : await getEventPaymentReview({ user, eventId, status });
   const result = <RegistrationWorkspace {...common} {...soloOnly} payments={payments} />;
   trace("route_return", { locale, resourceId: eventId });
   return result;
  }
  const qris = await getEventQris({ user, eventId });
  const result = <RegistrationWorkspace {...common} {...soloOnly} qris={qris} />;
  trace("route_return", { locale, resourceId: eventId });
  return result;
 } catch {
  trace("route_return", { locale, resourceId: eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
  return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;
 }
}
