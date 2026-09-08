import type { AppUser } from "@/lib/platform/types";

import { toActorContext } from "./actor";

import type { ActorContext } from "./actor";

/**
 * Temporary compatibility adapter for event read callers that still accept AppUser.
 * Legacy active admins are scoped as organizer actors for their own tenant.
 */
export function toEventReadActorCompatibility(user: AppUser | null): ActorContext | null {
  if (!user || user.deactivatedAt) return null;

  if (user.role === "admin") {
    return {
      userId: user.id,
      role: "organizer",
      tenantId: user.id,
    };
  }

  return toActorContext(user);
}