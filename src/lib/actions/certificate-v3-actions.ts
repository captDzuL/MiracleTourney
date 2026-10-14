"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnyRole } from "@/lib/auth/session";
import { uploadImageAsset } from "@/lib/actions/shared/uploads";
import { CERTIFICATE_REGENERATION_RATE_LIMIT, CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS } from "@/lib/actions/certificate-v3-rate-limit";
import { CERTIFICATE_ASSET_LIMITS, publishCertificateSet, publishCertificateSetInputSchema, regenerateCertificate, regenerateCertificateInputSchema, type CertificatePublicationActionResult, type CertificateStudioActor, type PublishCertificateSetResult, type RegenerateCertificateResult } from "@/lib/certificate/service";
import { createPrismaCertificateStudioDependencies } from "@/lib/certificate/studio-repository";
import { loadTeamLogo, type TeamLogoImportCode } from "@/lib/certificate/team-logo-import";
import { findApprovedTeamLogoAssetId, findEventTeamLogo } from "@/lib/certificate/team-logo-repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { createEventVisualAsset } from "@/lib/events/visual-repository";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import type { AppUser } from "@/lib/platform/types";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { safeEntityIdSchema } from "@/lib/security/request-guard";
import { withServerActionLog } from "@/lib/observability/logger";

type GateResult = { status: "blocked"; code: "feature_disabled" | "unauthorized" | "password_change_required" | "forbidden" | "rate_limited" };

function normalizePublicationResult(result: PublishCertificateSetResult): CertificatePublicationActionResult {
  if (result.status === "published") return { status: "published", revision: result.publicationVersion, publishedAt: result.publishedAt };
  if (result.status === "already_applied") return { status: "already_applied", result: normalizePublicationResult(result.result) };
  return result;
}
async function gate(eventId: string): Promise<{ actor: CertificateStudioActor; user: AppUser } | GateResult> {
  if (!isFeatureEnabled("completion_workspace_v3")) return { status: "blocked", code: "feature_disabled" };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "blocked", code: "unauthorized" };
  if (user.role === "organizer" && user.mustChangePassword) return { status: "blocked", code: "password_change_required" };
  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId, ownerUserId: user.role === "organizer" ? user.id : undefined },
    user.role === "organizer" ? user.id : null,
  );
  if (!access.ok) return { status: "blocked", code: "forbidden" };
  try { await assertUserCanManageEvent(user, eventId); }
  catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return { status: "blocked", code: "forbidden" };
    throw error;
  }
  return { actor: { id: user.id, role: user.role as CertificateStudioActor["role"] }, user };
}

export async function regenerateCertificateAction(input: unknown): Promise<RegenerateCertificateResult> {
  return withServerActionLog("certificate_regenerate", "/server-actions/certificate/regenerate", () => regenerateCertificateActionImpl(input));
}

async function regenerateCertificateActionImpl(input: unknown): Promise<RegenerateCertificateResult> {
  const parsed = regenerateCertificateInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  if (!(await checkRateLimit(
    `certificate-v3:regenerate:${access.actor.id}:${parsed.data.eventId}`,
    CERTIFICATE_REGENERATION_RATE_LIMIT,
    CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS,
  ))) {
    return { status: "blocked", code: "rate_limited" };
  }
  const result = await regenerateCertificate(parsed.data, createPrismaCertificateStudioDependencies(access.actor));
  if (result.status === "generated") revalidatePath(`/organizer/events/${parsed.data.eventId}/certificates`);
  return result;
}

export async function publishCertificateSetAction(input: unknown): Promise<CertificatePublicationActionResult> {
  return withServerActionLog("certificate_publish", "/server-actions/certificate/publish", () => publishCertificateSetActionImpl(input));
}

async function publishCertificateSetActionImpl(input: unknown): Promise<CertificatePublicationActionResult> {
  const parsed = publishCertificateSetInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  if (!(await checkRateLimit(`certificate-v3:publish:${access.actor.id}:${parsed.data.eventId}`, 5, 5 * 60 * 1000))) {
    return { status: "blocked", code: "rate_limited" };
  }
  const result = await publishCertificateSet(parsed.data, createPrismaCertificateStudioDependencies(access.actor));
  if (result.status === "published") revalidatePath(`/organizer/events/${parsed.data.eventId}/certificates`);
  return normalizePublicationResult(result);
}

const UPLOAD_VALIDATION_CODES = ["invalid_entity_id", "missing_file", "file_too_large", "unsupported_type", "signature_mismatch", "decode_failed", "invalid_dimensions"] as const;
type UploadFailureCode = (typeof UPLOAD_VALIDATION_CODES)[number] | "upload_failed";

/** Maps an upload pipeline error to a typed code; anything unexpected is logged without detail as upload_failed. */
function uploadFailureCode(error: unknown): UploadFailureCode {
  const known = error instanceof Error && error.name === "ImageUploadValidationError" && "code" in error
    ? UPLOAD_VALIDATION_CODES.find((code) => code === error.code) : undefined;
  if (known) return known;
  console.error("Certificate asset upload failed", { code: "upload_failed" });
  return "upload_failed";
}

const uploadCertificateAssetSchema = z.object({
  eventId: safeEntityIdSchema,
  purpose: z.enum(["certificate_team_logo", "certificate_character_art"]),
});

export async function uploadCertificateAssetAction(formData: FormData) {
  return withServerActionLog("certificate_asset_upload", "/server-actions/certificate/upload", () => uploadCertificateAssetActionImpl(formData));
}

async function uploadCertificateAssetActionImpl(formData: FormData) {
  const parsed = uploadCertificateAssetSchema.safeParse({
    eventId: formData.get("eventId"),
    purpose: formData.get("purpose"),
  });
  if (!parsed.success) return { status: "blocked" as const, code: "invalid_input" as const };
  const access = await gate(parsed.data.eventId);
  if ("status" in access) return access;
  if (!(await checkRateLimit(`certificate-asset:${access.actor.id}:${parsed.data.eventId}`, 5, 15 * 60 * 1000))) {
    return { status: "blocked" as const, code: "rate_limited" as const };
  }
  let asset: Awaited<ReturnType<typeof uploadImageAsset>>;
  try { asset = await uploadImageAsset({
    file: formData.get("asset"),
    folder: "certificate-assets",
    entityId: parsed.data.eventId,
    label: "Certificate asset",
    maxBytes: 5 * 1024 * 1024,
    minDimension: CERTIFICATE_ASSET_LIMITS.minDimension,
    maxDimension: CERTIFICATE_ASSET_LIMITS.maxDimension,
    validationMode: "throw",
  }); }
  catch (error) {
    return { status: "blocked" as const, code: uploadFailureCode(error) };
  }
  const created = await createEventVisualAsset(access.user, {
    eventId: parsed.data.eventId, source: "organizer_upload", status: "approved", purpose: parsed.data.purpose,
    url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height, byteSize: asset.byteSize,
    storageProvider: asset.storageProvider, storageKey: asset.storageKey, contentSha256: asset.contentSha256,
    rightsAttestedAt: new Date(),
  });
  revalidatePath("/organizer/events/" + parsed.data.eventId + "/certificates");
  return { status: "uploaded" as const, assetId: created.id };
}

const importTeamLogoSchema = z.object({ eventId: safeEntityIdSchema, teamId: safeEntityIdSchema });
const TEAM_LOGO_IMPORT_RATE_LIMIT = 20;
const TEAM_LOGO_IMPORT_RATE_WINDOW_MS = 15 * 60 * 1000;
const TEAM_LOGO_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export type ImportTeamLogoBlockedCode = GateResult["code"] | "invalid_input" | "team_not_found" | TeamLogoImportCode | UploadFailureCode;
export type ImportTeamLogoResult =
  | { status: "imported"; assetId: string; teamId: string }
  | { status: "blocked"; code: ImportTeamLogoBlockedCode };

const blockedImport = (code: ImportTeamLogoBlockedCode): ImportTeamLogoResult => ({ status: "blocked", code });

/** Copies a team's existing logo into the event's approved certificate assets. Idempotent for identical bytes. */
export async function importTeamLogoAsCertificateAssetAction(input: unknown): Promise<ImportTeamLogoResult> {
  return withServerActionLog("certificate_team_logo_import", "/server-actions/certificate/team-logo-import", () => importTeamLogoActionImpl(input));
}

async function importTeamLogoActionImpl(input: unknown): Promise<ImportTeamLogoResult> {
  const parsed = importTeamLogoSchema.safeParse(input);
  if (!parsed.success) return blockedImport("invalid_input");
  const { eventId, teamId } = parsed.data;
  const access = await gate(eventId);
  if ("status" in access) return access;
  if (!(await checkRateLimit(`certificate-team-logo:${access.actor.id}:${eventId}`, TEAM_LOGO_IMPORT_RATE_LIMIT, TEAM_LOGO_IMPORT_RATE_WINDOW_MS))) {
    return blockedImport("rate_limited");
  }
  const team = await findEventTeamLogo(eventId, teamId);
  if (!team) return blockedImport("team_not_found");
  const loaded = await loadTeamLogo(team.logoUrl);
  if (!loaded.ok) return blockedImport(loaded.code);
  const existingAssetId = await findApprovedTeamLogoAssetId(eventId, loaded.logo.contentSha256);
  if (existingAssetId) return { status: "imported", assetId: existingAssetId, teamId: team.id };
  let asset: Awaited<ReturnType<typeof uploadImageAsset>>;
  try {
    asset = await uploadImageAsset({
      file: new File([new Uint8Array(loaded.logo.bytes)], `team-${team.id}.${TEAM_LOGO_EXTENSIONS[loaded.logo.mimeType]}`, { type: loaded.logo.mimeType }),
      folder: "certificate-assets",
      entityId: eventId,
      label: "Certificate asset",
      maxBytes: CERTIFICATE_ASSET_LIMITS.maxBytes,
      minDimension: CERTIFICATE_ASSET_LIMITS.minDimension,
      maxDimension: CERTIFICATE_ASSET_LIMITS.maxDimension,
      validationMode: "throw",
      validatePixels: true,
    });
  } catch (error) {
    return blockedImport(uploadFailureCode(error));
  }
  const created = await createEventVisualAsset(access.user, {
    eventId, source: "team_logo_import", status: "approved", purpose: "certificate_team_logo", sourceUrl: team.logoUrl,
    url: asset.url, mimeType: asset.mimeType, width: asset.width, height: asset.height, byteSize: asset.byteSize,
    storageProvider: asset.storageProvider, storageKey: asset.storageKey, contentSha256: asset.contentSha256,
    // The organizer who imports the team logo attests that they may use it on this event's certificates.
    rightsAttestedAt: new Date(),
  });
  revalidatePath("/organizer/events/" + eventId + "/certificates");
  return { status: "imported", assetId: created.id, teamId: team.id };
}
