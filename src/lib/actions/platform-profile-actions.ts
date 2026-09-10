"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { updatePlatformProfile } from "@/lib/platform/repository";

const platformProfileSchema = z.object({
  locale: z.enum(["id", "en"]),
  displayName: z.string().trim().min(2).max(80),
  contactChannel: z.string().trim().min(2).max(40),
  contactValue: z.string().trim().min(3).max(200),
});

export async function updatePlatformProfileAction(formData: FormData) {
  const user = await requireAnyRole(["platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  const input = platformProfileSchema.parse({ locale: formData.get("locale"), displayName: formData.get("displayName"), contactChannel: formData.get("contactChannel"), contactValue: formData.get("contactValue") });
  await updatePlatformProfile({ displayName: input.displayName, contactChannel: input.contactChannel, contactValue: input.contactValue });
  revalidateTag("events");
  revalidatePath("/admin");
  redirect(`/${input.locale}/admin/platform-profile?saved=1`);
}