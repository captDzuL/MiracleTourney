"use server";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/session";
import { publishCertificateSet, publishCertificateSetInputSchema, regenerateCertificate, regenerateCertificateInputSchema, type CertificateStudioActor, type PublishCertificateSetResult, type RegenerateCertificateResult } from "@/lib/certificate/service";
import { createPrismaCertificateStudioDependencies } from "@/lib/certificate/studio-repository";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent } from "@/lib/platform/repository";

type GateResult = { status: "blocked"; code: "feature_disabled" | "unauthorized" | "password_change_required" | "forbidden" };
async function gate(eventId: string): Promise<{ actor: CertificateStudioActor } | GateResult> {
  if (!isFeatureEnabled("completion_workspace_v3")) return { status: "blocked", code: "feature_disabled" };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "blocked", code: "unauthorized" };
  if (user.role === "organizer" && user.mustChangePassword) return { status: "blocked", code: "password_change_required" };
  try { await assertUserCanManageEvent(user, eventId); }
  catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return { status: "blocked", code: "forbidden" };
    throw error;
  }
  return { actor: { id: user.id, role: user.role as CertificateStudioActor["role"] } };
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
