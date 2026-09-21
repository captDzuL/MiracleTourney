import type { AppUser } from "@/lib/platform/types";
import { prisma } from "@/lib/platform/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { findGameConfig } from "@/lib/platform/config";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { withServerActionLog } from "@/lib/observability/logger";
import type { OrganizerWorkspaceLifecycle, OrganizerWorkspaceSummary } from "./workspace-types";

/** One ownership-scoped query: scalar facts and filtered counts, never route payloads. */
async function readOrganizerWorkspaceSummaryImpl(eventId: string, actor: Pick<AppUser, "id" | "role">): Promise<OrganizerWorkspaceSummary | null> {
  if (!["organizer", "admin", "platform_admin"].includes(actor.role)) return null;
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...(actor.role === "organizer" ? { organizerUserId: actor.id } : {}) },
    select: {
      id: true, organizerUserId: true, name: true, gameId: true, format: true, status: true, publishedAt: true,
      updatedAt: true, publishedScheduleVersion: true,
      completion: { select: { status: true } },
      _count: { select: {
        teams: true,
        teamRegistrationRequests: { where: { status: "pending_review" } },
        matches: { where: { status: { not: "Completed" } } },
        statSubmissions: { where: { status: "pending" } },
        competitionActionItems: { where: { resolvedAt: null } },
      } },
    },
  });
  if (!event) return null;
  const access = authorizeWorkspaceResource(
    actor as WorkspaceActor,
    { eventId: event.id, ownerUserId: event.organizerUserId },
    event.organizerUserId,
  );
  if (!access.ok) return null;
  const lifecycles: Record<string, OrganizerWorkspaceLifecycle> = {
    Draft: "draft", Published: "registration", "Registration Closed": "drawing", Ongoing: "ongoing", Finished: "finished",
  };
  const lifecycle = lifecycles[event.status] ?? "draft";
  const operations = isFeatureEnabled("competition_operations_v3");
  const completion = isFeatureEnabled("completion_workspace_v3");
  const capabilities: OrganizerWorkspaceSummary["capabilities"] = {
    overview: true, registration: true,
    // These destinations are enabled by their owning migration tasks.
    participants: isFeatureEnabled("registration_workspace_v3"), announcements: true, settings: true,
    competition: operations, schedule: operations, "match-control": operations, completion,
  };
  const counts = event._count;
  const blockers: OrganizerWorkspaceSummary["blockers"] = [];
  const add = (code: string, section: OrganizerWorkspaceSummary["blockers"][number]["section"]) => {
    if (capabilities[section]) blockers.push({ code, section, message: `blockers.${code}`, href: `/organizer/events/${encodeURIComponent(event.id)}/${section}` });
  };
  if (counts.teamRegistrationRequests) add("registration_review", "registration");
  if (counts.matches && (lifecycle === "ongoing" || lifecycle === "finished")) add("match_results", "match-control");
  if (counts.statSubmissions) add("statistics_review", "completion");
  if (event.publishedScheduleVersion === null && (lifecycle === "drawing" || lifecycle === "ongoing")) add("schedule_unpublished", "schedule");
  return {
    event: { id: event.id, title: event.name, game: findGameConfig(event.gameId)?.name ?? event.gameId, format: event.format },
    lifecycle,
    publication: event.completion?.status === "completed" && lifecycle === "finished" ? "completed" : lifecycle === "draft" ? "private" : "published",
    role: actor.role as OrganizerWorkspaceSummary["role"], capabilities,
    badges: { participants: counts.teams, registration: counts.teamRegistrationRequests, "match-control": counts.competitionActionItems, completion: counts.matches + counts.statSubmissions },
    blockers, updatedAt: event.updatedAt.toISOString(),
  };
}

export function readOrganizerWorkspaceSummary(eventId: string, actor: Pick<AppUser, "id" | "role">): Promise<OrganizerWorkspaceSummary | null> {
  return withServerActionLog("organizer_workspace_read", "/server-readers/organizer-workspace", () => readOrganizerWorkspaceSummaryImpl(eventId, actor));
}
