"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { eventDraftSchema, saveEventDraft } from "@/lib/events/event-draft";
import { createEventPreviewToken, revokeEventPreviewTokens } from "@/lib/events/preview-token";
import { publishEvent } from "@/lib/events/publish-readiness";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent, createEvent, createOrganizerAndEventDraft, getOrganizerUserById, updateEventOrganizerContact } from "@/lib/platform/repository";
import { getLegacyTournamentFormat, TOURNAMENT_FORMAT_PRESETS, tournamentFormatConfigSchema, type TournamentFormatConfig } from "@/lib/tournament/formats/types";

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
  groupCount: z.coerce.number().int().min(2).max(16).optional(),
  qualifiersPerGroup: z.coerce.number().int().min(1).max(8).optional(),
  ownerKind: z.enum(["platform", "existing_organizer", "new_organizer"]).optional(),
  organizerUserId: z.string().min(1).optional(),
  organizerName: z.string().trim().min(2).optional(),
  organizerAccountName: z.string().trim().min(2).optional(),
  organizerEmail: z.string().email().optional(),
  organizerContactChannel: z.string().trim().min(1).max(40).optional(),
  organizerContactValue: z.string().trim().min(1).max(200).optional(),
  temporaryPassword: z.string().min(8).optional(),
});
const eventManagerRoleSchema = z.enum(["organizer", "platform_admin", "admin"]);

async function requireEventManager() {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  return {
    user,
    actor: { id: user.id, role: eventManagerRoleSchema.parse(user.role) },
  };
}

function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

async function createEventOrReturnToForm(input: Parameters<typeof createEvent>[0], locale: "id" | "en", role: "organizer" | "platform_admin" | "admin") {
  try {
    return await createEvent(input);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const basePath = role === "organizer" ? "organizer" : "admin";
      redirect(`/${locale}/${basePath}/events/new?error=slug-taken`);
    }
    throw error;
  }
}
export async function createEventV3Action(formData: FormData) {
  const { user } = await requireEventManager();
  const parsed = createEventActionSchema.parse({
    locale: formData.get("locale"), name: formData.get("name"), slug: formData.get("slug"), gameModeId: formData.get("gameModeId"),
    formatKind: formData.get("formatKind"), participantCap: Number(formData.get("participantCap")), groupCount: formData.get("groupCount") || undefined, qualifiersPerGroup: formData.get("qualifiersPerGroup") || undefined, ownerKind: formData.get("ownerKind") || undefined,
    organizerUserId: formData.get("organizerUserId") || undefined, organizerName: formData.get("organizerName") || undefined,
    organizerAccountName: formData.get("organizerAccountName") || undefined, organizerEmail: formData.get("organizerEmail") || undefined,
    organizerContactChannel: formData.get("organizerContactChannel") || undefined, organizerContactValue: formData.get("organizerContactValue") || undefined,
    temporaryPassword: formData.get("temporaryPassword") || undefined,
  });
  let formatConfig = {
    single_elimination: TOURNAMENT_FORMAT_PRESETS.singleElimination,
    double_elimination: TOURNAMENT_FORMAT_PRESETS.doubleElimination,
    round_robin: TOURNAMENT_FORMAT_PRESETS.roundRobin,
    group_playoffs: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs,
  }[parsed.formatKind];
  if (parsed.formatKind === "group_playoffs") {
    const groupPreset = TOURNAMENT_FORMAT_PRESETS.groupPlayoffs as Extract<TournamentFormatConfig, { kind: "group_playoffs" }>;
    const groupCount = parsed.groupCount ?? groupPreset.groupCount;
    const qualifiersPerGroup = parsed.qualifiersPerGroup ?? groupPreset.qualifiersPerGroup;
    if (parsed.participantCap % groupCount !== 0 || qualifiersPerGroup >= parsed.participantCap / groupCount) {
      throw new Error("Groups and qualifiers do not fit the participant capacity");
    }
    formatConfig = tournamentFormatConfigSchema.parse({ ...groupPreset, groupCount, qualifiersPerGroup });
  }
  if (parsed.formatKind !== "single_elimination" && !isFeatureEnabled("competition_operations_v3")) throw new Error("Competition operations are unavailable");

  if (user.role === "organizer") {
    const event = await createEventOrReturnToForm({ name: parsed.name, slug: parsed.slug, gameModeId: parsed.gameModeId, format: getLegacyTournamentFormat(formatConfig), formatConfig, participantCap: parsed.participantCap, organizerUserId: user.id, organizerName: user.name, organizerVerified: false }, parsed.locale, eventManagerRoleSchema.parse(user.role));
    revalidateTag("events");
    redirect(`/${parsed.locale}/organizer/events/${event.id}/overview`);
  }

  const ownerKind = parsed.ownerKind ?? "platform";
  if (ownerKind === "new_organizer") {
    const organizer = z.object({ name: z.string().trim().min(2), organizationName: z.string().trim().min(2), email: z.string().email(), contactChannel: z.string().trim().min(1).max(40), contactValue: z.string().trim().min(1).max(200), temporaryPassword: z.string().min(8) }).parse({ name: parsed.organizerAccountName, organizationName: parsed.organizerName, email: parsed.organizerEmail, contactChannel: parsed.organizerContactChannel, contactValue: parsed.organizerContactValue, temporaryPassword: parsed.temporaryPassword });
    const result = await createOrganizerAndEventDraft({ actorId: user.id, organizer, event: { name: parsed.name, slug: parsed.slug, gameModeId: parsed.gameModeId, format: getLegacyTournamentFormat(formatConfig), formatConfig, participantCap: parsed.participantCap, organizerName: organizer.organizationName } });
    revalidateTag("events");
    redirect(`/${parsed.locale}/admin/events/${result.event.id}/overview`);
  }

  if (ownerKind === "existing_organizer") {
    const organizerId = z.string().min(1).parse(parsed.organizerUserId);
    const organizer = await getOrganizerUserById(organizerId);
    if (!organizer) throw new Error("Organizer not found");
    const event = await createEventOrReturnToForm({ name: parsed.name, slug: parsed.slug, gameModeId: parsed.gameModeId, format: getLegacyTournamentFormat(formatConfig), formatConfig, participantCap: parsed.participantCap, organizerUserId: organizer.id, organizerName: organizer.name, organizerVerified: false }, parsed.locale, eventManagerRoleSchema.parse(user.role));
    revalidateTag("events");
    redirect(`/${parsed.locale}/admin/events/${event.id}/overview`);
  }

  const event = await createEventOrReturnToForm({ name: parsed.name, slug: parsed.slug, gameModeId: parsed.gameModeId, format: getLegacyTournamentFormat(formatConfig), formatConfig, participantCap: parsed.participantCap, organizerUserId: undefined, organizerName: "Miracle", organizerVerified: true }, parsed.locale, eventManagerRoleSchema.parse(user.role));
  revalidateTag("events");
  redirect(`/${parsed.locale}/admin/events/${event.id}/overview`);
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


