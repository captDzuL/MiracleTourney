export type TeamSeed = {
  id: string;
  name: string;
};

export type BracketVisibility = "hidden" | "ready" | "auto-advance";

export type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  byeForTeamId?: string;
  sourceMatchIds?: [string | null, string | null];
  resolvedWinnerTeamId?: string | null;
  visibility?: BracketVisibility;
  isPublicVisible?: boolean;
};

export type MatchResultInput = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type TeamStanding = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
  rank: number;
};

export type StatLine = Record<string, number>;

export type PlayerMatchStatInput = {
  matchId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  gameSlug: string;
  stats: StatLine;
};

export type PlayerLeaderboardEntry = {
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  gameSlug: string;
  matchesPlayed: number;
  totalStats: StatLine;
};
