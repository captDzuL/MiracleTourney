import type { ActorContext } from "@/modules/identity";

import type { EventAccessScope } from "./types";

export function resolveEventAccessScope(actor: ActorContext | null): EventAccessScope {
  if (!actor) return { kind: "none" };

  if (actor.role === "platform_admin") {
    return { kind: "platform_admin" };
  }

  if (actor.role === "organizer" && actor.tenantId) {
    return { kind: "organizer", organizerUserId: actor.tenantId };
  }

  return { kind: "none" };
}
