"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/platform/db";
import { createCompetitionOperations } from "@/lib/tournament/operations";
import { correctionPreviewSchema, operationRequestSchema } from "@/lib/tournament/operations/schema";

export async function executeCompetitionOperationAction(input: unknown) {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  if (!isFeatureEnabled("competition_operations_v3")) throw new Error("Competition operations are unavailable");
  const request = operationRequestSchema.parse(input);
  const receipt = await createCompetitionOperations(prisma).execute({ ...request, actor: { id: user.id, role: user.role } });
  revalidateTag("events");
  revalidatePath("/", "layout");
  return receipt;
}

export async function previewCompetitionResultCorrectionAction(input: unknown) {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) throw new Error("Unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) throw new Error("Password change required");
  if (!isFeatureEnabled("competition_operations_v3")) throw new Error("Competition operations are unavailable");
  const request = correctionPreviewSchema.parse(input);
  return createCompetitionOperations(prisma).previewResultCorrection({ ...request, actor: { id: user.id, role: user.role } });
}

/** Expected failures must cross the production Server Action boundary as data;
 * Next.js intentionally masks thrown server exception messages in production. */
export async function mutateCompetitionWorkspaceAction(input: unknown) {
  try { return { status: "saved" as const, receipt: await executeCompetitionOperationAction(input) }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/conflict|stale/i.test(message)) return { status: "conflict" as const };
    if (/authorized|password|unavailable/i.test(message)) return { status: "unauthorized" as const };
    return { status: "failed" as const };
  }
}
