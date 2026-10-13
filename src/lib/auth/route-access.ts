/** The areas the edge middleware keeps behind a sign-in. Organizer pages guard themselves. */
export type RoleArea = "admin" | "captain" | "player";

const AREA_ROLES: Readonly<Record<RoleArea, ReadonlySet<string>>> = {
  admin: new Set(["platform_admin", "organizer", "admin"]),
  // A player may open the captain area because the captain of a solo team is a player account.
  // The pages and actions behind it still check that the player owns the team.
  captain: new Set(["captain", "player"]),
  player: new Set(["player"]),
};

/** Which protected area a locale-free path belongs to, or null for a public path. */
export function roleAreaOf(normalizedPath: string): RoleArea | null {
  if (normalizedPath.startsWith("/admin")) return "admin";
  if (normalizedPath.startsWith("/captain")) return "captain";
  if (normalizedPath.startsWith("/player")) return "player";
  return null;
}

export function roleMayEnter(area: RoleArea, role: string | null): boolean {
  return role !== null && AREA_ROLES[area].has(role);
}
