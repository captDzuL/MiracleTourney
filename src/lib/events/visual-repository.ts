// Event visual assets, plus brand and certificate asset updates.
// Moved out of platform/repository.ts without changes (refactor PR 2.3).

import { prisma } from "@/lib/platform/db";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { mapEventVisualAsset } from "@/lib/platform/shared/mappers";
import type { AppUser, EventVisualAsset, VisualAssetSource, VisualAssetStatus } from "@/lib/platform/types";

export type CreateEventVisualAssetInput = {
  eventId: string;
  source: VisualAssetSource;
  status: VisualAssetStatus;
  url?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  storageProvider?: "vercel_blob" | "local" | null;
  storageKey?: string | null;
  contentSha256?: string | null;
  purpose?: "certificate_team_logo" | "certificate_character_art" | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  workflowRunId?: string | null;
  sourceUrl?: string | null;
  rightsAttestedAt?: Date | null;
  errorCode?: string | null;
};

export function clampFocalCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Lists every revision for an event, newest first. Organizer-scoped. */
export async function listEventVisualAssets(user: AppUser, eventId: string): Promise<EventVisualAsset[]> {
  await assertUserCanManageEvent(user, eventId);
  const rows = await prisma.eventVisualAsset.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapEventVisualAsset);
}

export async function createEventVisualAsset(
  user: AppUser,
  input: CreateEventVisualAssetInput,
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, input.eventId);
  const row = await prisma.eventVisualAsset.create({
    data: { ...input, createdByUserId: user.id },
  });
  return mapEventVisualAsset(row);
}

/**
 * Approves a revision and points the event at it inside one transaction so the
 * revision status and `Event.activeVisualAssetId` can never diverge. Already
 * approved revisions stay approvable, which is how rollback works.
 *
 * `dualWriteLegacyImage` mirrors the approved url into the legacy
 * `Event.gameImageUrl` column. It is only meant for the migration window while
 * surfaces that still read the single legacy url are being retired.
 */
export async function approveEventVisualAsset(
  user: AppUser,
  eventId: string,
  assetId: string,
  options: { dualWriteLegacyImage?: boolean } = {},
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventVisualAsset.findFirst({
      where: { id: assetId, eventId, status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    if (!existing) throw new Error("Visual revision is not available for approval");

    const approved = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { status: "approved", approvedAt: new Date() },
    });
    await tx.event.update({
      where: { id: eventId },
      data: {
        activeVisualAssetId: assetId,
        ...(options.dualWriteLegacyImage && approved.url ? { gameImageUrl: approved.url } : {}),
      },
    });
    return mapEventVisualAsset(approved);
  });
}

export async function rejectEventVisualAsset(
  user: AppUser,
  eventId: string,
  assetId: string,
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: eventId }, select: { activeVisualAssetId: true } });
    if (event?.activeVisualAssetId === assetId) throw new Error("Cannot reject the active visual revision");

    const existing = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
    if (!existing) throw new Error("Visual revision not found");

    const rejected = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { status: "rejected" },
    });
    return mapEventVisualAsset(rejected);
  });
}

export async function setEventVisualFocalPoint(
  user: AppUser,
  eventId: string,
  assetId: string,
  focalPoint: { x: number; y: number },
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  const existing = await prisma.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
  if (!existing) throw new Error("Visual revision not found");

  const row = await prisma.eventVisualAsset.update({
    where: { id: assetId },
    data: { focalX: clampFocalCoordinate(focalPoint.x), focalY: clampFocalCoordinate(focalPoint.y) },
  });
  return mapEventVisualAsset(row);
}

/** Counts AI generation attempts for an event since `since`, for rate limiting. */
export async function countAiVisualAttempts(eventId: string, since: Date): Promise<number> {
  return prisma.eventVisualAsset.count({
    where: { eventId, source: "ai_generated", createdAt: { gte: since } },
  });
}

/** Updates the character art URL and accent color for an event's certificate assets. */
export async function updateEventCertificateAssets(
  eventId: string,
  updates: { characterArtUrl?: string; accentColor?: string },
): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: updates });
}

export async function updateEventBrandAssets(
  eventId: string,
  updates: { logoUrl?: string; gameImageUrl?: string },
): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: updates });
}
