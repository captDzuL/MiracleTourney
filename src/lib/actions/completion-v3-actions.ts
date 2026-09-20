"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/session";
import {
  completeTournament, completeTournamentInputSchema,
  reopenTournament, reopenTournamentInputSchema, type CompletionActor, type CompletionResult,
} from "@/lib/completion/complete";
import { createPrismaCompletionDependencies } from "@/lib/completion/prisma-adapter";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent } from "@/lib/platform/repository";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";

type ActionBlocked = { status: "blocked"; code: "feature_disabled" | "unauthorized" | "password_change_required" | "forbidden" };
export type CompletionActionResult = CompletionResult | ActionBlocked;

async function gateCompletion(eventId: string): Promise<ActionBlocked | { actor: CompletionActor }> {
  if (!isFeatureEnabled("completion_workspace_v3")) return { status: "blocked", code: "feature_disabled" };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "blocked", code: "unauthorized" };
  if (user.role === "organizer" && user.mustChangePassword) return { status: "blocked", code: "password_change_required" };
  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId, ownerUserId: user.role === "organizer" ? user.id : undefined },
    user.role === "organizer" ? user.id : null,
  );
  if (!access.ok) return { status: "blocked", code: "forbidden" };
  try {
    await assertUserCanManageEvent(user, eventId);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return { status: "blocked", code: "forbidden" };
    throw error;
  }
  return { actor: { id: user.id, role: user.role as CompletionActor["role"] } };
}

export async function completeTournamentAction(input: unknown): Promise<CompletionActionResult> {
  const parsed = completeTournamentInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const { eventId, decisions, expectedVersion, idempotencyKey } = parsed.data;
  const access = await gateCompletion(eventId);
  if ("status" in access) return access;
  const result = await completeTournament(eventId, decisions, expectedVersion, idempotencyKey, createPrismaCompletionDependencies(access.actor));
  if (result.status === "completed") revalidatePath(`/organizer/events/${eventId}/completion`);
  return result;
}

export async function reopenTournamentAction(input: unknown): Promise<CompletionActionResult> {
  const parsed = reopenTournamentInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const { eventId, reason, expectedVersion, idempotencyKey } = parsed.data;
  const access = await gateCompletion(eventId);
  if ("status" in access) return access;
  const result = await reopenTournament(eventId, reason, expectedVersion, idempotencyKey, createPrismaCompletionDependencies(access.actor));
  if (result.status === "reopened") revalidatePath(`/organizer/events/${eventId}/completion`);
  return result;
}
