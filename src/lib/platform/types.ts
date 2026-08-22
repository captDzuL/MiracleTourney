export type UserRole = "public" | "captain" | "organizer" | "platform_admin" | "admin";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: Exclude<UserRole, "public">;
  deactivatedAt?: Date | null;
};

export type Game = {
  id: string;
  name: string;
  slug: string;
  accent: string;
  defaultModeLabel?: string;
  fallbackLogoUrl?: string;
  defaultBackgroundUrl?: string;
  primaryStatKey?: string;
  certificateThemeId?: "flashpeak" | "kuroko" | "mlbb" | "hok" | "valorant" | "dota2";
  artTheme?: {
    bg: string;
    orb1: string;
    orb2: string;
    ring: string;
    label: string;
  };
};

export type GameMode = {
  id: string;
  gameId: string;
  name: string;
  slug: string;
  defaultModeLabel?: string;
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

export type VisualAssetSource = "organizer_upload" | "ai_generated";

export type VisualAssetStatus =
  | "generating"
  | "ready_for_review"
  | "approved"
  | "rejected"
  | "failed";

export type EventVisualAsset = {
  id: string;
  eventId: string;
  source: VisualAssetSource;
  status: VisualAssetStatus;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  focalX: number;
  focalY: number;
  provider?: string;
  model?: string;
  promptVersion?: string;
  workflowRunId?: string;
  sourceUrl?: string;
  rightsAttestedAt?: Date;
  errorCode?: string;
  createdByUserId?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  characterArtUrl?: string;
  accentColor?: string;
  organizerUserId?: string;
  organizerName?: string;
  organizerVerified?: boolean;
  prizePoolLabel?: string;
  registrationFeeLabel?: string;
  registrationUrl?: string;
  activeVisualAssetId?: string;
  activeVisualAsset?: EventVisualAsset;
};

export type Certificate = {
  id: string;
  eventId: string;
  teamId: string;
  imageUrl: string;
  createdAt: Date;
};

export type Team = {
  id: string;
  eventId: string;
  captainId: string;
  name: string;
  logoText: string;
  logoUrl?: string;
  tag: string;
  captainName?: string;
  captainContact?: string;
  captain?: { id: string; name: string } | null;
  source?: "demo" | "csv-import" | "registration-intake";
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
