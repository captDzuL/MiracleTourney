import type { AppUser, PaymentSettings } from "@/lib/platform/types";
import { assertUserCanManageEvent } from "@/lib/platform/repository";
import { prisma } from "@/lib/platform/db";

export type EventPaymentSettingsSource = "event" | "global";
export type ResolvedEventPaymentSettings = PaymentSettings & {
  source: EventPaymentSettingsSource;
  eventId?: string;
  status?: "draft" | "published";
  version?: number;
  publishedAt?: Date;
};

export type EventPaymentSettingsActor = Pick<AppUser, "id" | "role">;

type EventPaymentSettingsRow = {
  id: string;
  eventId: string;
  qrisImageUrl: string | null;
  instructions: string | null;
  status: string;
  version: number;
  publishedAt: Date | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PaymentSettingsRow = {
  id: string;
  qrisImageUrl: string | null;
  instructions: string | null;
  updatedAt?: Date;
};

export type EventPaymentSettingsMutationResult =
  | { status: "saved" | "published"; settings: ResolvedEventPaymentSettings }
  | { status: "conflict"; version: number };

const PAYMENT_SETTINGS_ID = "global";

function mapEventPaymentSettings(row: EventPaymentSettingsRow): ResolvedEventPaymentSettings {
  return {
    id: row.id,
    eventId: row.eventId,
    source: "event",
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    updatedAt: row.updatedAt,
  };
}

function mapGlobalPaymentSettings(row: PaymentSettingsRow | null): ResolvedEventPaymentSettings {
  if (!row) return { id: PAYMENT_SETTINGS_ID, source: "global" };
  return {
    id: row.id,
    source: "global",
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

function normalizeQrisImageUrl(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 2_048) throw new Error("QRIS image URL is too long.");
  if (!normalized.startsWith("/") && !/^https?:\/\//i.test(normalized)) {
    throw new Error("QRIS image URL must use http(s) or a relative path.");
  }
  return normalized;
}

function normalizeInstructions(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length > 500) throw new Error("Payment instructions must be 500 characters or fewer.");
  return normalized || null;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

async function readEventPaymentSettings(eventId: string) {
  return prisma.eventPaymentSettings.findUnique({ where: { eventId } }) as unknown as Promise<EventPaymentSettingsRow | null>;
}

function conflictVersion(row: EventPaymentSettingsRow | null, fallback: number) {
  return row && Number.isInteger(row.version) ? row.version : fallback;
}

export async function getPublishedPaymentSettingsForEvent(eventId: string): Promise<ResolvedEventPaymentSettings> {
  const eventSettings = await prisma.eventPaymentSettings.findFirst({
    where: { eventId, status: "published" },
  }) as unknown as EventPaymentSettingsRow | null;
  if (eventSettings) return mapEventPaymentSettings(eventSettings);

  const globalSettings = await prisma.paymentSettings.findUnique({ where: { id: PAYMENT_SETTINGS_ID } }) as PaymentSettingsRow | null;
  return mapGlobalPaymentSettings(globalSettings);
}

export async function saveEventPaymentSettingsDraft(input: {
  eventId: string;
  actor: EventPaymentSettingsActor;
  expectedVersion: number;
  qrisImageUrl?: string | null;
  instructions?: string | null;
}): Promise<EventPaymentSettingsMutationResult> {
  await assertUserCanManageEvent(input.actor as AppUser, input.eventId);

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error("Payment settings version must be a non-negative integer.");
  }
  const data = {
    qrisImageUrl: normalizeQrisImageUrl(input.qrisImageUrl),
    instructions: normalizeInstructions(input.instructions),
  };
  const existing = await readEventPaymentSettings(input.eventId);
  if (!existing) {
    if (input.expectedVersion !== 0) return { status: "conflict", version: 0 };
    try {
      const created = await prisma.eventPaymentSettings.create({
        data: {
          eventId: input.eventId,
          ...data,
          status: "draft",
          version: 1,
          updatedById: input.actor.id,
        },
      }) as unknown as EventPaymentSettingsRow;
      return { status: "saved", settings: mapEventPaymentSettings(created) };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const latest = await readEventPaymentSettings(input.eventId);
      return { status: "conflict", version: conflictVersion(latest, 1) };
    }
  }

  const update = await prisma.eventPaymentSettings.updateMany({
    where: { eventId: input.eventId, version: input.expectedVersion },
    data: {
      ...data,
      status: "draft",
      publishedAt: null,
      updatedById: input.actor.id,
      version: { increment: 1 },
    },
  });
  if (update.count !== 1) {
    const latest = await readEventPaymentSettings(input.eventId);
    return { status: "conflict", version: conflictVersion(latest, existing.version) };
  }
  const saved = await readEventPaymentSettings(input.eventId);
  if (!saved) throw new Error("Event payment settings disappeared after saving.");
  return { status: "saved", settings: mapEventPaymentSettings(saved) };
}

export async function publishEventPaymentSettings(input: {
  eventId: string;
  actor: EventPaymentSettingsActor;
  expectedVersion: number;
}): Promise<EventPaymentSettingsMutationResult> {
  await assertUserCanManageEvent(input.actor as AppUser, input.eventId);

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error("Payment settings version must be a non-negative integer.");
  }
  const existing = await readEventPaymentSettings(input.eventId);
  if (!existing) return { status: "conflict", version: 0 };

  const publishedAt = new Date();
  const update = await prisma.eventPaymentSettings.updateMany({
    where: { eventId: input.eventId, version: input.expectedVersion, status: "draft" },
    data: {
      status: "published",
      publishedAt,
      updatedById: input.actor.id,
      version: { increment: 1 },
    },
  });
  if (update.count !== 1) {
    const latest = await readEventPaymentSettings(input.eventId);
    return { status: "conflict", version: conflictVersion(latest, existing.version) };
  }
  const published = await readEventPaymentSettings(input.eventId);
  if (!published) throw new Error("Event payment settings disappeared after publishing.");
  return { status: "published", settings: mapEventPaymentSettings(published) };
}

// Stable aliases for callers that use the shorter registration terminology.
export const savePaymentSettingsDraft = saveEventPaymentSettingsDraft;
export const publishPaymentSettings = publishEventPaymentSettings;
export const getPaymentSettingsForEvent = getPublishedPaymentSettingsForEvent;
