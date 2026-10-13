import type { SoloRegistrationView } from "@/lib/solo/registration-types";

export type SoloPanelState =
  | { kind: "form" }
  | { kind: "queued"; position: number | null }
  | { kind: "pay"; deadline: Date | null }
  | { kind: "review" }
  | { kind: "rejected"; reason: string | null; deadline: Date | null }
  | { kind: "approved" };

const lapsed = (deadline: Date | null, now: Date) => deadline !== null && deadline <= now;

/**
 * What the sign-up page shows a player, from their registration. A slot whose deadline has passed
 * counts as lost even before the sweep has written that down, so the player is never asked to pay for it.
 */
export function soloPanelState(
  registration: Pick<SoloRegistrationView, "status" | "rejectReason" | "expiresAt"> | null,
  queuePosition: number | null,
  now: Date,
): SoloPanelState {
  if (!registration) return { kind: "form" };
  switch (registration.status) {
    case "queued":
      return { kind: "queued", position: queuePosition };
    case "pending_payment":
      return lapsed(registration.expiresAt, now) ? { kind: "form" } : { kind: "pay", deadline: registration.expiresAt };
    case "pending_review":
      return { kind: "review" };
    case "rejected":
      return lapsed(registration.expiresAt, now)
        ? { kind: "form" }
        : { kind: "rejected", reason: registration.rejectReason, deadline: registration.expiresAt };
    case "approved":
      return { kind: "approved" };
    default:
      return { kind: "form" };
  }
}
