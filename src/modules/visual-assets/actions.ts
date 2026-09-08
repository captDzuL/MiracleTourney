"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import type { ActorContext } from "@/modules/identity";
import { toActorContext, toEventReadActorCompatibility } from "@/modules/identity";

import {
  approveEventVisualAsset,
  assertActorCanManageVisualEvent,
  createEventVisualAsset,
  rejectEventVisualAsset,
  setEventVisualFocalPoint,
} from "./service";
import { uploadEventVisualImage } from "./upload";

const managerRoles: Array<"organizer" | "platform_admin" | "admin"> = ["organizer", "platform_admin", "admin"];
const MAX_BACKGROUND_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * While the legacy `Event.gameImageUrl` column still has readers, every
 * approval mirrors the approved revision url back into it. Flip this to
 * `false` (and delete the dual-write branch in `approveVisualAssetForActor`)
 * once all surfaces read through `resolveEventVisual`.
 */
const DUAL_WRITE_LEGACY_EVENT_IMAGE = true;

function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
}

async function requireVisualAssetManager(): Promise<ActorContext> {
  const user = await requireAnyRole(managerRoles);
  if (!user) return redirectToActiveLocale("/login");

  // Migration window: keep legacy admin sessions as organizer/self-tenant actors.
  const actor = user.role === "admin" ? toEventReadActorCompatibility(user) : toActorContext(user);
  if (!actor) return redirectToActiveLocale("/login");
  return actor;
}

/**
 * Uploads an organizer-supplied event background as a new visual revision.
 * Organizer uploads are trusted after the rights attestation, so the revision
 * is created already approved and then activated through the service.
 */
async function uploadEventVisual(formData: FormData, returnPath: string) {
  const actor = await requireVisualAssetManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));

  try {
    // Ownership must be verified before any side effect (Blob upload) that a
    // later authorization failure cannot undo. Every downstream mutation also
    // re-verifies ownership inside its own transaction, so denial never rests
    // on this preflight alone.
    await assertActorCanManageVisualEvent(actor, eventId);

    if (formData.get("rightsAttestation") !== "confirmed") {
      throw new Error("Konfirmasi hak publikasi artwork terlebih dahulu.");
    }

    const asset = await uploadEventVisualImage({
      file: formData.get("eventVisual"),
      entityId: eventId,
      maxBytes: MAX_BACKGROUND_IMAGE_BYTES,
      errorPath: returnPath,
    });

    const revision = await createEventVisualAsset(actor, {
      eventId,
      source: "organizer_upload",
      status: "approved",
      url: asset.url,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      rightsAttestedAt: new Date(),
    });

    await approveEventVisualAsset(actor, eventId, revision.id, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    redirect(appendActionError(returnPath, message) as never);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  redirect(`${returnPath}?success=event-visual-uploaded#section-visuals` as never);
}

export async function adminUploadEventVisualAction(formData: FormData) {
  return uploadEventVisual(formData, "/admin");
}

export async function organizerUploadEventVisualAction(formData: FormData) {
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const locale = z.enum(["id", "en"]).parse(formData.get("locale"));
  return uploadEventVisual(formData, `/${locale}/organizer/events/${eventId}/overview`);
}

/** Approves a revision that is waiting for review and makes it the active one. */
export async function adminApproveEventVisualAction(formData: FormData) {
  const actor = await requireVisualAssetManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const assetId = z.string().min(1).parse(formData.get("assetId"));

  try {
    await approveEventVisualAsset(actor, eventId, assetId, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-approved`);
}

/** Rejects a revision. The service refuses to reject the active one. */
export async function adminRejectEventVisualAction(formData: FormData) {
  const actor = await requireVisualAssetManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const assetId = z.string().min(1).parse(formData.get("assetId"));

  try {
    await rejectEventVisualAsset(actor, eventId, assetId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rejection failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-rejected`);
}

/** Rolls back to an already approved revision by re-activating it. */
export async function adminActivateEventVisualAction(formData: FormData) {
  const actor = await requireVisualAssetManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const assetId = z.string().min(1).parse(formData.get("assetId"));

  try {
    await approveEventVisualAsset(actor, eventId, assetId, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activation failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-activated`);
}

/**
 * Stores the focal point of a revision. Values are forwarded as parsed so the
 * repository stays the single place that clamps them into the unit square.
 */
export async function adminSetEventVisualFocalPointAction(formData: FormData) {
  const actor = await requireVisualAssetManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const assetId = z.string().min(1).parse(formData.get("assetId"));
  const focalX = z.coerce.number().finite().parse(formData.get("focalX"));
  const focalY = z.coerce.number().finite().parse(formData.get("focalY"));

  try {
    await setEventVisualFocalPoint(actor, eventId, assetId, { x: focalX, y: focalY });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Focal point update failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-focal-updated`);
}
