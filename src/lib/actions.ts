"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { changePasswordAction as changePasswordIdentityAction } from "@/modules/identity";
import {
  adminArchiveEventAction as adminArchiveEventActionFromModule,
  adminCreateEventAction as adminCreateEventActionFromModule,
  adminUpdateEventPublicInfoAction as adminUpdateEventPublicInfoActionFromModule,
  adminUpdateEventStatusAction as adminUpdateEventStatusActionFromModule,
} from "@/modules/events";
import {
  adminActivateEventVisualAction as adminActivateEventVisualActionFromModule,
  adminApproveEventVisualAction as adminApproveEventVisualActionFromModule,
  adminRejectEventVisualAction as adminRejectEventVisualActionFromModule,
  adminSetEventVisualFocalPointAction as adminSetEventVisualFocalPointActionFromModule,
  adminUploadEventVisualAction as adminUploadEventVisualActionFromModule,
  organizerUploadEventVisualAction as organizerUploadEventVisualActionFromModule,
} from "@/modules/visual-assets";
import {
  adminRegenerateCertificateAction as adminRegenerateCertificateActionFromModule,
  adminSetAccentColorAction as adminSetAccentColorActionFromModule,
  adminUploadCharacterArtAction as adminUploadCharacterArtActionFromModule,
} from "@/modules/certificates";
import {
  adminAssignCaptainAction as adminAssignCaptainActionFromModule,
  adminDeleteTeamAction as adminDeleteTeamActionFromModule,
  adminUploadTeamLogoAction as adminUploadTeamLogoActionFromModule,
  captainAddPlayerAction as captainAddPlayerActionFromModule,
  captainDeletePlayerAction as captainDeletePlayerActionFromModule,
  captainSetDisplayCaptainAction as captainSetDisplayCaptainActionFromModule,
  captainUpdatePlayerAction as captainUpdatePlayerActionFromModule,
  captainUploadTeamLogoAction as captainUploadTeamLogoActionFromModule,
} from "@/modules/teams";
import {
  adminApprovePaymentAction as adminApprovePaymentActionFromModule,
  adminRejectPaymentAction as adminRejectPaymentActionFromModule,
  adminUpdatePaymentSettingsAction as adminUpdatePaymentSettingsActionFromModule,
  captainRegisterTeamAction as captainRegisterTeamActionFromModule,
  captainSaveDraftTeamAction as captainSaveDraftTeamActionFromModule,
  captainUploadPaymentProofAction as captainUploadPaymentProofActionFromModule,
} from "@/modules/registrations";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/platform/db";
import { createPasswordResetToken, consumePasswordResetToken } from "@/lib/platform/password-reset";
import { routing } from "@/i18n/routing";
import { requireRole, signIn } from "@/lib/auth/session";
import { buildRegistrationPreview, parseRegistrationSource, suggestRegistrationMapping } from "@/lib/imports/registration-intake";
import { parseAndValidateTeamImport } from "@/lib/imports/team-import";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { isDisposableEmail } from "@/lib/validation/email";
import { validateTeamData } from "@/lib/validation/team-data";
import { getGameModeConfig } from "@/lib/platform/config";
import type { AppUser } from "@/lib/platform/types";
import {
  approveStatSubmission,
  approveTeamRegistrationRequest,
  assertCaptainCanSubmitStats,
  assertUserCanManageEvent,
  assertUserCanReviewStatSubmission,
  createCaptainAccount,
  createOrUpdateCaptainDraftTeam,
  createTeamRegistrationRequest,
  getImportSnapshot,
  getUserByEmail,
  autoTransitionEventToOngoing,
  importTeams,
  saveRegistrationImportPreviewBatch,
  commitRegistrationImportBatch,
  registerTeam,
  rejectStatSubmission,
  rejectTeamRegistrationRequest,
  setMatchGames,
  setMatchResult,
  updatePaymentSettings,
  updateTeamRegistrationProof,
  updateEventStream,
  updateEventBrandAssets,
  upsertRoundConfig,
  upsertStatSubmission,
  adminWriteMatchPlayerStats,
} from "@/lib/platform/repository";
import fs from "fs";
import path from "path";

const MAX_TEAM_IMPORT_CSV_BYTES = 256 * 1024;
const MAX_REGISTRATION_INTAKE_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;
const MAX_QRIS_IMAGE_BYTES = 2 * 1024 * 1024;

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

async function redirectToRequestedLocale(path: string, locale?: string): Promise<never> {
  if (locale && routing.locales.includes(locale as "id" | "en")) {
    const [pathname, search = ""] = path.split("?");
    const query = search ? `?${search}` : "";
    const target = pathname === "/" ? `/${locale}${query}` : `/${locale}${pathname}${query}`;
    redirect(target);
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

type UploadedImageAsset = {
  url: string;
  mimeType: string;
  width: number;
  height: number;
};

function appendActionError(basePath: string, message: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}error=${encodeURIComponent(message)}`;
}

/**
 * Single validation + storage boundary for every admin image upload.
 * Checks, in order: entity id shape, presence, byte size, declared MIME,
 * magic bytes, and finally real decodability through `sharp` (which also gives
 * the dimensions we persist on a visual revision).
 */
async function uploadImageAsset({
  file,
  folder,
  entityId,
  label,
  maxBytes,
  errorPath = "/admin",
}: {
  file: FormDataEntryValue | null;
  folder: string;
  entityId: string;
  label: string;
  maxBytes: number;
  errorPath?: string;
}): Promise<UploadedImageAsset> {
  if (!isSafeEntityId(entityId)) {
    redirect(appendActionError(errorPath, `Invalid ${label} ID.`) as never);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(appendActionError(errorPath, `No ${label} file uploaded.`) as never);
  }
  if (file.size > maxBytes) {
    redirect(appendActionError(errorPath, `${label} file is too large.`) as never);
  }

  const extension = getImageExtension(file.type);
  if (!extension) {
    redirect(appendActionError(errorPath, `${label} must be a PNG, JPEG, or WebP image.`) as never);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasImageSignature(buffer, extension)) {
    redirect(appendActionError(errorPath, `${label} file content does not match its image type.`) as never);
  }

  const mimeType = file.type || "image/png";
  const dimensions = await readImageDimensions(buffer);
  if (!dimensions) {
    redirect(appendActionError(errorPath, `${label} file could not be decoded as an image.`) as never);
  }

  const filename = `${entityId}-${Date.now()}.${extension}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(`${folder}/${filename}`, buffer, {
      access: "public",
      contentType: mimeType,
    });
    return { url: result.url, mimeType, ...dimensions };
  }

  const dir = path.join(process.cwd(), "public", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { url: `/${folder}/${filename}`, mimeType, ...dimensions };
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
    const { generateCertificateIfFinal } = await import("@/modules/certificates");
    await generateCertificateIfFinal(matchId, eventId);
  } catch (err) {
    console.error(`Certificate generation failed for event ${eventId}:`, err);
  }
}

function isSafeStatToken(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return false;
  return !["__proto__", "constructor", "prototype"].includes(value);
}

/**
 * Registers a new captain account without requiring an active event.
 * Team draft and event registration happen later from the captain dashboard.
 */
export async function captainSignUpAction(formData: FormData) {
  const signUpError = async (msg: string) =>
    redirectToActiveLocale(`/register?error=${encodeURIComponent(msg)}` as never);

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || fullName.length < 2) await signUpError("Nama lengkap minimal 2 karakter.");
  if (!z.string().email().safeParse(email).success) await signUpError("Format email tidak valid.");
  if (password.length < 8) await signUpError("Password minimal 8 karakter.");

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
    const msg = err instanceof Error ? err.message : "Gagal membuat akun.";
    await signUpError(msg);
  }

  const result = await signIn(email, password);
  if (!result.ok) await signUpError("Akun berhasil dibuat, tapi login gagal. Silakan login manual.");

  await redirectToActiveLocale("/captain?success=registered" as never);
}

/** Authenticates a user by email/password and redirects to /admin or /captain based on role. */
export async function loginAction(formData: FormData) {
  const requestedLocale = String(formData.get("locale") ?? "").trim();
  const email = z.string().email().parse(formData.get("email"));
  const password = z.string().min(1).parse(formData.get("password"));
  let result;

  try {
    result = await signIn(email, password);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return await redirectToRequestedLocale("/login?error=database", requestedLocale);
    }

    throw error;
  }

  if (!result.ok) {
    return await redirectToRequestedLocale("/login?error=invalid", requestedLocale);
  }

  const user = result.user;
  if (!user) {
    return await redirectToRequestedLocale("/login?error=invalid", requestedLocale);
  }

  await redirectToRequestedLocale(
    user.role === "platform_admin" || user.role === "organizer" || user.role === "admin" ? "/admin" : "/captain",
    requestedLocale,
  );
}

/** Registers a team for a published event. Captain ID comes from the authenticated session, not the form. */
export const captainRegisterTeamAction = captainRegisterTeamActionFromModule;

export const captainSaveDraftTeamAction = captainSaveDraftTeamActionFromModule;


export const captainUploadPaymentProofAction = captainUploadPaymentProofActionFromModule;

export const adminUpdatePaymentSettingsAction = adminUpdatePaymentSettingsActionFromModule;

export const adminApprovePaymentAction = adminApprovePaymentActionFromModule;

export const adminRejectPaymentAction = adminRejectPaymentActionFromModule;
/**
 * Changes the captain's password after verifying the current one.
 * Validates that new and confirm passwords match and meet the 8-character minimum.
 */
export async function changePasswordAction(formData: FormData) {
  return changePasswordIdentityAction(formData);
}

export async function captainUploadTeamLogoAction(formData: FormData) {
  return captainUploadTeamLogoActionFromModule(formData);
}

/** Adds a player to the captain's team. UID and IGN are required; position is optional. */
export async function captainAddPlayerAction(formData: FormData) {
  return captainAddPlayerActionFromModule(formData);
}

/**
 * Updates a player's profile. Ownership is enforced server-side via the captain's session ID;
 * the action redirects with an error if the player does not belong to the authenticated captain.
 */
export async function captainUpdatePlayerAction(formData: FormData) {
  return captainUpdatePlayerActionFromModule(formData);
}

/**
 * Removes a player. Ownership check is delegated to the repository layer;
 * any exception redirects to /captain with an error message.
 */
export async function captainDeletePlayerAction(formData: FormData) {
  return captainDeletePlayerActionFromModule(formData);
}

export async function captainSetDisplayCaptainAction(formData: FormData) {
  return captainSetDisplayCaptainActionFromModule(formData);
}

/** Creates a new tournament event. Supported participant caps: 8, 12, 16, 24, 32, 64, 128, 256. */
export async function adminCreateEventAction(formData: FormData) {
  return adminCreateEventActionFromModule(formData);
}

/** Changes an event's lifecycle status (Draft → Published → Registration Closed → Ongoing → Finished). */
export async function adminUpdateEventStatusAction(formData: FormData) {
  return adminUpdateEventStatusActionFromModule(formData);
}

/** Assigns or clears the captain user for an imported team. */
export async function adminAssignCaptainAction(formData: FormData) {
  return adminAssignCaptainActionFromModule(formData);
}

/** Deactivates a captain account (platform_admin only). Deactivated users cannot log in. */
export async function adminDeactivateUserAction(formData: FormData) {
  const user = await requireRole("platform_admin");
  if (!user) {
    return redirectToActiveLocale("/login" as never);
  }
  const targetUserId = z.string().min(1).parse(formData.get("userId"));
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
  return adminDeleteTeamActionFromModule(formData);
}

/** Archives event (sets to Finished) or hard-deletes Draft events with no teams. */
export async function adminArchiveEventAction(formData: FormData) {
  return adminArchiveEventActionFromModule(formData);
}

/**
 * Records a BO1 match result (direct home/away score). Also auto-transitions the event
 * status from Published/Registration Closed to Ongoing if it hasn't been set yet.
 */
export async function adminUpdateMatchResultAction(formData: FormData) {
  const user = await requireAdminSession();

  const matchEventId = z.string().min(1).parse(formData.get("matchEventId"));
  const input = z.object({
    eventId: z.string().min(1),
    matchId: z.string().min(1),
    homeScore: z.coerce.number().int().min(0),
    awayScore: z.coerce.number().int().min(0),
  }).parse({
    eventId: formData.get("eventId"),
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  await assertUserCanManageEvent(user, input.eventId);

  let match;

  try {
    match = await setMatchResult(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match result.";
    await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  if (!match) await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=Match%20not%20found.` as never);
  await autoTransitionEventToOngoing(input.eventId);
  if (match?.roundLabel === "Final" && match.winnerTeamId) {
    try {
      await generateCertificateForFinalMatch(match.id, input.eventId);
    } catch (err) {
      console.error("[certificate] generation failed:", err);
    }
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&matchEventId=${matchEventId}&success=match-result-updated` as never);
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
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const file = formData.get("registrationFile");
  const worksheetName = String(formData.get("worksheetName") ?? "").trim() || undefined;

  await assertUserCanManageEvent(user, eventId);

  if (!(file instanceof File) || file.size === 0) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("Pilih file XLSX atau CSV terlebih dahulu.")}` as never,
    );
  }
  if (file.size > MAX_REGISTRATION_INTAKE_BYTES) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File registrasi maksimal 5 MiB.")}` as never,
    );
  }

  const lowerName = file.name.toLowerCase();
  const kind = lowerName.endsWith(".xlsx") ? "xlsx" : lowerName.endsWith(".csv") ? "csv" : null;
  if (!kind) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File harus berformat .xlsx atau .csv.")}` as never,
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      teams: {
        include: {
          players: {
            select: { nickname: true, displayName: true, position: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!event) {
    return redirectToActiveLocale(`/admin?phase=import&error=${encodeURIComponent("Event tidak ditemukan.")}` as never);
  }

  let parsed;
  try {
    parsed = await parseRegistrationSource({
      kind,
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      worksheetName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File registrasi tidak dapat dibaca.";
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent(message)}` as never,
    );
  }

  const worksheet = parsed.worksheets[0];
  if (!worksheet || worksheet.rows.length < 2) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent("File perlu header dan minimal satu baris registrasi.")}` as never,
    );
  }

  const mode = getGameModeConfig(event.gameModeId);
  const headers = worksheet.rows[0].map((cell) => cell.value);
  const mapping = suggestRegistrationMapping(headers, { maxRosterSize: mode.maxRosterSize });
  const missingRequired = [
    ["teamName", "nama tim"],
    ["captainName", "nama kapten"],
  ].filter(([key]) => mapping.columns[key as keyof typeof mapping.columns] == null);
  if (missingRequired.length > 0) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&error=${encodeURIComponent(`Mapping wajib belum ditemukan: ${missingRequired.map(([, label]) => label).join(", ")}.`)}` as never,
    );
  }

  const rows = worksheet.rows.slice(1).map((row, index) => ({
    sourceRow: index + 2,
    cells: row.map((cell) => cell.value),
    formulaColumns: row
      .map((cell, columnIndex) => (cell.formula ? columnIndex : -1))
      .filter((columnIndex) => columnIndex >= 0),
  }));
  const emailColumn = mapping.columns.captainEmail;
  const emailValues = emailColumn == null
    ? []
    : rows.map((row) => row.cells[emailColumn]?.trim().toLowerCase()).filter(Boolean);
  const existingUsers = emailValues.length
    ? await prisma.user.findMany({
        where: { email: { in: [...new Set(emailValues)] } },
        select: { id: true, email: true, role: true },
      })
    : [];

  const preview = buildRegistrationPreview({
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      participantCap: event.participantCap,
      bracketLocked: await import("@/lib/platform/repository").then((repo) => repo.isEventBracketLocked(event.id)),
      maxRosterSize: mode.maxRosterSize,
    },
    existingTeams: event.teams.map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      captainName: team.captainName,
      captainContact: team.captainContact,
      players: team.players,
    })),
    existingUsers,
    rows,
    mapping,
  });

  const batch = await saveRegistrationImportPreviewBatch({
    user,
    eventId,
    sourceKind: parsed.sourceKind,
    sourceLabel: file.name,
    worksheetName: worksheet.name,
    headerSignature: headers.join("|").toLowerCase(),
    mapping,
    items: preview.items,
    summary: preview.summary,
  });

  revalidatePath("/", "layout");
  return redirectToActiveLocale(
    `/admin?phase=import&activeEventId=${eventId}&registrationBatchId=${batch.id}&success=registration-preview-ready` as never,
  );
}

export async function adminCommitRegistrationImportAction(formData: FormData) {
  const user = await requireAdminSession();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const batchId = z.string().min(1).parse(formData.get("batchId"));
  const selectedItemIds = formData.getAll("itemId").map((value) => String(value)).filter(Boolean);

  if (selectedItemIds.length === 0) {
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent("Pilih minimal satu baris Baru atau Berubah untuk diimport.")}` as never,
    );
  }

  try {
    const result = await commitRegistrationImportBatch(user, batchId, selectedItemIds);
    revalidateTag("teams");
    revalidatePath("/", "layout");
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&success=registration-imported&count=${result.importedCount}` as never,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import registrasi gagal.";
    return redirectToActiveLocale(
      `/admin?phase=import&activeEventId=${eventId}&registrationBatchId=${batchId}&error=${encodeURIComponent(message)}` as never,
    );
  }
}

/** Updates the live-stream URL and label for an event. URL must be a valid absolute URL. */
export async function adminUpdateStreamAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    url: z.string().refine(isHttpUrl, "Stream URL must use http or https."),
    label: z.string().min(2),
  }).parse({
    eventId: formData.get("eventId"),
    url: formData.get("url"),
    label: formData.get("label"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  await updateEventStream(input.eventId, input.url, input.label);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stream-updated");
}

export async function adminUpdateEventPublicInfoAction(formData: FormData) {
  return adminUpdateEventPublicInfoActionFromModule(formData);
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
    matchId: z.string().min(1),
    teamId: z.string().min(1),
    eventId: z.string().min(1),
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  // Collect all stat keys in form: stat_{playerId}_{statKey}
  const stats: Record<string, Record<string, number>> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^stat_(.+)_(.+)$/);
    if (!m) continue;
    const [, playerId, statKey] = m;
    if (!isSafeStatToken(playerId) || !isSafeStatToken(statKey)) {
      throw new Error("Invalid stat field name.");
    }
    const parsedValue = z.coerce.number().int().min(0).max(9999).parse(value);
    if (!stats[playerId]) stats[playerId] = {};
    stats[playerId][statKey] = parsedValue;
  }

  await assertCaptainCanSubmitStats({ captainId: user.id, matchId, teamId, eventId });
  await upsertStatSubmission({ matchId, teamId, eventId, submittedBy: user.id, stats });
  revalidatePath("/captain/stats");
}

/** Approves a captain's stat submission, making it visible on the public leaderboard. */
export async function adminApproveStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
  await assertUserCanReviewStatSubmission(user, submissionId);
  await approveStatSubmission(submissionId, user.id);
  revalidatePath("/", "layout");
  await redirectToActiveLocale("/admin?success=stat-approved");
}

/** Rejects a stat submission with an optional rejection note shown to the captain. Defaults to "Please review and resubmit." if no note is provided. */
export async function adminRejectStatAction(formData: FormData) {
  const user = await requireAdminSession();
  const submissionId = formData.get("submissionId") as string;
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
    matchId: z.string().min(1),
    teamId: z.string().min(1),
    eventId: z.string().min(1),
  }).parse({
    matchId: formData.get("matchId"),
    teamId: formData.get("teamId"),
    eventId: formData.get("eventId"),
  });

  await assertUserCanManageEvent(user, eventId);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true, homeTeamId: true, awayTeamId: true, eventId: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.status !== "Completed") throw new Error("Stats can only be entered for completed matches");
  if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) throw new Error("Team is not part of this match");
  if (match.eventId !== eventId) throw new Error("Match does not belong to this event");

  const stats: Record<string, Record<string, number>> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^stat_(.+)_(.+)$/);
    if (!m) continue;
    const [, playerId, statKey] = m;
    if (!isSafeStatToken(playerId) || !isSafeStatToken(statKey)) {
      throw new Error("Invalid stat field name.");
    }
    const parsedValue = z.coerce.number().int().min(0).max(9999).parse(value);
    if (!stats[playerId]) stats[playerId] = {};
    stats[playerId][statKey] = parsedValue;
  }

  await adminWriteMatchPlayerStats({ matchId, teamId, eventId, adminId: user.id, stats });
  revalidateTag("stats");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&activeEventId=${eventId}&matchId=${matchId}&success=player-stats-saved`);
}

/** Sets the Best-of-N configuration for a specific round label in an event. Valid bestOf values are 1, 3, or 5. */
export async function adminSetRoundConfigAction(formData: FormData) {
  const user = await requireAdminSession();

  const input = z.object({
    eventId: z.string().min(1),
    roundLabel: z.string().min(1),
    bestOf: z.coerce.number().int().refine((n) => [1, 3, 5].includes(n), { message: "bestOf must be 1, 3, or 5" }),
  }).parse({
    eventId: formData.get("eventId"),
    roundLabel: formData.get("roundLabel"),
    bestOf: formData.get("bestOf"),
  });

  await assertUserCanManageEvent(user, input.eventId);
  await upsertRoundConfig(input.eventId, input.roundLabel, input.bestOf);
  revalidateTag("teams");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&matchEventId=${input.eventId}&success=round-config-saved` as never);
}

/**
 * Records per-game scores for a Best-of-N match. Form fields follow the pattern
 * `game{N}_home` / `game{N}_away`; empty rows are skipped. At least one game score
 * must be provided. Also auto-transitions the event to Ongoing if needed.
 */
export async function adminSetMatchGamesAction(formData: FormData) {
  const user = await requireAdminSession();

  const matchId = z.string().min(1).parse(formData.get("matchId"));
  const matchEventId = z.string().min(1).parse(formData.get("matchEventId"));
  const bestOf = z.coerce.number().int().min(1).max(5).parse(formData.get("bestOf"));
  await assertUserCanManageEvent(user, matchEventId);

  const games: { gameNumber: number; homeScore: number; awayScore: number }[] = [];
  for (let i = 1; i <= bestOf; i++) {
    const homeRaw = formData.get(`game${i}_home`);
    const awayRaw = formData.get(`game${i}_away`);
    if (homeRaw === null || homeRaw === "" || awayRaw === null || awayRaw === "") continue;
    const homeScore = z.coerce.number().int().min(0).parse(homeRaw);
    const awayScore = z.coerce.number().int().min(0).parse(awayRaw);
    games.push({ gameNumber: i, homeScore, awayScore });
  }

  if (games.length === 0) {
    await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=Masukkan+skor+minimal+1+game.` as never);
    return;
  }

  try {
    await setMatchGames(matchId, matchEventId, games, bestOf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save match games.";
    await redirectToActiveLocale(`/admin?matchEventId=${matchEventId}&error=${encodeURIComponent(message)}` as never);
  }

  await autoTransitionEventToOngoing(matchEventId);
  try {
    await generateCertificateForFinalMatch(matchId, matchEventId);
  } catch (err) {
    console.error("[certificate] generation failed:", err);
  }
  revalidateTag("teams");
  revalidateTag("events");
  revalidatePath("/", "layout");
  await redirectToActiveLocale(`/admin?phase=run&matchEventId=${matchEventId}&success=match-games-saved` as never);
}

/**
 * Certificate character-art upload, accent-color, and regeneration workflows now live in
 * `@/modules/certificates`; these are thin re-exports for existing callers.
 */
export async function adminUploadCharacterArtAction(formData: FormData) {
  return adminUploadCharacterArtActionFromModule(formData);
}

async function uploadEventLogo(formData: FormData, returnPath: string) {
  const user = await requireAdminSession();
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  await assertUserCanManageEvent(user, eventId);

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
    const message = err instanceof Error ? err.message : "Upload failed";
    redirect(appendActionError(returnPath, message) as never);
  }

  revalidateTag("events");
  revalidatePath("/", "layout");
  redirect(`${returnPath}?success=event-logo-uploaded#section-visuals` as never);
}

export async function adminUploadEventLogoAction(formData: FormData) {
  return uploadEventLogo(formData, "/admin");
}

export async function organizerUploadEventLogoAction(formData: FormData) {
  const eventId = z.string().min(1).parse(formData.get("eventId"));
  const locale = z.enum(["id", "en"]).parse(formData.get("locale"));
  return uploadEventLogo(formData, `/${locale}/organizer/events/${eventId}/overview`);
}

/**
 * Visual asset upload/approval/rejection/focal-point workflows now live in
 * `@/modules/visual-assets`; these are thin re-exports for existing callers.
 */
export async function adminUploadEventVisualAction(formData: FormData) {
  return adminUploadEventVisualActionFromModule(formData);
}

export async function organizerUploadEventVisualAction(formData: FormData) {
  return organizerUploadEventVisualActionFromModule(formData);
}

export async function adminApproveEventVisualAction(formData: FormData) {
  return adminApproveEventVisualActionFromModule(formData);
}

export async function adminRejectEventVisualAction(formData: FormData) {
  return adminRejectEventVisualActionFromModule(formData);
}

export async function adminActivateEventVisualAction(formData: FormData) {
  return adminActivateEventVisualActionFromModule(formData);
}

export async function adminSetEventVisualFocalPointAction(formData: FormData) {
  return adminSetEventVisualFocalPointActionFromModule(formData);
}


export async function adminUploadTeamLogoAction(formData: FormData) {
  return adminUploadTeamLogoActionFromModule(formData);
}

export async function adminSetAccentColorAction(formData: FormData) {
  return adminSetAccentColorActionFromModule(formData);
}

export async function adminRegenerateCertificateAction(formData: FormData) {
  return adminRegenerateCertificateActionFromModule(formData);
}

/**
 * Requests a password reset link for a captain account.
 * Always redirects to sent=1 regardless of whether the email exists (security best practice).
 * Sends the reset link via sendEmail(), which itself never throws on delivery failure.
 */
export async function requestPasswordResetAction(formData: FormData) {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = z.string().email().safeParse(emailRaw);
  if (!email.success) {
    return redirectToActiveLocale(
      `/forgot-password?error=${encodeURIComponent("Format email tidak valid.")}` as never,
    );
  }
  const user = await getUserByEmail(email.data);
  if (user && user.role === "captain") {
    const token = await createPasswordResetToken(user.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const resetUrl = `${appUrl}/forgot-password/reset?token=${token}`;
    try {
      await sendEmail({
        to: email.data,
        subject: "Reset Password Miracle League",
        html: `<p>Klik link berikut untuk reset password kamu: <a href="${resetUrl}">${resetUrl}</a></p><p>Link berlaku 1 jam.</p>`,
      });
    } catch (err) {
      // Never let an email-delivery failure change the response the caller sees (security).
      console.error(`[requestPasswordResetAction] sendEmail threw for ${email.data}:`, err);
    }
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
