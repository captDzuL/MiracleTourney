"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { validateTeamData } from "@/lib/validation/team-data";
import { getSessionActor, getSessionUser, toEventReadActorCompatibility } from "@/modules/identity";

import {
  approveTeamRegistrationRequest,
  assertCaptainCanUploadPaymentProof,
  createOrUpdateCaptainDraftTeam,
  createTeamRegistrationRequest,
  registerTeam,
  rejectTeamRegistrationRequest,
  updatePaymentSettings,
  updateTeamRegistrationProof,
} from "./service";
import { uploadRegistrationImage } from "./upload";

const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;
const MAX_QRIS_IMAGE_BYTES = 2 * 1024 * 1024;

async function requireCaptainActor() {
  const actor = await getSessionActor();
  if (!actor || actor.role !== "captain") return redirectToActiveLocale("/login");
  return actor;
}

async function requireReviewActor() {
  const user = await getSessionUser();
  const actor = toEventReadActorCompatibility(user);
  if (!actor || (actor.role !== "organizer" && actor.role !== "platform_admin")) return redirectToActiveLocale("/login");
  return actor;
}

async function requirePlatformAdminActor() {
  const actor = await getSessionActor();
  if (!actor || actor.role !== "platform_admin") return redirectToActiveLocale("/login");
  return actor;
}

export async function captainRegisterTeamAction(formData: FormData) {
  const actor = await requireCaptainActor();
  const user = await getSessionUser();
  const registrationError = (message: string) => redirectToActiveLocale(`/captain?error=${encodeURIComponent(message)}` as never);
  const draftTeamId = String(formData.get("draftTeamId") ?? "").trim() || undefined;
  const parsed = z.object({
    eventId: z.string().trim().min(1),
    name: z.string().trim().optional(),
    tag: z.string().trim().optional(),
  }).safeParse({
    eventId: formData.get("eventId"),
    name: String(formData.get("name") ?? "") || undefined,
    tag: String(formData.get("tag") ?? "") || undefined,
  });
  if (!parsed.success) return registrationError(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
  const input = { ...parsed.data, tag: parsed.data.tag?.toUpperCase() };
  if (!draftTeamId) {
    if (!input.name || input.name.length < 2) return registrationError("Nama tim minimal 2 karakter.");
    if (!input.tag || input.tag.length < 2 || input.tag.length > 5) return registrationError("Tag tim harus 2-5 karakter.");
    const errors = validateTeamData({ teamName: input.name, teamTag: input.tag, captainName: user?.name ?? "Captain" });
    if (errors.length > 0) return registrationError(errors.map((error) => error.message).join(". "));
  }
  try {
    await registerTeam({ ...input, draftTeamId, captainId: actor.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mendaftarkan tim.";
    if (message === "Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.") {
      try {
        await createTeamRegistrationRequest({ ...input, draftTeamId, captainId: actor.userId });
      } catch (paymentError) {
        return registrationError(paymentError instanceof Error ? paymentError.message : "Gagal membuat pendaftaran pembayaran.");
      }
      revalidateTag("teams");
      revalidatePath("/captain");
      return redirectToActiveLocale("/captain?tab=registration&success=payment-pending" as never);
    }
    return registrationError(message);
  }
  revalidateTag("teams");
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?success=team-created" as never);
}

export async function captainSaveDraftTeamAction(formData: FormData) {
  const actor = await requireCaptainActor();
  const user = await getSessionUser();
  const parsed = z.object({
    name: z.string().trim().min(2, "Nama tim minimal 2 karakter."),
    tag: z.string().trim().min(2, "Tag tim harus 2-5 karakter.").max(5, "Tag tim harus 2-5 karakter."),
  }).safeParse({ name: formData.get("name"), tag: formData.get("tag") });
  if (!parsed.success) return redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Data draft tim tidak valid.")}` as never);
  const input = { ...parsed.data, tag: parsed.data.tag.toUpperCase() };
  const errors = validateTeamData({ teamName: input.name, teamTag: input.tag, captainName: user?.name ?? "Captain" });
  if (errors.length > 0) return redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(errors.map((error) => error.message).join(". "))}` as never);
  try {
    await createOrUpdateCaptainDraftTeam({ ...input, captainId: actor.userId, captainName: user?.name ?? "Captain" });
  } catch (error) {
    return redirectToActiveLocale(`/captain?tab=roster&error=${encodeURIComponent(error instanceof Error ? error.message : "Gagal menyimpan draft tim.")}` as never);
  }
  revalidateTag("teams");
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?tab=roster&success=draft-team-saved" as never);
}

export async function captainUploadPaymentProofAction(formData: FormData) {
  const actor = await requireCaptainActor();
  const requestId = z.string().trim().min(1).parse(formData.get("requestId"));
  try {
    await assertCaptainCanUploadPaymentProof(actor, requestId);
    const proof = await uploadRegistrationImage({
      file: formData.get("paymentProof"), folder: "payment-proofs", entityId: requestId,
      label: "Payment proof", maxBytes: MAX_PAYMENT_PROOF_BYTES, errorPath: "/captain?tab=registration",
    });
    await updateTeamRegistrationProof(actor, requestId, proof.url);
  } catch (error) {
    return redirectToActiveLocale(`/captain?tab=registration&error=${encodeURIComponent(error instanceof Error ? error.message : "Gagal mengupload bukti pembayaran.")}` as never);
  }
  revalidatePath("/captain");
  return redirectToActiveLocale("/captain?tab=registration&success=payment-proof-uploaded" as never);
}

export async function adminUpdatePaymentSettingsAction(formData: FormData) {
  const actor = await requirePlatformAdminActor();
  const file = formData.get("qrisImage");
  const uploaded = file instanceof File && file.size > 0
    ? await uploadRegistrationImage({ file, folder: "payment-qris", entityId: "global", label: "QRIS image", maxBytes: MAX_QRIS_IMAGE_BYTES, errorPath: "/admin?phase=payments" })
    : null;
  const input = z.object({
    qrisImageUrl: z.preprocess((value) => String(value ?? "").trim() || null, z.string().refine((value) => value.startsWith("/") || /^https?:\/\//.test(value)).nullable()),
    instructions: z.preprocess((value) => String(value ?? "").trim() || null, z.string().max(500).nullable()),
  }).parse({ qrisImageUrl: uploaded?.url ?? formData.get("qrisImageUrl"), instructions: formData.get("instructions") });
  await updatePaymentSettings(actor, input);
  revalidatePath("/admin");
  return redirectToActiveLocale("/admin?phase=payments&success=payment-settings-updated" as never);
}

export async function adminApprovePaymentAction(formData: FormData) {
  const actor = await requireReviewActor();
  const requestId = z.string().trim().min(1).parse(formData.get("requestId"));
  try {
    await approveTeamRegistrationRequest(actor, requestId);
  } catch (error) {
    return redirectToActiveLocale(`/admin?phase=payments&error=${encodeURIComponent(error instanceof Error ? error.message : "Gagal approve pembayaran.")}` as never);
  }
  revalidateTag("teams"); revalidateTag("events"); revalidatePath("/admin"); revalidatePath("/captain");
  return redirectToActiveLocale("/admin?phase=payments&success=payment-approved" as never);
}

export async function adminRejectPaymentAction(formData: FormData) {
  const actor = await requireReviewActor();
  const input = z.object({ requestId: z.string().trim().min(1), reason: z.string().trim().min(3).max(240) }).parse({
    requestId: formData.get("requestId"), reason: formData.get("reason"),
  });
  try {
    await rejectTeamRegistrationRequest(actor, input.requestId, input.reason);
  } catch (error) {
    return redirectToActiveLocale(`/admin?phase=payments&error=${encodeURIComponent(error instanceof Error ? error.message : "Gagal reject pembayaran.")}` as never);
  }
  revalidatePath("/admin"); revalidatePath("/captain");
  return redirectToActiveLocale("/admin?phase=payments&success=payment-rejected" as never);
}