import type { TournamentFormatConfig } from "../formats/types";
export type { TournamentFormatConfig } from "../formats/types";

export type SeededTeam = { id: string; seed: number };
export type SingleEliminationConfig = Extract<TournamentFormatConfig, { kind: "single_elimination" }>;
export type DoubleEliminationConfig = Extract<TournamentFormatConfig, { kind: "double_elimination" }>;
export type RoundRobinConfig = Extract<TournamentFormatConfig, { kind: "round_robin" }>;
export type GroupPlayoffsConfig = Extract<TournamentFormatConfig, { kind: "group_playoffs" }>;
export type StandingsRules = Pick<RoundRobinConfig, "legs" | "points" | "tiebreakers">;

export type ParticipantSource =
  | { kind: "team"; teamId: string; seed: number }
  | { kind: "bye" }
  | { kind: "match"; matchId: string; outcome: "winner" | "loser" }
  | { kind: "group_rank"; groupId: string; rank: number };

export type CompetitionMatch = {
  id: string;
  phaseId: string;
  groupId: string | null;
  bracket: "single" | "upper" | "lower" | "grand_final" | "third_place" | "round_robin";
  round: number;
  slot: number;
  leg: number;
  bestOf: number;
  home: ParticipantSource;
  away: ParticipantSource;
  /** A bye has no loser and needs no official result. */
  status: "pending" | "bye" | "empty";
  advance: ParticipantSource | null;
};

export type MatchDependency = {
  id: string;
  sourceMatchId: string;
  targetMatchId: string;
  outcome: "winner" | "loser";
  targetSlot: "home" | "away";
};

export type QualificationDependency = {
  id: string;
  groupId: string;
  rank: number;
  targetMatchId: string;
  targetSlot: "home" | "away";
};

export type CompetitionPhase = {
  id: string;
  sequence: number;
  kind: "single_elimination" | "double_elimination" | "round_robin" | "groups";
  standingsRules: StandingsRules | null;
};

export type CompetitionGroup = {
  id: string;
  phaseId: string;
  label: string;
  sequence: number;
  teams: SeededTeam[];
  qualificationCutline: number;
};

export type CompetitionGraph = {
  eventId: string;
  config: TournamentFormatConfig;
  phases: CompetitionPhase[];
  groups: CompetitionGroup[];
  matches: CompetitionMatch[];
  dependencies: MatchDependency[];
  qualificationDependencies: QualificationDependency[];
  placements: { rank: number; source: ParticipantSource }[];
};

export type GenerateCompetitionGraphInput = {
  eventId: string;
  config: TournamentFormatConfig;
  teams: readonly SeededTeam[];
  /** Elimination capacity; rounded up to a power of two. Defaults to team count. */
  slotCount?: number;
  /** Must include any official revision, including a draw or a corrected result. */
  hasOfficialResults?: boolean;
};
