"use server";

import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { getLocalizedRedirectPath, redirectToActiveLocale } from "@/i18n/redirect";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { publishEvent } from "@/lib/events/publish-readiness";
import { prisma } from "@/lib/platform/db";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  equalizePasswordResetResponse,
} from "@/lib/platform/password-reset";

import { requireRole, signIn } from "@/lib/auth/session";
import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import { commitRegistrationImportForUser, previewRegistrationImportForUser } from "@/lib/actions/registration-v3-actions";
import * as eventRegistrationActions from "@/lib/actions/registration-v3-actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { isDisposableEmail } from "@/lib/validation/email";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";
import { validateTeamData } from "@/lib/validation/team-data";
import { parsePlayerStatForm } from "@/lib/player-stats/form";
import type { AppUser } from "@/lib/platform/types";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { toSafeActionMessage } from "@/lib/security/public-error";
import { isSafeHttpUrl, safeEntityIdSchema } from "@/lib/security/request-guard";
import {
  addPlayer,
  approveStatSubmission,
  approveEventVisualAsset,
  approveTeamRegistrationRequest,
  assertCaptainCanSubmitStats,
  assertUserCanManageEvent,
  assertUserCanManageTeam,
  assertUserCanReviewStatSubmission,
  createCaptainAccount,
  createOrUpdateCaptainDraftTeam,
  createEvent,
  createEventVisualAsset,
  createTeamRegistrationRequest,
  deletePlayer,
  getImportSnapshot,
  getEventsByIds,
  getOrganizerUserById,
  getPlayerStatFormContext,
  getUserByEmail,
  getUserPasswordHashById,
  autoTransitionEventToOngoing,
  importTeams,
  registerTeam,
  rejectStatSubmission,
  rejectEventVisualAsset,
  rejectTeamRegistrationRequest,
  setEventStatus,
  setEventVisualFocalPoint,
  setMatchGames,
  setMatchResult,
  updateCaptainPassword,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  updateEventPublicInfo,
  updateEventStream,
  updateEventBrandAssets,
  updateEventCertificateAssets,
  updateTeamLogo,
  updateCaptainTeamLogo,
  updatePlayer,
  upsertRoundConfig,
  upsertStatSubmission,
  setTeamCaptainDisplay,
  adminWriteMatchPlayerStats,
} from "@/lib/platform/repository";
import fs from "fs";
import path from "path";

const MAX_TEAM_IMPORT_CSV_BYTES = 256 * 1024;
const MAX_LOGO_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;
const MAX_QRIS_IMAGE_BYTES = 2 * 1024 * 1024;
const actionEntityId = safeEntityIdSchema;

async function requireAdminSession(): Promise<AppUser> {
  const user =
    await requireRole("platform_admin")
    ?? await requireRole("organizer")
    ?? await requireRole("admin");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

async function requireCaptainSession(): Promise<AppUser> {
  const user = await requireRole("captain");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

function assertWorkspaceEventAction(user: AppUser, eventId: string) {
  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId, ownerUserId: user.role === "organizer" ? user.id : undefined },
    user.role === "organizer" ? user.id : null,
  );
  if (!access.ok) throw new Error("Not authorized");
}

async function redirectToRequestedLocale(path: string, locale?: string): Promise<never> {
  if (locale === "id" || locale === "en") {
    redirect(getLocalizedRedirectPath(path, locale));
  }

  return redirectToActiveLocale(path);
}

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "PrismaClientInitializationError"
    || error.message.includes("Can't reach database server")
  );
}

function isSafeEntityId(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function getImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return null;
}

function hasImageSignature(buffer: Buffer, extension: "png" | "jpg" | "webp") {
  if (extension === "png") {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }
  if (extension === "jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function isHttpUrl(value: string) {
  return isSafeHttpUrl(value);
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

export type UploadedImageAsset = {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  storageProvider: "vercel_blob" | "local";
  storageKey: string;
  contentSha256: string;
};

function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
}
export type ImageUploadValidationCode =
  | "invalid_entity_id" | "missing_file" | "file_too_large" | "unsupported_type"
  | "signature_mismatch" | "decode_failed" | "invalid_dimensions";

class ImageUploadValidationError extends Error {
  readonly code: ImageUploadValidationCode;
  constructor(code: ImageUploadValidationCode, message: string) {
    super(message);
    this.name = "ImageUploadValidationError";
    this.code = code;
  }
}

function rejectImageUpload(code: ImageUploadValidationCode, message: string, validationMode: "redirect" | "throw", errorPath: string): never {
  if (validationMode === "throw") throw new ImageUploadValidationError(code, message);
  redirect(appendActionError(errorPath, message) as never);
}


/**
 * Single validation + storage boundary for every admin image upload.
 * Checks, in order: entity id shape, presence, byte size, declared MIME,
 * magic bytes, and finally real decodability through `sharp` (which also gives
 * the dimensions we persist on a visual revision).
 */
export async function uploadImageAsset({
  file,
  folder,
  entityId,
  label,
  maxBytes,
  minDimension,
  maxDimension,
  validationMode = "redirect",
  errorPath = "/admin",
}: {
  file: FormDataEntryValue | null;
  folder: string;
  entityId: string;
  label: string;
  maxBytes: number;
  minDimension?: number;
  maxDimension?: number;
  validationMode?: "redirect" | "throw";
  errorPath?: string;
}): Promise<UploadedImageAsset> {
  if (!isSafeEntityId(entityId)) {
    rejectImageUpload("invalid_entity_id", `Invalid ${label} ID.`, validationMode, errorPath);
  }
  if (!(file instanceof File) || file.size === 0) {
    rejectImageUpload("missing_file", `No ${label} file uploaded.`, validationMode, errorPath);
  }
  if (file.size > maxBytes) {
    rejectImageUpload("file_too_large", `${label} file is too large.`, validationMode, errorPath);
  }

  const extension = getImageExtension(file.type);
  if (!extension) {
    rejectImageUpload("unsupported_type", `${label} must be a PNG, JPEG, or WebP image.`, validationMode, errorPath);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentSha256 = createHash("sha256").update(buffer).digest("hex");
  if (!hasImageSignature(buffer, extension)) {
    rejectImageUpload("signature_mismatch", `${label} file content does not match its image type.`, validationMode, errorPath);
  }

  const mimeType = file.type || "image/png";
  const dimensions = await readImageDimensions(buffer);
  if (!dimensions) {
    rejectImageUpload("decode_failed", `${label} file could not be decoded as an image.`, validationMode, errorPath);
  }
  if ((minDimension !== undefined && (dimensions.width < minDimension || dimensions.height < minDimension))
    || (maxDimension !== undefined && (dimensions.width > maxDimension || dimensions.height > maxDimension))) {
    rejectImageUpload("invalid_dimensions", `${label} dimensions are outside the allowed range.`, validationMode, errorPath);
  }

  const filename = `${entityId}-${contentSha256}-${randomUUID()}.${extension}`;
  const storageKey = folder + "/" + filename;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(`${folder}/${filename}`, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { url: result.url, mimeType, ...dimensions, byteSize: file.size, storageProvider: "vercel_blob", storageKey, contentSha256 };
  }

  const dir = path.join(process.cwd(), "public", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer, { flag: "wx" });
  return { url: "/" + storageKey, mimeType, ...dimensions, byteSize: file.size, storageProvider: "local", storageKey, contentSha256 };
}

/** Returns real pixel dimensions, or null when the bytes are not a decodable image. */
async function readImageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

/**
 * Generates the champion certificate for a finished Final.
 *
 * Never throws: certificate rendering depends on a headless browser and remote storage, and a
 * failure there must not roll back the match result the admin just saved. The failure is persisted
 * on the certificate row by the generator itself, and the admin panel offers a retry.
 */
async function generateCertificateForFinalMatch(matchId: string, eventId: string) {
  try {
    const { generateCertificateIfFinal } = await import("@/lib/certificate/generate");
    await generateCertificateIfFinal(matchId, eventId);
  } catch {
    console.error("Certificate generation failed", { eventIdHash: createHash("sha256").update(eventId).digest("hex").slice(0, 16) });
  }
}

/**
 * Registers a new captain account without requiring an active event.
 * Team draft and event registration happen later from the captain dashboard.
 */
export async function captainSignUpAction(formData: FormData) {
  const returnTo = getSafeReturnTo(formData.get("returnTo"));
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const hasSafeEventId = Boolean(eventId && isSafeEntityId(eventId));
  const signUpError = async (msg: string) => {
    const context = new URLSearchParams();
    if (hasSafeEventId) context.set("eventId", eventId);
    if (returnTo) context.set("returnTo", returnTo);
    context.set("error", msg);
    return redirectToRequestedLocale(`/register?${context.toString()}`, requestedLocale);
  };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || fullName.length < 2) await signUpError("Nama lengkap minimal 2 karakter.");
  if (!z.string().email().safeParse(email).success) await signUpError("Format email tidak valid.");
  if (password.length < 8) await signUpError("Password minimal 8 karakter.");

  if (eventId) {
    if (!hasSafeEventId) await signUpError("Event tidak valid.");
    const [event] = await getEventsByIds([eventId]);
    if (!event || !["Published", "Registration Closed"].includes(event.status)) {
      await signUpError("Event tidak tersedia.");
    }
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000)) {
    await signUpError("Terlalu banyak percobaan pendaftaran. Coba lagi dalam 15 menit.");
  }

  if (isDisposableEmail(email)) {
    await signUpError("Email sementara tidak diizinkan. Gunakan email aktif.");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) await signUpError("Email ini sudah terdaftar. Coba login.");

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await createCaptainAccount({ email, name: fullName, passwordHash });
  } catch (err) {
    const msg = toSafeActionMessage(err, "Gagal membuat akun.");
    await signUpError(msg);
  }

  const result = await signIn(email, password);
  if (!result.ok) await signUpError("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  await redirectToRequestedLocale(
    eventId
      ? `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`
      : returnTo ?? "/captain?success=registered",
    requestedLocale,
  );
}
/** Authenticates a user by email/password and redirects to their role-specific workspace. */
export async function loginAction(formData: FormData) {
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const returnTo = getSafeReturnTo(formData.get("returnTo"));
  const eventId = String(formData.get("eventId") ?? "").trim();
  const hasSafeEventId = Boolean(eventId && isSafeEntityId(eventId));
  const loginErrorPath = (error: "database" | "invalid") => {
    const context = new URLSearchParams();
    if (returnTo) context.set("returnTo", returnTo);
    else if (hasSafeEventId) context.set("eventId", eventId);
    context.set("error", error);
    return `/login?${context.toString()}`;
  };
  const email = z.string().email().parse(formData.get("email"));
  const password = z.string().min(1).parse(formData.get("password"));
  let result;

  try {
    result = await signIn(email, password);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return await redirectToRequestedLocale(loginErrorPath("database"), requestedLocale);
    }

    console.error("[loginAction] signIn failed");
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  if (!result.ok) {
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  const user = result.user;
  if (!user) {
    return await redirectToRequestedLocale(loginErrorPath("invalid"), requestedLocale);
  }

  if (user.role === "captain" && returnTo) {
    await redirectToRequestedLocale(returnTo, requestedLocale);
  }
  if (user.role === "captain" && hasSafeEventId) {
    await redirectToRequestedLocale(
      `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`,
      requestedLocale,
    );
  }

  await redirectToRequestedLocale(
    user.role === "organizer" && user.mustChangePassword
      ? "/organizer/change-password"
      : user.role === "organizer" ? "/organizer" : user.role === "platform_admin" || user.role === "admin" ? "/admin" : "/captain",
    requestedLocale,
  );
}

/** Registers a team for a published event. Captain ID comes from the authenticated session, not the form. */
export async function captainRegisterTeamAction(formData: FormData) {
  const captain = await requireCaptainSession();
  const rawEventId = String(formData.get("eventId") ?? "").trim();
  const registrationBase = isSafeEntityId(rawEventId)
    ? `/captain?tab=registration&eventId=${encodeURIComponent(rawEventId)}`
    : "/captain?tab=registration";
  const registrationError = async (msg: string) =>
    redirectToActiveLocale(`${registrationBase}&error=${encodeURIComponent(msg)}` as never);
  const draftTeamIdRaw = String(formData.get("draftTeamId") ?? "").trim();
  const draftTeamId = draftTeamIdRaw ? actionEntityId.parse(draftTeamIdRaw) : undefined;
  const parsed = z.object({
    eventId: actionEntityId,
    name: z.string().trim().optional(),
    tag: z.string().trim().optional(),
  }).safeParse({
    eventId: formData.get("eventId"),
    name: String(formData.get("name") ?? "") || undefined,
    tag: String(formData.get("tag") ?? "") || undefined,
  });

  if (!parsed.success) {
    return await registrationError(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
  }

  const input = {
    ...parsed.data,
    tag: parsed.data.tag ? parsed.data.tag.toUpperCase() : undefined,
  };
  if (!draftTeamId) {
    if (!input.name || input.name.length < 2) return await registrationError("Nama tim minimal 2 karakter.");
    if (!input.tag || input.tag.length < 2 || input.tag.length > 5) return await registrationError("Tag tim harus 2-5 karakter.");
    const dataErrors = validateTeamData({ teamName: input.name, teamTag: input.tag, captainName: captain.name });
    if (dataErrors.length > 0) {
      return await registrationError(dataErrors.map((error) => error.message).join(". "));
    }
  }

  try {
    await registerTeam({ ...input, draftTeamId, captainId: captain.id });
  } catch (err) {
    const msg = toSafeActionMessage(err, "Gagal mendaftarkan tim.");
    if (msg === "Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.") {
      try {
        await createTeamRegistrationRequest({ ...input, draftTeamId, captainId: captain.id });
      } catch (paymentError) {
        const paymentMsg = toSafeActionMessage(paymentError, "Gagal membuat pendaftaran pembayaran.");
        return await registrationError(paymentMsg);
      }
      revalidateTag("teams");
      revalidatePath("/captain");
      await redirectToActiveLocale(`${registrationBase}&success=payment-pending` as never);
    }
    return await registrationError(msg);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  await redirectToActiveLocale(`${registrationBase}&success=team-created` as never);
}

export async function captainSaveDraftTeamAction(formData: FormData) {
  const captain = await requireCaptainSession();
  const draftError = async (msg: string) =>
    redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(msg)}` as never);

  const parsed = z.object({
    name: z.string().trim().min(2, "Nama tim minimal 2 karakter."),
    tag: z.string().trim().min(2, "Tag tim harus 2-5 karakter.").max(5, "Tag tim harus 2-5 karakter."),
  }).safeParse({
    name: formData.get("name"),
    tag: formData.get("tag"),
  });

  if (!parsed.success) {
    return await draftError(parsed.error.issues[0]?.message ?? "Data draft tim tidak valid.");
  }

  const input = { ...parsed.data, tag: parsed.data.tag.toUpperCase() };
  const dataErrors = validateTeamData({ teamName: input.name, teamTag: input.tag, captainName: captain.name });
  if (dataErrors.length > 0) {
    return await draftError(dataErrors.map((error) => error.message).join(". "));
  }

  try {
    await createOrUpdateCaptainDraftTeam({ ...input, captainId: captain.id, captainName: captain.name });
  } catch (err) {
    const msg = toSafeActionMessage(err, "Gagal menyimpan draft tim.");
    return await draftError(msg);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?tab=roster&success=draft-team-saved");
}


export async function captainUploadPaymentProofAction(formData: FormData) {
  const captain = await requireCaptainSession();
  const returnTo = getSafeReturnTo(formData.get("returnTo"));
  const parsed = z.object({
    requestId: actionEntityId,
    eventId: actionEntityId.optional(),
  }).parse({
    requestId: formData.get("requestId"),
    eventId: String(formData.get("eventId") ?? "").trim() || undefined,
  });
  const registrationBase = returnTo ?? (parsed.eventId && isSafeEntityId(parsed.eventId)
    ? `/captain?tab=registration&eventId=${encodeURIComponent(parsed.eventId)}`
    : "/captain?tab=registration");

  try {
    const request = await prisma.teamRegistrationRequest.findFirst({
      where: { id: parsed.requestId, captainId: captain.id },
      select: { id: true, eventId: true },
    });
    if (!request || parsed.eventId && request.eventId !== parsed.eventId) {
      throw new Error("Not authorized");
    }

    const proofAsset = await uploadImageAsset({
      file: formData.get("paymentProof"),
      folder: "payment-proofs",
      entityId: parsed.requestId,
      label: "Payment proof",
      maxBytes: MAX_PAYMENT_PROOF_BYTES,
      validationMode: "throw",
      errorPath: registrationBase,
    });
    await updateTeamRegistrationProof(captain.id, parsed.requestId, proofAsset.url);
  } catch (error) {
    const message = toSafeActionMessage(error, "Gagal mengupload bukti pembayaran.");
    await redirectToActiveLocale(appendActionError(registrationBase, message) as never);
  }

  revalidatePath("/captain");
  const separator = registrationBase.includes("?") ? "&" : "?";
  await redirectToActiveLocale(`${registrationBase}${separator}success=payment-proof-uploaded` as never);
}

export async function adminUpdatePaymentSettingsAction(formData: FormData) {
  await requireAdminSession();

  const qrisImageFile = formData.get("qrisImage");
  const uploadedQrisAsset = qrisImageFile instanceof File && qrisImageFile.size > 0
    ? await uploadImageAsset({
      file: qrisImageFile,
      folder: "payment-qris",
      entityId: "global",
      label: "QRIS image",
      maxBytes: MAX_QRIS_IMAGE_BYTES,
      errorPath: "/admin?phase=payments",
    })
    : null;
  const uploadedQrisUrl = uploadedQrisAsset?.url ?? null;

  const input = z.object({
    qrisImageUrl: optionalPublicUrlSchema.or(z.string().startsWith("/")).nullable(),
    instructions: z.preprocess((value) => {
      const text = String(value ?? "").trim();
      return text === "" ? null : text;
    }, z.string().max(500).nullable()),
  }).parse({
    qrisImageUrl: uploadedQrisUrl ?? formData.get("qrisImageUrl"),
    instructions: formData.get("instructions"),
  });

  await updatePaymentSettings(input);
  revalidatePath("/admin");
  await redirectToActiveLocale("/admin?phase=payments&success=payment-settings-updated" as never);
}

export async function adminApprovePaymentAction(formData: FormData) {
  const user = await requireAdminSession();
  const requestId = actionEntityId.parse(formData.get("requestId"));

  try {
    await approveTeamRegistrationRequest(user, requestId);
  } catch (error) {
    const message = toSafeActionMessage(error, "Gagal approve pembayaran.");
    await redirectToActiveLocale(`/admin?phase=payments&error=${encodeURIComponent(message)}` as never);
  }

  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/admin");
  revalidatePath("/captain");
  await redirectToActiveLocale("/admin?phase=payments&success=payment-approved" as never);
}

export async function adminRejectPaymentAction(formData: FormData) {
  const user = await requireAdminSession();
  const input = z.object({
    requestId: actionEntityId,
    reason: z.string().trim().min(3).max(240),
  }).parse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });

  try {
    await rejectTeamRegistrationRequest(user, input.requestId, input.reason);
  } catch (error) {
    const message = toSafeActionMessage(error, "Gagal reject pembayaran.");
    await redirectToActiveLocale(`/admin?phase=payments&error=${encodeURIComponent(message)}` as never);
  }

  revalidatePath("/admin");
  revalidatePath("/captain");
  await redirectToActiveLocale("/admin?phase=payments&success=payment-rejected" as never);
}
/**
 * Changes the captain's password after verifying the current one.
 * Validates that new and confirm passwords match and meet the 8-character minimum.
 */
export async function changePasswordAction(formData: FormData) {
  const user = await requireCaptainSession();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const settingsError = async (msg: string) =>
    redirectToActiveLocale(`/captain/settings?error=${encodeURIComponent(msg)}` as never);

  if (!currentPassword || !newPassword || !confirmPassword) {
    await settingsError("Semua field harus diisi.");
  }
  if (newPassword.length < 8) {
    await settingsError("Password baru minimal 8 karakter.");
  }
  if (newPassword !== confirmPassword) {
    await settingsError("Konfirmasi password tidak cocok.");
  }

  const currentHash = await getUserPasswordHashById(user.id);
  if (!currentHash) {
    return settingsError("Terjadi kesalahan. Coba lagi.");
  }

  const valid = await bcrypt.compare(currentPassword, currentHash);
  if (!valid) {
    return settingsError("Password saat ini tidak tepat.");
  }

  await updateCaptainPassword(user.id, await bcrypt.hash(newPassword, 10));
  await redirectToActiveLocale("/captain?success=password-changed");
}

export async function captainUploadTeamLogoAction(formData: FormData) {
  const captain = await requireCaptainSession();

  try {
    const teamId = actionEntityId.parse(formData.get("teamId"));
    const team = await prisma.team.findFirst({
      where: { id: teamId, captainId: captain.id },
      select: { id: true },
    });
    if (!team) throw new Error("Not authorized");

    const asset = await uploadImageAsset({
      file: formData.get("teamLogo"),
      folder: "team-logos",
      entityId: teamId,
      label: "Team logo",
      maxBytes: MAX_LOGO_IMAGE_BYTES,
      errorPath: "/captain?tab=roster",
    });
    await updateCaptainTeamLogo(captain.id, teamId, asset.url);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    return await redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(message)}`);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?tab=roster&success=team-logo-updated");
}

/** Adds a player to the captain's team. UID and IGN are required; position is optional. */
export async function captainAddPlayerAction(formData: FormData) {
  const captain = await requireCaptainSession();

  const input = z.object({
    teamId: actionEntityId,
    eventId: actionEntityId.optional(),
    displayName: z.string().trim().min(2, "UID minimal 2 karakter."),
    nickname: z.string().trim().min(2, "IGN minimal 2 karakter."),
    position: z.string().trim().optional(),
  }).parse({
    teamId: formData.get("teamId"),
    eventId: String(formData.get("eventId") ?? "") || undefined,
    displayName: formData.get("displayName"),
    nickname: formData.get("nickname"),
    position: String(formData.get("position") ?? ""),
  });

  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : undefined;

  try {
    await addPlayer({ ...input, captainId: captain.id, position: input.position ?? "", jerseyNumber });
  } catch (e) {
    const msg = toSafeActionMessage(e, "Tidak dapat menambahkan pemain.");
    return await redirectToActiveLocale("/captain?error=" + encodeURIComponent(msg));
  }
  await redirectToActiveLocale("/captain?success=player-added");
}

/**
 * Updates a player's profile. Ownership is enforced server-side via the captain's session ID;
 * the action redirects with an error if the player does not belong to the authenticated captain.
 */
export async function captainUpdatePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();

  const id = actionEntityId.parse(formData.get("playerId"));
  const jerseyRaw = formData.get("jerseyNumber");
  const jerseyNumber =
    jerseyRaw && String(jerseyRaw).trim() !== ""
      ? parseInt(String(jerseyRaw), 10)
      : null;

  const data = {
    displayName: z.string().trim().min(2).parse(formData.get("displayName")),
    nickname: z.string().trim().min(2).parse(formData.get("nickname")),
    position: String(formData.get("position") ?? "").trim(),
    jerseyNumber: jerseyNumber ?? undefined,
  };

  try {
    await updatePlayer(id, user.id, data);
  } catch {
    await redirectToActiveLocale("/captain?error=Tidak+dapat+mengedit+pemain+ini.");
  }

  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=player-updated");
}

/**
 * Removes a player. Ownership check is delegated to the repository layer;
 * any exception redirects to /captain with an error message.
 */
export async function captainDeletePlayerAction(formData: FormData) {
  const user = await requireCaptainSession();
  const id = actionEntityId.parse(formData.get("playerId"));

  try {
    await deletePlayer(id, user.id);
  } catch {
    await redirectToActiveLocale("/captain?error=Tidak+dapat+menghapus+pemain+ini.");
  }

  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=player-deleted");
}

export async function captainSetDisplayCaptainAction(formData: FormData) {
  const user = await requireCaptainSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));
  const playerId = actionEntityId.parse(formData.get("playerId"));

  try {
    await setTeamCaptainDisplay(teamId, user.id, playerId);
  } catch {
    return await redirectToActiveLocale("/captain?error=" + encodeURIComponent("Tidak dapat mengubah tampilan kapten."));
  }

  revalidatePath("/", "layout");
  await redirectToActiveLocale("/captain?success=captain-display-updated");
}

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

/** Assigns or clears the captain user for an imported team. */
export async function adminAssignCaptainAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));
  const captainUserIdRaw = String(formData.get("captainUserId") ?? "").trim();
  const captainUserId = captainUserIdRaw ? actionEntityId.parse(captainUserIdRaw) : null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, eventId: true },
  });
  if (!team?.eventId) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }
  await assertUserCanManageEvent(user, team.eventId);
  assertWorkspaceEventAction(user, team.eventId);

  if (captainUserId) {
    const captain = await prisma.user.findUnique({
      where: { id: captainUserId, role: "captain" },
      select: { id: true, name: true },
    });
    if (!captain) {
      return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Kapten tidak ditemukan.")}` as never);
    }
    await prisma.team.update({
      where: { id: teamId },
      data: { captainId: captain.id, captainName: captain.name },
    });
  } else {
    await prisma.team.update({
      where: { id: teamId },
      data: { captainId: null, captainName: null },
    });
  }

  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=captain-assigned" as never);
}

/** Deactivates a captain account (platform_admin only). Deactivated users cannot log in. */
export async function adminDeactivateUserAction(formData: FormData) {
  const user = await requireRole("platform_admin");
  if (!user) {
    return redirectToActiveLocale("/login" as never);
  }
  const targetUserId = actionEntityId.parse(formData.get("userId"));
  if (targetUserId === user.id) {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Tidak dapat menonaktifkan akun sendiri.")}` as never
    );
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } });
  if (!target || target.role !== "captain") {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Hanya akun kapten yang dapat dinonaktifkan.")}` as never
    );
  }
  await prisma.user.update({ where: { id: targetUserId }, data: { deactivatedAt: new Date() } });
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=user-deactivated" as never);
}

/** Deletes a team from a Draft-status event. Blocks if event has started. */
export async function adminDeleteTeamAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));

  let access: { eventId: string };
  try {
    access = await assertUserCanManageTeam(user, teamId);
    assertWorkspaceEventAction(user, access.eventId);
  } catch {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, eventId: access.eventId },
    include: { event: { select: { id: true, status: true } } },
  });
  if (!team?.event || !team.eventId) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent("Tim tidak ditemukan.")}` as never);
  }
  if (team.event.status !== "Draft") {
    return redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Tim hanya dapat dihapus dari event Draft.")}` as never
    );
  }
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/", "layout");
  return redirectToActiveLocale("/admin?success=team-deleted" as never);
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

/**
 * Records a BO1 match result (direct home/away score). Also auto-transitions the event
 * status from Published/Registration Closed to Ongoing if it hasn't been set yet.
 */
// Destination is selected by the authenticated role, never a client return URL.
// Callers authorize the mutation event before using this fixed route family.
function legacyMatchReturn(user: AppUser, eventId: string, matchId: string | undefined, feedback: string, success = false) {
  return user.role === "organizer"
    ? `/organizer/events/${encodeURIComponent(eventId)}/legacy-match-day?${matchId ? `matchId=${encodeURIComponent(matchId)}&` : ""}${feedback}`
    : `/admin?${success ? "phase=run&" : ""}matchEventId=${encodeURIComponent(eventId)}&${feedback}`;
}

export async function adminUpdateMatchResultAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const matchEventId = actionEntityId.parse(formData.get("matchEventId"));
  const input = z.object({
    eventId: actionEntityId,
    matchId: actionEntityId,
    homeScore: z.coerce.number().int().min(0),
    awayScore: z.coerce.number().int().min(0),
  }).parse({
    eventId: formData.get("eventId"),
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);

  let match;
  const returnEventId = user.role === "organizer" ? input.eventId : matchEventId;

  try {
    match = await setMatchResult(input);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save match result.");
    await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, `error=${encodeURIComponent(message)}`), locale);
  }

  if (!match) await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, "error=Match%20not%20found."), locale);
  await autoTransitionEventToOngoing(input.eventId);
  if (match?.roundLabel === "Final" && match.winnerTeamId) {
    try {
      await generateCertificateForFinalMatch(match.id, input.eventId);
    } catch {
      console.error("[certificate] generation failed");
    }
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, returnEventId, input.matchId, "success=match-result-updated", true), locale);
}

/**
 * Parses and imports teams from an uploaded CSV file.
 * Validates file presence, then delegates to `parseAndValidateTeamImport` for structural
 * and business-rule checks before persisting. Redirects with error on any failure.
 */
export async function adminImportTeamsCsvAction(formData: FormData) {
  const user = await requireAdminSession();

  const file = formData.get("csv");

  if (!(file instanceof File) || file.size === 0) {
    return redirectToActiveLocale("/admin?error=Please%20choose%20a%20CSV%20file%20before%20importing.");
  }
  if (file.size > MAX_TEAM_IMPORT_CSV_BYTES) {
    return redirectToActiveLocale("/admin?error=CSV%20file%20is%20too%20large.%20Maximum%20size%20is%20256%20KiB.");
  }

  const result = parseAndValidateTeamImport(
    await file.text(),
    await getImportSnapshot(user.role === "organizer" ? user : undefined),
  );

  if (!result.ok) {
    return redirectToActiveLocale(`/admin?error=${encodeURIComponent(result.message)}`);
  }

  await importTeams(result.rows);
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=teams-imported&count=${result.rows.length}`);
}

export async function adminPreviewRegistrationImportAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);
  const file = formData.get("registrationFile");
  if (!(file instanceof File) || file.size === 0) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("Pilih file XLSX atau CSV terlebih dahulu.")}` as never,
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File registrasi maksimal 5 MiB.")}` as never,
    );
  }
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".csv")) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File harus berformat .xlsx atau .csv.")}` as never,
    );
  }
  const result = await previewRegistrationImportForUser(user, formData, { legacyCompatibility: true });
  if (result.status === "preview_ready") {
    revalidatePath("/", "layout");
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${result.batchId}&success=registration-preview-ready` as never,
    );
  }
  if (result.status === "blocked" && result.legacy?.behavior === "throw") throw new Error(result.legacy.message);
  const phase = result.status === "blocked" && result.legacy?.phase === "registration" ? "registration" : "import";
  const message = result.status === "blocked" && result.legacy?.message
    ? result.legacy.message
    : result.status === "blocked" || result.status === "conflict"
      ? result.message
      : "Preview import registrasi gagal.";
  const activeEventId = result.status === "blocked" && result.legacy?.includeActiveEventId === false
    ? ""
    : `&activeEventId=${eventId}`;
  return redirectToActiveLocale(
    `/admin?phase=${phase}${activeEventId}&error=${encodeURIComponent(message)}` as never,
  );
}

export async function adminCommitRegistrationImportAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  const batchId = actionEntityId.parse(formData.get("batchId"));
  const selectedItemIds = formData.getAll("itemId").map(String).filter(Boolean);
  if (selectedItemIds.length === 0) {
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent("Pilih minimal satu baris Baru atau Berubah untuk diimport.")}` as never,
    );
  }
  const result = await commitRegistrationImportForUser(user, formData, { legacyCompatibility: true });
  if (result.status === "imported") {
    revalidateTag("teams");
    revalidatePath("/", "layout");
    return redirectToActiveLocale(
      `/admin?phase=registration&activeEventId=${eventId}&success=registration-imported&count=${result.importedCount}` as never,
    );
  }
  if (result.status === "blocked" && result.legacy?.behavior === "throw") throw new Error(result.legacy.message);
  const message = result.status === "blocked" && result.legacy?.message
    ? result.legacy.message
    : result.status === "blocked" || result.status === "conflict"
      ? result.message
      : "Import registrasi gagal.";
  return redirectToActiveLocale(
    `/admin?phase=registration&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent(message)}` as never,
  );
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

/**
 * Submits per-player match statistics for a captain's team.
 * Stat keys are parsed from form fields matching the pattern `stat_{playerId}_{statKey}`.
 * Non-numeric values default to 0.
 */
export async function captainSubmitStatsAction(formData: FormData) {
  const user = await requireRole("captain");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const { matchId, teamId, eventId } = z.object({
    matchId: actionEntityId,
    teamId: actionEntityId,
    eventId: actionEntityId,
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  await assertCaptainCanSubmitStats({ captainId: user.id, matchId, teamId, eventId });
  const context = await getPlayerStatFormContext(matchId, eventId);
  const stats = parsePlayerStatForm(formData, {
    allowedStatKeys: context.allowedStatKeys,
    scoreSlotCount: context.scoreGameNumbers?.length ?? null,
  });
  await upsertStatSubmission({ matchId, teamId, eventId, submittedBy: user.id, stats });
  revalidatePath("/captain/stats");
}

/** Approves a captain's stat submission, making it visible on the public leaderboard. */
export async function adminApproveStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = actionEntityId.parse(formData.get("submissionId"));
  await assertUserCanReviewStatSubmission(user, submissionId);
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-approved");
}

/** Rejects a stat submission with an optional rejection note shown to the captain. Defaults to "Please review and resubmit." if no note is provided. */
export async function adminRejectStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = actionEntityId.parse(formData.get("submissionId"));
  const note =
    (formData.get("rejectionNote") as string)?.trim() || "Please review and resubmit.";
  await assertUserCanReviewStatSubmission(user, submissionId);
  await rejectStatSubmission(submissionId, user.id, note);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-rejected");
}

/**
 * Writes player match statistics directly from the Admin page.
 * Bypasses the captain submission queue and upserts PlayerStat rows immediately.
 * Only allowed for Completed matches. Uses the same validation as the captain flow.
 */
export async function adminSaveMatchPlayerStatsAction(formData: FormData) {
  const user = await requireAdminSession();

  const { matchId, teamId, eventId } = z.object({
    matchId: actionEntityId,
    teamId: actionEntityId,
    eventId: actionEntityId,
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  const context = await getPlayerStatFormContext(matchId, eventId);
  const match = context.match;
  if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) throw new Error("Team is not part of this match");
  if (match.eventId !== eventId) throw new Error("Match does not belong to this event");

  const stats = parsePlayerStatForm(formData, {
    allowedStatKeys: context.allowedStatKeys,
    scoreSlotCount: context.scoreGameNumbers?.length ?? null,
  });

  await adminWriteMatchPlayerStats({ matchId, teamId, eventId, adminId: user.id, stats });
  revalidateTag("stats");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&activeEventId=${eventId}&matchId=${matchId}&success=player-stats-saved`);
}

/** Sets the Best-of-N configuration for a specific round label in an event. Valid bestOf values are 1, 3, or 5. */
export async function adminSetRoundConfigAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const input = z.object({
    eventId: actionEntityId,
    roundLabel: z.string().min(1),
    bestOf: z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }),
  }).parse({
    eventId: formData.get("eventId"),
    roundLabel: formData.get("roundLabel"),
    bestOf: formData.get("bestOf"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  assertWorkspaceEventAction(user, input.eventId);
  try {
    await upsertRoundConfig(input.eventId, input.roundLabel, input.bestOf);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save round configuration.");
    await redirectToRequestedLocale(legacyMatchReturn(user, input.eventId, undefined, `error=${encodeURIComponent(message)}`), locale);
  }
  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, input.eventId, undefined, "success=round-config-saved", true), locale);
}

/**
 * Records per-game scores for a Best-of-N match. Form fields follow the pattern
 * `game{N}_home` / `game{N}_away`; empty rows are skipped. At least one game score
 * must be provided. Also auto-transitions the event to Ongoing if needed.
 */
export async function adminSetMatchGamesAction(formData: FormData) {
  const user = await requireAdminSession();
  const locale = formData.get("locale")?.toString();

  const matchId = actionEntityId.parse(formData.get("matchId"));
  const matchEventId = actionEntityId.parse(formData.get("matchEventId"));
  // The hidden value is only a render-integrity hint. The repository resolves
  // the authoritative rule from this match's event and round in one transaction.
  z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }).parse(formData.get("bestOf"));
  await assertUserCanManageEvent(user, matchEventId);
  assertWorkspaceEventAction(user, matchEventId);

  const games: { gameNumber: number; homeScore: number; awayScore: number }[] = [];
  for (let i = 1; i <= 5; i++) {
    const homeRaw = formData.get(`game${i}_home`);
    const awayRaw = formData.get(`game${i}_away`);
    if (homeRaw === null || homeRaw === "" || awayRaw === null || awayRaw === "") continue;
    const homeScore = z.coerce.number().int().min(0).parse(homeRaw);
    const awayScore = z.coerce.number().int().min(0).parse(awayRaw);
    games.push({ gameNumber: i, homeScore, awayScore });
  }

  if (games.length === 0) {
    await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, "error=Masukkan+skor+minimal+1+game."), locale);
    return;
  }

  try {
    await setMatchGames(matchId, matchEventId, games);
  } catch (error) {
    const message = toSafeActionMessage(error, "Unable to save match games.");
    await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, `error=${encodeURIComponent(message)}`), locale);
  }

  await autoTransitionEventToOngoing(matchEventId);
  try {
    await generateCertificateForFinalMatch(matchId, matchEventId);
  } catch {
    console.error("[certificate] generation failed");
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToRequestedLocale(legacyMatchReturn(user, matchEventId, matchId, "success=match-games-saved", true), locale);
}

/** Uploads a character art PNG for an event's certificate to Vercel Blob and stores the URL. */
export async function adminUploadCharacterArtAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

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

async function uploadEventLogo(formData: FormData, returnPath: string, returnSection = "visuals") {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

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

export async function adminUploadTeamLogoAction(formData: FormData) {
  const user = await requireAdminSession();
  const teamId = actionEntityId.parse(formData.get("teamId"));

  try {
    const { eventId } = await assertUserCanManageTeam(user, teamId);
    assertWorkspaceEventAction(user, eventId);

    const asset = await uploadImageAsset({
      file: formData.get("teamLogo"),
      folder: "team-logos",
      entityId: teamId,
      label: "Team logo",
      maxBytes: MAX_LOGO_IMAGE_BYTES,
    });
    await updateTeamLogo(user, teamId, asset.url);
  } catch (err) {
    const message = toSafeActionMessage(err, "Upload failed");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?success=team-logo-uploaded`);
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

/**
 * Re-renders the champion certificate for an event, replacing whatever is stored.
 *
 * Used to recover from a failed generation (headless Chromium is the usual culprit) and to pick up
 * a new accent color or character art. Rate limited because each run boots a browser.
 */
export async function adminRegenerateCertificateAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = actionEntityId.parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);
  assertWorkspaceEventAction(user, eventId);

  if (!checkRateLimit(`cert-regen:${eventId}`, 3, 5 * 60 * 1000)) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.")}`,
    );
  }

  const finalMatch = await prisma.match.findFirst({
    where: { eventId, roundLabel: "Final", winnerTeamId: { not: null } },
  });
  const winnerTeamId = finalMatch?.winnerTeamId;
  if (!winnerTeamId) {
    await redirectToActiveLocale(
      `/admin?error=${encodeURIComponent("Belum ada juara. Simpan hasil match Final terlebih dahulu.")}`,
    );
    return;
  }

  try {
    const { generateCertificate } = await import("@/lib/certificate/generate");
    await generateCertificate(eventId, winnerTeamId);
  } catch (err) {
    const message = toSafeActionMessage(err, "Certificate generation failed");
    revalidatePath("/admin");
    await redirectToActiveLocale(`/admin?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  await redirectToActiveLocale(`/admin?success=certificate-regenerated`);
}

/**
 * Requests a password reset link for a captain account.
 * Always redirects to sent=1 regardless of whether the email exists (security best practice).
 * Queues the reset link through Next's post-response hook; sendEmail() itself never throws on delivery failure.
 */
export async function requestPasswordResetAction(formData: FormData) {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = z.string().email().safeParse(emailRaw);
  if (!email.success) {
    return redirectToActiveLocale(
      `/forgot-password?error=${encodeURIComponent("Format email tidak valid.")}` as never,
    );
  }
  const requestIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`password-reset-request:${requestIp}`, 5, 15 * 60 * 1000)) {
    return redirectToActiveLocale("/forgot-password?sent=1" as never);
  }

  try {
    const user = await getUserByEmail(email.data);
    after(async () => {
      try {
        await equalizePasswordResetResponse(async () => {
          if (!user || user.role !== "captain") return;

          const token = await createPasswordResetToken(user.id);
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
          const resetUrl = `${appUrl}/forgot-password/reset?token=${token}`;
          await sendEmail({
            to: email.data,
            subject: "Reset Password Miracle League",
            html: `<p>Klik link berikut untuk reset password kamu: <a href="${resetUrl}">${resetUrl}</a></p><p>Link berlaku 30 menit.</p>`,
          });
        });
      } catch {
        // Keep background delivery failures generic and free of user data.
        console.error("[requestPasswordResetAction] reset delivery failed");
      }
    });
  } catch {
    // Keep lookup/scheduling failures indistinguishable to callers.
    console.error("[requestPasswordResetAction] reset delivery failed");
  }
  // Always redirect to sent=1 regardless of whether email exists (security)
  return redirectToActiveLocale("/forgot-password?sent=1" as never);
}

/**
 * Resets a captain's password using a one-time token.
 * Validates token length, password length, and confirmation match before consuming the token.
 */
export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const requestIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`password-reset-consume:${requestIp}`, 5, 15 * 60 * 1000)) {
    return redirectToActiveLocale(
      `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Token tidak valid atau sudah kadaluarsa.")}` as never,
    );
  }

  if (!token || token.length < 64) {
    return redirectToActiveLocale(
      `/forgot-password/reset?error=${encodeURIComponent("Token tidak valid.")}` as never,
    );
  }
  if (password.length < 8) {
    return redirectToActiveLocale(
      `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Password minimal 8 karakter.")}` as never,
    );
  }
  if (password !== confirm) {
    return redirectToActiveLocale(
      `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Password tidak sama.")}` as never,
    );
  }

  const newHash = await bcrypt.hash(password, 10);

  try {
    await consumePasswordResetToken(token, newHash);
  } catch {
    return redirectToActiveLocale(
      `/forgot-password/reset?token=${token}&error=${encodeURIComponent("Token tidak valid atau sudah kadaluarsa.")}` as never,
    );
  }

  return redirectToActiveLocale(
    `/login?message=${encodeURIComponent("Password berhasil direset. Silakan login.")}` as never,
  );
}

// Next's server-action compiler requires explicit async function exports.
export async function approveEventPaymentAction(formData: FormData) {
  return eventRegistrationActions.approveEventPaymentAction(formData);
}
export async function commitEventRegistrationImportAction(formData: FormData) {
  return eventRegistrationActions.commitEventRegistrationImportAction(formData);
}
export async function previewEventRegistrationImportAction(formData: FormData) {
  return eventRegistrationActions.previewEventRegistrationImportAction(formData);
}
export async function publishEventQrisAction(formData: FormData) {
  return eventRegistrationActions.publishEventQrisAction(formData);
}
export async function rejectEventPaymentAction(formData: FormData) {
  return eventRegistrationActions.rejectEventPaymentAction(formData);
}
export async function saveEventQrisDraftAction(formData: FormData) {
  return eventRegistrationActions.saveEventQrisDraftAction(formData);
}
