import { samePosition } from "./normalize";
import { assertSupportedRules } from "./slots";
import type { SoloAssignment, SoloDrawResult, SoloRules } from "./types";

/**
 * Every rule a draw must obey before it can become real teams.
 * Returns violation codes; an empty list means the draw is valid.
 */
export function checkDrawInvariants(result: SoloDrawResult, rules: SoloRules): string[] {
  const { requiredPosition } = assertSupportedRules(rules);
  const violations: string[] = [];

  const seen = new Set<string>();
  const teams = new Map<number, SoloAssignment[]>();
  let unplacedCount = 0;

  for (const assignment of result.assignments) {
    if (seen.has(assignment.registrationId)) violations.push("duplicate_registration");
    seen.add(assignment.registrationId);

    if (assignment.role === "unplaced") {
      unplacedCount += 1;
      if (assignment.teamIndex !== null) violations.push("unplaced_with_team");
      if (assignment.isCaptain) violations.push("unplaced_captain");
      continue;
    }
    if (assignment.teamIndex === null) {
      violations.push("starter_without_team");
      continue;
    }
    teams.set(assignment.teamIndex, [...(teams.get(assignment.teamIndex) ?? []), assignment]);
  }

  const indexes = [...teams.keys()].sort((left, right) => left - right);
  if (indexes.some((index, position) => index !== position + 1)) violations.push("team_index_gap");
  if (indexes.length !== result.teamCount) violations.push("team_count_mismatch");
  if (unplacedCount !== result.unplacedCount) violations.push("unplaced_count_mismatch");

  for (const index of indexes) {
    const members = teams.get(index) ?? [];
    if (members.length !== rules.teamSize) violations.push(`team:${index}:size`);
    const holders = members.filter(
      (member) => member.assignedPosition !== null && samePosition(member.assignedPosition, requiredPosition),
    );
    if (holders.length !== 1) violations.push(`team:${index}:required_position`);
    if (members.filter((member) => member.isCaptain).length !== 1) violations.push(`team:${index}:captain`);
  }

  return [...new Set(violations)];
}
