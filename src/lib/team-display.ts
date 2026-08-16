/**
 * Shared helper for displaying the captain name of a team.
 *
 * Resolution order:
 *   1. team.captainName  — denormalised string stored at import / registration time
 *   2. team.captain.name — linked User record (populated when captainId is set)
 *   3. "Belum Ditugaskan" — Indonesian fallback when no captain is assigned
 */
export function getCaptainDisplayName(team: {
  captainName?: string | null;
  captain?: { name: string } | null;
}): string {
  return team.captainName ?? team.captain?.name ?? "Belum Ditugaskan";
}
