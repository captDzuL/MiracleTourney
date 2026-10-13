import { samePosition } from "./normalize";
import { assertSupportedRules } from "./slots";
import type { SoloCandidate, SoloRules, SoloWarning } from "./types";

export type SoloPlan = Readonly<{
  teamCount: number;
  /** Players who hold the required position, in registration order, including emergency keepers. */
  keeperRegistrationIds: readonly string[];
  /** The part of `keeperRegistrationIds` that came from field players who offered to fill in. */
  emergencyUsedRegistrationIds: readonly string[];
  /** Field players who get a team, in registration order. */
  fieldRegistrationIds: readonly string[];
  /** Players without a team. Always the later registrations. Does not depend on any seed. */
  unplacedRegistrationIds: readonly string[];
  warnings: readonly SoloWarning[];
}>;

const MIN_TEAMS = 2;

function compareRegistration(left: SoloCandidate, right: SoloCandidate): number {
  if (left.registeredAt !== right.registeredAt) return left.registeredAt - right.registeredAt;
  if (left.registrationId < right.registrationId) return -1;
  return left.registrationId > right.registrationId ? 1 : 0;
}

function assertValidInput(candidates: readonly SoloCandidate[], participantCap: number): void {
  if (!Number.isInteger(participantCap) || participantCap < MIN_TEAMS) {
    throw new RangeError(`Team count must be a whole number of at least ${MIN_TEAMS}.`);
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.registrationId)) {
      throw new Error(`Duplicate registration in the draw: ${candidate.registrationId}`);
    }
    seen.add(candidate.registrationId);
    if (candidate.primaryPosition.trim() === "") {
      throw new Error(`Registration ${candidate.registrationId} has no primary position.`);
    }
  }
}

/**
 * Decides how many teams can be built and exactly who is in or out. Nothing here is random,
 * so the organizer can see who would be left out before choosing a seed.
 *
 * Who is in: keepers by registration order, then the earliest emergency keepers if keepers
 * are short, then field players by registration order. The rest are left out.
 */
export function planTeams(input: {
  candidates: readonly SoloCandidate[];
  participantCap: number;
  rules: SoloRules;
}): SoloPlan {
  const { requiredPosition } = assertSupportedRules(input.rules);
  assertValidInput(input.candidates, input.participantCap);

  const fieldPerTeam = input.rules.teamSize - 1;
  const ordered = [...input.candidates].sort(compareRegistration);
  const required = ordered.filter((candidate) => samePosition(candidate.primaryPosition, requiredPosition));
  const open = ordered.filter((candidate) => !samePosition(candidate.primaryPosition, requiredPosition));
  const emergency = open.filter(
    (candidate) => candidate.secondaryPosition !== null && samePosition(candidate.secondaryPosition, requiredPosition),
  );

  let teamCount = 0;
  for (let teams = input.participantCap; teams >= MIN_TEAMS; teams -= 1) {
    const missingKeepers = Math.max(0, teams - required.length);
    if (missingKeepers <= emergency.length && open.length - missingKeepers >= fieldPerTeam * teams) {
      teamCount = teams;
      break;
    }
  }

  const keepers = required.slice(0, Math.min(required.length, teamCount));
  const emergencyUsed = emergency.slice(0, Math.max(0, teamCount - required.length));
  const emergencyUsedIds = new Set(emergencyUsed.map((candidate) => candidate.registrationId));
  const field = open
    .filter((candidate) => !emergencyUsedIds.has(candidate.registrationId))
    .slice(0, fieldPerTeam * teamCount);

  const placed = new Set([...keepers, ...emergencyUsed, ...field].map((candidate) => candidate.registrationId));
  const unplaced = ordered.filter((candidate) => !placed.has(candidate.registrationId));

  return {
    teamCount,
    keeperRegistrationIds: [...keepers, ...emergencyUsed].map((candidate) => candidate.registrationId),
    emergencyUsedRegistrationIds: emergencyUsed.map((candidate) => candidate.registrationId),
    fieldRegistrationIds: field.map((candidate) => candidate.registrationId),
    unplacedRegistrationIds: unplaced.map((candidate) => candidate.registrationId),
    warnings: buildWarnings({
      teamCount,
      participantCap: input.participantCap,
      fieldPerTeam,
      requiredCount: required.length,
      emergencyCount: emergency.length,
      openCount: open.length,
      unplacedCount: unplaced.length,
    }),
  };
}

function buildWarnings(counts: {
  teamCount: number;
  participantCap: number;
  fieldPerTeam: number;
  requiredCount: number;
  emergencyCount: number;
  openCount: number;
  unplacedCount: number;
}): SoloWarning[] {
  const warnings: SoloWarning[] = [];
  if (counts.teamCount === 0) warnings.push({ code: "too_few_teams", detail: { minimum: MIN_TEAMS } });

  const requiredMissing = Math.max(0, counts.participantCap - counts.requiredCount - counts.emergencyCount);
  if (requiredMissing > 0) warnings.push({ code: "required_short", detail: { missing: requiredMissing } });

  const keepersFromOpen = Math.max(0, counts.participantCap - counts.requiredCount);
  const openMissing = Math.max(0, counts.fieldPerTeam * counts.participantCap - (counts.openCount - keepersFromOpen));
  if (openMissing > 0) warnings.push({ code: "open_short", detail: { missing: openMissing } });

  if (counts.teamCount > 0 && counts.teamCount < counts.participantCap) {
    warnings.push({ code: "team_count_below_cap", detail: { teamCount: counts.teamCount, participantCap: counts.participantCap } });
  }
  if (counts.unplacedCount > 0) warnings.push({ code: "unplaced", detail: { count: counts.unplacedCount } });
  return warnings;
}
