"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { getUserPasswordHashById, updateOrganizerProfileForUser, updateUserPassword } from "@/lib/platform/repository";

const organizerProfileSchema = z.object({
  locale: z.enum(["id", "en"]),
  organizationName: z.string().trim().min(2).max(100),
  contactChannel: z.string().trim().min(2).max(40),
  contactValue: z.string().trim().min(3).max(200),
});

/** Saves the organizer identity used on every event that they own. */
export async function updateOrganizerProfileAction(formData: FormData) {
  const user = await requireAnyRole(["organizer"]);
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword) throw new Error("Password change required");

  const input = organizerProfileSchema.parse({
    locale: formData.get("locale"),
    organizationName: formData.get("organizationName"),
    contactChannel: formData.get("contactChannel"),
    contactValue: formData.get("contactValue"),
  });

  const { locale, ...profile } = input;
  await updateOrganizerProfileForUser(user, profile);
  revalidateTag("events");
  revalidatePath("/organizer");
  revalidatePath("/organizer/profile");
  redirect(`/${locale}/organizer/profile?saved=1`);
}
/** Completes the required first-login password change for a newly provisioned organizer. */
export async function completeOrganizerPasswordChangeAction(formData: FormData) {
  const user = await requireAnyRole(["organizer"]);
  if (!user) throw new Error("Unauthorized");
  const input = z.object({
    locale: z.enum(["id", "en"]), currentPassword: z.string().min(1), newPassword: z.string().min(8), confirmPassword: z.string().min(8),
  }).parse({
    locale: formData.get("locale"), currentPassword: formData.get("currentPassword"), newPassword: formData.get("newPassword"), confirmPassword: formData.get("confirmPassword"),
  });
  if (input.newPassword !== input.confirmPassword) throw new Error("Password confirmation does not match");
  const currentHash = await getUserPasswordHashById(user.id);
  if (!currentHash || !(await bcrypt.compare(input.currentPassword, currentHash))) throw new Error("Current password is incorrect");
  await updateUserPassword(user.id, await bcrypt.hash(input.newPassword, 10));
  revalidatePath("/organizer");
  redirect(`/${input.locale}/organizer?password=changed`);
}