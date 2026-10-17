import { checkDrawInvariants } from "./invariants";
import { normalizeKey, samePosition } from "./normalize";
import { planTeams } from "./plan";
import { createRng, shuffle } from "./prng";
import { assertSupportedRules } from "./slots";
import type { SoloAssignment, SoloCandidate, SoloDrawResult, SoloRules, SoloWarning } from "./types";

type Lookup = ReadonlyMap<string, SoloCandidate>;

/** How many players in this group repeat an in-game name that is already taken in the group. */
function repeatedNames(memberIds: readonly string[], lookup: Lookup): number {
  const names = memberIds.map((id) => normalizeKey(lookup.get(id)?.ign ?? id));
  return names.length - new Set(names).size;
}

function withMember(team: readonly string[], position: number, memberId: string): string[] {
  return team.map((id, index) => (index === position ? memberId : id));
}

/**
 * Tries one swap of field players between `teams[index]` and another team that lowers the total
 * number of repeated names. Position 0 of every team is the keeper and never moves.
 */
function splitOneClash(teams: string[][], index: number, lookup: Lookup): boolean {
  for (let offset = 1; offset < teams.length; offset += 1) {
    const other = (index + offset) % teams.length;
    const before = repeatedNames(teams[index], lookup) + repeatedNames(teams[other], lookup);
    for (let mine = 1; mine < teams[index].length; mine += 1) {
      for (let theirs = 1; theirs < teams[other].length; theirs += 1) {
        const nextMine = withMember(teams[index], mine, teams[other][theirs]);
        const nextTheirs = withMember(teams[other], theirs, teams[index][mine]);
        if (repeatedNames(nextMine, lookup) + repeatedNames(nextTheirs, lookup) < before) {
          teams[index] = nextMine;
          teams[other] = nextTheirs;
          return true;
        }
      }
    }
  }
  return false;
}

/** Moves field players between teams until no team repeats a name, or no swap helps. */
function splitNameClashes(teams: string[][], lookup: Lookup): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < teams.length; index += 1) {
      if (repeatedNames(teams[index], lookup) > 0 && splitOneClash(teams, index, lookup)) changed = true;
    }
  }
}

function clashWarnings(teams: readonly (readonly string[])[], lookup: Lookup): SoloWarning[] {
  const warnings: SoloWarning[] = [];
  teams.forEach((members, index) => {
    if (repeatedNames(members, lookup) > 0) warnings.push({ code: "ign_collision", detail: { team: index + 1 } });
  });
  return warnings;
}

function pickCaptain(members: readonly string[], lookup: Lookup, rng: () => number): string {
  const volunteers = members.filter((id) => lookup.get(id)?.willingCaptain);
  const pool = volunteers.length > 0 ? volunteers : members;
  return pool[Math.floor(rng() * pool.length)];
}

export function isLockable(teamCount: number, warnings: readonly SoloWarning[]): boolean {
  return teamCount >= 2 && !warnings.some((warning) => warning.code === "ign_collision");
}

/**
 * Builds teams from the approved players. The same seed and the same players always give the
 * same teams, whatever order the players are listed in.
 */
export function drawTeams(input: {
  candidates: readonly SoloCandidate[];
  participantCap: number;
  rules: SoloRules;
  seed: string;
}): SoloDrawResult {
  const { requiredPosition } = assertSupportedRules(input.rules);
  const rng = createRng(input.seed);
  const plan = planTeams(input);
  const lookup: Lookup = new Map(input.candidates.map((candidate) => [candidate.registrationId, candidate]));
  const fieldPerTeam = input.rules.teamSize - 1;

  const keepers = shuffle(plan.keeperRegistrationIds, rng);
  const field = shuffle(plan.fieldRegistrationIds, rng);
  const teams = keepers.map((keeper, index) => [keeper, ...field.slice(index * fieldPerTeam, (index + 1) * fieldPerTeam)]);
  splitNameClashes(teams, lookup);
  const captains = teams.map((members) => pickCaptain(members, lookup, rng));

  const assignments: SoloAssignment[] = teams.flatMap((members, teamPosition) =>
    members.map((registrationId, memberPosition) => ({
      registrationId,
      teamIndex: teamPosition + 1,
      role: "starter" as const,
      assignedPosition: memberPosition === 0 ? requiredPosition : (lookup.get(registrationId)?.primaryPosition.trim() ?? null),
      isCaptain: captains[teamPosition] === registrationId,
    })),
  );
  for (const registrationId of plan.unplacedRegistrationIds) {
    assignments.push({ registrationId, teamIndex: null, role: "unplaced", assignedPosition: null, isCaptain: false });
  }

  const warnings = [...plan.warnings, ...clashWarnings(teams, lookup)];
  return {
    assignments,
    teamCount: plan.teamCount,
    unplacedCount: plan.unplacedRegistrationIds.length,
    warnings,
    canLock: isLockable(plan.teamCount, warnings),
  };
}

function teamMembers(assignments: readonly SoloAssignment[], teamCount: number): string[][] {
  return Array.from({ length: teamCount }, (_, index) =>
    assignments.filter((assignment) => assignment.teamIndex === index + 1).map((assignment) => assignment.registrationId),
  );
}

/** After a swap, a team must still have exactly one captain; the incoming player fills a gap. */
function settleCaptain(assignments: SoloAssignment[], teamIndex: number, incomingId: string): SoloAssignment[] {
  const members = assignments.filter((assignment) => assignment.teamIndex === teamIndex);
  const captains = members.filter((member) => member.isCaptain);
  if (captains.length === 1) return assignments;
  return assignments.map((assignment) => {
    if (assignment.teamIndex !== teamIndex) return assignment;
    if (captains.length === 0) return assignment.registrationId === incomingId ? { ...assignment, isCaptain: true } : assignment;
    return assignment.registrationId === incomingId ? { ...assignment, isCaptain: false } : assignment;
  });
}

function findStarter(result: SoloDrawResult, registrationId: string): SoloAssignment {
  const found = result.assignments.find((assignment) => assignment.registrationId === registrationId);
  if (!found) throw new Error(`Unknown registration: ${registrationId}`);
  if (found.role !== "starter" || found.teamIndex === null) throw new Error(`Registration ${registrationId} is not in a team.`);
  return found;
}

/**
 * Swaps two players between two teams before the draw is locked. Keepers only swap with keepers
 * and field players with field players, so every team keeps exactly one keeper.
 */
export function swapPlayers(input: {
  result: SoloDrawResult;
  candidates: readonly SoloCandidate[];
  a: string;
  b: string;
  rules: SoloRules;
}): SoloDrawResult {
  const { requiredPosition } = assertSupportedRules(input.rules);
  const first = findStarter(input.result, input.a);
  const second = findStarter(input.result, input.b);
  if (first.teamIndex === second.teamIndex) throw new Error("Cannot swap two players of the same team.");
  const holdsRequired = (assignment: SoloAssignment) =>
    assignment.assignedPosition !== null && samePosition(assignment.assignedPosition, requiredPosition);
  if (holdsRequired(first) !== holdsRequired(second)) {
    throw new Error(`Cannot swap a ${requiredPosition} with a player in another position.`);
  }

  let assignments = input.result.assignments.map((assignment) => {
    if (assignment.registrationId === first.registrationId) return { ...assignment, teamIndex: second.teamIndex };
    if (assignment.registrationId === second.registrationId) return { ...assignment, teamIndex: first.teamIndex };
    return assignment;
  });
  assignments = settleCaptain(assignments, first.teamIndex!, second.registrationId);
  assignments = settleCaptain(assignments, second.teamIndex!, first.registrationId);

  const lookup: Lookup = new Map(input.candidates.map((candidate) => [candidate.registrationId, candidate]));
  const warnings = [
    ...input.result.warnings.filter((warning) => warning.code !== "ign_collision"),
    ...clashWarnings(teamMembers(assignments, input.result.teamCount), lookup),
  ];
  const next: SoloDrawResult = {
    ...input.result,
    assignments,
    warnings,
    canLock: isLockable(input.result.teamCount, warnings),
  };
  const violations = checkDrawInvariants(next, input.rules);
  if (violations.length > 0) throw new Error(`The swap would break the draw: ${violations.join(", ")}`);
  return next;
}
