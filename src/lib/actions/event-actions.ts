"use server";

// Server actions for events: create, status, archive, stream, public info, accent color, character art.
// Moved out of lib/actions.ts without changes (refactor PR 3.2).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { MAX_BACKGROUND_IMAGE_BYTES } from "@/lib/actions/shared/limits";
import { actionEntityId } from "@/lib/actions/shared/request";
import { isHttpUrl, optionalPublicUrlSchema } from "@/lib/actions/shared/schemas";
import { assertWorkspaceEventAction, requireAdminSession } from "@/lib/actions/shared/session";
import { uploadImageAsset } from "@/lib/actions/shared/uploads";
import { publishEvent } from "@/lib/events/publish-readiness";
import { createEvent, setEventStatus, updateEventPublicInfo, updateEventStream } from "@/lib/events/repository";
import { updateEventCertificateAssets } from "@/lib/events/visual-repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOrganizerUserById } from "@/lib/identity/repository";
import { prisma } from "@/lib/platform/db";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import type { AppUser } from "@/lib/platform/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

const optionalPublicLabelSchema = z.preprocess(
  (value) => {
    const text = String(value ?? "").trim();
    return text === "" ? null : text;
  },
  z.string().max(80).nullable(),
);

/** Creates a new tournament event. Supported participant caps: 8, 12, 16, 24, 32, 64, 128, 256. */
export async function adminCreateEventAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    name: z.string().min(3),
    slug: z.string().min(3),
    gameModeId: actionEntityId,
    format: z.enum(["Single Elimination", "League"]),
    participantCap: z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
    organizerUserId: actionEntityId.optional(),
  }).parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    gameModeId: formData.get("gameModeId"),
    format: formData.get("format"),
    participantCap: Number(formData.get("participantCap")),
    organizerUserId: formData.get("organizerUserId") || undefined,
  });

  let organizerAssignment: Pick<AppUser, "id" | "name"> | undefined;
  if (user.role === "organizer") {
    organizerAssignment = user;
  } else if (input.organizerUserId) {
    const organizer = await getOrganizerUserById(input.organizerUserId);
    if (!organizer) {
      await redirectToActiveLocale("/admin?error=Organizer%20not%20found.");
    } else {
      organizerAssignment = organizer;
    }
  }

  try {
    await createEvent({
      name: input.name,
      slug: input.slug,
      gameModeId: input.gameModeId,
      format: input.format,
      participantCap: input.participantCap,
      organizerUserId: organizerAssignment?.id,
      organizerName: organizerAssignment?.name,
      organizerVerified: false,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      await redirectToActiveLocale("/admin?error=slug-already-exists");
    }
    throw error;
  }
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=event-created");
}

/** Changes an event's lifecycle status (Draft → Published → Registration Closed → Ongoing → Finished). */
export async function adminUpdateEventStatusAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    eventId: actionEntityId,
    status: z.enum(["Draft", "Published", "Registration Closed", "Ongoing", "Finished"]),
  }).parse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);

  if (input.status === "Published" && isFeatureEnabled("organizer_workspace_v3")) {
    const publication = await publishEvent(input.eventId, {
      id: user.id,
      role: z.enum(["organizer", "platform_admin", "admin"]).parse(user.role),
    });
    if (publication.status === "not_found") {
      return redirectToActiveLocale("/admin?error=Event%20not%20found.");
    }
    if (publication.status === "blocked") {
      return redirectToActiveLocale("/admin?error=event-not-ready");
    }

    if (publication.status !== "published" && publication.status !== "already_published") {
      return redirectToActiveLocale("/admin?error=event-publish-conflict");
    }

    revalidateTag("events");
    revalidatePath("/", "layout");
    return redirectToActiveLocale(`/admin?success=event-status-updated&event=${publication.slug}`);
  }

  const event = await setEventStatus(input.eventId, input.status);

  if (!event) {
    return redirectToActiveLocale("/admin?error=Event%20not%20found.");
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-status-updated&event=${event.slug}`);
}

/** Archives event (sets to Finished) or hard-deletes Draft events with no teams. */
export async function adminArchiveEventAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const action = z.enum(["archive", "delete"]).parse(formData.get("action"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { _count: { select: { teams: true } } },
  });
  if (!event) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Event tidak ditemukan.")}` as never);
  }

  if (action === "delete") {
    if (event.status !== "Draft") {
      return redirectToActiveLocale(
        `/admin?error=${encodeURIComponent("Hanya event Draft yang dapat dihapus.")}` as never
      );
    }
    if (event._count.teams > 0) {
      return redirectToActiveLocale(
        `/admin?error=${encodeURIComponent("Event dengan tim tidak dapat dihapus. Hapus tim terlebih dahulu.")}` as never
      );
    }
    await prisma.event.delete({ where: { id: eventId } });
  } else {
    await prisma.event.update({ where: { id: eventId }, data: { status: "Finished" } });
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=event-archived" as never);
}

/** Updates the live-stream URL and label for an event. URL must be a valid absolute URL. */
export async function adminUpdateStreamAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    eventId: actionEntityId,
    url: z.string().refine(isHttpUrl, "Stream URL must use http or https."),
    label: z.string().min(2),
  }).parse({
    eventId: formData.get("eventId"),
    url: formData.get("url"),
    label: formData.get("label"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);
  await updateEventStream(input.eventId, input.url, input.label);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stream-updated");
}

export async function adminUpdateEventPublicInfoAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    eventId: actionEntityId,
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
  }).parse({
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

  const event = await updateEventPublicInfo(user, input.eventId, {
    description: input.description,
    registrationWindow: input.registrationWindow,
    startsAt: input.startsAt,
    venue: input.venue,
    prizePoolLabel: input.prizePoolLabel,
    registrationFeeRequired: input.registrationFeeRequired,
    registrationFeeAmount: input.registrationFeeRequired ? input.registrationFeeAmount : null,
    registrationFeeLabel: input.registrationFeeLabel,

    registrationUrl: input.registrationUrl,
  });

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-public-info-updated&event=${event.slug}`);
}

/** Uploads a character art PNG for an event's certificate to Vercel Blob and stores the URL. */
export async function adminUploadCharacterArtAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  if (!(await checkRateLimit(`character-art:${user.id}:${eventId}`, 5, 15 * 60 * 1000))) {
    return redirectToActiveLocale("/admin?error=rate-limited");
  }

  try {
    const asset = await uploadImageAsset({
      file: formData.get("characterArt"),
      folder: "character-art",
      entityId: eventId,
      label: "Character art",
      maxBytes: MAX_BACKGROUND_IMAGE_BYTES,
    });
    await updateEventCertificateAssets(eventId, { characterArtUrl: asset.url });
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=character-art-uploaded`);
}

/** Updates the accent color for an event's certificate. */
export async function adminSetAccentColorAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const accentColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("accentColor"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);
  await updateEventCertificateAssets(eventId, { accentColor });
  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=accent-color-saved`);
}
