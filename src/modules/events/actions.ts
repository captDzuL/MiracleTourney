"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { redirectToActiveLocale } from "@/i18n/redirect";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  toActorContext,
  toEventReadActorCompatibility,
} from "@/modules/identity";

import { eventDraftSchema } from "@/lib/events/event-draft";
import {
  archiveEventForManager,
  createEventForManager,
  createEventPreviewForManager,
  publishEventForManager,
  resolveEventFormatConfig,
  revokeEventPreviewForManager,
  saveEventDraftForManager,
  updateEventOrganizerContactForManager,
  updateEventPublicInfoForManager,
  updateEventStatusForManager,
} from "./service";

const managerRoles: Array<"organizer" | "platform_admin" | "admin"> = ["organizer", "platform_admin", "admin"];

const createEventActionSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3),
  gameModeId: z.string().min(1),
  format: z.enum(["Single Elimination", "League"]),
  participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
  organizerUserId: z.string().min(1).optional(),
});

const createEventV3Schema = z.object({
  locale: z.enum(["id", "en"]),
  name: z.string().trim().min(3),
  slug: z.string().trim().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  gameModeId: z.string().min(1),
  formatKind: z.enum(["single_elimination", "double_elimination", "round_robin", "group_playoffs"]),
  participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
  organizerUserId: z.string().min(1).optional(),
});

const updateEventStatusSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["Draft", "Published", "Registration Closed", "Ongoing", "Finished"]),
});

const archiveEventSchema = z.object({
  eventId: z.string().min(1),
  action: z.enum(["archive", "delete"]),
});

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const optionalPublicLabelSchema = z.preprocess(
  (value) => {
    const text = String(value ?? "").trim();
    return text === "" ? null : text;
  },
  z.string().max(80).nullable(),
);

const optionalPublicUrlSchema = z.preprocess(
  (value) => {
    const text = String(value ?? "").trim();
    return text === "" ? null : text;
  },
  z.string().refine(isHttpUrl, "Registration URL must use http or https.").nullable(),
);

const updateEventPublicInfoSchema = z.object({
  eventId: z.string().min(1),
  description: z.string().trim().min(10).max(500),
  registrationWindow: z.string().trim().min(2).max(120),
  startsAt: z.string().trim().min(2).max(120),
  venue: z.string().trim().min(2).max(120),
  prizePoolLabel: optionalPublicLabelSchema,
  registrationFeeRequired: z.preprocess((value) => value === "on" || value === "true" || value === "paid", z.boolean()),
  registrationFeeAmount: z.preprocess((value) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : value;
  }, z.number().int().positive().nullable()),
  registrationFeeLabel: optionalPublicLabelSchema,
  registrationUrl: optionalPublicUrlSchema,
});

const saveDraftActionSchema = z.object({
  eventId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  draft: eventDraftSchema,
});

const publishActionSchema = z.object({ eventId: z.string().min(1) });
const createPreviewActionSchema = z.object({ eventId: z.string().min(1), locale: z.enum(["id", "en"]) });
const revokePreviewActionSchema = z.object({ eventId: z.string().min(1) });
const organizerContactActionSchema = z.object({
  eventId: z.string().min(1),
  contactChannel: z.string().trim().min(1).max(40),
  contactValue: z.string().trim().min(1).max(200),
});

async function requireEventManager() {
  const user = await requireAnyRole(managerRoles);
  if (!user) return redirectToActiveLocale("/login");

  // Migration window: keep legacy admin sessions as organizer/self-tenant actors.
  const actor = user.role === "admin" ? toEventReadActorCompatibility(user) : toActorContext(user);
  if (!actor) return redirectToActiveLocale("/login");
  return { user, actor };
}

export async function adminCreateEventAction(formData: FormData) {
  const { user, actor } = await requireEventManager();
  const input = createEventActionSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    format: formData.get("format"),
    participantCap: Number(formData.get("participantCap")),
    organizerUserId: formData.get("organizerUserId") || undefined,
  });

  try {
    const formatConfig = input.format === "Single Elimination"
      ? resolveEventFormatConfig("single_elimination")
      : resolveEventFormatConfig("round_robin");

    await createEventForManager({
      actor,
      organizerDisplayName: user.name,
      name: input.name,
      slug: input.slug,
      gameModeId: input.gameModeId,
      formatConfig,
      participantCap: input.participantCap,
      organizerUserId: input.organizerUserId,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return redirectToActiveLocale("/admin?error=slug-already-exists");
    }
    if (error instanceof NotFoundError && error.message === "Organizer selection is required.") {
      return redirectToActiveLocale("/admin?error=Organizer%20selection%20is%20required.");
    }
    if (error instanceof NotFoundError && error.message === "Organizer not found.") {
      return redirectToActiveLocale("/admin?error=Organizer%20not%20found.");
    }
    if (error instanceof ForbiddenError) {
      return redirectToActiveLocale("/admin?error=Organizer%20selection%20is%20required.");
    }
    throw error;
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=event-created");
}

export async function adminUpdateEventStatusAction(formData: FormData) {
  const { actor } = await requireEventManager();
  const input = updateEventStatusSchema.parse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });

  try {
    const result = await updateEventStatusForManager({
      actor,
      eventId: input.eventId,
      status: input.status,
      enableV3PublishFlow: isFeatureEnabled("organizer_workspace_v3"),
    });

    if ("event" in result) {
      revalidateTag("events");
      revalidatePath("/", "layout");
      return redirectToActiveLocale(`/admin?success=event-status-updated&event=${result.event.slug}`);
    }

    if (result.status === "not_found") {
      return redirectToActiveLocale("/admin?error=Event%20not%20found.");
    }
    if (result.status === "blocked") {
      return redirectToActiveLocale("/admin?error=event-not-ready");
    }

    if (
      (result.status === "published" || result.status === "already_published")
      && "slug" in result
      && typeof result.slug === "string"
    ) {
      revalidateTag("events");
      revalidatePath("/", "layout");
      return redirectToActiveLocale(`/admin?success=event-status-updated&event=${result.slug}`);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return redirectToActiveLocale("/admin?error=Event%20not%20found.");
    }
    if (error instanceof ConflictError) {
      return redirectToActiveLocale("/admin?error=event-publish-conflict");
    }
    throw error;
  }

  return redirectToActiveLocale("/admin?error=event-publish-conflict");
}

export async function adminArchiveEventAction(formData: FormData) {
  const { actor } = await requireEventManager();
  const input = archiveEventSchema.parse({
    eventId: formData.get("eventId"),
    action: formData.get("action"),
  });

  const result = await archiveEventForManager({
    actor,
    eventId: input.eventId,
    action: input.action,
  });

  if (result === "not_draft") {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Hanya event Draft yang dapat dihapus.")}` as never);
  }

  if (result === "has_teams") {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Event dengan tim tidak dapat dihapus. Hapus tim terlebih dahulu.")}` as never);
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=event-archived" as never);
}

export async function adminUpdateEventPublicInfoAction(formData: FormData) {
  const { actor } = await requireEventManager();
  const input = updateEventPublicInfoSchema.parse({
    eventId: formData.get("eventId"),
    description: formData.get("description"),
    registrationWindow: formData.get("registrationWindow"),
    startsAt: formData.get("startsAt"),
    venue: formData.get("venue"),
    prizePoolLabel: formData.get("prizePoolLabel"),
    registrationFeeRequired: formData.get("registrationFeeRequired"),
    registrationFeeAmount: formData.get("registrationFeeAmount"),
    registrationFeeLabel: formData.get("registrationFeeLabel"),
    registrationUrl: formData.get("registrationUrl"),
  });

  const event = await updateEventPublicInfoForManager({
    actor,
    eventId: input.eventId,
    updates: {
      description: input.description,
      registrationWindow: input.registrationWindow,
      startsAt: input.startsAt,
      venue: input.venue,
      prizePoolLabel: input.prizePoolLabel,
      registrationFeeRequired: input.registrationFeeRequired,
      registrationFeeAmount: input.registrationFeeRequired ? input.registrationFeeAmount : null,
      registrationFeeLabel: input.registrationFeeLabel,
      registrationUrl: input.registrationUrl,
    },
  });

  revalidateTag("events");
  revalidatePath("/", "layout");
  return redirectToActiveLocale(`/admin?success=event-public-info-updated&event=${event.slug}`);
}

export async function createEventV3Action(formData: FormData) {
  const { user, actor } = await requireEventManager();
  const parsed = createEventV3Schema.parse({
    locale: formData.get("locale"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    formatKind: formData.get("formatKind"),
    participantCap: Number(formData.get("participantCap")),
    organizerUserId: formData.get("organizerUserId") || undefined,
  });

  if (parsed.formatKind !== "single_elimination" && !isFeatureEnabled("competition_operations_v3")) {
    throw new Error("Competition operations are unavailable");
  }

  const formatConfig = resolveEventFormatConfig(parsed.formatKind);
  const event = await createEventForManager({
    actor,
    organizerDisplayName: user.name,
    name: parsed.name,
    slug: parsed.slug,
    gameModeId: parsed.gameModeId,
    formatConfig,
    participantCap: parsed.participantCap,
    organizerUserId: parsed.organizerUserId,
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

  const result = await saveEventDraftForManager({
    actor,
    eventId: parsed.eventId,
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
  const { actor } = await requireEventManager();
  const parsed = publishActionSchema.parse(input);
  const result = await publishEventForManager({
    actor,
    eventId: parsed.eventId,
  });

  if (result.status === "published") {
    revalidateTag("events");
    revalidatePath("/", "layout");
    revalidatePath("/organizer/events/" + parsed.eventId);
  }

  return result;
}

export async function updateEventOrganizerContactAction(formData: FormData) {
  const { user, actor } = await requireEventManager();
  const parsed = organizerContactActionSchema.parse({
    eventId: formData.get("eventId"),
    contactChannel: formData.get("contactChannel"),
    contactValue: formData.get("contactValue"),
  });

  await updateEventOrganizerContactForManager({
    actor,
    organizerDisplayName: user.name,
    eventId: parsed.eventId,
    contactChannel: parsed.contactChannel,
    contactValue: parsed.contactValue,
  });
  revalidatePath("/organizer/events/" + parsed.eventId);
}

export async function createEventPreviewAction(input: unknown) {
  const { actor } = await requireEventManager();
  const parsed = createPreviewActionSchema.parse(input);
  const result = await createEventPreviewForManager({
    actor,
    eventId: parsed.eventId,
  });

  if (result.status !== "created") return result;
  revalidatePath("/organizer/events/" + parsed.eventId);
  return {
    status: result.status,
    url: `/${parsed.locale}/preview/events/${result.token}`,
    expiresAt: result.expiresAt,
  };
}

export async function revokeEventPreviewAction(input: unknown) {
  const { actor } = await requireEventManager();
  const parsed = revokePreviewActionSchema.parse(input);
  const result = await revokeEventPreviewForManager({
    actor,
    eventId: parsed.eventId,
  });

  if (result.status === "revoked") revalidatePath("/organizer/events/" + parsed.eventId);
  return result;
}
