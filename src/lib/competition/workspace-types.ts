import type { CompetitionGraph } from "@/lib/tournament/competition";
import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";
import type { StandingsTable } from "@/lib/tournament/operations/result-projection";
import type { StoredSchedule } from "@/lib/tournament/operations/state";

export type WorkspaceMatch = {
  id: string; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number;
  status: string; scheduleStatus: string; resultVersion: number; bestOf: number;
  roundLabel: string; phaseId: string | null; groupId: string | null;
  start: string | null; end: string | null; room: string | null;
  games: { gameNumber: number; homeScore: number; awayScore: number }[];
};
export type CompetitionWorkspaceState = {
  compatibility?: Pick<import("@/lib/tournament/operations/legacy-compatibility").LegacyDiagnostic, "status" | "reason"> | null;
  event: { id: string; name: string; version: number; timezone: string; startsAt: string | null; publishedScheduleVersion: number | null; config: TournamentFormatConfig | null };
  graph: CompetitionGraph | null; matches: WorkspaceMatch[]; teams: { id: string; name: string }[];
  standings: StandingsTable[];
  readiness: { matchId: string; teamId: string; status: string; note: string | null }[];
  actions: { id: string; matchId: string | null; priority: string; title: string; detail: string | null }[];
  schedule: ({ id: string; version: number } & StoredSchedule) | null;
  publishedSchedule: CompetitionWorkspaceState["schedule"];
  incidents: { id: string; matchId: string | null; kind: string; description: string; resolvedAt: string | null }[];
  announcements: { id: string; title: string; body: string; status: string; urgency: "info" | "important" | "urgent" }[];
  audit: { id: string; matchId: string | null; action: string; reason: string | null; actor: string | null; at: string | null }[];
  unavailableSections: string[];
};
export type WorkspaceView = "competition" | "schedule" | "match-control" | "match";
