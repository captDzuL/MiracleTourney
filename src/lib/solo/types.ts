/** Which quota a registration counts against. */
export type SoloSlotGroup = "required" | "open";

/** Per-game draw rules. Phase 1 supports exactly one required position, held by one player per team. */
export type SoloRules = Readonly<{
  teamSize: number;
  requiredPositions: Readonly<Record<string, number>>;
}>;

/** An approved registration that is eligible to be placed in a team. */
export type SoloCandidate = Readonly<{
  registrationId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  /** Equal to the required position means this player can fill in when that position is short. */
  secondaryPosition: string | null;
  willingCaptain: boolean;
  /** Epoch milliseconds. Earlier registrations keep their place when there are more players than slots. */
  registeredAt: number;
}>;

export type SoloWarningCode =
  | "too_few_teams"
  | "required_short"
  | "open_short"
  | "team_count_below_cap"
  | "unplaced"
  | "ign_collision";

/** Machine-readable warning. The UI turns the code into text. */
export type SoloWarning = Readonly<{
  code: SoloWarningCode;
  detail?: Readonly<Record<string, number | string>>;
}>;

export type SoloAssignment = Readonly<{
  registrationId: string;
  /** 1-based team number. Null for players who did not make a team. */
  teamIndex: number | null;
  role: "starter" | "unplaced";
  /** The position this player holds in the team. Null for unplaced players. */
  assignedPosition: string | null;
  isCaptain: boolean;
}>;

export type SoloDrawResult = Readonly<{
  assignments: readonly SoloAssignment[];
  teamCount: number;
  unplacedCount: number;
  warnings: readonly SoloWarning[];
  /** False when the draw has a blocking problem, such as an IGN clash that cannot be split. */
  canLock: boolean;
}>;
