import { isSafeEntityId } from "@/lib/security/request-guard";
import type { UserRole } from "@/lib/platform/types";

type PostLoginInput = {
  role: UserRole;
  mustChangePassword?: boolean;
  /** Already passed through getSafeReturnTo. */
  returnTo?: string | null;
  eventId?: string | null;
};

/**
 * Where a signed-in user lands after logging in, or after opening the login
 * page while already signed in. Only captains follow `returnTo` and `eventId`,
 * because those come from the captain registration flow.
 */
export function resolvePostLoginPath({ role, mustChangePassword, returnTo, eventId }: PostLoginInput): string {
  if (role === "organizer") return mustChangePassword ? "/organizer/change-password" : "/organizer";
  if (role === "platform_admin" || role === "admin") return "/admin";
  if (role === "captain" && returnTo) return returnTo;
  if (role === "captain" && eventId && isSafeEntityId(eventId)) {
    return `/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`;
  }
  return "/captain";
}
