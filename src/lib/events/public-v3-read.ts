import { readPublicOngoing } from "./public-ongoing";
import { readPublicRegistration } from "./public-registration";
import { readPublicDrawing } from "./public-drawing";
import { readPublicFinished } from "./public-finished";
import { readerProbeLimit } from "@/lib/platform/reader-bounds";
import { createServerMilestoneLogger, withServerActionLog } from "@/lib/observability/logger";
import type { CompatiblePublicEventInput, CompatiblePublicEventRecord, PublicV3Cta, PublicV3EventViewModel, PublicHomeFeaturedEvent, PublicViewer } from "./public-v3-types";
import { PUBLIC_READER_ROW_LIMIT, PUBLIC_STATUSES, callOptional, eventRecord, navigation, publicReaderRows, record, statusExplanationKey, statusMode, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { teamsFor } from "@/lib/events/public-v3/parts";
export { projectPublicV3Identity } from "@/lib/events/public-v3/identity";
import { registrationInput } from "@/lib/events/public-v3/registration";
import { drawingInput, finishedInput, ongoingInput } from "@/lib/events/public-v3/phases";
import { teamsFromRaw } from "@/lib/events/public-v3/authoritative";
export { projectPublicV3AuthoritativeMatch } from "@/lib/events/public-v3/authoritative";
import { compatibilitySnapshot, readPublishedAnnouncements } from "@/lib/events/public-v3/compat";
import { normalizeAuthoritative } from "@/lib/events/public-v3/normalize";

export function projectCompatiblePublicV3Event(input: CompatiblePublicEventInput): PublicV3EventViewModel {
  const event = eventRecord(input);
  const mode = statusMode(text(event.status, "Published"));
  const teams = teamsFor(input);
  if (mode === "registration") return registrationInput(event, input, teams, "compatible");
  if (mode === "drawing") return drawingInput(event, input, teams, "compatible");
  if (mode === "ongoing") return ongoingInput(event, input, teams, "compatible");
  return finishedInput(event, input, teams, "compatible");
}

/**
 * Projects an unpublished (Draft or in-revision) event into the same V3 public view model the
 * published page uses. Only saved event fields are shown; registration stays disabled because a
 * private preview must never offer a live entry point.
 */
export function projectPreviewPublicV3Event(event: CompatiblePublicEventRecord, now = new Date()): PublicV3EventViewModel {
  const view = projectCompatiblePublicV3Event({ event, now });
  if (view.mode !== "registration") return view;
  const cta: PublicV3Cta = { kind: "disabled", label: "registration_unavailable", href: null, hrefByLocale: null, reason: "registration_unavailable", enabled: false };
  return {
    ...view,
    cta,
    identity: { ...view.identity, cta },
    event: { ...view.event, cta },
    viewer: { state: "anonymous", cta: { kind: "disabled", label: "registration_unavailable", reason: "registration_unavailable", enabled: false } },
  };
}

/** Narrow pure adapter for homepage consumers; never invents missing detail fields. */
export function projectPublicHomeFeaturedEvent(view: PublicV3EventViewModel): PublicHomeFeaturedEvent {
  const base = {
    source: view.source, identity: view.identity, organizer: view.organizer, facts: view.facts,
    statusExplanation: view.statusExplanation, statusExplanationKey: view.statusExplanationKey,
    cta: view.cta, navigation: view.navigation, teams: view.teams.map(({ id, name }) => ({ id, name })),
  };
  if (view.mode === "registration") return { ...base, mode: "registration", registration: {
    activeTeamCount: view.registration.activeTeamCount, participantCap: view.registration.participantCap,
    remainingSlots: view.registration.remainingSlots,
  } };
  if (view.mode === "drawing") return { ...base, mode: "drawing", drawing: { published: view.drawing.published }, matches: view.matches };
  if (view.mode === "ongoing") return { ...base, mode: "ongoing", liveMatches: view.liveMatches, nextMatches: view.nextMatches, recentResults: view.recentResults };
  return { ...base, mode: "finished", matches: view.matches, podium: view.podium.map(({ rank, teamName }) => ({ rank, teamName })) };
}

async function readPublicV3EventImpl(slug: string, viewer: PublicViewer, now = new Date(), requestId?: string): Promise<PublicV3EventViewModel | null> {
  const include = { organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } } };
  let event = await callOptional("event", "findUnique", { where: { slug }, include });
  if (!event) event = await callOptional("event", "findFirst", { where: { slug }, include });
  if (!event) return null;
  const storedEvent = record(event);
  const publicContact = record(record(storedEvent.organizer).organizerProfile);
  const row: AnyRecord = {
    ...storedEvent,
    organizerContactChannel: text(publicContact.contactChannel, text(storedEvent.organizerContactChannel)),
    organizerContactValue: text(publicContact.contactValue, text(storedEvent.organizerContactValue)),
  };
  const status = text(row.status);
  if (!PUBLIC_STATUSES.has(status)) return null;
  const trace = requestId
    ? createServerMilestoneLogger({ operation: "public_event_read", route: "/server-readers/public-event", requestId })
    : undefined;
  const persistedUpdates = await readPublishedAnnouncements(text(row.id), now, status, trace);
  let authoritative: unknown = null;
  if (status === "Ongoing") authoritative = await readPublicOngoing(slug, now);
  else if (status === "Finished") authoritative = await readPublicFinished(slug);
  else if (status === "Published") {
    authoritative = await readPublicDrawing(slug);
    if (!authoritative) authoritative = await readPublicRegistration(slug, viewer, now);
  } else if (status === "Registration Closed") {
    authoritative = await readPublicDrawing(slug);
  }
  const authoritativeMode = text(record(authoritative).mode);
  const snapshotTeams = ["registration", "drawing", "ongoing", "finished"].includes(authoritativeMode)
    ? teamsFromRaw(publicReaderRows("public.snapshot.teams", await callOptional("team", "findMany", { where: { eventId: text(row.id) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) })))
    : [];
  const normalized = normalizeAuthoritative(row, authoritative, "authoritative", snapshotTeams, persistedUpdates);
  if (normalized) return normalized;
  return projectCompatiblePublicV3Event(await compatibilitySnapshot(row, viewer, now, persistedUpdates));
}

export function readPublicV3Event(slug: string, viewer: PublicViewer, now = new Date()): Promise<PublicV3EventViewModel | null> {
  return withServerActionLog("public_event_read", "/server-readers/public-event", ({ requestId }) => readPublicV3EventImpl(slug, viewer, now, requestId));
}
