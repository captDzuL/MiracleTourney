"use server";

// Server actions for registration: register, draft, payment proof and review, payment settings, V3 wrappers.
// Moved out of lib/actions.ts without changes (refactor PR 3.4).

import { redirectToActiveLocale } from "@/i18n/redirect";
import * as eventRegistrationActions from "@/lib/actions/registration-v3-actions";
import { isSafeEntityId } from "@/lib/actions/shared/ids";
import { MAX_PAYMENT_PROOF_BYTES, MAX_QRIS_IMAGE_BYTES } from "@/lib/actions/shared/limits";
import { actionEntityId } from "@/lib/actions/shared/request";
import { optionalPublicUrlSchema } from "@/lib/actions/shared/schemas";
import { requireAdminSession, requireCaptainSession } from "@/lib/actions/shared/session";
import { appendActionError, uploadImageAsset } from "@/lib/actions/shared/uploads";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";
import { writeServerLog } from "@/lib/observability/logger";
import { prisma } from "@/lib/platform/db";
import { updatePaymentSettings } from "@/lib/platform/settings-repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOrUpdateCaptainDraftTeam, createTeamRegistrationRequest, registerTeam, updateTeamRegistrationProof } from "@/lib/registration/repository";
import { approveTeamRegistrationRequest, rejectTeamRegistrationRequest } from "@/lib/registration/review-repository";
import { describeActionError, isUserSafeActionError, toSafeActionMessage } from "@/lib/security/public-error";
import { validateTeamData } from "@/lib/validation/team-data";
import { revalidatePath, revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Expected rejections reach the captain as-is; anything else is masked to the captain, so record it for operators. */
function logUnexpectedRegistrationFailure(stage: string | undefined, error: unknown, eventId: string, operation = "captain_register_team") {
  if (isUserSafeActionError(error)) return;
  const { name, code } = describeActionError(error);
  writeServerLog({
    phase: "failed",
    operation,
    route: "/captain",
    requestId: randomUUID(),
    durationMs: 0,
    status: 500,
    errorCode: code ?? name,
    resourceId: eventId,
    ...(stage ? { stage } : {}),
  });
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
        logUnexpectedRegistrationFailure("creating_payment_request", paymentError, input.eventId);
        return await registrationError(paymentMsg);
      }
      revalidateTag("teams");
      revalidatePath("/captain");
      await redirectToActiveLocale(`${registrationBase}&success=payment-pending` as never);
    }
    logUnexpectedRegistrationFailure(undefined, err, input.eventId);
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
    // A missing or non-text field counts as empty, so the captain gets the readable message below, not a raw zod one.
    name: typeof formData.get("name") === "string" ? formData.get("name") : "",
    tag: typeof formData.get("tag") === "string" ? formData.get("tag") : "",
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
    logUnexpectedRegistrationFailure(undefined, err, captain.id, "captain_save_draft_team");
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

  let request: { id: string; eventId: string } | null = null;
  try {
    request = await prisma.teamRegistrationRequest.findFirst({
      where: { id: parsed.requestId, captainId: captain.id },
      select: { id: true, eventId: true },
    });
    if (!request || parsed.eventId && request.eventId !== parsed.eventId) {
      throw new Error("Not authorized");
    }

  } catch (error) {
    const message = toSafeActionMessage(error, "Gagal mengupload bukti pembayaran.");
    await redirectToActiveLocale(appendActionError(registrationBase, message) as never);
  }

  if (!request || !(await checkRateLimit(`payment-proof:${captain.id}:${request.eventId}:${request.id}`, 5, 15 * 60 * 1000))) {
    await redirectToActiveLocale(appendActionError(registrationBase, "rate-limited") as never);
  }

  try {
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
  const user = await requireAdminSession();
  // These settings are one row for the whole platform. An organizer manages the QRIS of their own events instead.
  if (user.role === "organizer") {
    return redirectToActiveLocale(
      `/admin?phase=payments&error=${encodeURIComponent("Hanya admin platform yang dapat mengubah pengaturan QRIS global.")}` as never,
    );
  }

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
