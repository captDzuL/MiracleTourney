import { bracketSize, seedOrder } from "../competition/shared";

export type LegacyAuditMatch = {
  id: string;
  round: number | null;
  slot: number | null;
  roundLabel?: string;
  homeTeamId: string;
  awayTeamId: string;
};

export type InferredSeeds = {
  seeds: { id: string; seed: number }[];
  complete: boolean;
  note: string;
};

/**
 * Old brackets placed seeds with the same balanced order the V3 graph uses: first-round slot s
 * holds order[2s-2] and order[2s-1]. Read the seeds back from those slots. A team that never
 * appears in round 1 (bye rows not stored) is only placed when exactly one seed is left over.
 * Read-only helper for audits; it never decides anything about results.
 */
export function inferLegacySeeds(teamIds: string[], matches: LegacyAuditMatch[]): InferredSeeds {
  // The old generator sized the bracket from the event's slot count, which can exceed the team count.
  const firstRoundSlots = Math.max(0, ...matches.filter((match) => match.round === 1).map((match) => match.slot ?? 0));
  const order = seedOrder(bracketSize(Math.max(2, teamIds.length, firstRoundSlots * 2)));
  const seedByTeam = new Map<string, number>();
  for (const match of matches) {
    if (match.round !== 1 || !match.slot) continue;
    const position = (match.slot - 1) * 2;
    if (position + 1 >= order.length) continue;
    if (match.homeTeamId) seedByTeam.set(match.homeTeamId, order[position]);
    if (match.awayTeamId) seedByTeam.set(match.awayTeamId, order[position + 1]);
  }
  const missing = teamIds.filter((id) => !seedByTeam.has(id));
  const taken = new Set(seedByTeam.values());
  const freeSeeds = Array.from({ length: teamIds.length }, (_, index) => index + 1).filter((seed) => !taken.has(seed));
  if (missing.length === 1 && freeSeeds.length === 1) {
    seedByTeam.set(missing[0], freeSeeds[0]);
    return { seeds: [...seedByTeam].map(([id, seed]) => ({ id, seed })), complete: true, note: "one team missing from round 1, placed by elimination" };
  }
  const outsideRange = [...seedByTeam.values()].filter((seed) => seed > teamIds.length).length;
  const complete = missing.length === 0 && outsideRange === 0;
  return {
    seeds: [...seedByTeam].map(([id, seed]) => ({ id, seed })),
    complete,
    note: complete
      ? "all seeds read from first-round slots"
      : missing.length
        ? `${missing.length} team(s) not in round 1 - seeds cannot be inferred safely`
        : "first-round slots point at seeds beyond the team count - team list and bracket disagree",
  };
}

/**
 * The upgrade diagnosis compares fixtures with a freshly generated graph, where later rounds hold
 * no teams and nothing has been played. Take results and advanced teams out so only the structure is compared.
 */
export function structuralOnly<T extends LegacyAuditMatch>(matches: T[]) {
  return matches.map((match) => ({
    ...match,
    homeTeamId: match.round === 1 ? match.homeTeamId : "",
    awayTeamId: match.round === 1 ? match.awayTeamId : "",
    homeScore: 0,
    awayScore: 0,
    status: "Scheduled",
    resultVersion: 0,
    winnerTeamId: null,
  }));
}
