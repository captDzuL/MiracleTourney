import type { Prisma } from "@prisma/client";

import { getFallbackLogoUrl } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";
import type { ActorContext } from "@/modules/identity";
import { ForbiddenError, NotFoundError } from "@/modules/identity";

import type { EventStream } from "@/lib/platform/types";

import type {
  Event,
  EventAccessScope,
  EventRow,
  EventVisualAsset,
  EventVisualAssetRow,
  ManageableEventDraft,
  ManageableEventDraftRow,
  TournamentFormat,
  VisualAssetSource,
  VisualAssetStatus,
} from "./types";

export const PUBLIC_EVENT_STATUSES = ["Published", "Registration Closed", "Ongoing", "Finished"] as const;

export const eventPublicInclude = {
  stream: true,
  activeVisualAsset: true,
} satisfies Prisma.EventInclude;

function mapEventVisualAsset(row: EventVisualAssetRow): EventVisualAsset {
  const asset: EventVisualAsset = {
    id: row.id,
    eventId: row.eventId,
    source: row.source as VisualAssetSource,
    status: row.status as VisualAssetStatus,
    focalX: row.focalX,
    focalY: row.focalY,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  return {
    ...asset,
    ...(row.url ? { url: row.url } : {}),
    ...(row.mimeType ? { mimeType: row.mimeType } : {}),
    ...(row.width != null ? { width: row.width } : {}),
    ...(row.height != null ? { height: row.height } : {}),
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.promptVersion ? { promptVersion: row.promptVersion } : {}),
    ...(row.workflowRunId ? { workflowRunId: row.workflowRunId } : {}),
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.rightsAttestedAt ? { rightsAttestedAt: row.rightsAttestedAt } : {}),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.createdByUserId ? { createdByUserId: row.createdByUserId } : {}),
    ...(row.approvedAt ? { approvedAt: row.approvedAt } : {}),
  };
}

export function mapEvent(row: EventRow): Event {
  const event: Event = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    gameId: row.gameId,
    gameModeId: row.gameModeId,
    format: row.format as TournamentFormat,
    status: row.status as Event["status"],
    participantCap: row.participantCap as Event["participantCap"],
    registrationWindow: row.registrationWindow,
    startsAt: row.startsAt,
    venue: row.venue,
    registrationFeeRequired: row.registrationFeeRequired ?? false,
  };

  const formatConfig = tournamentFormatConfigSchema.safeParse(row.formatConfig);

  return {
    ...event,
    ...(row.logoUrl ?? getFallbackLogoUrl(row.gameId) ? { logoUrl: row.logoUrl ?? getFallbackLogoUrl(row.gameId) } : {}),
    ...(row.gameImageUrl ? { gameImageUrl: row.gameImageUrl } : {}),
    ...(row.characterArtUrl ? { characterArtUrl: row.characterArtUrl } : {}),
    ...(row.accentColor ? { accentColor: row.accentColor } : {}),
    ...(row.organizerUserId ? { organizerUserId: row.organizerUserId } : {}),
    ...(row.organizerName ? { organizerName: row.organizerName } : {}),
    ...(row.organizerVerified != null ? { organizerVerified: row.organizerVerified } : {}),
    ...(row.prizePoolLabel ? { prizePoolLabel: row.prizePoolLabel } : {}),
    ...(row.registrationFeeAmount != null ? { registrationFeeAmount: row.registrationFeeAmount } : {}),
    ...(row.registrationFeeLabel ? { registrationFeeLabel: row.registrationFeeLabel } : {}),
    ...(row.registrationUrl ? { registrationUrl: row.registrationUrl } : {}),
    ...(formatConfig.success ? { formatConfig: formatConfig.data } : {}),
    ...(row.activeVisualAssetId ? { activeVisualAssetId: row.activeVisualAssetId } : {}),
    ...(row.activeVisualAsset ? { activeVisualAsset: mapEventVisualAsset(row.activeVisualAsset) } : {}),
    ...(row.stream
      ? {
          stream: {
            platform: row.stream.platform as EventStream["platform"],
            url: row.stream.url,
            label: row.stream.label,
            enabled: row.stream.enabled,
            isLive: row.stream.isLive,
          },
        }
      : {}),
  };
}

function whereForScope(scope: EventAccessScope): Prisma.EventWhereInput | undefined {
  if (scope.kind === "organizer") return { organizerUserId: scope.organizerUserId };
  if (scope.kind === "platform_admin") return undefined;
  return { id: "__no-access__" };
}

export async function listEventsForScope(scope: EventAccessScope) {
  const where = whereForScope(scope);
  const rows = await prisma.event.findMany({
    ...(where ? { where } : {}),
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapEvent);
}

export async function listPublicEventMetadata() {
  return prisma.event.findMany({
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listEventsByIds(eventIds: string[]) {
  if (!eventIds.length) return [];

  const rows = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapEvent);
}

export async function listPublicEvents() {
  const rows = await prisma.event.findMany({
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapEvent);
}

export async function listPublishedEvents() {
  const rows = await prisma.event.findMany({
    where: { status: "Published" },
    include: eventPublicInclude,
    orderBy: { startsAt: "asc" },
  });

  return rows.map(mapEvent);
}

export async function listCaptainTeamEventIds(captainId: string, eventIds: string[]) {
  if (!captainId || !eventIds.length) return [];

  const rows = await prisma.team.findMany({
    where: { captainId, eventId: { in: eventIds } },
    select: { eventId: true },
  });

  return rows.map((row) => row.eventId).filter((eventId): eventId is string => Boolean(eventId));
}

export async function listCaptainRegistrationRequestEventIds(
  captainId: string,
  eventIds: string[],
  statuses: readonly string[],
) {
  if (!captainId || !eventIds.length || !statuses.length) return [];

  const rows = await prisma.teamRegistrationRequest.findMany({
    where: {
      captainId,
      eventId: { in: eventIds },
      status: { in: [...statuses] },
    },
    select: { eventId: true },
  });

  return (rows ?? []).map((row) => row.eventId).filter((eventId): eventId is string => Boolean(eventId));
}

export async function listTeamCountsByEventIds(eventIds: string[]) {
  if (!eventIds.length) return new Map<string, number>();

  const rows = await prisma.team.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.eventId, row._count._all]));
}

export async function listLockedSingleEliminationEventIds(events: Array<{ id: string; format: string }>) {
  const lockedEntries = await Promise.all(
    events.map(async (event) => {
      if (event.format !== "Single Elimination") return [event.id, false] as const;
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      return [event.id, completedMatches > 0] as const;
    }),
  );

  return new Set(lockedEntries.filter(([, locked]) => locked).map(([eventId]) => eventId));
}

export async function findEventBySlug(slug: string) {
  const row = await prisma.event.findUnique({ where: { slug }, include: eventPublicInclude });
  return row ? mapEvent(row) : null;
}

export async function findPublicEventBySlug(slug: string) {
  const row = await prisma.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_EVENT_STATUSES] } },
    include: eventPublicInclude,
  });

  return row ? mapEvent(row) : null;
}

export async function findManageableEventDraft(scope: EventAccessScope, eventId: string): Promise<ManageableEventDraft | null> {
  const row = await prisma.event.findFirst({
    where: {
      id: eventId,
      ...(scope.kind === "organizer" ? { organizerUserId: scope.organizerUserId } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      gameId: true,
      gameModeId: true,
      format: true,
      formatConfig: true,
      participantCap: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      eventStartsAt: true,
      timezone: true,
      venue: true,
      venueAddress: true,
      registrationFeeRequired: true,
      registrationFeeAmount: true,
      logoUrl: true,
      gameImageUrl: true,
      draftRevision: true,
      status: true,
      organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } },
    },
  });

  if (!row) return null;

  const draftRow = row as ManageableEventDraftRow;
  const formatConfig = tournamentFormatConfigSchema.safeParse(draftRow.formatConfig);

  return {
    ...draftRow,
    status: draftRow.status as ManageableEventDraft["status"],
    formatConfig: formatConfig.success ? formatConfig.data : null,
  };
}

function eventCommandWhere(actor: ActorContext, eventId: string): Prisma.EventWhereInput {
  if (actor.role === "platform_admin") {
    return { id: eventId };
  }

  if (actor.role === "organizer" && actor.tenantId) {
    return { id: eventId, organizerUserId: actor.tenantId };
  }

  return { id: "__no-access__" };
}

export async function getActiveOrganizerIdentityById(organizerUserId: string) {
  return prisma.user.findFirst({
    where: {
      id: organizerUserId,
      role: "organizer",
      deactivatedAt: null,
    },
    select: { id: true, name: true },
  });
}

export async function assertActorCanManageEvent(actor: ActorContext, eventId: string): Promise<void> {
  if (actor.role === "platform_admin") return;

  if (actor.role !== "organizer" || !actor.tenantId) {
    throw new ForbiddenError();
  }

  const row = await prisma.event.findFirst({
    where: { id: eventId, organizerUserId: actor.tenantId },
    select: { id: true },
  });

  if (!row) {
    throw new ForbiddenError();
  }
}

export async function createEventRecord(input: {
  name: string;
  slug: string;
  gameId: string;
  gameModeId: string;
  format: Event["format"];
  formatConfig?: Prisma.JsonValue;
  participantCap: Event["participantCap"];
  organizerUserId: string;
  organizerName?: string;
  organizerVerified?: boolean;
}) {
  const row = await prisma.event.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: "New event created from admin panel.",
      gameId: input.gameId,
      gameModeId: input.gameModeId,
      format: input.format,
      ...(input.formatConfig ? { formatConfig: input.formatConfig } : {}),
      status: "Draft",
      participantCap: input.participantCap,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      organizerUserId: input.organizerUserId,
      organizerName: input.organizerName,
      organizerVerified: input.organizerVerified ?? false,
    },
    include: eventPublicInclude,
  });

  return mapEvent(row);
}

export async function setEventStatusForActor(actor: ActorContext, eventId: string, status: Event["status"]) {
  return prisma.$transaction(async (tx) => {
    const where = eventCommandWhere(actor, eventId);
    const updated = await tx.event.updateMany({
      where,
      data: { status },
    });

    if (updated.count !== 1) return null;

    const now = new Date();
    await tx.eventPreviewToken.updateMany({
      where: { eventId, revokedAt: null },
      data: { revokedAt: now },
    });

    const row = await tx.event.findFirst({
      where,
      include: eventPublicInclude,
    });

    return row ? mapEvent(row) : null;
  });
}

export async function updateEventPublicInfoForActor(
  actor: ActorContext,
  eventId: string,
  updates: {
    description: string;
    registrationWindow: string;
    startsAt: string;
    venue: string;
    prizePoolLabel?: string | null;
    registrationFeeRequired?: boolean;
    registrationFeeAmount?: number | null;
    registrationFeeLabel?: string | null;
    registrationUrl?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const where = eventCommandWhere(actor, eventId);
    const updated = await tx.event.updateMany({
      where,
      data: updates,
    });

    if (updated.count !== 1) {
      throw new ForbiddenError();
    }

    const row = await tx.event.findFirst({ where, include: eventPublicInclude });
    if (!row) {
      throw new NotFoundError();
    }

    return mapEvent(row);
  });
}

export async function updateEventOrganizerContactForActor(
  actor: ActorContext,
  input: { eventId: string; contactChannel: string; contactValue: string; fallbackOrganizationName?: string },
) {
  return prisma.$transaction(async (tx) => {
    const where = eventCommandWhere(actor, input.eventId);
    const event = await tx.event.findFirst({
      where,
      select: { organizerUserId: true, organizerName: true },
    });

    if (!event?.organizerUserId) {
      throw new ForbiddenError();
    }

    await tx.organizerProfile.upsert({
      where: { userId: event.organizerUserId },
      update: {
        contactChannel: input.contactChannel,
        contactValue: input.contactValue,
      },
      create: {
        userId: event.organizerUserId,
        organizationName: event.organizerName ?? input.fallbackOrganizationName ?? "Organizer",
        contactChannel: input.contactChannel,
        contactValue: input.contactValue,
      },
    });
  });
}

export async function archiveEventForActor(
  actor: ActorContext,
  eventId: string,
  action: "archive" | "delete",
): Promise<"archived" | "deleted" | "not_found" | "not_draft" | "has_teams"> {
  return prisma.$transaction(async (tx) => {
    const where = eventCommandWhere(actor, eventId);
    const event = await tx.event.findFirst({
      where,
      include: { _count: { select: { teams: true } } },
    });

    if (!event) return "not_found";

    if (action === "delete") {
      if (event.status !== "Draft") return "not_draft";
      if (event._count.teams > 0) return "has_teams";

      await tx.event.delete({ where: { id: event.id } });
      return "deleted";
    }

    await tx.event.update({ where: { id: event.id }, data: { status: "Finished" } });
    return "archived";
  });
}
