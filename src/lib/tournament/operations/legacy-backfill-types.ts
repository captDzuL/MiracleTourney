import type { CompetitionGraph, CompetitionMatch, SeededTeam, SingleEliminationConfig } from "../competition";
import type { CompletionSourceRows } from "@/lib/completion/prisma-adapter";
import type { CompletionReadiness } from "@/lib/completion/readiness";

export type BackfillEvent = {
  id: string;
  slug: string;
  format: string;
  formatConfig: unknown;
  organizerUserId: string | null;
  competitionVersion: number;
  gameId: string;
  gameModeId: string;
};
export type BackfillTeam = { id: string; name: string };
export type BackfillMatch = {
  id: string;
  round: number | null;
  slot: number | null;
  roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  status: string;
  resultVersion: number;
  scheduleMetadata?: unknown;
};
export type BackfillRoundConfig = { roundLabel: string; bestOf: number };
export type BackfillGame = { matchId: string; gameNumber: number; homeScore: number; awayScore: number };
/** A third-place match that was played but never stored. Only the winner is known. */
export type ThirdPlaceSpec = { winnerTeamName: string; loserTeamName: string; reason: string };
export type BackfillExisting = { phaseCount: number; resultRevisionCount: number; dependencyCount: number };

export type LegacyBackfillInput = {
  event: BackfillEvent;
  teams: BackfillTeam[];
  matches: BackfillMatch[];
  roundConfigs: BackfillRoundConfig[];
  matchGames: BackfillGame[];
  thirdPlace?: ThirdPlaceSpec;
  actorUserId: string;
  now: Date;
  existing?: BackfillExisting;
  playerStats?: CompletionSourceRows["playerStats"];
  approvedSubmissions?: CompletionSourceRows["approvedSubmissions"];
};

export type ScoreSnapshot = {
  bestOf: number;
  games: { gameNumber: number; homeScore: number; awayScore: number }[];
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  scoreRecorded?: false;
};

/** Existing metadata of the old row is kept; only the graph node is added. */
export type ScheduleMetadata = Record<string, unknown> & { graphMatch: CompetitionMatch };

export type BackfillMatchUpdate = {
  matchId: string;
  data: {
    phaseId: string;
    scheduleMetadata: ScheduleMetadata;
    resultVersion: 1;
    resultSnapshot: ScoreSnapshot;
    resultConfirmedAt: Date;
    scheduleStatus: "completed";
  };
};

export type BackfillMatchCreate = {
  id: string;
  eventId: string;
  phaseId: string;
  roundLabel: string;
  round: number;
  slot: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
  status: "Completed";
  scheduleStatus: "completed";
  resultVersion: 1;
  resultSnapshot: ScoreSnapshot;
  resultConfirmedAt: Date;
  scheduleMetadata: { graphMatch: CompetitionMatch };
};

export type BackfillDependency = {
  id: string;
  eventId: string;
  sourceMatchId: string;
  targetMatchId: string;
  outcome: "winner" | "loser";
  targetSlot: "home" | "away";
};

export type BackfillRevision = {
  eventId: string;
  matchId: string;
  version: 1;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  scoreSnapshot: ScoreSnapshot;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
};

export type BackfillPhase = {
  id: string;
  eventId: string;
  label: string;
  sequence: number;
  status: "active";
  configuration: Record<string, unknown>;
};

export type LegacyBackfillPlan = {
  eventId: string;
  /** competitionVersion read when planning; the writer bumps it once with a compare-and-set. */
  competitionVersion: number;
  formatConfig: SingleEliminationConfig;
  seeds: SeededTeam[];
  graph: CompetitionGraph;
  phase: BackfillPhase;
  matchUpdates: BackfillMatchUpdate[];
  createdMatches: BackfillMatchCreate[];
  dependencies: BackfillDependency[];
  revisions: BackfillRevision[];
  actorUserId: string;
  warnings: string[];
  notes: string[];
};

export type BackfillFinalFact = { matchId: string; official: boolean; winnerTeamId: string | null; loserTeamId: string | null };

export type BackfillPrediction = {
  readiness: CompletionReadiness;
  /** What the completion reader sees for the title match; null when the graph has no readable final. */
  final: BackfillFinalFact | null;
  awardStatisticCounts: Record<"mvp" | "top_scorer" | "top_defender" | "top_assist", number>;
};

export type LegacyBackfillResult =
  | { ok: false; problems: string[] }
  | { ok: true; plan: LegacyBackfillPlan; prediction: BackfillPrediction };
