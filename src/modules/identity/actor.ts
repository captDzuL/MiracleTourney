import type { AppUser } from "@/lib/platform/types";

export type ActorContext = {
  userId: string;
  role: "captain" | "organizer" | "platform_admin";
  tenantId: string | null;
};

export function toActorContext(user: AppUser | null): ActorContext | null {
  if (!user || user.deactivatedAt) return null;

  if (user.role === "captain") {
    return { userId: user.id, role: "captain", tenantId: null };
  }

  if (user.role === "organizer") {
    return { userId: user.id, role: "organizer", tenantId: user.id };
  }

  if (user.role === "platform_admin") {
    return { userId: user.id, role: "platform_admin", tenantId: null };
  }

  return null;
}
