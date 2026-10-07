import type { AppUser } from "@/lib/platform/types";
import { getAdaptivePublicEventView } from "./adaptive-public-event";
import type { PublicViewer } from "./public-v3-types";

function viewerUser(viewer: PublicViewer): AppUser | null {
  if (!viewer || viewer.role === "public" || typeof viewer.id !== "string" || typeof viewer.email !== "string" || typeof viewer.name !== "string") return null;
  if (!["captain", "organizer", "platform_admin", "admin"].includes(viewer.role as string)) return null;
  return { id: viewer.id, email: viewer.email, name: viewer.name, role: viewer.role as AppUser["role"] };
}

/** Public registration reader used by the normalized V3 boundary. */
export async function readPublicRegistration(slug: string, viewer: PublicViewer, now = new Date()) {
  return getAdaptivePublicEventView(slug, viewerUser(viewer), now);
}

export { getRegistrationAvailability, buildRegistrationCta, describeTournamentFormat, normalizeOrganizerContact } from "./adaptive-public-event";
