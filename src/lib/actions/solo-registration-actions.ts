"use server";

import { revalidatePath } from "next/cache";

import { uploadImageAsset } from "@/lib/actions/shared/uploads";
import { requireRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { withServerActionLog } from "@/lib/observability/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserFacingError, toSafeActionMessage } from "@/lib/security/public-error";
import { isSafeEntityId } from "@/lib/security/request-guard";
import { findEventSlug, findOwnSoloRegistration } from "@/lib/solo/lookups";
import { parseSoloRegistrationForm } from "@/lib/solo/registration-form";
import {
  registerSoloAndAnnounce,
  uploadSoloProofAndAnnounce,
  withdrawSoloAndAnnounce,
} from "@/lib/solo/registration-service";

import { redirectToLocale } from "./locale-redirect";

const ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;
const TOO_MANY_ATTEMPTS = "Terlalu banyak percobaan. Coba lagi dalam 15 menit.";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const registerPath = (slug: string) => `/events/${slug}/register`;

function pathWith(base: string, key: "error" | "success", value: string) {
  return `${base}?${new URLSearchParams({ [key]: value })}`;
}

/** Sends the person back to the event page with a message, or to the event list when the page is unknown. */
function backTo(slug: string | null, locale: string, key: "error" | "success", value: string) {
  return redirectToLocale(pathWith(slug ? registerPath(slug) : "/events", key, value), locale);
}

function describeFailure(error: unknown, fallback: string) {
  return error instanceof UserFacingError ? error.message : toSafeActionMessage(error, fallback);
}

/** Registers the signed-in player for a solo event and reports the outcome on the event page. */
export async function registerSoloAction(formData: FormData): Promise<never> {
  return withServerActionLog("solo_register", "/server-actions/solo-register", () => register(formData));
}

async function register(formData: FormData): Promise<never> {
  const locale = text(formData, "locale");
  if (!isFeatureEnabled("solo_tournament_v1")) return backTo(null, locale, "error", "Pendaftaran solo belum dibuka.");

  const eventId = text(formData, "eventId");
  const event = isSafeEntityId(eventId)
    ? await findEventSlug(eventId)
    : null;
  if (!event) return backTo(null, locale, "error", "Event tidak ditemukan.");

  const player = await requireRole("player");
  if (!player) {
    return redirectToLocale(`/login?${new URLSearchParams({ returnTo: registerPath(event.slug) })}`, locale);
  }

  const parsed = parseSoloRegistrationForm({
    eventId,
    ign: text(formData, "ign"),
    uid: text(formData, "uid"),
    primaryPosition: text(formData, "primaryPosition"),
    secondaryPosition: text(formData, "secondaryPosition"),
    willingCaptain: text(formData, "willingCaptain"),
    whatsapp: text(formData, "whatsapp"),
    shareContact: text(formData, "shareContact"),
  });
  if (!parsed.ok) return backTo(event.slug, locale, "error", parsed.message);
  if (!(await checkRateLimit(`solo-register:${player.id}:${eventId}`, ATTEMPTS, WINDOW_MS))) {
    return backTo(event.slug, locale, "error", TOO_MANY_ATTEMPTS);
  }

  // A redirect works by throwing, so it must stay outside the try block or the catch would swallow it.
  let outcome: string;
  try {
    outcome = (await registerSoloAndAnnounce({ ...parsed.data, userId: player.id })).outcome;
  } catch (error) {
    return backTo(event.slug, locale, "error", describeFailure(error, "Gagal mendaftar. Coba lagi."));
  }
  revalidatePath(registerPath(event.slug));
  return backTo(event.slug, locale, "success", outcome);
}

async function findOwnRegistration(formData: FormData, userId: string) {
  const registrationId = text(formData, "registrationId");
  if (!isSafeEntityId(registrationId)) return { registrationId, slug: null, valid: false as const };
  const row = await findOwnSoloRegistration(registrationId, userId);
  return { registrationId, slug: row?.event.slug ?? null, valid: true as const, found: Boolean(row) };
}

/** Attaches a payment proof image to the signed-in player's own registration. */
export async function uploadSoloProofAction(formData: FormData): Promise<never> {
  return withServerActionLog("solo_proof_upload", "/server-actions/solo-proof-upload", () => uploadProof(formData));
}

async function uploadProof(formData: FormData): Promise<never> {
  const locale = text(formData, "locale");
  const player = await requireRole("player");
  if (!player) return redirectToLocale("/login", locale);

  const own = await findOwnRegistration(formData, player.id);
  if (!own.valid) return backTo(null, locale, "error", "Pendaftaran tidak valid.");
  if (!own.slug) return backTo(null, locale, "error", "Pendaftaran tidak ditemukan.");
  if (!(await checkRateLimit(`solo-proof:${player.id}:${own.registrationId}`, ATTEMPTS, WINDOW_MS))) {
    return backTo(own.slug, locale, "error", TOO_MANY_ATTEMPTS);
  }

  try {
    const asset = await uploadImageAsset({
      file: formData.get("paymentProof"),
      folder: "payment-proofs",
      entityId: own.registrationId,
      label: "Payment proof",
      maxBytes: MAX_PAYMENT_PROOF_BYTES,
      validationMode: "throw",
      errorPath: registerPath(own.slug),
    });
    await uploadSoloProofAndAnnounce({ userId: player.id, registrationId: own.registrationId, proofImageUrl: asset.url });
  } catch (error) {
    return backTo(own.slug, locale, "error", describeFailure(error, "Gagal mengunggah bukti bayar."));
  }
  revalidatePath(registerPath(own.slug));
  return backTo(own.slug, locale, "success", "payment-proof-uploaded");
}

/** Lets the signed-in player leave a solo event while registration is open. */
export async function withdrawSoloAction(formData: FormData): Promise<never> {
  return withServerActionLog("solo_withdraw", "/server-actions/solo-withdraw", () => withdraw(formData));
}

async function withdraw(formData: FormData): Promise<never> {
  const locale = text(formData, "locale");
  const player = await requireRole("player");
  if (!player) return redirectToLocale("/login", locale);

  const own = await findOwnRegistration(formData, player.id);
  if (!own.valid) return backTo(null, locale, "error", "Pendaftaran tidak valid.");
  if (!own.slug) return backTo(null, locale, "error", "Pendaftaran tidak ditemukan.");

  let needsRefund: boolean;
  try {
    needsRefund = (await withdrawSoloAndAnnounce({ userId: player.id, registrationId: own.registrationId })).needsRefund;
  } catch (error) {
    return backTo(own.slug, locale, "error", describeFailure(error, "Gagal membatalkan. Coba lagi."));
  }
  revalidatePath(registerPath(own.slug));
  return backTo(own.slug, locale, "success", needsRefund ? "withdrawn-refund" : "withdrawn");
}
