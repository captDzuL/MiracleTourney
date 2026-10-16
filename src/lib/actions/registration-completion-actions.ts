"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { actionEntityId } from "@/lib/actions/shared/request";
import { requireCaptainSession } from "@/lib/actions/shared/session";
import { requireAnyRole } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extendCompletionDeadline,
  restoreSuspendedTeam,
  suspendIncompleteTeam,
  updateCaptainTeamContact,
} from "@/lib/registration/completion-repository";
import { toSafeActionMessage } from "@/lib/security/public-error";
import type { AppUser } from "@/lib/platform/types";

export type CompletionActionResult =
  | { status: "done" }
  | { status: "failed"; message: string };

const FAILED_MESSAGE = "Perubahan tidak dapat disimpan.";
const idSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const inputSchema = z.object({ eventId: idSchema, teamId: idSchema });

type TeamCompletionOperation = (user: AppUser, eventId: string, teamId: string) => Promise<void>;

async function runTeamCompletionAction(formData: FormData, operation: TeamCompletionOperation): Promise<CompletionActionResult> {
  const parsed = inputSchema.safeParse({ eventId: formData.get("eventId"), teamId: formData.get("teamId") });
  if (!parsed.success) return { status: "failed", message: "Data tim tidak valid." };

  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "failed", message: "Sesi organizer tidak ditemukan." };
  if (user.role === "organizer" && user.mustChangePassword) {
    return { status: "failed", message: "Ganti password sebelum mengelola registrasi." };
  }
  if (!(await checkRateLimit(`team-completion:${user.id}`, 30, 60_000))) {
    return { status: "failed", message: "Terlalu banyak percobaan. Coba lagi nanti." };
  }

  try {
    await operation(user, parsed.data.eventId, parsed.data.teamId);
  } catch (error) {
    return { status: "failed", message: toSafeActionMessage(error, FAILED_MESSAGE) };
  }
  revalidateTag("teams");
  revalidateTag("events");
  return { status: "done" };
}

export async function suspendTeamAction(formData: FormData): Promise<CompletionActionResult> {
  return runTeamCompletionAction(formData, (user, eventId, teamId) => suspendIncompleteTeam(user, eventId, teamId));
}

export async function restoreTeamAction(formData: FormData): Promise<CompletionActionResult> {
  return runTeamCompletionAction(formData, (user, eventId, teamId) => restoreSuspendedTeam(user, eventId, teamId));
}

export async function extendTeamDeadlineAction(formData: FormData): Promise<CompletionActionResult> {
  return runTeamCompletionAction(formData, (user, eventId, teamId) => extendCompletionDeadline(user, eventId, teamId));
}

const CAPTAIN_CONTACT_REQUIRED_MESSAGE = "Isi nomor WhatsApp kapten, 6 sampai 32 karakter.";

/** Lets a captain fill in the WhatsApp number of a team that was registered without one. */
export async function captainUpdateContactAction(formData: FormData) {
  const captain = await requireCaptainSession();
  const parsed = z.object({
    teamId: actionEntityId,
    captainContact: z.string().trim().min(6, CAPTAIN_CONTACT_REQUIRED_MESSAGE).max(32, CAPTAIN_CONTACT_REQUIRED_MESSAGE).regex(/^[^<>]*$/, CAPTAIN_CONTACT_REQUIRED_MESSAGE),
  }).safeParse({
    teamId: formData.get("teamId"),
    captainContact: String(formData.get("captainContact") ?? ""),
  });
  if (!parsed.success) {
    return await redirectToActiveLocale(`/captain?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Data tim tidak valid.")}` as never);
  }
  if (!(await checkRateLimit(`captain-contact:${captain.id}`, 10, 60_000))) {
    return await redirectToActiveLocale(`/captain?error=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi nanti.")}` as never);
  }

  try {
    await updateCaptainTeamContact(captain.id, parsed.data.teamId, parsed.data.captainContact);
  } catch (error) {
    const message = toSafeActionMessage(error, "Gagal menyimpan nomor WhatsApp.");
    return await redirectToActiveLocale(`/captain?error=${encodeURIComponent(message)}` as never);
  }

  revalidateTag("teams");
  revalidatePath("/captain");
  await redirectToActiveLocale("/captain?success=contact-saved");
}
