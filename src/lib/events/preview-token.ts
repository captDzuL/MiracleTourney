import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/platform/db";
import { eventPublicInclude, mapEvent } from "@/lib/platform/repository";

const PREVIEW_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const PREVIEW_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type EventPreviewActor = {
  id: string;
  role: "organizer" | "platform_admin" | "admin";
};

export function hashEventPreviewToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function manageableDraftWhere(eventId: string, actor: EventPreviewActor) {
  return {
    id: eventId,
    ...(actor.role === "organizer" ? { organizerUserId: actor.id } : {}),
    status: "Draft",
  };
}

export async function createEventPreviewToken(input: {
  eventId: string;
  actor: EventPreviewActor;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.updateMany({
      where: manageableDraftWhere(input.eventId, input.actor),
      data: { previewRevision: { increment: 1 } },
    });
    if (event.count === 0) return { status: "not_found_or_not_draft" as const };

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + PREVIEW_TOKEN_LIFETIME_MS);
    await tx.eventPreviewToken.updateMany({
      where: { eventId: input.eventId, revokedAt: null },
      data: { revokedAt: now },
    });
    const preview = await tx.eventPreviewToken.create({
      data: {
        eventId: input.eventId,
        createdByUserId: input.actor.id,
        tokenHash: hashEventPreviewToken(token),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });
    return { status: "created" as const, token, id: preview.id, expiresAt: preview.expiresAt };
  });
}

export async function resolveEventPreviewToken(rawToken: string, now = new Date()) {
  if (!PREVIEW_TOKEN_PATTERN.test(rawToken)) return null;

  const preview = await prisma.eventPreviewToken.findUnique({
    where: { tokenHash: hashEventPreviewToken(rawToken) },
    include: { event: { include: eventPublicInclude } },
  });
  if (!preview || preview.revokedAt || preview.expiresAt <= now || preview.event.status !== "Draft") return null;
  return { ...preview, event: mapEvent(preview.event) };
}

export async function revokeEventPreviewTokens(input: {
  eventId: string;
  actor: EventPreviewActor;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.updateMany({
      where: manageableDraftWhere(input.eventId, input.actor),
      data: { previewRevision: { increment: 1 } },
    });
    if (event.count === 0) return { status: "not_found_or_not_draft" as const };

    const revoked = await tx.eventPreviewToken.updateMany({
      where: { eventId: input.eventId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { status: "revoked" as const, count: revoked.count };
  });
}