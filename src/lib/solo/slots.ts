import { normalizeKey, samePosition } from "./normalize";
import type { SoloRules, SoloSlotGroup } from "./types";

/**
 * Phase 1 supports exactly one required position, held by exactly one player per team.
 * Anything else throws, so a misconfigured game fails loudly instead of drawing bad teams.
 */
export function assertSupportedRules(rules: SoloRules): { requiredPosition: string } {
  if (!Number.isInteger(rules.teamSize) || rules.teamSize < 2) {
    throw new RangeError("Solo draw team size must be a whole number of at least 2.");
  }
  const entries = Object.entries(rules.requiredPositions);
  if (entries.length !== 1) {
    throw new RangeError("Solo draw supports exactly one required position.");
  }
  const [requiredPosition, count] = entries[0];
  if (normalizeKey(requiredPosition) === "" || count !== 1) {
    throw new RangeError("The required position must be held by exactly one player per team.");
  }
  return { requiredPosition };
}

export function slotGroupOf(primaryPosition: string, rules: SoloRules): SoloSlotGroup {
  const { requiredPosition } = assertSupportedRules(rules);
  return samePosition(primaryPosition, requiredPosition) ? "required" : "open";
}

/** Slots per group for an event with `participantCap` teams. */
export function computeQuota(participantCap: number, rules: SoloRules): { required: number; open: number } {
  assertSupportedRules(rules);
  if (!Number.isInteger(participantCap) || participantCap < 1) {
    throw new RangeError("Team count must be a positive whole number.");
  }
  return { required: participantCap, open: participantCap * (rules.teamSize - 1) };
}

export type RegistrationOutcome = "approved" | "pending_payment" | "queued";

/** What happens to a new registration, given how many slots its group already uses. */
export function decideRegistration(input: { used: number; quota: number; free: boolean }): RegistrationOutcome {
  if (input.used >= input.quota) return "queued";
  return input.free ? "approved" : "pending_payment";
}

/** The queued registration that gets the next free slot: earliest registered, id breaks ties. */
export function pickNextQueued<T extends { id: string; createdAt: Date }>(queued: readonly T[]): T | null {
  let next: T | null = null;
  for (const entry of queued) {
    if (next === null) {
      next = entry;
      continue;
    }
    const difference = entry.createdAt.getTime() - next.createdAt.getTime();
    if (difference < 0 || (difference === 0 && entry.id < next.id)) next = entry;
  }
  return next;
}
