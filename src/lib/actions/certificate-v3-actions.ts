"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnyRole } from "@/lib/auth/session";
import { uploadImageAsset } from "@/lib/actions";
import { publishCertificateSet, publishCertificateSetInputSchema, regenerateCertificate, regenerateCertificateInputSchema, type CertificateStudioActor, type PublishCertificateSetResult, type RegenerateCertificateResult } from "@/lib/certificate/service";
import { createPrismaCertificateStudioDependencies } from "@/lib/certificate/studio-repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent, createEventVisualAsset } from "@/lib/platform/repository";
import type { AppUser } from "@/lib/platform/types";

type GateResult = { status: "blocked"; code: "feature_disabled" | "unauthorized" | "password_change_required" | "forbidden" };
async function gate(eventId: string): Promise<{ actor: CertificateStudioActor; user: AppUser } | GateResult> {
  if (!isFeatureEnabled("completion_workspace_v3")) return { status: "blocked", code: "feature_disabled" };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "blocked", code: "unauthorized" };
  if (user.role === "organizer" && user.mustChangePassword) return { status: "blocked", code: "password_change_required" };
  try { await assertUserCanManageEvent(user, eventId); }
  catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return { status: "blocked", code: "forbidden" };
    throw error;
  }
  return { actor: { id: user.id, role: user.role as CertificateStudioActor["role"] }, user };
}

export async function regenerateCertificateAction(input: unknown): Promise<RegenerateCertificateResult> {
  const parsed = regenerateCertificateInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  const result = await regenerateCertificate(parsed.data, createPrismaCertificateStudioDependencies(access.actor));
  if (result.status === "generated") revalidatePath(`/organizer/events/${parsed.data.eventId}/certificates`);
  return result;
}

export async function publishCertificateSetAction(input: unknown): Promise<PublishCertificateSetResult> {
  const parsed = publishCertificateSetInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  const result = await publishCertificateSet(parsed.data, createPrismaCertificateStudioDependencies(access.actor));
  if (result.status === "published") revalidatePath(`/organizer/events/${parsed.data.eventId}/certificates`);
  return result;
}

const uploadCertificateAssetSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  purpose: z.enum(["certificate_team_logo", "certificate_character_art"]),
});

export async function uploadCertificateAssetAction(formData: FormData) {
  const parsed = uploadCertificateAssetSchema.safeParse({
    eventId: formData.get("eventId"),
    purpose: formData.get("purpose"),
  });
  if (!parsed.success) return { status: "blocked" as const, code: "invalid_input" as const };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  const asset = await uploadImageAsset({
    file: formData.get("asset"),
    folder: "certificate-assets",
    entityId: parsed.data.eventId,
    label: "Certificate asset",
    maxBytes: 5 * 1024 * 1024,
    errorPath: "/organizer/events/" + parsed.data.eventId + "/certificates",
  });
  const created = await createEventVisualAsset(access.user, {
    eventId: parsed.data.eventId, source: "organizer_upload", status: "approved", purpose: parsed.data.purpose,
    url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height, byteSize: asset.byteSize,
    storageProvider: asset.storageProvider, storageKey: asset.storageKey, contentSha256: asset.contentSha256,
    rightsAttestedAt: new Date(),
  });
  revalidatePath("/organizer/events/" + parsed.data.eventId + "/certificates");
  return { status: "uploaded" as const, assetId: created.id };
}
