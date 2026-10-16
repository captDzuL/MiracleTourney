// Event reads and writes: lists, drafts, slugs, public info, lifecycle, discovery and stream.
// Moved out of platform/repository.ts without changes (refactor PR 2.2).

import { applyEventLifecycleSideEffects } from "@/lib/events/event-lifecycle";
import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import { getGameIdForMode } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { UserFacingError } from "@/lib/security/public-error";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { ACTIVE_REGISTRATION_REQUEST_STATUSES, CACHE_TAGS, PUBLIC_EVENT_STATUSES } from "@/lib/platform/shared/constants";
import { eventPublicInclude, mapEvent, mapUser } from "@/lib/platform/shared/mappers";
import { isNewRegistrationWindowOpen } from "@/lib/platform/shared/tx";
import type { AppUser, Event, EventStatus } from "@/lib/platform/types";
import { getLiveStreamPresentation } from "@/lib/tournament/engine";
import { tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { unstable_cache } from "next/cache";
import { cache } from "react";

// ── Bracket sizing ─────────────────────────────────────────────────────────────
// `event.participantCap` is only the *maximum* registration allowed. The actual
// bracket must be sized to the number of teams that really registered, rounded
// up to the nearest power of two (byes fill the remaining slots). Using
// `participantCap` directly here was the bug: a 32-cap event with only 7 teams
// would render a full 5-round bracket instead of an 8-slot / 3-round one.
export function getBracketSlotCount(teamCount: number): 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256 {
  const safeCount = Math.max(teamCount, 1);
  return Math.pow(2, Math.ceil(Math.log2(safeCount === 1 ? 2 : safeCount))) as 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256;
}

/**
 * Returns all publicly-visible events (Published, Registration Closed, Ongoing, Finished). Used by sitemap.
 * A database error is passed on: an empty list would give search engines a "successful" sitemap without any event.
 */
export async function getAllPublicEvents(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return prisma.event.findMany({
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Returns all events (all statuses), ordered newest first. For admin use only. */
export async function getEvents(): Promise<Event[]> {
  const rows = await prisma.event.findMany({ include: eventPublicInclude, orderBy: { createdAt: "desc" } });
  return rows.map(mapEvent);
}

/** Returns selected events by ID, preserving database ordering newest first. */
export async function getEventsByIds(eventIds: string[]): Promise<Event[]> {
  if (!eventIds.length) return [];
  const rows = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapEvent);
}

export async function getManageableEventsForUser(user: AppUser): Promise<Event[]> {
  if (user.role === "platform_admin" || user.role === "admin") return getEvents();
  if (user.role !== "organizer") return [];

  const rows = await prisma.event.findMany({
    where: { organizerUserId: user.id },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapEvent);
}

export async function getManageableEventDraft(user: AppUser, eventId: string) {
  if (user.role !== "organizer" && user.role !== "platform_admin" && user.role !== "admin") return null;
  const row = await prisma.event.findFirst({
    where: {
      id: eventId,
      ...(user.role === "organizer" ? { organizerUserId: user.id } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true, gameId: true, gameModeId: true,
      organizerUserId: true, organizerName: true, organizerVerified: true,
      format: true, formatConfig: true, participantCap: true, entryMode: true,
      registrationOpensAt: true, registrationClosesAt: true, eventStartsAt: true,
      timezone: true, venue: true, venueAddress: true,
      registrationFeeRequired: true, registrationFeeAmount: true, prizePoolLabel: true,
      logoUrl: true, gameImageUrl: true, draftRevision: true, publishedRevision: true, status: true,
      _count: { select: { matches: true } },
      organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } },
    },
  });
  if (!row) return null;
  const formatConfig = tournamentFormatConfigSchema.safeParse(row.formatConfig);
  return {
    ...row,
    formatConfig: formatConfig.success ? formatConfig.data : null,
    status: row.status as EventStatus,
  };
}

export async function updateEventOrganizerContact(
  user: AppUser,
  input: { eventId: string; contactChannel: string; contactValue: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, ...(user.role === "organizer" ? { organizerUserId: user.id } : {}) },
      select: { organizerUserId: true, organizerName: true },
    });
    if (!event?.organizerUserId) throw new Error("Not authorized");
    await tx.organizerProfile.upsert({
      where: { userId: event.organizerUserId },
      update: { contactChannel: input.contactChannel, contactValue: input.contactValue },
      create: {
        userId: event.organizerUserId,
        organizationName: event.organizerName ?? user.name,
        contactChannel: input.contactChannel,
        contactValue: input.contactValue,
      },
    });
  });
}

export type EventPublicInfoUpdates = {
  description: string;
  registrationWindow: string;
  startsAt: string;
  venue: string;
  prizePoolLabel?: string | null;
  registrationFeeRequired?: boolean;
  registrationFeeAmount?: number | null;
  registrationFeeLabel?: string | null;
  registrationUrl?: string | null;
};

export async function updateEventPublicInfo(
  user: AppUser,
  eventId: string,
  updates: EventPublicInfoUpdates,
): Promise<Event> {
  await assertUserCanManageEvent(user, eventId);
  const row = await prisma.event.update({
    where: { id: eventId },
    data: updates,
    include: eventPublicInclude,
  });
  return mapEvent(row);
}

/** Returns events with publicly visible statuses: Published, Registration Closed, Ongoing, Finished. */
export async function getPublicEvents(): Promise<Event[]> {
  const rows = await prisma.event.findMany({
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapEvent);
}

export async function getOpenRegistrationEventsForCaptain(captainId: string): Promise<Array<Event & { registeredTeams: number }>> {
  if (!captainId) return [];

  const rows = await prisma.event.findMany({
    where: { status: "Published" },
    include: { stream: true },
    orderBy: { startsAt: "asc" },
  });
  const now = new Date();
  const events = rows
    .filter((event) => isNewRegistrationWindowOpen({
      status: event.status,
      registrationOpensAt: event.registrationOpensAt,
      registrationClosesAt: event.registrationClosesAt,
    }, now))
    .map(mapEvent);
  const eventIds = events.map((event) => event.id);
  if (!eventIds.length) return [];

  const [captainTeams, captainRequests, teamCountRows, pendingReviewRows, lockedEntries] = await Promise.all([
    prisma.team.findMany({
      where: { captainId, eventId: { in: eventIds } },
      select: { eventId: true },
    }),
    prisma.teamRegistrationRequest.findMany({
      where: { captainId, eventId: { in: eventIds }, status: { in: ACTIVE_REGISTRATION_REQUEST_STATUSES } },
      select: { eventId: true },
    }),
    prisma.team.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.teamRegistrationRequest.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds }, status: "pending_review" },
      _count: { _all: true },
    }),
    Promise.all(events.map(async (event) => {
      if (event.format !== "Single Elimination") return [event.id, false] as const;
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      return [event.id, completedMatches > 0] as const;
    })),
  ]);

  const joinedEventIds = new Set([
    ...captainTeams.map((team) => team.eventId),
    ...(captainRequests ?? []).map((request) => request.eventId),
  ]);
  const teamCounts = new Map(teamCountRows.map((row) => [row.eventId, row._count._all]));
  const pendingReviewCounts = new Map(pendingReviewRows.map((row) => [row.eventId, row._count._all]));
  const lockedEventIds = new Set(lockedEntries.filter(([, locked]) => locked).map(([eventId]) => eventId));

  return events
    .map((event) => ({
      ...event,
      registeredTeams: (teamCounts.get(event.id) ?? 0) + (pendingReviewCounts.get(event.id) ?? 0),
    }))
    .filter((event) => !joinedEventIds.has(event.id))
    .filter((event) => event.registeredTeams < event.participantCap)
    .filter((event) => !lockedEventIds.has(event.id));
}

/** Direct DB lookup by slug with no status filter. For admin pages that need to see Draft events. */
export async function getEventBySlug(slug: string): Promise<Event | null> {
  const row = await prisma.event.findUnique({ where: { slug }, include: eventPublicInclude });
  return row ? mapEvent(row) : null;
}

/**
 * Cached (60s, tag "events") public event lookup by slug.
 * Returns null for Draft events. Also memoised per-request via React cache.
 */
export const getPublicEventBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Event | null> => {
      const row = await prisma.event.findFirst({
        where: { slug, status: { in: [...PUBLIC_EVENT_STATUSES] } },
        include: eventPublicInclude,
      });
      return row ? mapEvent(row) : null;
    },
    ["public-event-by-slug"],
    { revalidate: 60, tags: [CACHE_TAGS.events] },
  ),
);

export async function updatePublishedEventSlugAsAdmin(
  user: AppUser,
  eventId: string,
  nextSlug: string,
): Promise<{ oldSlug: string; slug: string }> {
  if (user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");
  const slug = nextSlug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid slug");
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },
      select: { id: true, slug: true },
    });
    if (!event) throw new Error("Event is not editable");
    if (event.slug === slug) return { oldSlug: event.slug, slug };
    const occupied = await tx.event.findFirst({ where: { slug }, select: { id: true } });
    const redirectOccupied = await tx.eventSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { id: true } });
    if (occupied || redirectOccupied) throw new Error("Slug already exists");
    await tx.eventSlugRedirect.create({ data: { oldSlug: event.slug, eventId: event.id } });
    await tx.event.update({
      where: { id: event.id },
      data: { slug, publishedRevision: { increment: 1 } },
    });
    return { oldSlug: event.slug, slug };
  });
}

export async function getPublicEventSlugRedirect(oldSlug: string): Promise<string | null> {
  const redirect = await prisma.eventSlugRedirect.findUnique({
    where: { oldSlug },
    select: { event: { select: { slug: true, status: true } } },
  });
  return redirect && PUBLIC_EVENT_STATUSES.has(redirect.event.status as EventStatus)
    ? redirect.event.slug
    : null;
}

export type CreateOrganizerAndEventDraftInput = {
  actorId: string;
  organizer: {
    name: string;
    organizationName: string;
    email: string;
    contactChannel: string;
    contactValue: string;
    temporaryPassword: string;
  };
  event: {
    name: string;
    slug: string;
    gameModeId: string;
    format: Event["format"];
    formatConfig?: import("@/lib/tournament/formats/types").TournamentFormatConfig;
    participantCap: Event["participantCap"];
    organizerName: string;
  };
};

/** Creates a first-login-protected organizer, its public profile, and its Draft event atomically. */
export async function createOrganizerAndEventDraft(input: CreateOrganizerAndEventDraftInput): Promise<{ organizer: AppUser; event: Event }> {
  const passwordHash = await bcrypt.hash(input.organizer.temporaryPassword, 10);
  const gameId = getGameIdForMode(input.event.gameModeId);

  return prisma.$transaction(async (tx) => {
    const organizer = await tx.user.create({
      data: {
        email: input.organizer.email,
        name: input.organizer.name,
        role: "organizer",
        passwordHash,
        // The temporary password is never persisted in plaintext. The flag is
        // enforced by login and V3 organizer actions until it is changed.
        mustChangePassword: true,
      } as never,
    });
    await tx.organizerProfile.create({
      data: {
        userId: organizer.id,
        organizationName: input.organizer.organizationName,
        contactChannel: input.organizer.contactChannel,
        contactValue: input.organizer.contactValue,
      },
    });
    const event = await tx.event.create({
      data: {
        slug: input.event.slug,
        name: input.event.name,
        description: "New event created from platform admin.",
        gameId,
        gameModeId: input.event.gameModeId,
        format: input.event.format,
        formatConfig: input.event.formatConfig,
        status: "Draft",
        participantCap: input.event.participantCap,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: organizer.id,
        organizerName: input.event.organizerName,
        organizerVerified: false,
      },
      include: { stream: true },
    });
    return { organizer: mapUser(organizer), event: mapEvent(event) };
  });
}

/**
 * Creates a new event in "Draft" status. Game ID is resolved from the gameModeId.
 * Default description, venue ("Online"), and dates ("TBD") are set automatically.
 */
export async function createEvent(input: {
  name: string;
  slug: string;
  gameModeId: string;
  format: Event["format"];
  formatConfig?: import("@/lib/tournament/formats/types").TournamentFormatConfig;
  participantCap: Event["participantCap"];
  organizerUserId?: string;
  organizerName?: string;
  organizerVerified?: boolean;
}): Promise<Event> {
  const gameId = getGameIdForMode(input.gameModeId);
  const row = await prisma.event.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: "New event created from admin panel.",
      gameId,
      gameModeId: input.gameModeId,
      format: input.format,
      formatConfig: input.formatConfig,
      status: "Draft",
      participantCap: input.participantCap,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      organizerUserId: input.organizerUserId,
      organizerName: input.organizerName,
      organizerVerified: input.organizerVerified ?? false,
    },
    include: { stream: true },
  });
  return mapEvent(row);
}

/**
 * A solo event closes registration from its own draw panel, which settles open payments and refunds first,
 * and once its teams are locked it does not go back to taking registrations.
 */
async function assertSoloStatusChangeAllowed(tx: Prisma.TransactionClient, eventId: string, status: Event["status"]): Promise<void> {
  const current = await tx.event.findUnique({ where: { id: eventId }, select: { entryMode: true, status: true, activeSoloDrawId: true } });
  if (current?.entryMode !== "solo") return;
  if (status === "Registration Closed" && current.status !== "Registration Closed") {
    throw new UserFacingError("Event solo ditutup dari tab Acak tim di halaman registrasi.");
  }
  if (current.activeSoloDrawId !== null && (status === "Draft" || status === "Published")) {
    throw new UserFacingError("Tim sudah dikunci. Event tidak bisa dibuka lagi untuk pendaftaran.");
  }
}

/** Updates an event's lifecycle status. Use `autoTransitionEventToOngoing` for the match-triggered transition. */
export async function setEventStatus(eventId: string, status: Event["status"]): Promise<Event | null> {
  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    await assertSoloStatusChangeAllowed(tx, eventId, status);
    const updatedEvent = await tx.event.update({ where: { id: eventId }, data: { status }, include: eventPublicInclude });
    await applyEventLifecycleSideEffects(tx, eventId, status, now);
    return updatedEvent;
  });
  return mapEvent(row);
}

/**
 * Idempotently transitions an event from "Published" or "Registration Closed" to "Ongoing".
 * The same transaction discards active private revisions and revokes every preview token.
 */
export async function autoTransitionEventToOngoing(eventId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.event.updateMany({
      where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },
      data: { status: "Ongoing" },
    });
    if (transitioned.count === 0) return;
    await applyEventLifecycleSideEffects(tx, eventId, "Ongoing", now);
  });
}

/**
 * Public discovery read without fixtures or demo fallbacks.
 *
 * Callers own timeout/error presentation so they can state honestly that live
 * tournament data is temporarily unavailable.
 */
export async function getPublicDiscoveryEvents(now: Date = new Date()): Promise<PublicDiscoveryEvent[]> {
  const trace = process.env.PUBLIC_V3_HOME_DISCOVERY_TRACE === "1";
  const elapsed = (started: number) => Math.min(99999, Math.round(performance.now() - started));
  if (trace) {
    console.info("[public-v3-discovery] connect-start");
    const connectStarted = performance.now();
    try {
      await prisma.$connect();
      console.info(`[public-v3-discovery] connect-done ms=${elapsed(connectStarted)}`);
    } catch (error) {
      console.info(`[public-v3-discovery] connect-error ms=${elapsed(connectStarted)}`);
      throw error;
    }
  }
  if (trace) console.info("[public-v3-discovery] query-start");
  const queryStarted = performance.now();
  const rows = await prisma.event.findMany({
    relationLoadStrategy: "join",
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    include: {
      ...eventPublicInclude,
      competitionPhases: {
        where: { sequence: 1 },
        select: { status: true },
        take: 1,
      },
      matches: {
        where: { status: "Live" },
        select: { id: true },
        take: 1,
      },
      promotions: {
        where: { type: "featured", active: true, startsAt: { lte: now }, endsAt: { gte: now } },
        select: { id: true },
        take: 1,
      },
      _count: { select: { teams: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
  });
  if (trace) console.info(`[public-v3-discovery] query-done ms=${elapsed(queryStarted)}`);

  const mapStarted = performance.now();
  const entries = rows.map((row) => ({
    event: mapEvent(row),
    phaseStatus: row.competitionPhases[0]?.status ?? null,
    hasLiveMatch: row.matches.length > 0,
    teamCount: row._count.teams,
    updatedAt: row.updatedAt.toISOString(),
    pinnedFeatured: row.promotions.length > 0,
  }));
  if (trace) console.info(`[public-v3-discovery] map-done ms=${elapsed(mapStarted)}`);
  return entries;
}

/**
 * Sets or replaces the live stream URL for an event. Parses the URL to determine platform
 * (YouTube, TikTok, or external) and stores it as enabled + live immediately.
 */
export async function updateEventStream(eventId: string, url: string, label: string): Promise<Event | null> {
  // One transaction: the stream row and the event read back belong together, and the event cannot vanish in between.
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) return null;

    let stream: ReturnType<typeof getLiveStreamPresentation>;
    try {
      stream = getLiveStreamPresentation(url);
    } catch {
      throw new UserFacingError("Link live stream tidak valid. Pakai alamat lengkap yang diawali https://.");
    }
    await tx.eventStream.upsert({
      where: { eventId },
      update: { platform: stream.platform, url, label, enabled: true, isLive: true },
      create: { eventId, platform: stream.platform, url, label, enabled: true, isLive: true },
    });

    const updated = await tx.event.findUnique({ where: { id: eventId }, include: { stream: true } });
    return updated ? mapEvent(updated) : null;
  });
}

/** What the archive/delete action needs to know about an event: its status and how many teams it has. */
export async function getEventArchiveInfo(eventId: string): Promise<{ status: string; teamCount: number } | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { _count: { select: { teams: true } } },
  });
  return event ? { status: event.status, teamCount: event._count.teams } : null;
}

/** Permanently deletes an event. The caller checks that it is a Draft without teams. */
export async function deleteEvent(eventId: string): Promise<void> {
  await prisma.event.delete({ where: { id: eventId } });
}

/** Archives an event by marking it Finished. */
export async function markEventFinished(eventId: string): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: { status: "Finished" } });
}

/** True when captains may log in through this event's page: it is Published or Registration Closed. */
export async function isEventOpenForCaptainLogin(eventId: string): Promise<boolean> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },
    select: { id: true },
  });
  return event !== null;
}
