import { parseTournamentFormatConfig } from "../formats/types";
import type { GenerateCompetitionGraphInput } from "./types";

export function validateGraphInput(input: GenerateCompetitionGraphInput): GenerateCompetitionGraphInput {
  if (input.hasOfficialResults) throw new Error("Cannot regenerate a competition with official results");
  const config = parseTournamentFormatConfig(input.config);
  if (!input.eventId.trim()) throw new Error("Event ID must not be blank");
  if (input.teams.length < 2 || input.teams.length > 256) {
    throw new Error("Team count must be between 2 and 256");
  }
  const ids = input.teams.map((team) => team.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("Team IDs must be nonblank and unique");
  }
  const teams = input.teams.map((team) => ({ ...team })).sort((a, b) => a.seed - b.seed);
  if (teams.some((team, index) => team.seed !== index + 1)) {
    throw new Error("Seeds must be unique, contiguous integers from 1 to team count");
  }
  const slotCount = input.slotCount ?? teams.length;
  if (!Number.isInteger(slotCount) || slotCount < teams.length || slotCount > 256) {
    throw new Error("Slot count must be an integer between team count and 256");
  }
  if (config.kind === "round_robin" || config.kind === "group_playoffs") {
    if (slotCount !== teams.length) throw new Error("Slot count is an elimination-only capacity");
  }
  if (config.kind === "group_playoffs" && Math.floor(teams.length / config.groupCount) < Math.max(2, config.qualifiersPerGroup)) {
    throw new Error("Each group needs at least two teams and enough teams for its qualification cutline");
  }
  return { ...input, config, teams, slotCount };
}
