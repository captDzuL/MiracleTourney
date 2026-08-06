export type UserRole = "public" | "captain" | "admin";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: Exclude<UserRole, "public">;
};

export type Game = {
  id: string;
  name: string;
  slug: string;
  accent: string;
};

export type GameMode = {
  id: string;
  gameId: string;
  name: string;
  slug: string;
  teamSize: 3 | 4 | 5 | 6 | 7;
  maxRosterSize: number;
  positions: string[];
  statKeys: string[];
};

export type EventStatus =
  | "Draft"
  | "Published"
  | "Registration Closed"
  | "Ongoing"
  | "Finished";

export type TournamentFormat = "Single Elimination" | "League";

export type EventStream = {
  platform: "youtube" | "tiktok" | "external";
  url: string;
  label: string;
  enabled: boolean;
  isLive: boolean;
};

export type Event = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl?: string;
  gameImageUrl?: string;
  gameId: string;
  gameModeId: string;
  format: TournamentFormat;
  status: EventStatus;
  participantCap: 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256;
  registrationWindow: string;
  startsAt: string;
  venue: string;
  stream?: EventStream;
};

export type Team = {
  id: string;
  eventId: string;
  captainId: string;
  name: string;
  logoText: string;
  tag: string;
  captainName?: string;
  captainContact?: string;
  source?: "demo" | "csv-import";
};

export type Player = {
  id: string;
  teamId: string;
  eventId: string;
  displayName: string;
  nickname: string;
  position: string;
  jerseyNumber?: number;
};

export type Match = {
  id: string;
  eventId: string;
  roundLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: "Scheduled" | "Completed";
  slot?: number;
  round?: number;
  winnerTeamId?: string | null;
  scheduledLabel?: string;
};

export type EventRoundConfig = {
  id: string;
  eventId: string;
  roundLabel: string;
  bestOf: number;
};

export type MatchGame = {
  id: string;
  matchId: string;
  gameNumber: number;
  homeScore: number;
  awayScore: number;
};
