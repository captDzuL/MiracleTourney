// Pure rules for "is this team's registration complete": a captain contact and a full roster.

import { getGameModeConfig } from "@/lib/platform/config";

export const COMPLETION_GRACE_MS = 48 * 60 * 60 * 1000;

export type CompletionGaps = {
  missingContact: boolean;
  missingPlayers: number;
};

/** incomplete: data missing, no deadline yet. pending: before the deadline. overdue: deadline reached. */
export type CompletionState = "complete" | "incomplete" | "pending" | "overdue";

/** Fixed zone, so the server, the browser and the email print the same time. */
export function formatCompletionDeadline(deadline: Date): string {
  return deadline.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" });
}

/** Players a team needs for this game mode, or null for a mode the app does not know (old or broken events). */
export function getRequiredPlayers(gameModeId: string): number | null {
  try {
    return getGameModeConfig(gameModeId).teamSize;
  } catch {
    return null;
  }
}

export function getCompletionGaps(input: {
  captainContact?: string | null;
  playerCount: number;
  requiredPlayers: number;
}): CompletionGaps {
  return {
    missingContact: !input.captainContact?.trim(),
    missingPlayers: Math.max(input.requiredPlayers - input.playerCount, 0),
  };
}

export function hasCompletionGaps(gaps: CompletionGaps): boolean {
  return gaps.missingContact || gaps.missingPlayers > 0;
}

export function newCompletionDeadline(now: Date): Date {
  return new Date(now.getTime() + COMPLETION_GRACE_MS);
}

/** A running deadline grows by two more days; a passed or missing one restarts from now. */
export function extendedDeadline(current: Date | null | undefined, now: Date): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + COMPLETION_GRACE_MS);
}

export function getCompletionState(gaps: CompletionGaps, deadline: Date | null | undefined, now: Date): CompletionState {
  if (!hasCompletionGaps(gaps)) return "complete";
  if (!deadline) return "incomplete";
  return deadline.getTime() > now.getTime() ? "pending" : "overdue";
}
