import { seedOrder } from "../competition/shared";
import type { SeededTeam } from "../competition";
import type { BackfillMatch, BackfillTeam } from "./legacy-backfill-types";

export type SeedInference = {
  seeds: SeededTeam[];
  /** Bracket size read from the number of rounds: a bracket with R rounds holds 2^R places. */
  size: number;
  rounds: number;
  problems: string[];
};

type Placement = { teamId: string; seed: number; where: string };
type Slice = { placements: Placement[]; problems: string[] };

const label = (round: number, slot: number) => `round ${round} slot ${slot}`;

function rowAt(matches: BackfillMatch[], round: number, slot: number) {
  return matches.filter((match) => match.round === round && match.slot === slot);
}

/** A first-round row seats two teams at the seed pair the V3 graph uses for the same slot. */
function rowPlacements(row: BackfillMatch, slot: number, order: number[], teamCount: number): Slice {
  const [homeSeed, awaySeed] = [order[2 * slot - 2], order[2 * slot - 1]];
  const where = label(1, slot);
  const sides = [{ teamId: row.homeTeamId, seed: homeSeed, side: "home" }, { teamId: row.awayTeamId, seed: awaySeed, side: "away" }];
  const problems = sides.flatMap(({ teamId, seed, side }) => {
    if (!teamId) return [`${where}: ${side} team is empty (a stored bye row is not supported)`];
    return seed > teamCount ? [`${where}: ${side} seed ${seed} is beyond the team count ${teamCount}`] : [];
  });
  return { placements: problems.length ? [] : sides.map(({ teamId, seed }) => ({ teamId, seed, where })), problems };
}

/**
 * A first-round slot without a stored row is a bye. The team waits in the round-2 match that slot feeds:
 * home side when the slot is odd, away side when it is even. It takes the better seed of the slot's pair.
 */
function byePlacement(matches: BackfillMatch[], slot: number, order: number[], teamCount: number): Slice {
  const where = `${label(1, slot)} (bye)`;
  const [first, second] = [order[2 * slot - 2], order[2 * slot - 1]];
  const [better, worse] = [Math.min(first, second), Math.max(first, second)];
  if (worse <= teamCount) return { placements: [], problems: [`${where}: has no match row but both seeds ${better} and ${worse} are real teams`] };
  const parents = rowAt(matches, 2, Math.ceil(slot / 2));
  if (parents.length !== 1) return { placements: [], problems: [`${where}: ${label(2, Math.ceil(slot / 2))} must hold the bye team but found ${parents.length} rows`] };
  const side = slot % 2 === 1 ? "home" : "away";
  const teamId = side === "home" ? parents[0].homeTeamId : parents[0].awayTeamId;
  if (!teamId) return { placements: [], problems: [`${where}: ${label(2, Math.ceil(slot / 2))} has no team on the ${side} side for the bye team`] };
  return { placements: [{ teamId, seed: better, where }], problems: [] };
}

function slotSlice(matches: BackfillMatch[], slot: number, order: number[], teamCount: number): Slice {
  const rows = rowAt(matches, 1, slot);
  if (rows.length > 1) return { placements: [], problems: [`${label(1, slot)}: ${rows.length} rows share this slot`] };
  return rows.length ? rowPlacements(rows[0], slot, order, teamCount) : byePlacement(matches, slot, order, teamCount);
}

function placementProblems(placements: Placement[], teams: BackfillTeam[]): string[] {
  const known = new Set(teams.map((team) => team.id));
  const names = new Map(teams.map((team) => [team.id, team.name]));
  const wheres = new Map<string, string[]>();
  for (const placement of placements) wheres.set(placement.teamId, [...(wheres.get(placement.teamId) ?? []), placement.where]);
  const duplicated = [...wheres].filter(([, places]) => places.length > 1)
    .map(([id, places]) => `team "${names.get(id) ?? id}" is placed more than once: ${places.join(", ")}`);
  const unknown = [...wheres.keys()].filter((id) => !known.has(id)).map((id) => `team id ${id} is not a team of this event`);
  const missing = teams.filter((team) => !wheres.has(team.id)).map((team) => `team "${team.name}" does not appear in round 1 or as a bye team`);
  return [...duplicated, ...unknown, ...missing];
}

function seedProblems(seeds: SeededTeam[], teamCount: number): string[] {
  const ordered = seeds.map((entry) => entry.seed).sort((a, b) => a - b);
  return ordered.every((seed, index) => seed === index + 1) && ordered.length === teamCount
    ? []
    : [`seeds read from the bracket are not 1..${teamCount} without gaps or repeats`];
}

/**
 * Seeds for a finished old bracket whose bye rows were never stored. Reads every first-round slot, then
 * places each bye team from round 2. Reports every inconsistency; never guesses a seed.
 */
export function inferBackfillSeeds(teams: BackfillTeam[], matches: BackfillMatch[]): SeedInference {
  const rounds = Math.max(0, ...matches.map((match) => match.round ?? 0));
  const size = 2 ** rounds;
  if (!rounds || teams.length > size || teams.length <= size / 2) {
    return { seeds: [], size, rounds, problems: [`${teams.length} teams do not fit a ${rounds}-round bracket of ${size} places`] };
  }
  const order = seedOrder(size);
  const slices = Array.from({ length: size / 2 }, (_, index) => slotSlice(matches, index + 1, order, teams.length));
  const placements = slices.flatMap((slice) => slice.placements);
  const problems = [...slices.flatMap((slice) => slice.problems), ...placementProblems(placements, teams)];
  const seeds = problems.length ? [] : placements.map(({ teamId, seed }) => ({ id: teamId, seed })).sort((a, b) => a.seed - b.seed);
  return { seeds, size, rounds, problems: problems.length ? problems : seedProblems(seeds, teams.length) };
}
