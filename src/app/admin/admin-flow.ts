export const adminPhases = ["prepare", "registration", "run", "review"] as const;

export type AdminPhase = (typeof adminPhases)[number];

export type AdminWorkspaceScope = "admin" | "organizer_registration";

export function canUseAdminWorkspace(role: string, scope: AdminWorkspaceScope = "admin") {
  return role === "platform_admin" || role === "admin" || (role === "organizer" && scope === "organizer_registration");
}

type AdminPhaseQuery = {
  activeEventId?: string;
  matchEventId?: string;
  matchId?: string;
};

export function resolveAdminPhase(value: string | undefined): AdminPhase {
  if (value === "import" || value === "payments") return "registration";
  return adminPhases.find((phase) => phase === value) ?? "prepare";
}

export function buildAdminPhaseHref(phase: AdminPhase, query: AdminPhaseQuery = {}) {
  const params = new URLSearchParams({ phase });

  if (query.activeEventId) params.set("activeEventId", query.activeEventId);

  if (phase === "run") {
    if (query.matchEventId) params.set("matchEventId", query.matchEventId);
    if (query.matchId) params.set("matchId", query.matchId);
  }

  return `?${params.toString()}`;
}
