import type { Match } from "@prisma/client";
import { generateCompetitionGraph, type CompetitionGraph } from "../../src/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS, type TournamentFormatConfig } from "../../src/lib/tournament/formats/types";
import { competitionProjection } from "../../src/lib/tournament/operations/result-projection";
import { planSchedule, type ScheduleDraft, type ScheduleInput } from "../../src/lib/tournament/scheduling";

type FixtureEvent = { id: string; slug: string; status: string; format: string };
type FixtureTeam = { id: string; eventId: string; source: string | null };
type FixtureMatch = Pick<Match, "id" | "eventId" | "roundLabel" | "round" | "slot" | "homeTeamId" | "awayTeamId" | "status" | "homeScore" | "awayScore" | "winnerTeamId">;

const FINISHED_FORMAT: TournamentFormatConfig = {
  version: 1,
  kind: "single_elimination",
  bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
  thirdPlace: "required",
};
const CONFIG = {
  "flashpeak-revision-closed": { status: "Registration Closed", teams: 4, matches: 3, dependencies: 2, format: TOURNAMENT_FORMAT_PRESETS.singleElimination },
  "flashpeak-rising-64": { status: "Ongoing", teams: 8, matches: 7, dependencies: 6, format: TOURNAMENT_FORMAT_PRESETS.singleElimination },
  "flashpeak-champions-32": { status: "Finished", teams: 8, matches: 8, dependencies: 8, format: FINISHED_FORMAT },
} as const;

function drift(): never { throw new Error("FIXTURE_DRIFT"); }

export function buildFixtureGraph(event: FixtureEvent, teams: FixtureTeam[], matches: FixtureMatch[]): { graph: CompetitionGraph; seeds: { id: string; seed: number }[] } {
  const fixture = CONFIG[event.slug as keyof typeof CONFIG];
  if (!fixture || event.status !== fixture.status || event.format !== "Single Elimination" ||
      teams.length !== fixture.teams || matches.length !== fixture.matches) drift();
  const seeds = teams.map((_, index) => ({ id: `team-${event.slug}-${index + 1}`, seed: index + 1 }));
  const byId = new Map(teams.map((team) => [team.id, team]));
  if (byId.size !== teams.length || seeds.some((seed) => byId.get(seed.id)?.eventId !== event.id || byId.get(seed.id)?.source !== "demo")) drift();
  const graph = generateCompetitionGraph({ eventId: event.id, config: fixture.format, teams: seeds });
  if (graph.matches.length !== fixture.matches || graph.dependencies.length !== fixture.dependencies || graph.phases.length !== 1) drift();
  const rows = new Map(matches.map((match) => [match.id, match]));
  if (rows.size !== matches.length || graph.matches.some((node) => !rows.has(node.id))) drift();
  const projectionRows = matches.map((match) => ({ ...match, resultVersion: match.status === "Completed" ? 1 : 0 }));
  const projection = competitionProjection(graph, projectionRows as Match[]);
  const rounds = new Map<string, number>();
  for (const [index, node] of graph.matches.entries()) {
    const row = rows.get(node.id)!;
    const key = `${node.phaseId}:${node.bracket}:${node.round}:${node.leg}`;
    if (!rounds.has(key)) rounds.set(key, rounds.size + 1);
    const home = projection.resolve(node.home), away = projection.resolve(node.away);
    const expectedStatus = event.status === "Finished" ? "Completed" : event.status === "Ongoing" && index === 0 ? "Live" : "Scheduled";
    if (row.eventId !== event.id || row.roundLabel !== `${node.bracket} ${node.round}` || row.round !== rounds.get(key) ||
        row.slot !== index + 1 || row.homeTeamId !== home || row.awayTeamId !== away || row.status !== expectedStatus ||
        (expectedStatus !== "Completed" && (row.homeScore !== 0 || row.awayScore !== 0 || row.winnerTeamId !== null)) ||
        (expectedStatus === "Completed" && (!row.winnerTeamId || ![home, away].includes(row.winnerTeamId)))) drift();
  }
  if (event.status === "Finished" && (projection.placements.length !== 3 || projection.placements.some((item, index) => item.rank !== index + 1 || !item.teamId))) drift();
  return { graph, seeds };
}

export function createSyntheticSchedule(
  graph: CompetitionGraph,
  matches: ReadonlyArray<{ id: string; status: string }>,
  input: Omit<ScheduleInput, "graph" | "matchStates" | "existingAssignments">,
): ScheduleDraft {
  const playable = graph.matches.filter((node) => node.status === "pending");
  if (matches.length !== graph.matches.length || new Set(matches.map((match) => match.id)).size !== matches.length ||
      playable.some((node) => !matches.some((match) => match.id === node.id))) drift();
  const first = planSchedule({ ...input, graph, matchStates: Object.fromEntries(matches.map((match) => [match.id, "scheduled"])) });
  if (!first.feasible || first.conflicts.length || first.assignments.length !== playable.length ||
      new Set(first.assignments.map((assignment) => assignment.matchId)).size !== playable.length) drift();
  const fixed = planSchedule({ ...input, graph, existingAssignments: first.assignments,
    matchStates: Object.fromEntries(matches.map((match) => [match.id, match.status === "Live" ? "live" : match.status === "Completed" ? "completed" : "scheduled"])) });
  const ordered = (draft: ScheduleDraft) => JSON.stringify([...draft.assignments].sort((a, b) => a.matchId.localeCompare(b.matchId)));
  if (!fixed.feasible || fixed.conflicts.length || ordered(first) !== ordered(fixed)) drift();
  return first;
}
