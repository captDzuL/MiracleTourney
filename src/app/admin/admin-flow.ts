export const adminPhases = ["prepare", "import", "payments", "run", "review"] as const;

export type AdminPhase = (typeof adminPhases)[number];

type AdminPhaseQuery = {
  activeEventId?: string;
  matchEventId?: string;
  matchId?: string;
};

export function resolveAdminPhase(value: string | undefined): AdminPhase {
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
