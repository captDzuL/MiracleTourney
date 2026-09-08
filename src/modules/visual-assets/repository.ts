import { prisma } from "@/lib/platform/db";
import * as demoStore from "@/lib/platform/demo-store";
import type { ActorContext } from "@/modules/identity";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/identity";
import { resolveEventAccessScope } from "@/modules/events";

import type {
  ApproveVisualAssetOptions,
  CreateVisualAssetInput,
  EventVisualAsset,
  FocalPoint,
  VisualAssetSource,
  VisualAssetStatus,
} from "./types";

type VisualAssetRow = {
  id: string;
  eventId: string;
  source: string;
  status: string;
  url?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  focalX: number;
  focalY: number;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  workflowRunId?: string | null;
  sourceUrl?: string | null;
  rightsAttestedAt?: Date | null;
  errorCode?: string | null;
  createdByUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapVisualAsset(row: VisualAssetRow): EventVisualAsset {
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

function clampFocalCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Organizer access is scoped to the actor's tenant; only `platform_admin` has
 * global event access. Reuses the events module's access-scope resolver so
 * ownership semantics never drift between the two modules.
 *
 * Accepts an optional transaction client so mutations can re-verify ownership
 * *inside* the same database transaction as their write. This closes the gap
 * a separate preflight check would leave open if ownership changed between
 * the check and the write; every mutation below re-checks against the `tx`
 * it writes with, not just the outer `prisma` client.
 */
export async function assertActorCanManageVisualEvent(
  actor: ActorContext | null,
  eventId: string,
  client: typeof prisma | TransactionClient = prisma,
): Promise<void> {
  const scope = resolveEventAccessScope(actor);

  if (scope.kind === "platform_admin") return;

  if (scope.kind !== "organizer") {
    throw new ForbiddenError("Not authorized");
  }

  const row = await client.event.findFirst({
    where: { id: eventId, organizerUserId: scope.organizerUserId },
    select: { id: true },
  });

  if (!row) {
    throw new ForbiddenError("Not authorized");
  }
}

/** Lists every revision for an event, newest first. Organizer-scoped. */
export async function listVisualAssetsForActor(actor: ActorContext | null, eventId: string): Promise<EventVisualAsset[]> {
  await assertActorCanManageVisualEvent(actor, eventId);
  try {
    const rows = await prisma.eventVisualAsset.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapVisualAsset);
  } catch {
    return demoStore.listEventVisualAssets(eventId);
  }
}

export async function createVisualAssetForActor(
  actor: ActorContext | null,
  input: CreateVisualAssetInput,
): Promise<EventVisualAsset> {
  return prisma.$transaction(async (tx) => {
    await assertActorCanManageVisualEvent(actor, input.eventId, tx);
    const row = await tx.eventVisualAsset.create({
      data: { ...input, createdByUserId: actor!.userId },
    });
    return mapVisualAsset(row);
  });
}

/**
 * Approves a revision and points the event at it inside one transaction so the
 * revision status and `Event.activeVisualAssetId` can never diverge. Already
 * approved revisions stay approvable, which is how rollback (re-activation)
 * works.
 *
 * `dualWriteLegacyImage` mirrors the approved url into the legacy
 * `Event.gameImageUrl` column. It is only meant for the migration window while
 * surfaces that still read the single legacy url are being retired.
 */
export async function approveVisualAssetForActor(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
  options: ApproveVisualAssetOptions = {},
): Promise<EventVisualAsset> {
  return prisma.$transaction(async (tx) => {
    await assertActorCanManageVisualEvent(actor, eventId, tx);
    const existing = await tx.eventVisualAsset.findFirst({
      where: { id: assetId, eventId, status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    if (!existing) throw new ConflictError("Visual revision is not available for approval");

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
    return mapVisualAsset(approved);
  });
}

export async function rejectVisualAssetForActor(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
): Promise<EventVisualAsset> {
  return prisma.$transaction(async (tx) => {
    await assertActorCanManageVisualEvent(actor, eventId, tx);
    const event = await tx.event.findFirst({ where: { id: eventId }, select: { activeVisualAssetId: true } });
    if (event?.activeVisualAssetId === assetId) throw new ConflictError("Cannot reject the active visual revision");

    const existing = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Visual revision not found");

    const rejected = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { status: "rejected" },
    });
    return mapVisualAsset(rejected);
  });
}

export async function setVisualAssetFocalPointForActor(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
  focalPoint: FocalPoint,
): Promise<EventVisualAsset> {
  return prisma.$transaction(async (tx) => {
    await assertActorCanManageVisualEvent(actor, eventId, tx);
    const existing = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Visual revision not found");

    const row = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { focalX: clampFocalCoordinate(focalPoint.x), focalY: clampFocalCoordinate(focalPoint.y) },
    });
    return mapVisualAsset(row);
  });
}

/** Counts AI generation attempts for an event since `since`, for rate limiting. */
export async function countAiVisualAttempts(eventId: string, since: Date): Promise<number> {
  return prisma.eventVisualAsset.count({
    where: { eventId, source: "ai_generated", createdAt: { gte: since } },
  });
}
