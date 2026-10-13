"use server";

// Server actions for event logo and visual assets.
// Moved out of lib/actions.ts without changes (refactor PR 3.3).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { MAX_BACKGROUND_IMAGE_BYTES, MAX_LOGO_IMAGE_BYTES } from "@/lib/actions/shared/limits";
import { actionEntityId } from "@/lib/actions/shared/request";
import { assertWorkspaceEventAction, requireAdminSession } from "@/lib/actions/shared/session";
import { appendActionError, uploadImageAsset } from "@/lib/actions/shared/uploads";
import { approveEventVisualAsset, createEventVisualAsset, rejectEventVisualAsset, setEventVisualFocalPoint, updateEventBrandAssets } from "@/lib/events/visual-repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function uploadEventLogo(formData: FormData, returnPath: string, returnSection = "visuals") {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  if (!(await checkRateLimit(`event-logo:${user.id}:${eventId}`, 5, 15 * 60 * 1000))) {
    return redirectToActiveLocale(`${returnPath}?error=rate-limited` as never);
  }

  try {
    const asset = await uploadImageAsset({
      file: formData.get("eventLogo"),
      folder: "event-logos",
      entityId: eventId,
      label: "Event logo",
      maxBytes: MAX_LOGO_IMAGE_BYTES,
      errorPath: returnPath,
    });
    await updateEventBrandAssets(eventId, { logoUrl: asset.url });
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    redirect(`${appendActionError(returnPath, message)}${returnSection === "public" ? "#section-public" : ""}` as never);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  redirect(`${returnPath}?success=event-logo-uploaded#section-${returnSection}` as never);
}

export async function adminUploadEventLogoAction(formData: FormData) {
  return uploadEventLogo(formData, "/admin");
}

export async function organizerUploadEventLogoAction(formData: FormData) {
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const locale = z.enum(["id", "en"]).parse(formData.get("locale"));
  const master = isFeatureEnabled("organizer_master_shell_v3");
  return uploadEventLogo(formData, `/${locale}/organizer/events/${eventId}/${master ? "edit" : "overview"}`, master ? "public" : "visuals");
}

/**
 * While the legacy `Event.gameImageUrl` column still has readers, every
 * approval mirrors the approved revision url back into it. Flip this to `false`
 * (and delete the dual-write branch in `approveEventVisualAsset`) once all
 * surfaces read through `resolveEventVisual`.
 */
const DUAL_WRITE_LEGACY_EVENT_IMAGE = true;

/**
 * Uploads an organizer-supplied event background as a new visual revision.
 * Organizer uploads are trusted after the rights attestation, so the revision
 * is created already approved and then activated through the repository.
 */
async function uploadEventVisual(formData: FormData, returnPath: string, returnSection = "visuals") {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));

  try {
    await assertUserCanManageEvent(user, eventId);
    assertWorkspaceEventAction(user, eventId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    redirect(`${appendActionError(returnPath, message)}${returnSection === "public" ? "#section-public" : ""}` as never);
  }

  if (!(await checkRateLimit(`event-visual:${user.id}:${eventId}`, 5, 15 * 60 * 1000))) {
    return redirect(`${returnPath}?error=rate-limited${returnSection === "public" ? "#section-public" : ""}` as never);
  }

  try {
    if (formData.get("rightsAttestation") !== "confirmed") {
      throw new Error("Konfirmasi hak publikasi artwork terlebih dahulu.");
    }

    const asset = await uploadImageAsset({
      file: formData.get("eventVisual"),
      folder: "event-backgrounds",
      entityId: eventId,
      label: "Event background",
      maxBytes: MAX_BACKGROUND_IMAGE_BYTES,
      errorPath: returnPath,
    });

    const revision = await createEventVisualAsset(user, {
      eventId,
      source: "organizer_upload",
      status: "approved",
      url: asset.url,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      rightsAttestedAt: new Date(),
    });

    await approveEventVisualAsset(user, eventId, revision.id, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    redirect(`${appendActionError(returnPath, message)}${returnSection === "public" ? "#section-public" : ""}` as never);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  redirect(`${returnPath}?success=event-visual-uploaded#section-${returnSection}` as never);
}

export async function adminUploadEventVisualAction(formData: FormData) {
  return uploadEventVisual(formData, "/admin");
}

export async function organizerUploadEventVisualAction(formData: FormData) {
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const locale = z.enum(["id", "en"]).parse(formData.get("locale"));
  const master = isFeatureEnabled("organizer_master_shell_v3");
  return uploadEventVisual(formData, `/${locale}/organizer/events/${eventId}/${master ? "edit" : "overview"}`, master ? "public" : "visuals");
}

/** Approves a revision that is waiting for review and makes it the active one. */
export async function adminApproveEventVisualAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const assetId = actionEntityId.parse(formData.get("assetId"));

  try {
    await assertUserCanManageEvent(user, eventId);
    assertWorkspaceEventAction(user, eventId);
    await approveEventVisualAsset(user, eventId, assetId, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = toSafeActionMessage(err, "Approval failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-approved`);
}

/** Rejects a revision. The repository refuses to reject the active one. */
export async function adminRejectEventVisualAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const assetId = actionEntityId.parse(formData.get("assetId"));

  try {
    await assertUserCanManageEvent(user, eventId);
    assertWorkspaceEventAction(user, eventId);
    await rejectEventVisualAsset(user, eventId, assetId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Rejection failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-rejected`);
}

/** Rolls back to an already approved revision by re-activating it. */
export async function adminActivateEventVisualAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const assetId = actionEntityId.parse(formData.get("assetId"));

  try {
    await assertUserCanManageEvent(user, eventId);
    assertWorkspaceEventAction(user, eventId);
    await approveEventVisualAsset(user, eventId, assetId, {
      dualWriteLegacyImage: DUAL_WRITE_LEGACY_EVENT_IMAGE,
    });
  } catch (err) {
    const message = toSafeActionMessage(err, "Activation failed");
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
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const assetId = actionEntityId.parse(formData.get("assetId"));
  const focalX = z.coerce.number().finite().parse(formData.get("focalX"));
  const focalY = z.coerce.number().finite().parse(formData.get("focalY"));

  try {
    await assertUserCanManageEvent(user, eventId);
    assertWorkspaceEventAction(user, eventId);
    await setEventVisualFocalPoint(user, eventId, assetId, { x: focalX, y: focalY });
  } catch (err) {
    const message = toSafeActionMessage(err, "Focal point update failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=event-visual-focal-updated`);
}
