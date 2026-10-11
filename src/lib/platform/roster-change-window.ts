import type { Match } from "@prisma/client";
import type { CompetitionGraph } from "../tournament/competition/types";
import { isTerminal } from "../tournament/operations/state";

/**
 * `free`    – the roster lock is not active yet; captains edit as before.
 * `limited` – locked, but the organizer allowed a few approved roster changes
 *             and the group stage is still running.
 * `locked`  – no roster change at all.
 */
export type RosterChangeWindow = "free" | "limited" | "locked";

export interface RosterChangeWindowInput {
  /** Result of the existing all-or-nothing roster lock. */
  baseLocked: boolean;
  eventStatus: string;
  rosterChangeLimit: number;
  /** Null for legacy events and when the graph cannot be read. */
  graph: CompetitionGraph | null;
  matches: ReadonlyArray<Match>;
}

/**
 * Decides which roster rule applies. Every doubtful case resolves to `locked`:
 * a missing or malformed graph, or a format without a group stage.
 */
export function resolveRosterChangeWindow(input: RosterChangeWindowInput): RosterChangeWindow {
  if (!input.baseLocked) return "free";
  if (input.rosterChangeLimit <= 0) return "locked";
  if (input.eventStatus === "Finished") return "locked";

  const { graph } = input;
  if (!graph || graph.config.kind !== "group_playoffs") return "locked";

  try {
    const groupPhaseIds = new Set(graph.phases.filter((phase) => phase.standingsRules).map((phase) => phase.id));
    if (groupPhaseIds.size === 0) return "locked";

    const playoffMatchIds = new Set(graph.matches.filter((match) => !groupPhaseIds.has(match.phaseId)).map((match) => match.id));
    // The window stays open after the groups finish so a team can field its best
    // roster for the playoffs. It closes when the first playoff match starts.
    if (input.matches.some((match) => playoffMatchIds.has(match.id) && isTerminal(match))) return "locked";
  } catch {
    return "locked";
  }
  return "limited";
}

/** Reads the graph stored on the first phase; anything unexpected becomes null (locked). */
export function graphFromPhaseConfiguration(configuration: unknown, eventId: string): CompetitionGraph | null {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return null;
  const graph = (configuration as { graph?: unknown }).graph;
  if (!graph || typeof graph !== "object") return null;
  const candidate = graph as Partial<CompetitionGraph>;
  if (candidate.eventId !== eventId) return null;
  if (!Array.isArray(candidate.phases) || !Array.isArray(candidate.matches) || !Array.isArray(candidate.groups) || !candidate.config) return null;
  return graph as CompetitionGraph;
}
