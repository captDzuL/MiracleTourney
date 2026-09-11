import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/platform/db";
import { getGameIdForMode } from "@/lib/platform/config";
import { eventPublicInclude, mapEvent } from "@/lib/platform/repository";
import type { EventStatus } from "@/lib/platform/types";
import { getLegacyTournamentFormat, tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";

const EDITABLE_EVENT_STATUSES = ["Published", "Registration Closed"] as const;
const PREVIEW_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const trimmedText = z.string().transform((value) => value.trim());
const nullableTrimmedText = z.string().transform((value) => value.trim() || null).nullable();
const nullableIsoDate = z.preprocess(
  (value) => value instanceof Date ? value.toISOString() : value === "" ? null : value,
  z.string().datetime({ offset: true }).nullable(),
);
const participantCapSchema = z.union([
  z.literal(8), z.literal(12), z.literal(16), z.literal(24),
  z.literal(32), z.literal(64), z.literal(128), z.literal(256),
]);
const streamSchema = z.object({
  platform: z.enum(["youtube", "tiktok", "external"]),
  url: z.string().trim().min(1),
  label: z.string().trim().min(1),
  enabled: z.boolean(),
  isLive: z.boolean(),
}).strict().nullable();

const revisionPayloadShape = {
  name: trimmedText.pipe(z.string().min(1)),
  description: trimmedText,
  logoUrl: nullableTrimmedText,
  gameImageUrl: nullableTrimmedText,
  gameModeId: trimmedText.pipe(z.string().min(1)),
  format: z.enum(["Single Elimination", "League"]),
  formatConfig: tournamentFormatConfigSchema.nullable(),
  participantCap: participantCapSchema,
  registrationOpensAt: nullableIsoDate,
  registrationClosesAt: nullableIsoDate,
  eventStartsAt: nullableIsoDate,
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  venue: trimmedText,
  venueAddress: nullableTrimmedText,
  prizePoolLabel: nullableTrimmedText,
  registrationFeeRequired: z.boolean(),
  registrationFeeAmount: z.number().int().nonnegative().nullable(),
  registrationFeeLabel: nullableTrimmedText,
  registrationUrl: nullableTrimmedText,
  characterArtUrl: nullableTrimmedText,
  accentColor: nullableTrimmedText,
  activeVisualAssetId: nullableTrimmedText,
  stream: streamSchema,
};

function validateFormatCompatibility(
  value: { format?: "Single Elimination" | "League"; formatConfig?: z.infer<typeof tournamentFormatConfigSchema> | null },
  context: z.RefinementCtx,
) {
  if (value.formatConfig && value.format && getLegacyTournamentFormat(value.formatConfig) !== value.format) {
    context.addIssue({ code: "custom", path: ["formatConfig"], message: "V3 format config must match the legacy format" });
  }
}

export const eventRevisionPayloadSchema = z.object(revisionPayloadShape).strict().superRefine(validateFormatCompatibility);
export const eventRevisionPatchSchema = z.object(revisionPayloadShape).partial().strict().superRefine(validateFormatCompatibility);

export type EventRevisionPayload = z.infer<typeof eventRevisionPayloadSchema>;
export type EventRevisionPatch = z.infer<typeof eventRevisionPatchSchema>;
export type EventRevisionField = keyof EventRevisionPayload;
export type EventRevisionActor = { id: string; role: "organizer" | "admin" | "platform_admin" };
export type EventRevisionFieldLockReason = "event_started" | "event_finished" | "status_not_editable" | "registration_closed" | "matches_exist";
export type EventRevisionFieldState = { state: "saved" | "conflict" } | { state: "locked"; reason: EventRevisionFieldLockReason };
export type SaveEventEditRevisionResult =
  | { status: "saved"; revision: number; retry?: true; fields: Partial<Record<EventRevisionField, EventRevisionFieldState>> }
  | { status: "conflict" | "locked"; revision: number; fields: Partial<Record<EventRevisionField, EventRevisionFieldState>> }
  | { status: "not_editable"; revision: number; eventStatus: EventStatus; fields: Partial<Record<EventRevisionField, EventRevisionFieldState>> };

const registrationFields = [
  "registrationOpensAt", "registrationClosesAt", "registrationFeeRequired",
  "registrationFeeAmount", "registrationFeeLabel", "registrationUrl",
] as const satisfies readonly EventRevisionField[];
const structureFields = [
  "name", "eventStartsAt", "timezone", "gameModeId", "format", "formatConfig", "participantCap",
] as const satisfies readonly EventRevisionField[];
const allRevisionFields = Object.keys(revisionPayloadShape) as EventRevisionField[];

export function getEventRevisionFieldLocks(input: {
  status: EventStatus;
  registrationClosesAt: Date | string | null;
  matchCount: number;
  now?: Date;
}): Partial<Record<EventRevisionField, EventRevisionFieldLockReason>> {
  const locks: Partial<Record<EventRevisionField, EventRevisionFieldLockReason>> = {};
  if (!EDITABLE_EVENT_STATUSES.includes(input.status as (typeof EDITABLE_EVENT_STATUSES)[number])) {
    const reason: EventRevisionFieldLockReason = input.status === "Ongoing"
      ? "event_started"
      : input.status === "Finished" ? "event_finished" : "status_not_editable";
    for (const field of allRevisionFields) locks[field] = reason;
    return locks;
  }

  const now = input.now ?? new Date();
  const closesAt = input.registrationClosesAt == null ? null : new Date(input.registrationClosesAt);
  const registrationClosed = input.status === "Registration Closed"
    || (closesAt != null && !Number.isNaN(closesAt.getTime()) && closesAt <= now);
  if (registrationClosed) {
    for (const field of registrationFields) locks[field] = "registration_closed";
  }
  if (input.matchCount > 0) {
    for (const field of structureFields) locks[field] = "matches_exist";
  }
  return locks;
}

/* Prisma Client is generated during install/deploy. This narrow structural type lets the
 * schema and module land together without requiring a generated client in this worktree. */
type RevisionDatabase = {
  $transaction<T>(callback: (tx: RevisionDatabase) => Promise<T>): Promise<T>;
  event: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  eventEditRevision: {
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  eventPreviewToken: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  eventStream: {
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

const db = prisma as unknown as RevisionDatabase;

type EventSnapshot = {
  id: string;
  slug: string;
  status: EventStatus;
  organizerUserId: string | null;
  publishedRevision: number;
  name: string;
  description: string;
  logoUrl: string | null;
  gameImageUrl: string | null;
  gameModeId: string;
  format: "Single Elimination" | "League";
  formatConfig: unknown;
  participantCap: number;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  eventStartsAt: Date | null;
  timezone: string;
  venue: string;
  venueAddress: string | null;
  prizePoolLabel: string | null;
  registrationFeeRequired: boolean;
  registrationFeeAmount: number | null;
  registrationFeeLabel: string | null;
  registrationUrl: string | null;
  characterArtUrl: string | null;
  accentColor: string | null;
  activeVisualAssetId: string | null;
  stream: unknown;
  _count: { matches: number };
};

type RevisionRow = {
  id: string;
  eventId: string;
  createdByUserId: string | null;
  status: "Draft" | "Applied" | "Discarded";
  basePublishedRevision: number;
  revision: number;
  lastMutationId: string | null;
  lastMutationPayload: unknown;
  payload: unknown;
  event: EventSnapshot;
};

const eventSnapshotSelect = {
  id: true, slug: true, status: true, organizerUserId: true, publishedRevision: true,
  name: true, description: true, logoUrl: true, gameImageUrl: true, gameModeId: true,
  format: true, formatConfig: true, participantCap: true,
  registrationOpensAt: true, registrationClosesAt: true, eventStartsAt: true, timezone: true,
  venue: true, venueAddress: true, prizePoolLabel: true,
  registrationFeeRequired: true, registrationFeeAmount: true, registrationFeeLabel: true,
  registrationUrl: true, characterArtUrl: true, accentColor: true, activeVisualAssetId: true,
  stream: true, _count: { select: { matches: true } },
};

function actorEventScope(actor: EventRevisionActor) {
  return actor.role === "organizer" ? { organizerUserId: actor.id } : {};
}

function eventIsEditable(status: EventStatus): status is "Published" | "Registration Closed" {
  return EDITABLE_EVENT_STATUSES.includes(status as (typeof EDITABLE_EVENT_STATUSES)[number]);
}

function buildPayload(event: EventSnapshot): EventRevisionPayload {
  return eventRevisionPayloadSchema.parse({
    name: event.name,
    description: event.description,
    logoUrl: event.logoUrl,
    gameImageUrl: event.gameImageUrl,
    gameModeId: event.gameModeId,
    format: event.format,
    formatConfig: event.formatConfig,
    participantCap: event.participantCap,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    eventStartsAt: event.eventStartsAt,
    timezone: event.timezone,
    venue: event.venue,
    venueAddress: event.venueAddress,
    prizePoolLabel: event.prizePoolLabel,
    registrationFeeRequired: event.registrationFeeRequired,
    registrationFeeAmount: event.registrationFeeAmount,
    registrationFeeLabel: event.registrationFeeLabel,
    registrationUrl: event.registrationUrl,
    characterArtUrl: event.characterArtUrl,
    accentColor: event.accentColor,
    activeVisualAssetId: event.activeVisualAssetId,
    stream: event.stream,
  });
}

function fieldsWithState(patch: EventRevisionPatch, state: "saved" | "conflict") {
  return Object.fromEntries(Object.keys(patch).map((field) => [field, { state }])) as Partial<Record<EventRevisionField, EventRevisionFieldState>>;
}

function lockedPatchFields(
  patch: EventRevisionPatch,
  locks: Partial<Record<EventRevisionField, EventRevisionFieldLockReason>>,
) {
  const entries = Object.keys(patch).map((fieldName) => {
    const field = fieldName as EventRevisionField;
    const reason = locks[field];
    return [field, reason ? { state: "locked" as const, reason } : { state: "conflict" as const }];
  });
  return Object.fromEntries(entries) as Partial<Record<EventRevisionField, EventRevisionFieldState>>;
}

async function findRevision(tx: RevisionDatabase, revisionId: string, actor: EventRevisionActor) {
  return await tx.eventEditRevision.findFirst({
    where: {
      id: revisionId,
      event: actor.role === "organizer" ? { organizerUserId: actor.id } : {},
    },
    include: { event: { select: eventSnapshotSelect } },
  }) as RevisionRow | null;
}

async function discardStartedRevision(tx: RevisionDatabase, revision: RevisionRow, now: Date) {
  await tx.eventEditRevision.updateMany({
    where: { id: revision.id, status: "Draft" },
    data: { status: "Discarded", discardedAt: now, discardReason: "event_started" },
  });
  await tx.eventPreviewToken.updateMany({
    where: { revisionId: revision.id, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function startEventEditRevision(input: {
  eventId: string;
  actor: EventRevisionActor;
  now?: Date;
}) {
  const run = async (tx: RevisionDatabase) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, ...actorEventScope(input.actor) },
      select: eventSnapshotSelect,
    }) as EventSnapshot | null;
    if (!event) return { status: "not_found" as const };
    if (!eventIsEditable(event.status)) return { status: "not_editable" as const, eventStatus: event.status };

    const active = await tx.eventEditRevision.findFirst({
      where: { eventId: input.eventId, status: "Draft" },
      include: { event: { select: eventSnapshotSelect } },
    }) as RevisionRow | null;
    if (active) return { status: "active" as const, revision: active };

    const revision = await tx.eventEditRevision.create({
      data: {
        eventId: event.id,
        createdByUserId: input.actor.id,
        status: "Draft",
        basePublishedRevision: event.publishedRevision,
        revision: 0,
        payload: buildPayload(event),
      },
    }) as RevisionRow;
    return { status: "created" as const, revision };
  };

  try {
    return await db.$transaction(run);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const active = await db.eventEditRevision.findFirst({
      where: {
        eventId: input.eventId,
        status: "Draft",
        event: actorEventScope(input.actor),
      },
      include: { event: { select: eventSnapshotSelect } },
    }) as RevisionRow | null;
    if (!active) throw error;
    return { status: "active" as const, revision: active };
  }
}

export async function saveEventEditRevision(input: {
  revisionId: string;
  actor: EventRevisionActor;
  expectedRevision: number;
  mutationId: string;
  patch: unknown;
  now?: Date;
}): Promise<SaveEventEditRevisionResult> {
  const patch = eventRevisionPatchSchema.parse(input.patch);
  const mutationId = z.string().uuid().parse(input.mutationId);
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const current = await findRevision(tx, input.revisionId, input.actor);
    if (!current) throw new Error("Revision not found or not manageable by actor");
    if (current.status !== "Draft") {
      return { status: "not_editable", revision: current.revision, eventStatus: current.event.status, fields: fieldsWithState(patch, "conflict") };
    }
    if (current.event.status === "Ongoing") {
      await discardStartedRevision(tx, current, now);
      return { status: "not_editable", revision: current.revision, eventStatus: current.event.status, fields: fieldsWithState(patch, "conflict") };
    }
    if (!eventIsEditable(current.event.status)) {
      return { status: "not_editable", revision: current.revision, eventStatus: current.event.status, fields: fieldsWithState(patch, "conflict") };
    }
    const alreadySaved = current.revision === input.expectedRevision + 1
      && current.lastMutationId === mutationId
      && isDeepStrictEqual(eventRevisionPatchSchema.parse(current.lastMutationPayload), patch);
    if (alreadySaved) {
      return { status: "saved", revision: current.revision, retry: true, fields: fieldsWithState(patch, "saved") };
    }
    if (current.revision !== input.expectedRevision) {
      return { status: "conflict", revision: current.revision, fields: fieldsWithState(patch, "conflict") };
    }

    const locks = getEventRevisionFieldLocks({
      status: current.event.status,
      registrationClosesAt: current.event.registrationClosesAt,
      matchCount: current.event._count.matches,
      now,
    });
    if (Object.keys(patch).some((field) => locks[field as EventRevisionField])) {
      return { status: "locked", revision: current.revision, fields: lockedPatchFields(patch, locks) };
    }

    const previousPayload = eventRevisionPayloadSchema.parse(current.payload);
    const nextPayload = eventRevisionPayloadSchema.parse({
      ...previousPayload,
      ...patch,
      ...(patch.formatConfig ? { format: getLegacyTournamentFormat(patch.formatConfig) } : {}),
    });
    const update = await tx.eventEditRevision.updateMany({
      where: {
        id: current.id,
        status: "Draft",
        revision: input.expectedRevision,
        basePublishedRevision: current.event.publishedRevision,
        event: {
          ...actorEventScope(input.actor),
          status: { in: [...EDITABLE_EVENT_STATUSES] },
          publishedRevision: current.basePublishedRevision,
        },
      },
      data: {
        payload: nextPayload,
        lastMutationId: mutationId,
        lastMutationPayload: patch,
        revision: { increment: 1 },
      },
    });
    if (update.count === 1) {
      return { status: "saved", revision: input.expectedRevision + 1, fields: fieldsWithState(patch, "saved") };
    }

    const latest = await findRevision(tx, input.revisionId, input.actor);
    if (!latest) throw new Error("Revision not found or not manageable by actor");
    const retry = latest.revision === input.expectedRevision + 1
      && latest.lastMutationId === mutationId
      && isDeepStrictEqual(eventRevisionPatchSchema.parse(latest.lastMutationPayload), patch);
    if (retry) return { status: "saved", revision: latest.revision, retry: true, fields: fieldsWithState(patch, "saved") };
    if (latest.event.status === "Ongoing" && latest.status === "Draft") await discardStartedRevision(tx, latest, now);
    if (latest.status !== "Draft" || !eventIsEditable(latest.event.status)) {
      return { status: "not_editable", revision: latest.revision, eventStatus: latest.event.status, fields: fieldsWithState(patch, "conflict") };
    }
    return { status: "conflict", revision: latest.revision, fields: fieldsWithState(patch, "conflict") };
  });
}

export async function discardEventEditRevision(input: {
  revisionId: string;
  actor: EventRevisionActor;
  reason?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const revision = await findRevision(tx, input.revisionId, input.actor);
    if (!revision) return { status: "not_found" as const };
    if (revision.status !== "Draft") return { status: "not_editable" as const, revisionStatus: revision.status };
    const update = await tx.eventEditRevision.updateMany({
      where: { id: revision.id, status: "Draft" },
      data: { status: "Discarded", discardedAt: now, discardReason: input.reason ?? "cancelled" },
    });
    if (update.count === 0) return { status: "conflict" as const };
    await tx.eventPreviewToken.updateMany({
      where: { revisionId: revision.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return { status: "discarded" as const, eventId: revision.eventId };
  });
}

function changedFields(payload: EventRevisionPayload, event: EventSnapshot) {
  const current = buildPayload(event);
  return allRevisionFields.filter((field) => !isDeepStrictEqual(payload[field], current[field]));
}

function eventUpdateData(payload: EventRevisionPayload) {
  const { stream: _stream, ...fields } = payload;
  return {
    ...fields,
    gameId: getGameIdForMode(payload.gameModeId),
    formatConfig: payload.formatConfig === null ? Prisma.DbNull : payload.formatConfig,
    registrationOpensAt: payload.registrationOpensAt === null ? null : new Date(payload.registrationOpensAt),
    registrationClosesAt: payload.registrationClosesAt === null ? null : new Date(payload.registrationClosesAt),
    eventStartsAt: payload.eventStartsAt === null ? null : new Date(payload.eventStartsAt),
    publishedRevision: { increment: 1 },
  };
}

export async function applyEventEditRevision(input: {
  revisionId: string;
  actor: EventRevisionActor;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const revision = await findRevision(tx, input.revisionId, input.actor);
    if (!revision) return { status: "not_found" as const };
    if (revision.status !== "Draft") return { status: "not_editable" as const, revisionStatus: revision.status };
    if (revision.event.status === "Ongoing") {
      await discardStartedRevision(tx, revision, now);
      return { status: "not_editable" as const, eventStatus: revision.event.status };
    }
    if (!eventIsEditable(revision.event.status)) return { status: "not_editable" as const, eventStatus: revision.event.status };
    if (revision.basePublishedRevision !== revision.event.publishedRevision) {
      return { status: "conflict" as const, publishedRevision: revision.event.publishedRevision };
    }

    const payload = eventRevisionPayloadSchema.parse(revision.payload);
    const locks = getEventRevisionFieldLocks({
      status: revision.event.status,
      registrationClosesAt: revision.event.registrationClosesAt,
      matchCount: revision.event._count.matches,
      now,
    });
    const lockedChanges = changedFields(payload, revision.event).filter((field) => locks[field]);
    if (lockedChanges.length > 0) {
      return {
        status: "locked" as const,
        fields: Object.fromEntries(lockedChanges.map((field) => [field, { state: "locked" as const, reason: locks[field] }])),
      };
    }

    const claimed = await tx.eventEditRevision.updateMany({
      where: { id: revision.id, status: "Draft", basePublishedRevision: revision.basePublishedRevision },
      data: { status: "Applied", appliedAt: now },
    });
    if (claimed.count === 0) return { status: "conflict" as const, publishedRevision: revision.event.publishedRevision };

    const applied = await tx.event.updateMany({
      where: {
        id: revision.eventId,
        ...actorEventScope(input.actor),
        status: { in: [...EDITABLE_EVENT_STATUSES] },
        publishedRevision: revision.basePublishedRevision,
      },
      data: eventUpdateData(payload),
    });
    if (applied.count === 0) throw new Error("EVENT_REVISION_APPLY_CONFLICT");

    if (payload.stream) {
      await tx.eventStream.upsert({
        where: { eventId: revision.eventId },
        create: { eventId: revision.eventId, ...payload.stream },
        update: payload.stream,
      });
    } else {
      await tx.eventStream.deleteMany({ where: { eventId: revision.eventId } });
    }
    await tx.eventPreviewToken.updateMany({
      where: { revisionId: revision.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return {
      status: "applied" as const,
      eventId: revision.eventId,
      slug: revision.event.slug,
      publishedRevision: revision.basePublishedRevision + 1,
    };
  });
}

export async function getActiveEventEditRevisionIds(input: {
  eventIds: string[];
  actor: EventRevisionActor;
}): Promise<Record<string, { id: string; revision: number }>> {
  if (input.eventIds.length === 0) return {};
  const rows = await db.eventEditRevision.findMany({
    where: {
      eventId: { in: input.eventIds },
      status: "Draft",
      event: {
        ...actorEventScope(input.actor),
        status: { in: [...EDITABLE_EVENT_STATUSES] },
      },
    },
    select: { id: true, eventId: true, revision: true },
  }) as Array<{ id: string; eventId: string; revision: number }>;
  return Object.fromEntries(rows.map((row) => [row.eventId, { id: row.id, revision: row.revision }]));
}

export function hashEventRevisionPreviewToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createEventRevisionPreviewToken(input: {
  revisionId: string;
  actor: EventRevisionActor;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const revision = await findRevision(tx, input.revisionId, input.actor);
    if (!revision || revision.status !== "Draft" || !eventIsEditable(revision.event.status)) {
      return { status: "not_found_or_not_editable" as const };
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + PREVIEW_TOKEN_LIFETIME_MS);
    await tx.eventPreviewToken.updateMany({
      where: { revisionId: revision.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const preview = await tx.eventPreviewToken.create({
      data: {
        eventId: revision.eventId,
        revisionId: revision.id,
        createdByUserId: input.actor.id,
        tokenHash: hashEventRevisionPreviewToken(token),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    }) as { id: string; expiresAt: Date };
    return { status: "created" as const, token, id: preview.id, expiresAt: preview.expiresAt };
  });
}





export async function getEventEditRevision(input: { revisionId: string; actor: EventRevisionActor }) {
  return db.$transaction(async (tx) => findRevision(tx, input.revisionId, input.actor));
}

export async function revokeEventRevisionPreviewTokens(input: {
  revisionId: string;
  actor: EventRevisionActor;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const revision = await findRevision(tx, input.revisionId, input.actor);
    if (!revision || revision.status !== "Draft" || !eventIsEditable(revision.event.status)) {
      return { status: "not_found_or_not_editable" as const };
    }
    const result = await tx.eventPreviewToken.updateMany({
      where: { revisionId: revision.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return { status: "revoked" as const, count: result.count };
  });
}

export async function resolveEventRevisionPreviewToken(rawToken: string, now = new Date()) {
  if (!PREVIEW_TOKEN_PATTERN.test(rawToken)) return null;
  const preview = await prisma.eventPreviewToken.findUnique({
    where: { tokenHash: hashEventRevisionPreviewToken(rawToken) },
    include: {
      event: { include: eventPublicInclude },
      revision: true,
    },
  });
  if (!preview || preview.revokedAt || preview.expiresAt <= now || !preview.revision) return null;
  if (preview.revision.status !== "Draft" || !eventIsEditable(preview.event.status as EventStatus)) return null;
  const payload = eventRevisionPayloadSchema.safeParse(preview.revision.payload);
  if (!payload.success) return null;
  const base = mapEvent(preview.event);
  const event = {
    ...base,
    name: payload.data.name,
    description: payload.data.description,
    gameId: getGameIdForMode(payload.data.gameModeId),
    gameModeId: payload.data.gameModeId,
    format: payload.data.format,
    formatConfig: payload.data.formatConfig ?? undefined,
    participantCap: payload.data.participantCap,
    venue: payload.data.venue,
    logoUrl: payload.data.logoUrl ?? undefined,
    gameImageUrl: payload.data.gameImageUrl ?? undefined,
    prizePoolLabel: payload.data.prizePoolLabel ?? undefined,
    registrationFeeRequired: payload.data.registrationFeeRequired,
    registrationFeeAmount: payload.data.registrationFeeAmount ?? undefined,
    registrationFeeLabel: payload.data.registrationFeeLabel ?? undefined,
    registrationUrl: payload.data.registrationUrl ?? undefined,
    stream: payload.data.stream ?? undefined,
    registrationWindow: payload.data.registrationOpensAt && payload.data.registrationClosesAt
      ? `${payload.data.registrationOpensAt} - ${payload.data.registrationClosesAt}`
      : base.registrationWindow,
    startsAt: payload.data.eventStartsAt ?? base.startsAt,
  };
  return { ...preview, event, revisionId: preview.revision.id };
}
