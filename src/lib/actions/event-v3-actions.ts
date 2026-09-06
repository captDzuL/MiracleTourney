"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { eventDraftSchema, saveEventDraft } from "@/lib/events/event-draft";
import { createEventPreviewToken, revokeEventPreviewTokens } from "@/lib/events/preview-token";
import { publishEvent } from "@/lib/events/publish-readiness";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent, createEvent, updateEventOrganizerContact } from "@/lib/platform/repository";
import { getLegacyTournamentFormat, TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const saveDraftActionSchema = z.object({
  eventId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  draft: eventDraftSchema,
});
const publishActionSchema = z.object({ eventId: z.string().min(1) });
const createPreviewActionSchema = z.object({
  eventId: z.string().min(1),
  locale: z.enum(["id", "en"]),
});
const revokePreviewActionSchema = z.object({ eventId: z.string().min(1) });
const organizerContactActionSchema = z.object({
  eventId: z.string().min(1),
  contactChannel: z.string().trim().min(1).max(40),
  contactValue: z.string().trim().min(1).max(200),
});
const createEventActionSchema = z.object({
  locale: z.enum(["id", "en"]),
  name: z.string().trim().min(3),
  slug: z.string().trim().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  gameModeId: z.string().min(1),
  formatKind: z.enum(["single_elimination", "double_elimination", "round_robin", "group_playoffs"]),
  participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
});
const eventManagerRoleSchema = z.enum(["organizer", "platform_admin", "admin"]);

async function requireEventManager() {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  return {
    user,
    actor: { id: user.id, role: eventManagerRoleSchema.parse(user.role) },
  };
}

export async function createEventV3Action(formData: FormData) {
  const { user } = await requireEventManager();
  const parsed = createEventActionSchema.parse({
    locale: formData.get("locale"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    formatKind: formData.get("formatKind"),
    participantCap: Number(formData.get("participantCap")),
  });
  const formatConfig = {
    single_elimination: TOURNAMENT_FORMAT_PRESETS.singleElimination,
    double_elimination: TOURNAMENT_FORMAT_PRESETS.doubleElimination,
    round_robin: TOURNAMENT_FORMAT_PRESETS.roundRobin,
    group_playoffs: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs,
  }[parsed.formatKind];
  if (parsed.formatKind !== "single_elimination" && !isFeatureEnabled("competition_operations_v3")) {
    throw new Error("Competition operations are unavailable");
  }
  const event = await createEvent({
    name: parsed.name,
    slug: parsed.slug,
    gameModeId: parsed.gameModeId,
    format: getLegacyTournamentFormat(formatConfig),
    formatConfig,
    participantCap: parsed.participantCap,
    organizerUserId: user.id,
    organizerName: user.name,
    organizerVerified: false,
  });
  revalidateTag("events");
  redirect(`/${parsed.locale}/organizer/events/${event.id}/overview`);
}

export async function saveEventDraftAction(input: unknown) {
  const { actor } = await requireEventManager();
  const parsed = saveDraftActionSchema.parse(input);
  if (parsed.draft.formatConfig?.kind !== undefined && parsed.draft.formatConfig.kind !== "single_elimination" && !isFeatureEnabled("competition_operations_v3")) {
    throw new Error("Competition operations are unavailable");
  }
  const result = await saveEventDraft({
    eventId: parsed.eventId,
    actor,
    expectedRevision: parsed.expectedRevision,
    mutationId: parsed.mutationId,
    draft: parsed.draft,
  });

  if (result.status === "saved") {
    revalidateTag("events");
    revalidatePath("/", "layout");
  }
  return result;
}

export async function publishEventV3Action(input: unknown) {
  const { user, actor } = await requireEventManager();
  const parsed = publishActionSchema.parse(input);
  await assertUserCanManageEvent(user, parsed.eventId);
  const result = await publishEvent(parsed.eventId, actor);

  if (result.status === "published") {
    revalidateTag("events");
    revalidatePath("/", "layout");
    revalidatePath("/organizer/events/" + parsed.eventId);
  }
  return result;
}

export async function updateEventOrganizerContactAction(formData: FormData) {
  const { user } = await requireEventManager();
  const parsed = organizerContactActionSchema.parse({
    eventId: formData.get("eventId"),
    contactChannel: formData.get("contactChannel"),
    contactValue: formData.get("contactValue"),
  });
  await updateEventOrganizerContact(user, parsed);
  revalidatePath("/organizer/events/" + parsed.eventId);
}

export async function createEventPreviewAction(input: unknown) {
  const { user, actor } = await requireEventManager();
  const parsed = createPreviewActionSchema.parse(input);
  await assertUserCanManageEvent(user, parsed.eventId);
  const result = await createEventPreviewToken({ eventId: parsed.eventId, actor });

  if (result.status !== "created") return result;
  revalidatePath("/organizer/events/" + parsed.eventId);
  return {
    status: result.status,
    url: `/${parsed.locale}/preview/events/${result.token}`,
    expiresAt: result.expiresAt,
  };
}

export async function revokeEventPreviewAction(input: unknown) {
  const { user, actor } = await requireEventManager();
  const parsed = revokePreviewActionSchema.parse(input);
  await assertUserCanManageEvent(user, parsed.eventId);
  const result = await revokeEventPreviewTokens({ eventId: parsed.eventId, actor });

  if (result.status === "revoked") revalidatePath("/organizer/events/" + parsed.eventId);
  return result;
}


