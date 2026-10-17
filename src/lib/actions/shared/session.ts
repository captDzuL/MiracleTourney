// Session and workspace guards shared by the server actions. Plain module on purpose: not a server action file.
// Moved out of actions.ts (refactor PR 1.4). requireAdminSession now also blocks organizers who must change their password.

import { redirectToActiveLocale } from "@/i18n/redirect";
import { getCaptainOrTeamOwner } from "@/lib/auth/captain-access";
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

  // An organizer with a temporary password may only change it. The organizer pages and the v3 actions already
  // enforce this; the legacy actions that start here did not.
  if (user.role === "organizer" && user.mustChangePassword) {
    return redirectToActiveLocale("/organizer/change-password");
  }

  return user;
}

/** Captain accounts only. Registering a team and keeping a reusable draft stay with them, never with a player. */
export async function requireCaptainSession(): Promise<AppUser> {
  const user = await requireRole("captain");

  if (!user) {
    return redirectToActiveLocale("/login");
  }

  return user;
}

/**
 * A captain, or a player whom a solo draw made captain of a team. For the roster, the logo and the stats of
 * a team: each action still checks that the team belongs to this account.
 */
export async function requireCaptainOrOwnerSession(): Promise<AppUser> {
  const user = await getCaptainOrTeamOwner();

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
