"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/session";
import {
  completeTournament, completeTournamentInputSchema,
  reopenTournament, reopenTournamentInputSchema, type CompletionResult,
} from "@/lib/completion/complete";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertUserCanManageEvent } from "@/lib/platform/repository";

type ActionBlocked = { status: "blocked"; code: "feature_disabled" | "unauthorized" | "password_change_required" | "forbidden" };
export type CompletionActionResult = CompletionResult | ActionBlocked;

async function gateCompletion(eventId: string): Promise<ActionBlocked | null> {
  if (!isFeatureEnabled("completion_workspace_v3")) return { status: "blocked", code: "feature_disabled" };
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return { status: "blocked", code: "unauthorized" };
  if (user.role === "organizer" && user.mustChangePassword) return { status: "blocked", code: "password_change_required" };
  try {
    await assertUserCanManageEvent(user, eventId);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return { status: "blocked", code: "forbidden" };
    throw error;
  }
  return null;
}

export async function completeTournamentAction(input: unknown): Promise<CompletionActionResult> {
  const parsed = completeTournamentInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const { eventId, decisions, expectedVersion, idempotencyKey } = parsed.data;
  const blocked = await gateCompletion(eventId);
  if (blocked) return blocked;
  const result = await completeTournament(eventId, decisions, expectedVersion, idempotencyKey);
  if (result.status === "completed") revalidatePath(`/organizer/events/${eventId}/completion`);
  return result;
}

export async function reopenTournamentAction(input: unknown): Promise<CompletionActionResult> {
  const parsed = reopenTournamentInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const { eventId, reason, expectedVersion, idempotencyKey } = parsed.data;
  const blocked = await gateCompletion(eventId);
  if (blocked) return blocked;
  const result = await reopenTournament(eventId, reason, expectedVersion, idempotencyKey);
  if (result.status === "reopened") revalidatePath(`/organizer/events/${eventId}/completion`);
  return result;
}
