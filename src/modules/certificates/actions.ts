"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActorContext } from "@/modules/identity";
import { toActorContext, toEventReadActorCompatibility } from "@/modules/identity";

import { assertActorCanManageCertificateEvent, regenerateCertificate, updateCertificateAssets } from "./service";
import { uploadCharacterArtImage } from "./upload";

const managerRoles: Array<"organizer" | "platform_admin" | "admin"> = ["organizer", "platform_admin", "admin"];

async function requireCertificateManager(): Promise<ActorContext> {
  const user = await requireAnyRole(managerRoles);
  if (!user) return redirectToActiveLocale("/login");

  // Migration window: keep legacy admin sessions as organizer/self-tenant actors.
  const actor = user.role === "admin" ? toEventReadActorCompatibility(user) : toActorContext(user);
  if (!actor) return redirectToActiveLocale("/login");
  return actor;
}

/** Uploads a character art PNG for an event's certificate to Vercel Blob and stores the URL. */
export async function adminUploadCharacterArtAction(formData: FormData) {
  const actor = await requireCertificateManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));

  try {
    // Ownership must be verified before the Blob/filesystem upload side effect that a later
    // denial cannot undo. `updateCertificateAssets` still re-verifies ownership at its own
    // ownership-scoped write, so the denial never rests solely on this preflight.
    await assertActorCanManageCertificateEvent(actor, eventId);

    const asset = await uploadCharacterArtImage({ file: formData.get("characterArt"), entityId: eventId });
    await updateCertificateAssets(actor, eventId, { characterArtUrl: asset.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=character-art-uploaded`);
}

/** Updates the accent color for an event's certificate. */
export async function adminSetAccentColorAction(formData: FormData) {
  const actor = await requireCertificateManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const accentColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("accentColor"));

  try {
    await assertActorCanManageCertificateEvent(actor, eventId);
    await updateCertificateAssets(actor, eventId, { accentColor });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=accent-color-saved`);
}

/**
 * Re-renders the champion certificate for an event, replacing whatever is stored.
 *
 * Used to recover from a failed generation (headless Chromium is the usual culprit) and to pick up
 * a new accent color or character art. Rate limited because each run boots a browser; ownership is
 * checked first so a denied organizer can never burn another tenant's rate-limit budget.
 */
export async function adminRegenerateCertificateAction(formData: FormData) {
  const actor = await requireCertificateManager();
  const eventId = z.string().min(1).parse(formData.get("eventId"));

  try {
    await assertActorCanManageCertificateEvent(actor, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not authorized";
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  if (!checkRateLimit(`cert-regen:${eventId}`, 3, 5 * 60 * 1000)) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.")}`,
    );
  }

  try {
    await regenerateCertificate(actor, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Certificate generation failed";
    revalidatePath("/admin");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=certificate-regenerated`);
}
