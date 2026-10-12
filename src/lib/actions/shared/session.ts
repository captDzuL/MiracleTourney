// Session and workspace guards shared by the server actions. Plain module on purpose: not a server action file.
// Moved out of actions.ts without changes (refactor PR 1.4).

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireRole } from "@/lib/auth/session";
import type { AppUser } from "@/lib/platform/types";
import { authorizeWorkspaceResource } from "@/lib/security/authorization";
import type { WorkspaceActor } from "@/lib/security/authorization";

export async function requireAdminSession(): Promise<AppUser> {
  const user =
    await requireRole("platform_admin")
    ?? await requireRole("organizer")
    ?? await requireRole("admin");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

export async function requireCaptainSession(): Promise<AppUser> {
  const user = await requireRole("captain");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

export function assertWorkspaceEventAction(user: AppUser, eventId: string) {
  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId, ownerUserId: user.role === "organizer" ? user.id : undefined },
    user.role === "organizer" ? user.id : null,
  );
  if (!access.ok) throw new Error("Not authorized");
}
