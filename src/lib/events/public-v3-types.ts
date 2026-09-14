import type { RegistrationViewerState, RegistrationCta } from "./adaptive-public-event";
import type { AppUser } from "@/lib/platform/types";

/** Indicates whether a public field came from the V3 lifecycle or a legacy projection. */
export type PublicV3DataSource = "authoritative" | "compatible";

/**
 * Public pages only need a small, non-sensitive viewer description.  AppUser is
 * accepted for callers that already have a session; the loose shape also keeps
 * route adapters from leaking private session fields into this boundary.
 */
export type PublicViewer =
  | AppUser
  | {
      id?: string | null;
      email?: string;
      name?: string;
      role?: AppUser["role"] | "public";
      [key: string]: unknown;
    }
  | null;

export type PublicV3Locale = "id" | "en";
export type PublicV3LocalizedHref = Record<PublicV3Locale, string>;
export type PublicV3RouteKey = "overview" | "register" | "participants" | "schedule" | "bracket" | "leaderboard" | "standings" | "custom";

export type PublicV3RouteTarget = {
  key: PublicV3RouteKey;
  hrefByLocale: PublicV3LocalizedHref;
};

export type PublicV3RouteTargets = {
  overview: PublicV3RouteTarget;
  register: PublicV3RouteTarget;
  participants: PublicV3RouteTarget;
  schedule: PublicV3RouteTarget;
  bracket: PublicV3RouteTarget;
  leaderboard: PublicV3RouteTarget;
  standings: PublicV3RouteTarget;
};

function localizedPath(path: string, locale: PublicV3Locale): string {
  const [rawPathname, search = ""] = path.split("?");
  const pathname = rawPathname.replace(/^\/(?:id|en)(?=\/|$)/, "") || "/";
  const query = search ? "?" + search : "";
  return pathname === "/" ? "/" + locale + query : "/" + locale + pathname + query;
}

/** Build the two canonical public paths once so consumers never concatenate locales themselves. */
export function publicV3LocalizedHref(path: string): PublicV3LocalizedHref {
  return { id: localizedPath(path, "id"), en: localizedPath(path, "en") };
}

export function publicV3RouteTarget(slug: string, key: PublicV3RouteKey): PublicV3RouteTarget {
  const encodedSlug = encodeURIComponent(slug);
  const suffix = key === "overview"
    ? ""
    : key === "register"
      ? "/register"
      : key === "participants"
        ? "/participants"
        : key === "schedule"
          ? "/schedule"
          : key === "bracket"
            ? "/bracket"
            : key === "leaderboard"
              ? "/leaderboards"
              : key === "standings"
                ? "/standings"
                : "";
  return {
    key,
    hrefByLocale: publicV3LocalizedHref("/events/" + encodedSlug + suffix),
  };
}

export function publicV3RouteTargets(slug: string): PublicV3RouteTargets {
  return {
    overview: publicV3RouteTarget(slug, "overview"),
    register: publicV3RouteTarget(slug, "register"),
    participants: publicV3RouteTarget(slug, "participants"),
    schedule: publicV3RouteTarget(slug, "schedule"),
    bracket: publicV3RouteTarget(slug, "bracket"),
    leaderboard: publicV3RouteTarget(slug, "leaderboard"),
    standings: publicV3RouteTarget(slug, "standings"),
  };
}

export function resolvePublicV3Route(target: PublicV3RouteTarget, locale: PublicV3Locale): string {
  return target.hrefByLocale[locale];
}

export type PublicV3Navigation = {
  overview: boolean;
  participants: boolean;
  schedule: boolean;
  bracket: boolean;
  leaderboard: boolean;
  targets: PublicV3RouteTargets;
};

export type PublicV3Cta = {
  kind?: RegistrationCta["kind"] | "link";
  label: string;
  href: string | null;
  hrefByLocale: PublicV3LocalizedHref | null;
  target?: PublicV3RouteTarget;
  enabled: boolean;
  reason?: string;
};
export type PublicV3Identity = {
  id: string;
  slug: string;
  title: string;
  description: string;
  game: {
    id: string;
    name: string;
    modeId: string;
    modeName: string;
  };
  organizer: {
    name: string;
    verified: boolean;
    trust: "verified" | "unverified";
    contactChannel: string;
    contactValue: string;
    contactHref: string | null;
  };
  statusExplanation: string;
  statusExplanationKey: string;
  routes: PublicV3RouteTargets;
  facts: {
    startsAt: string;
    timezone: string;
    venue: string;
    prize: string | null;
    participants: number;
    participantCap: number;
    remainingSlots: number;
  };
  cta: PublicV3Cta;
  navigation: PublicV3Navigation;
  poster: {
    eventUrl: string | null;
    logoUrl: string | null;
    gameImageUrl: string | null;
  };
  format: string;
};

export type PublicV3Team = {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  players: number;
};

export type PublicV3Match = {
  id: string;
  roundLabel: string;
  home: string | null;
  away: string | null;
  status: "scheduled" | "live" | "completed" | "delayed" | "postponed";
  homeScore: number | null;
  awayScore: number | null;
  start: string | null;
  end: string | null;
  room: string | null;
  bestOf: number;
  official: boolean;
};

export type PublicV3BracketSlot = {
  id: string;
  roundLabel: string;
  home: string;
  away: string;
  status: "tbd" | "scheduled" | "live" | "completed";
  homeScore: number | null;
  awayScore: number | null;
  official: boolean;
};

export type PublicV3LeaderboardEntry = {
  playerId: string;
  playerName: string;
  nickname: string;
  teamId: string;
  teamName: string;
  position: string;
  game: number;
  score: number | null;
  goal: number;
  assist: number;
  passing: number;
  defense: number;
};

export type PublicV3Certificate = {
  id: string;
  type: string;
  recipientKind: "team" | "player" | string;
  recipientId: string;
  recipientName: string;
  publishedUrl: string;
  verificationCode: string;
};

export type PublicV3CertificateState = {
  status: "preparing" | "published";
  publishedCount: number;
  expectedCount: number;
  isCurrent: boolean;
  isComplete: boolean;
  publicationVersion: number | null;
};

export type PublicV3Shared = {
  source: PublicV3DataSource;
  identity: PublicV3Identity;
  /** Flat aliases keep the model ergonomic for small presentation components. */
  event: PublicV3Identity;
  organizer: PublicV3Identity["organizer"];
  facts: PublicV3Identity["facts"];
  statusExplanation: string;
  statusExplanationKey: string;
  cta: PublicV3Cta;
  navigation: PublicV3Navigation;
  teams: PublicV3Team[];
  updates: Array<{ id: string; title: string; body: string; publishedAt: string }>;
};

export type PublicV3RegistrationEventViewModel = PublicV3Shared & {
  mode: "registration";
  registration: {
    availability: "upcoming" | "open" | "full" | "closed" | "legacy";
    opensAt: string | null;
    closesAt: string | null;
    activeTeamCount: number;
    pendingReviewCount: number;
    occupiedSlots: number;
    remainingSlots: number;
    participantCap: number;
    feeRequired: boolean;
    feeAmount: number | null;
    feeLabel: string;
    minimumRoster: number;
    maximumRoster: number;
    bracket: { status: "tbd"; slots: PublicV3BracketSlot[] };
  };
  viewer: { state: RegistrationViewerState; cta: RegistrationCta };
  matches: PublicV3Match[];
  leaderboard: PublicV3LeaderboardEntry[];
};

export type PublicV3DrawingEventViewModel = PublicV3Shared & {
  mode: "drawing";
  drawing: {
    published: boolean;
    status: "published" | "tbd";
    seeds: Array<{ teamId: string; teamName: string; seed: number }>;
    slots: PublicV3BracketSlot[];
  };
  matches: PublicV3Match[];
  standings: Array<{ phaseId: string; groupId: string | null; rows: Array<Record<string, unknown>> }>;
  schedule: { version: number; publishedAt: string | null } | null;
  leaderboard: PublicV3LeaderboardEntry[];
};

export type PublicV3OngoingEventViewModel = PublicV3Shared & {
  mode: "ongoing";
  matches: PublicV3Match[];
  liveMatches: PublicV3Match[];
  nextMatches: PublicV3Match[];
  recentResults: PublicV3Match[];
  schedule: { version: number; publishedAt: string | null; changes: Array<Record<string, unknown>> } | null;
  standings: Array<Record<string, unknown>>;
  stream: { url: string; label: string; platform: string; isLive: boolean } | null;
  leaderboard: PublicV3LeaderboardEntry[];
  stateVersion: string;
  lastUpdatedAt: string;
};

export type PublicV3FinishedEventViewModel = PublicV3Shared & {
  mode: "finished";
  certificates: PublicV3CertificateState & { items: PublicV3Certificate[] };
  podium: Array<{
    rank: number;
    teamId: string;
    teamName: string;
    certificate: PublicV3Certificate | null;
  }>;
  awards: Array<{
    type: string;
    recipientId: string;
    recipientName: string;
    teamId: string;
    teamName: string;
    reason: string | null;
    certificate: PublicV3Certificate | null;
  }>;
  matches: PublicV3Match[];
  standings: Array<{ phaseId: string; groupId: string | null; rows: Array<Record<string, unknown>> }>;
  leaderboard: PublicV3LeaderboardEntry[];
};

export type PublicV3EventViewModel =
  | PublicV3RegistrationEventViewModel
  | PublicV3DrawingEventViewModel
  | PublicV3OngoingEventViewModel
  | PublicV3FinishedEventViewModel;

export type CompatiblePublicEventRecord = {
  id?: string;
  slug?: string;
  name?: string;
  title?: string;
  description?: string | null;
  logoUrl?: string | null;
  posterUrl?: string | null;
  gameImageUrl?: string | null;
  gameId?: string;
  gameName?: string;
  gameModeId?: string;
  modeName?: string;
  format?: string;
  status?: string;
  participantCap?: number;
  registrationWindow?: string | null;
  startsAt?: string | null;
  eventStartsAt?: Date | string | null;
  registrationOpensAt?: Date | string | null;
  registrationClosesAt?: Date | string | null;
  timezone?: string | null;
  venue?: string | null;
  venueAddress?: string | null;
  organizerName?: string | null;
  organizerVerified?: boolean | null;
  organizerContactChannel?: string | null;
  organizerContactValue?: string | null;
  prizePoolLabel?: string | null;
  registrationFeeRequired?: boolean | null;
  registrationFeeAmount?: number | null;
  registrationFeeLabel?: string | null;
  registrationUrl?: string | null;
  stream?: { url?: string; label?: string; platform?: string; enabled?: boolean; isLive?: boolean } | null;
  [key: string]: unknown;
};

export type CompatiblePublicTeam = {
  id: string;
  name: string;
  tag?: string | null;
  logoUrl?: string | null;
  players?: Array<unknown> | number | null;
  [key: string]: unknown;
};

export type CompatiblePublicMatch = {
  id: string;
  roundLabel?: string | null;
  round?: number | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
  scheduledAt?: Date | string | null;
  scheduledEndsAt?: Date | string | null;
  scheduleRoom?: string | null;
  resultVersion?: number | null;
  winnerTeamId?: string | null;
  bestOf?: number | null;
  [key: string]: unknown;
};

export type CompatiblePublicCertificate = {
  id: string;
  type: string;
  recipientKind?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  publishedUrl?: string | null;
  verificationCode?: string | null;
  publishedAt?: Date | string | null;
  status?: string | null;
  completionId?: string | null;
  completionVersion?: number | null;
  [key: string]: unknown;
};

export type CompatiblePublicEventInput = {
  event?: CompatiblePublicEventRecord;
  eventRow?: CompatiblePublicEventRecord;
  viewer?: PublicViewer;
  now?: Date;
  teams?: CompatiblePublicTeam[];
  registrations?: Array<{ status?: string; team?: CompatiblePublicTeam | null; teamId?: string | null; [key: string]: unknown }>;
  matches?: CompatiblePublicMatch[];
  completion?: {
    id?: string;
    status?: string;
    sourceSnapshot?: unknown;
    podium?: Array<{ rank: number; teamId: string; teamName: string; [key: string]: unknown }>;
    podiumPlacements?: Array<{ rank: number; teamId: string; teamName: string; [key: string]: unknown }>;
    awards?: Array<{ type: string; status?: string; decision?: { recipientId: string; recipientName: string; teamId: string; teamName: string; reason?: string | null; [key: string]: unknown } | null; [key: string]: unknown }>;
    [key: string]: unknown;
  } | null;
  publication?: { completionId?: string | null; completionVersion?: number | null; version?: number | null; certificateIds?: unknown; [key: string]: unknown } | null;
  certificates?: CompatiblePublicCertificate[];
  leaderboard?: Array<{
    playerId: string;
    playerName: string;
    nickname?: string | null;
    teamId: string;
    teamName: string;
    position?: string | null;
    game?: number | null;
    score?: number | null;
    stats?: unknown;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};
