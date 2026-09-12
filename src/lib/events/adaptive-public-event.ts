import type { AppUser, EventStatus } from "@/lib/platform/types";
import { findGameConfig, findGameModeConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import {
  tournamentFormatConfigSchema,
  upgradeLegacyTournamentFormat,
  type TournamentFormatConfig,
} from "@/lib/tournament/formats/types";

export type RegistrationAvailability = "upcoming" | "open" | "full" | "closed" | "legacy";

export type RegistrationViewerState =
  | "anonymous"
  | "wrong_role"
  | "eligible_without_team"
  | "eligible_with_team"
  | "draft_incomplete"
  | "pending_payment"
  | "pending_review"
  | "rejected"
  | "expired"
  | "approved";

export type RegistrationCta =
  | { kind: "login"; label: string; enabled: true }
  | { kind: "start"; label: string; href: string; enabled: true }
  | { kind: "continue"; label: string; href: string; enabled: true }
  | { kind: "status"; label: string; href: string; enabled: true }
  | { kind: "disabled"; label: string; reason: string; enabled: false };

export type AdaptivePublicEventViewModel = {
  event: {
    id: string;
    slug: string;
    name: string;
    description: string;
    logoUrl: string | null;
    posterUrl: string | null;
    gameName: string;
    modeName: string;
    formatLabel: string;
    formatDetails: string[];
    eventStartsAt: string;
    timezone: string;
    venue: string;
    prize: string | null;
  };
  organizer: {
    name: string;
    verified: boolean;
    contactChannel: string;
    contactValue: string;
    contactHref: string | null;
  };
  registration: {
    availability: RegistrationAvailability;
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
  };
  viewer: {
    state: RegistrationViewerState;
    cta: RegistrationCta;
  };
};

export function shouldUseAdaptiveRegistrationRenderer(input: {
  enabled: boolean;
  status: EventStatus;
  availability: RegistrationAvailability;
}) {
  return input.enabled
    && (input.status === "Published" || input.status === "Registration Closed")
    && input.availability !== "legacy";
}
export function getRegistrationAvailability(input: {
  status: EventStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  occupiedSlots: number;
  participantCap: number;
  now: Date;
}): RegistrationAvailability {
  if (!["Published", "Registration Closed"].includes(input.status)) return "legacy";
  if (!input.opensAt || !input.closesAt) return "legacy";
  if (input.status === "Registration Closed" || input.now >= input.closesAt) return "closed";
  if (input.now < input.opensAt) return "upcoming";
  if (input.occupiedSlots >= input.participantCap) return "full";
  return "open";
}

const CTA_LABEL = {
  login: "register_team",
  create: "create_team_and_register",
  select: "select_team_to_register",
  continue: "continue_registration",
  payment: "continue_payment",
  status: "view_registration_status",
  repair: "repair_payment_proof",
  registered: "view_registered_team",
  retry: "register_again",
  wrongRole: "use_captain_account",
  upcoming: "registration_upcoming",
  closed: "registration_closed",
  full: "registration_full",
  legacy: "registration_unavailable",
} as const;

export function buildRegistrationCta(input: {
  state: RegistrationViewerState;
  availability: RegistrationAvailability;
  href: string;
}): RegistrationCta {
  const { state, availability, href } = input;

  if (state === "pending_payment") return { kind: "continue", label: CTA_LABEL.payment, href, enabled: true };
  if (state === "pending_review") return { kind: "status", label: CTA_LABEL.status, href, enabled: true };
  if (state === "rejected") return { kind: "continue", label: CTA_LABEL.repair, href, enabled: true };
  if (state === "approved") return { kind: "status", label: CTA_LABEL.registered, href, enabled: true };
  if (state === "wrong_role") {
    return { kind: "disabled", label: CTA_LABEL.wrongRole, reason: "captain_account_required", enabled: false };
  }

  if (availability !== "open") {
    const reason = availability === "upcoming"
      ? CTA_LABEL.upcoming
      : availability === "full"
        ? CTA_LABEL.full
        : availability === "closed"
          ? CTA_LABEL.closed
          : CTA_LABEL.legacy;
    return { kind: "disabled", label: reason, reason, enabled: false };
  }

  if (state === "anonymous") return { kind: "login", label: CTA_LABEL.login, enabled: true };
  if (state === "eligible_without_team") return { kind: "start", label: CTA_LABEL.create, href, enabled: true };
  if (state === "eligible_with_team") return { kind: "start", label: CTA_LABEL.select, href, enabled: true };
  if (state === "draft_incomplete") return { kind: "continue", label: CTA_LABEL.continue, href, enabled: true };
  return { kind: "start", label: CTA_LABEL.retry, href, enabled: true };
}

export function normalizeOrganizerContact(channel: string, value: string): string | null {
  const normalizedChannel = channel.trim().toLowerCase();
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  if (normalizedChannel.includes("whatsapp") || normalizedChannel === "wa") {
    const digits = normalizedValue.replace(/\D/g, "").replace(/^0/, "62");
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (normalizedChannel.includes("email")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue) ? `mailto:${normalizedValue}` : null;
  }
  if (normalizedChannel.includes("instagram") || normalizedChannel === "ig") {
    if (/^https?:\/\//i.test(normalizedValue)) return normalizedValue;
    const handle = normalizedValue.replace(/^@/, "").replace(/^instagram\.com\//i, "");
    return handle ? `https://instagram.com/${handle}` : null;
  }
  return null;
}

export function describeTournamentFormat(config: TournamentFormatConfig): { label: string; details: string[] } {
  if (config.kind === "single_elimination") {
    const details = [
      `Early rounds BO${config.bestOf.earlyRounds}`,
      `Semifinals BO${config.bestOf.semifinals}`,
      `Final BO${config.bestOf.final}`,
    ];
    if (config.thirdPlace === "required") details.push(`Third-place match BO${config.bestOf.thirdPlace}`);
    return { label: "Single Elimination", details };
  }

  if (config.kind === "double_elimination") {
    return {
      label: "Double Elimination",
      details: [
        `Early rounds BO${config.bestOf.earlyRounds}`,
        `Upper final BO${config.bestOf.upperFinal}`,
        `Lower final BO${config.bestOf.lowerFinal}`,
        `Grand final BO${config.bestOf.grandFinal}`,
      ],
    };
  }

  if (config.kind === "round_robin") {
    return {
      label: "Round-Robin",
      details: [
        config.legs === 2 ? "Double round-robin" : "Single round-robin",
        `${config.points.win}/${config.points.draw}/${config.points.loss} points`,
      ],
    };
  }

  return {
    label: "Group + Playoffs",
    details: [
      `${config.groupCount} groups`,
      `Top ${config.qualifiersPerGroup} qualify from each group`,
      config.groupStage.legs === 2 ? "Double round-robin group stage" : "Single round-robin group stage",
      config.playoffs.kind === "single_elimination" ? "Single-elimination playoffs" : "Double-elimination playoffs",
      ...(config.playoffs.kind === "single_elimination" && config.playoffs.thirdPlace === "required"
        ? [`Third-place match BO${config.playoffs.bestOf.thirdPlace}`]
        : []),
    ],
  };
}

function parseFormat(format: string, formatConfig: unknown): TournamentFormatConfig {
  const parsed = tournamentFormatConfigSchema.safeParse(formatConfig);
  if (parsed.success) return parsed.data;
  return upgradeLegacyTournamentFormat(format === "League" ? "League" : "Single Elimination");
}

async function getViewerState(
  eventId: string,
  viewer: AppUser | null,
  now: Date,
): Promise<RegistrationViewerState> {
  if (!viewer) return "anonymous";
  if (viewer.role !== "captain") return "wrong_role";

  const [activeTeam, request, draftTeams] = await Promise.all([
    prisma.team.findFirst({ where: { eventId, captainId: viewer.id }, select: { id: true } }),
    prisma.teamRegistrationRequest.findFirst({
      where: { eventId, captainId: viewer.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, expiresAt: true },
    }),
    prisma.team.findMany({
      where: { eventId: null, captainId: viewer.id },
      select: { _count: { select: { players: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (activeTeam) return "approved";
  if (request) {
    if (request.status === "pending_payment") return request.expiresAt <= now ? "expired" : "pending_payment";
    if (request.status === "pending_review") return "pending_review";
    if (request.status === "rejected") return request.expiresAt <= now ? "expired" : "rejected";
    if (request.status === "approved") return "approved";
    return "expired";
  }
  if (!draftTeams.length) return "eligible_without_team";
  return draftTeams.some((team) => team._count.players >= 1) ? "eligible_with_team" : "draft_incomplete";
}

export async function getAdaptivePublicEventView(
  slug: string,
  viewer: AppUser | null,
  now: Date = new Date(),
): Promise<AdaptivePublicEventViewModel | null> {
  const row = await prisma.event.findFirst({
    where: { slug, status: { in: ["Published", "Registration Closed", "Ongoing", "Finished"] } },
    include: {
      activeVisualAsset: true,
      organizer: { include: { organizerProfile: true } },
    },
  });
  if (!row) return null;

  const [activeTeamCount, pendingReviewCount, platformProfile] = await Promise.all([
    prisma.team.count({ where: { eventId: row.id } }),
    prisma.teamRegistrationRequest.count({ where: { eventId: row.id, status: "pending_review" } }),
    row.organizerUserId
      ? Promise.resolve(null)
      : prisma.platformProfile.findUnique({ where: { id: "global" } }),
  ]);
  const occupiedSlots = activeTeamCount + pendingReviewCount;
  const registrationAvailability = getRegistrationAvailability({
    status: row.status as EventStatus,
    opensAt: row.registrationOpensAt,
    closesAt: row.registrationClosesAt,
    occupiedSlots,
    participantCap: row.participantCap,
    now,
  });
  const availability: RegistrationAvailability = row.eventStartsAt
    ? registrationAvailability
    : "legacy";
  const game = findGameConfig(row.gameId);
  const mode = findGameModeConfig(row.gameModeId);
  const format = describeTournamentFormat(parseFormat(row.format, row.formatConfig));
  const profile = row.organizer?.organizerProfile;
  const organizerName = row.organizerUserId
    ? profile?.organizationName ?? row.organizerName ?? row.organizer?.name ?? "Organizer"
    : platformProfile?.displayName ?? "Miracle";
  const contactChannel = profile?.contactChannel ?? platformProfile?.contactChannel ?? "";
  const contactValue = profile?.contactValue ?? platformProfile?.contactValue ?? "";
  const state = await getViewerState(row.id, viewer, now);
  const href = `/captain?tab=registration&eventId=${encodeURIComponent(row.id)}`;

  return {
    event: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      logoUrl: row.logoUrl,
      posterUrl: row.activeVisualAsset?.status === "approved" && row.activeVisualAsset.url
        ? row.activeVisualAsset.url
        : row.gameImageUrl,
      gameName: game?.name ?? row.gameId,
      modeName: mode?.name ?? row.gameModeId,
      formatLabel: format.label,
      formatDetails: format.details,
      eventStartsAt: row.eventStartsAt?.toISOString() ?? row.startsAt,
      timezone: row.timezone,
      venue: row.venueAddress ?? row.venue,
      prize: row.prizePoolLabel,
    },
    organizer: {
      name: row.organizerUserId ? organizerName : "Miracle",
      verified: row.organizerUserId ? profile?.verified ?? row.organizerVerified : true,
      contactChannel,
      contactValue,
      contactHref: normalizeOrganizerContact(contactChannel, contactValue),
    },
    registration: {
      availability,
      opensAt: row.registrationOpensAt?.toISOString() ?? null,
      closesAt: row.registrationClosesAt?.toISOString() ?? null,
      activeTeamCount,
      pendingReviewCount,
      occupiedSlots,
      remainingSlots: Math.max(0, row.participantCap - occupiedSlots),
      participantCap: row.participantCap,
      feeRequired: row.registrationFeeRequired,
      feeAmount: row.registrationFeeAmount,
      feeLabel: row.registrationFeeLabel ?? "",
      minimumRoster: 1,
      maximumRoster: mode?.maxRosterSize ?? 1,
    },
    viewer: {
      state,
      cta: buildRegistrationCta({ state, availability, href }),
    },
  };
}

export async function getAdaptivePublicEventViewWithRetry(
  slug: string,
  viewer: AppUser | null,
  now: Date = new Date(),
): Promise<AdaptivePublicEventViewModel | null> {
  try {
    return await getAdaptivePublicEventView(slug, viewer, now);
  } catch {
    return getAdaptivePublicEventView(slug, viewer, now);
  }
}
