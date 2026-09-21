import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cache } from "react";
import { unstable_cache } from "next/cache";

import bcrypt from "bcryptjs";

import { applyEventLifecycleSideEffects } from "@/lib/events/event-lifecycle";
import type { PublicDiscoveryEvent } from "@/lib/events/public-discovery";
import {
  gameModes,
  games,
  findGameConfig,
  getFallbackLogoUrl,
  getGameConfig,
  getGameIdForMode,
  getGameModeConfig,
  getGamePrimaryStatKey,
  getStatKeysForMode,
} from "@/lib/platform/config";
import {
  resolvePlayerScoreGameNumbers,
  validatePlayerStatPayload,
  type PlayerStatPayloadMap,
} from "@/lib/player-stats/form";
import {
  aggregateFlashpeakLeaderboard,
  parsePlayerScoreArray,
  type FlashpeakLeaderboardEntry,
  type FlashpeakLeaderboardSource,
} from "@/lib/player-stats/flashpeak";
import type { AppUser, Certificate, Event, EventRoundConfig, EventStatus, EventStream, EventVisualAsset, Match, MatchGame, PaymentSettings, Player, Team, TeamRegistrationRequest, TeamRegistrationRequestStatus, TournamentFormat, VisualAssetSource, VisualAssetStatus } from "@/lib/platform/types";
import type { RegistrationNormalizedTeam, RegistrationPreviewItem, RegistrationSourceKind } from "@/lib/imports/registration-intake";
import { mapRequestStatus, normalizeRegistrationSource, type RegistrationRecord } from "@/lib/registration/records";
import type { ResolvedEventPaymentSettings } from "@/lib/registration/event-payment-settings";
import { tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";
import {
  aggregatePlayerLeaderboard,
  buildLeagueStandings,
  generateRoundRobinSchedule,
  getPublicVisibleSingleEliminationBracket,
  getLiveStreamPresentation,
  projectSingleEliminationBracket,
} from "@/lib/tournament/engine";
import type { BracketMatch, MatchResultInput, PlayerMatchStatInput } from "@/lib/tournament/types";
import { Prisma } from "@prisma/client";
import * as demoStore from "./demo-store";
import { prisma } from "./db";

const PUBLIC_EVENT_STATUSES = new Set<EventStatus>(["Published", "Registration Closed", "Ongoing", "Finished"]);

// Organizer list readers keep the existing response shapes while preventing an
// event-sized request from turning into an unbounded database read.
const ORGANIZER_READER_ROW_LIMIT = 500;
const ORGANIZER_READER_HISTORY_LIMIT = 100;


type RegistrationWindowEvent = {
  status: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
};

function isNewRegistrationWindowOpen(event: RegistrationWindowEvent, now = new Date()): boolean {
  if (event.status !== "Published") return false;
  if (event.registrationOpensAt && now < event.registrationOpensAt) return false;
  if (event.registrationClosesAt && now >= event.registrationClosesAt) return false;
  return true;
}

function assertNewRegistrationWindowOpen(event: RegistrationWindowEvent, now = new Date()): void {
  if (!isNewRegistrationWindowOpen(event, now)) {
    throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
  }
}

async function runSerializableRegistrationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 60_000,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Pendaftaran berubah bersamaan. Silakan coba lagi.");
}

/** Single relation set every mapped-event query loads, so `mapEvent` stays the only mapping site. */
export const eventPublicInclude = { stream: true, activeVisualAsset: true } satisfies Prisma.EventInclude;

type EventVisualAssetRow = {
  id: string; eventId: string; source: string; status: string;
  url?: string | null; mimeType?: string | null; width?: number | null; height?: number | null; byteSize?: number | null;
  storageProvider?: string | null; storageKey?: string | null; contentSha256?: string | null; purpose?: string | null;
  focalX: number; focalY: number;
  provider?: string | null; model?: string | null; promptVersion?: string | null;
  workflowRunId?: string | null; sourceUrl?: string | null; rightsAttestedAt?: Date | null;
  errorCode?: string | null; createdByUserId?: string | null; approvedAt?: Date | null;
  createdAt: Date; updatedAt: Date;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapEventVisualAsset(row: EventVisualAssetRow): EventVisualAsset {
  const asset: EventVisualAsset = {
    id: row.id,
    eventId: row.eventId,
    source: row.source as VisualAssetSource,
    status: row.status as VisualAssetStatus,
    focalX: row.focalX,
    focalY: row.focalY,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.url) asset.url = row.url;
  if (row.mimeType) asset.mimeType = row.mimeType;
  if (row.width != null) asset.width = row.width;
  if (row.height != null) asset.height = row.height;
  if (row.byteSize != null) asset.byteSize = row.byteSize;
  if (row.storageProvider === "vercel_blob" || row.storageProvider === "local") asset.storageProvider = row.storageProvider;
  if (row.storageKey) asset.storageKey = row.storageKey;
  if (row.contentSha256) asset.contentSha256 = row.contentSha256;
  if (row.purpose === "certificate_team_logo" || row.purpose === "certificate_character_art") asset.purpose = row.purpose;
  if (row.provider) asset.provider = row.provider;
  if (row.model) asset.model = row.model;
  if (row.promptVersion) asset.promptVersion = row.promptVersion;
  if (row.workflowRunId) asset.workflowRunId = row.workflowRunId;
  if (row.sourceUrl) asset.sourceUrl = row.sourceUrl;
  if (row.rightsAttestedAt) asset.rightsAttestedAt = row.rightsAttestedAt;
  if (row.errorCode) asset.errorCode = row.errorCode;
  if (row.createdByUserId) asset.createdByUserId = row.createdByUserId;
  if (row.approvedAt) asset.approvedAt = row.approvedAt;
  return asset;
}

export function mapEvent(row: {
  id: string; slug: string; name: string; description: string;
  logoUrl: string | null; gameImageUrl: string | null;
  gameId: string; gameModeId: string; format: string; status: string;
  formatConfig?: Prisma.JsonValue | null;
  participantCap: number; registrationWindow: string; startsAt: string;
  venue: string; characterArtUrl?: string | null; accentColor?: string | null;
  organizerUserId?: string | null; organizerName?: string | null; organizerVerified?: boolean | null;
  prizePoolLabel?: string | null; registrationFeeRequired?: boolean | null; registrationFeeAmount?: number | null; registrationFeeLabel?: string | null; registrationUrl?: string | null;
  stream?: { platform: string; url: string; label: string; enabled: boolean; isLive: boolean; } | null;
  activeVisualAssetId?: string | null;
  activeVisualAsset?: EventVisualAssetRow | null;
}): Event {
  const event: Event = {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    gameId: row.gameId, gameModeId: row.gameModeId,
    format: row.format as TournamentFormat,
    status: row.status as EventStatus,
    participantCap: row.participantCap as Event["participantCap"],
    registrationWindow: row.registrationWindow, startsAt: row.startsAt, venue: row.venue,
    registrationFeeRequired: row.registrationFeeRequired ?? false,
  };
  const logoUrl = row.logoUrl ?? getFallbackLogoUrl(row.gameId);
  if (logoUrl) event.logoUrl = logoUrl;
  if (row.gameImageUrl) event.gameImageUrl = row.gameImageUrl;
  if (row.characterArtUrl) event.characterArtUrl = row.characterArtUrl;
  if (row.accentColor) event.accentColor = row.accentColor;
  if (row.organizerUserId) event.organizerUserId = row.organizerUserId;
  if (row.organizerName) event.organizerName = row.organizerName;
  if (row.organizerVerified != null) event.organizerVerified = row.organizerVerified;
  if (row.prizePoolLabel) event.prizePoolLabel = row.prizePoolLabel;
  if (row.registrationFeeAmount != null) event.registrationFeeAmount = row.registrationFeeAmount;
  if (row.registrationFeeLabel) event.registrationFeeLabel = row.registrationFeeLabel;
  if (row.registrationUrl) event.registrationUrl = row.registrationUrl;
  const formatConfig = tournamentFormatConfigSchema.safeParse(row.formatConfig);
  if (formatConfig.success) event.formatConfig = formatConfig.data;
  if (row.activeVisualAssetId) event.activeVisualAssetId = row.activeVisualAssetId;
  if (row.activeVisualAsset) event.activeVisualAsset = mapEventVisualAsset(row.activeVisualAsset);
  if (row.stream) {
    event.stream = {
      platform: row.stream.platform as EventStream["platform"],
      url: row.stream.url, label: row.stream.label,
      enabled: row.stream.enabled, isLive: row.stream.isLive,
    };
  }
  return event;
}

function mapTeam(row: {
  id: string; eventId: string | null; captainId: string | null;
  name: string; logoText: string; logoUrl?: string | null; tag: string;
  captainName: string | null; captainContact: string | null; captainIgn: string | null;
  captainUid: string | null; captainIsPlayer: boolean; source: string;
  captain?: { id: string; name: string } | null;
}): Team {
  return {
    id: row.id, captainId: row.captainId ?? "",
    ...(row.eventId ? { eventId: row.eventId } : {}),
    name: row.name, logoText: row.logoText, tag: row.tag,
    ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
    ...(row.captainName ? { captainName: row.captainName } : {}),
    ...(row.captainContact ? { captainContact: row.captainContact } : {}),
    ...(row.captainIgn ? { captainIgn: row.captainIgn } : {}),
    ...(row.captainUid ? { captainUid: row.captainUid } : {}),
    captainIsPlayer: row.captainIsPlayer,
    ...(row.captain != null ? { captain: row.captain } : {}),
    source: row.source as Team["source"],
  };
}


const PAYMENT_SETTINGS_ID = "global";
const ACTIVE_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review", "approved"];
const RESERVED_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review"];
const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
// pending_review is deliberately excluded: once a captain has uploaded proof, the
// deadline no longer applies - only an admin approve/reject should resolve the request.
const EXPIRABLE_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "rejected"];

async function expireStaleRegistrationRequests() {
  await prisma.teamRegistrationRequest.updateMany({
    where: {
      status: { in: EXPIRABLE_REGISTRATION_REQUEST_STATUSES },
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired" },
  });
}

function mapPaymentSettings(row: { id: string; qrisImageUrl: string | null; instructions: string | null; updatedAt?: Date } | null): PaymentSettings {
  if (!row) return { id: PAYMENT_SETTINGS_ID };
  return {
    id: row.id,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

const registrationRequestInclude = {
  event: { include: { stream: true } },
  captain: { select: { id: true, name: true, email: true } },
} as const;

function mapTeamRegistrationRequest(row: {
  id: string;
  eventId: string;
  captainId: string;
  teamId: string | null;
  teamName: string;
  teamTag: string;
  status: string;
  proofImageUrl: string | null;
  rejectReason: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  event?: Parameters<typeof mapEvent>[0] | null;
  captain?: { id: string; name: string; email?: string } | null;
}): TeamRegistrationRequest {
  return {
    id: row.id,
    eventId: row.eventId,
    captainId: row.captainId,
    ...(row.teamId ? { teamId: row.teamId } : {}),
    teamName: row.teamName,
    teamTag: row.teamTag,
    status: row.status as TeamRegistrationRequestStatus,
    ...(row.proofImageUrl ? { proofImageUrl: row.proofImageUrl } : {}),
    ...(row.rejectReason ? { rejectReason: row.rejectReason } : {}),
    expiresAt: row.expiresAt,
    ...(row.approvedAt ? { approvedAt: row.approvedAt } : {}),
    ...(row.approvedById ? { approvedById: row.approvedById } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.event ? { event: mapEvent(row.event) } : {}),
    ...(row.captain !== undefined ? { captain: row.captain } : {}),
  };
}

export class RegistrationMutationConflictError extends Error {
  readonly code = "stale_mutation" as const;
  readonly currentUpdatedAt?: Date;

  constructor(message = "Pendaftaran berubah. Muat ulang sebelum mencoba lagi.", currentUpdatedAt?: Date) {
    super(message);
    this.name = "RegistrationMutationConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

export type RegistrationReviewPrecondition = {
  expectedStatus?: TeamRegistrationRequestStatus;
  expectedUpdatedAt?: Date;
};

async function assertEventExists(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new Error("Event tidak ditemukan.");
}

function mapPlayer(row: {
  id: string; teamId: string; eventId: string | null;
  displayName: string; nickname: string; position: string; jerseyNumber: number | null;
}): Player {
  return {
    id: row.id, teamId: row.teamId,
    ...(row.eventId ? { eventId: row.eventId } : {}),
    displayName: row.displayName, nickname: row.nickname, position: row.position,
    ...(row.jerseyNumber != null ? { jerseyNumber: row.jerseyNumber } : {}),
  };
}

function mapUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  sessionVersion?: number;
  deactivatedAt?: Date | null;
  mustChangePassword?: boolean;
}): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as AppUser["role"],
    ...(row.sessionVersion !== undefined ? { sessionVersion: row.sessionVersion } : {}),
    ...(row.deactivatedAt ? { deactivatedAt: row.deactivatedAt } : {}),
    ...(row.mustChangePassword ? { mustChangePassword: true } : {}),
  };
}

function mapMatch(row: {
  id: string; eventId: string; roundLabel: string;
  homeTeamId: string; awayTeamId: string;
  homeScore: number; awayScore: number; status: string;
  slot: number | null; round: number | null; winnerTeamId: string | null; scheduledLabel: string | null;
}): Match {
  return {
    id: row.id, eventId: row.eventId, roundLabel: row.roundLabel,
    homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
    homeScore: row.homeScore, awayScore: row.awayScore,
    status: row.status as Match["status"],
    ...(row.slot != null ? { slot: row.slot } : {}),
    ...(row.round != null ? { round: row.round } : {}),
    ...(row.winnerTeamId ? { winnerTeamId: row.winnerTeamId } : {}),
    ...(row.scheduledLabel ? { scheduledLabel: row.scheduledLabel } : {}),
  };
}

// ── Bracket sizing ─────────────────────────────────────────────────────────────
// `event.participantCap` is only the *maximum* registration allowed. The actual
// bracket must be sized to the number of teams that really registered, rounded
// up to the nearest power of two (byes fill the remaining slots). Using
// `participantCap` directly here was the bug: a 32-cap event with only 7 teams
// would render a full 5-round bracket instead of an 8-slot / 3-round one.
function getBracketSlotCount(teamCount: number): 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256 {
  const safeCount = Math.max(teamCount, 1);
  return Math.pow(2, Math.ceil(Math.log2(safeCount === 1 ? 2 : safeCount))) as 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256;
}

// ── Credential helpers ────────────────────────────────────────────────────────

function generateTempPassword(): string {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

function generateCaptainEmail(tag: string, usedInBatch: Set<string>, explicitEmail?: string): string {
  if (explicitEmail) {
    usedInBatch.add(explicitEmail);
    return explicitEmail;
  }
  let candidate = `${tag.toLowerCase()}@miraclefc.gg`;
  let n = 2;
  while (usedInBatch.has(candidate)) {
    candidate = `${tag.toLowerCase()}${n}@miraclefc.gg`;
    n++;
  }
  usedInBatch.add(candidate);
  return candidate;
}

function generateSyntheticRegistrationEmail(eventSlug: string, tag: string, usedInBatch: Set<string>): string {
  const base = `${eventSlug}-${tag}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let candidate = `${base}@miraclefc.gg`;
  let n = 2;
  while (usedInBatch.has(candidate)) {
    candidate = `${base}-${n}@miraclefc.gg`;
    n += 1;
  }
  usedInBatch.add(candidate);
  return candidate;
}

// ── Static config ─────────────────────────────────────────────────────────────

/** Returns the static list of all supported games from config. */
export function getAllGames() {
  return games;
}

/** Returns the static list of all supported game modes from config. */
export function getGameModes() {
  return gameModes;
}

/** Resolves the game definition for a given event. Throws if the game ID is not found in config. */
export function getGameForEvent(event: Event) {
  return getGameConfig(event.gameId);
}

/** Resolves the game mode definition for a given event. Throws if the mode ID is not found in config. */
export function getModeForEvent(event: Event) {
  return getGameModeConfig(event.gameModeId);
}

// ── Events ────────────────────────────────────────────────────────────────────

/** Returns all publicly-visible events (Published, Registration Closed, Ongoing, Finished). Used by sitemap. */
export async function getAllPublicEvents(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  try {
    return await prisma.event.findMany({
      where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return [];
  }
}

/** Returns all events (all statuses), ordered newest first. For admin use only. */
export async function getEvents(): Promise<Event[]> {
  const rows = await prisma.event.findMany({ include: eventPublicInclude, orderBy: { createdAt: "desc" } });
  return rows.map(mapEvent);
}

/** Returns selected events by ID, preserving database ordering newest first. */
export async function getEventsByIds(eventIds: string[]): Promise<Event[]> {
  if (!eventIds.length) return [];
  try {
    const rows = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      include: eventPublicInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapEvent);
  } catch {
    const eventIdSet = new Set(eventIds);
    return demoStore.getEvents().filter((event) => eventIdSet.has(event.id));
  }
}

export async function getManageableEventsForUser(user: AppUser): Promise<Event[]> {
  if (user.role === "platform_admin" || user.role === "admin") return getEvents();
  if (user.role !== "organizer") return [];

  const rows = await prisma.event.findMany({
    where: { organizerUserId: user.id },
    include: eventPublicInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapEvent);
}

export type PlatformProfileSummary = {
  displayName: string;
  contactChannel: string;
  contactValue: string;
};

export async function getPlatformProfile(): Promise<PlatformProfileSummary | null> {
  return prisma.platformProfile.findUnique({
    where: { id: "global" },
    select: { displayName: true, contactChannel: true, contactValue: true },
  });
}

export async function updatePlatformProfile(input: PlatformProfileSummary): Promise<void> {
  await prisma.platformProfile.upsert({
    where: { id: "global" },
    update: input,
    create: { id: "global", ...input },
  });
}
export type OrganizerProfileSummary = {
  organizationName: string;
  contactChannel: string;
  contactValue: string;
  verified: boolean;
};

export async function getOrganizerProfileForUser(user: AppUser): Promise<OrganizerProfileSummary | null> {
  if (user.role !== "organizer") return null;
  const profile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
    select: { organizationName: true, contactChannel: true, contactValue: true, verified: true },
  });
  return profile;
}

export async function updateOrganizerProfileForUser(
  user: AppUser,
  input: { organizationName: string; contactChannel: string; contactValue: string },
): Promise<void> {
  if (user.role !== "organizer") throw new Error("Not authorized");
  await prisma.$transaction(async (tx) => {
    await tx.organizerProfile.upsert({
      where: { userId: user.id },
      update: input,
      create: { userId: user.id, ...input },
    });
    await tx.event.updateMany({
      where: { organizerUserId: user.id },
      data: { organizerName: input.organizationName },
    });
  });
}
export async function assertUserCanManageEvent(user: AppUser, eventId: string): Promise<void> {
  if (user.role === "platform_admin" || user.role === "admin") return;
  if (user.role !== "organizer") throw new Error("Not authorized");

  const row = await prisma.event.findFirst({
    where: { id: eventId, organizerUserId: user.id },
    select: { id: true },
  });
  if (!row) throw new Error("Not authorized");
}

export async function getManageableEventDraft(user: AppUser, eventId: string) {
  if (user.role !== "organizer" && user.role !== "platform_admin" && user.role !== "admin") return null;
  const row = await prisma.event.findFirst({
    where: {
      id: eventId,
      ...(user.role === "organizer" ? { organizerUserId: user.id } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true, gameId: true, gameModeId: true,
      organizerUserId: true, organizerName: true, organizerVerified: true,
      format: true, formatConfig: true, participantCap: true,
      registrationOpensAt: true, registrationClosesAt: true, eventStartsAt: true,
      timezone: true, venue: true, venueAddress: true,
      registrationFeeRequired: true, registrationFeeAmount: true, prizePoolLabel: true,
      logoUrl: true, gameImageUrl: true, draftRevision: true, publishedRevision: true, status: true,
      _count: { select: { matches: true } },
      organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } },
    },
  });
  if (!row) return null;
  const formatConfig = tournamentFormatConfigSchema.safeParse(row.formatConfig);
  return {
    ...row,
    formatConfig: formatConfig.success ? formatConfig.data : null,
    status: row.status as EventStatus,
  };
}

export async function updateEventOrganizerContact(
  user: AppUser,
  input: { eventId: string; contactChannel: string; contactValue: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, ...(user.role === "organizer" ? { organizerUserId: user.id } : {}) },
      select: { organizerUserId: true, organizerName: true },
    });
    if (!event?.organizerUserId) throw new Error("Not authorized");
    await tx.organizerProfile.upsert({
      where: { userId: event.organizerUserId },
      update: { contactChannel: input.contactChannel, contactValue: input.contactValue },
      create: {
        userId: event.organizerUserId,
        organizationName: event.organizerName ?? user.name,
        contactChannel: input.contactChannel,
        contactValue: input.contactValue,
      },
    });
  });
}

export async function assertUserCanReviewStatSubmission(user: AppUser, submissionId: string): Promise<void> {
  if (user.role === "platform_admin" || user.role === "admin") return;
  if (user.role !== "organizer") throw new Error("Not authorized");

  const row = await prisma.statSubmission.findFirst({
    where: { id: submissionId, status: "pending", event: { organizerUserId: user.id } },
    select: { id: true },
  });
  if (!row) throw new Error("Not authorized");
}

export async function assertUserCanManageTeam(user: AppUser, teamId: string): Promise<{ eventId: string }> {
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    select: { id: true, eventId: true },
  });

  if (!team?.eventId) throw new Error("Not authorized");
  await assertUserCanManageEvent(user, team.eventId);
  return { eventId: team.eventId };
}

export type EventPublicInfoUpdates = {
  description: string;
  registrationWindow: string;
  startsAt: string;
  venue: string;
  prizePoolLabel?: string | null;
  registrationFeeRequired?: boolean;
  registrationFeeAmount?: number | null;
  registrationFeeLabel?: string | null;
  registrationUrl?: string | null;
};

export async function updateEventPublicInfo(
  user: AppUser,
  eventId: string,
  updates: EventPublicInfoUpdates,
): Promise<Event> {
  try {
    await assertUserCanManageEvent(user, eventId);
    const row = await prisma.event.update({
      where: { id: eventId },
      data: updates,
      include: eventPublicInclude,
    });
    return mapEvent(row);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") throw error;
    const event = demoStore.updateEventPublicInfo(user, eventId, updates);
    if (!event) throw new Error("Not authorized");
    return event;
  }
}

/** Returns events with publicly visible statuses: Published, Registration Closed, Ongoing, Finished. */
export async function getPublicEvents(): Promise<Event[]> {
  try {
    const rows = await prisma.event.findMany({
      where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
      include: eventPublicInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapEvent);
  } catch {
    return demoStore.getPublicEvents();
  }
}

/**
 * Returns events with status "Published" only, ordered by start date ascending.
 * Used for the captain sign-up event picker — "Ongoing" events are excluded so
 * captains cannot register once matches have started.
 */
export async function getPublishedEvents(): Promise<Event[]> {
  const rows = await prisma.event.findMany({
    where: { status: "Published" },
    include: eventPublicInclude,
    orderBy: { startsAt: "asc" },
  });
  return rows.map(mapEvent);
}
export async function getOpenRegistrationEventsForCaptain(captainId: string): Promise<Array<Event & { registeredTeams: number }>> {
  if (!captainId) return [];

  const rows = await prisma.event.findMany({
    where: { status: "Published" },
    include: { stream: true },
    orderBy: { startsAt: "asc" },
  });
  const now = new Date();
  const events = rows
    .filter((event) => isNewRegistrationWindowOpen({
      status: event.status,
      registrationOpensAt: event.registrationOpensAt,
      registrationClosesAt: event.registrationClosesAt,
    }, now))
    .map(mapEvent);
  const eventIds = events.map((event) => event.id);
  if (!eventIds.length) return [];

  const [captainTeams, captainRequests, teamCountRows, pendingReviewRows, lockedEntries] = await Promise.all([
    prisma.team.findMany({
      where: { captainId, eventId: { in: eventIds } },
      select: { eventId: true },
    }),
    prisma.teamRegistrationRequest.findMany({
      where: { captainId, eventId: { in: eventIds }, status: { in: ACTIVE_REGISTRATION_REQUEST_STATUSES } },
      select: { eventId: true },
    }),
    prisma.team.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.teamRegistrationRequest.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds }, status: "pending_review" },
      _count: { _all: true },
    }),
    Promise.all(events.map(async (event) => {
      if (event.format !== "Single Elimination") return [event.id, false] as const;
      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });
      return [event.id, completedMatches > 0] as const;
    })),
  ]);

  const joinedEventIds = new Set([
    ...captainTeams.map((team) => team.eventId),
    ...(captainRequests ?? []).map((request) => request.eventId),
  ]);
  const teamCounts = new Map(teamCountRows.map((row) => [row.eventId, row._count._all]));
  const pendingReviewCounts = new Map(pendingReviewRows.map((row) => [row.eventId, row._count._all]));
  const lockedEventIds = new Set(lockedEntries.filter(([, locked]) => locked).map(([eventId]) => eventId));

  return events
    .map((event) => ({
      ...event,
      registeredTeams: (teamCounts.get(event.id) ?? 0) + (pendingReviewCounts.get(event.id) ?? 0),
    }))
    .filter((event) => !joinedEventIds.has(event.id))
    .filter((event) => event.registeredTeams < event.participantCap)
    .filter((event) => !lockedEventIds.has(event.id));
}

/** Direct DB lookup by slug with no status filter. For admin pages that need to see Draft events. */
export async function getEventBySlug(slug: string): Promise<Event | null> {
  try {
    const row = await prisma.event.findUnique({ where: { slug }, include: eventPublicInclude });
    return row ? mapEvent(row) : null;
  } catch {
    return demoStore.getEventBySlug(slug) ?? null;
  }
}

/**
 * Cached (60s, tag "events") public event lookup by slug.
 * Returns null for Draft events. Also memoised per-request via React cache.
 */
export const getPublicEventBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Event | null> => {
      try {
        const row = await prisma.event.findFirst({
          where: { slug, status: { in: [...PUBLIC_EVENT_STATUSES] } },
          include: eventPublicInclude,
        });
        return row ? mapEvent(row) : null;
      } catch {
        return demoStore.getPublicEventBySlug(slug) ?? null;
      }
    },
    ["public-event-by-slug"],
    { revalidate: 60, tags: ["events"] },
  ),
);

// ── Event visual assets ───────────────────────────────────────────────────────


export async function updatePublishedEventSlugAsAdmin(
  user: AppUser,
  eventId: string,
  nextSlug: string,
): Promise<{ oldSlug: string; slug: string }> {
  if (user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");
  const slug = nextSlug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid slug");
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },
      select: { id: true, slug: true },
    });
    if (!event) throw new Error("Event is not editable");
    if (event.slug === slug) return { oldSlug: event.slug, slug };
    const occupied = await tx.event.findFirst({ where: { slug }, select: { id: true } });
    const redirectOccupied = await tx.eventSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { id: true } });
    if (occupied || redirectOccupied) throw new Error("Slug already exists");
    await tx.eventSlugRedirect.create({ data: { oldSlug: event.slug, eventId: event.id } });
    await tx.event.update({
      where: { id: event.id },
      data: { slug, publishedRevision: { increment: 1 } },
    });
    return { oldSlug: event.slug, slug };
  });
}

export async function getPublicEventSlugRedirect(oldSlug: string): Promise<string | null> {
  const redirect = await prisma.eventSlugRedirect.findUnique({
    where: { oldSlug },
    select: { event: { select: { slug: true, status: true } } },
  });
  return redirect && PUBLIC_EVENT_STATUSES.has(redirect.event.status as EventStatus)
    ? redirect.event.slug
    : null;
}

export type CreateEventVisualAssetInput = {
  eventId: string;
  source: VisualAssetSource;
  status: VisualAssetStatus;
  url?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  storageProvider?: "vercel_blob" | "local" | null;
  storageKey?: string | null;
  contentSha256?: string | null;
  purpose?: "certificate_team_logo" | "certificate_character_art" | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  workflowRunId?: string | null;
  sourceUrl?: string | null;
  rightsAttestedAt?: Date | null;
  errorCode?: string | null;
};

function clampFocalCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Lists every revision for an event, newest first. Organizer-scoped. */
export async function listEventVisualAssets(user: AppUser, eventId: string): Promise<EventVisualAsset[]> {
  await assertUserCanManageEvent(user, eventId);
  try {
    const rows = await prisma.eventVisualAsset.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapEventVisualAsset);
  } catch {
    return demoStore.listEventVisualAssets(eventId);
  }
}

export async function createEventVisualAsset(
  user: AppUser,
  input: CreateEventVisualAssetInput,
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, input.eventId);
  const row = await prisma.eventVisualAsset.create({
    data: { ...input, createdByUserId: user.id },
  });
  return mapEventVisualAsset(row);
}

/**
 * Approves a revision and points the event at it inside one transaction so the
 * revision status and `Event.activeVisualAssetId` can never diverge. Already
 * approved revisions stay approvable, which is how rollback works.
 *
 * `dualWriteLegacyImage` mirrors the approved url into the legacy
 * `Event.gameImageUrl` column. It is only meant for the migration window while
 * surfaces that still read the single legacy url are being retired.
 */
export async function approveEventVisualAsset(
  user: AppUser,
  eventId: string,
  assetId: string,
  options: { dualWriteLegacyImage?: boolean } = {},
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventVisualAsset.findFirst({
      where: { id: assetId, eventId, status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    if (!existing) throw new Error("Visual revision is not available for approval");

    const approved = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { status: "approved", approvedAt: new Date() },
    });
    await tx.event.update({
      where: { id: eventId },
      data: {
        activeVisualAssetId: assetId,
        ...(options.dualWriteLegacyImage && approved.url ? { gameImageUrl: approved.url } : {}),
      },
    });
    return mapEventVisualAsset(approved);
  });
}

export async function rejectEventVisualAsset(
  user: AppUser,
  eventId: string,
  assetId: string,
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: eventId }, select: { activeVisualAssetId: true } });
    if (event?.activeVisualAssetId === assetId) throw new Error("Cannot reject the active visual revision");

    const existing = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
    if (!existing) throw new Error("Visual revision not found");

    const rejected = await tx.eventVisualAsset.update({
      where: { id: assetId },
      data: { status: "rejected" },
    });
    return mapEventVisualAsset(rejected);
  });
}

export async function setEventVisualFocalPoint(
  user: AppUser,
  eventId: string,
  assetId: string,
  focalPoint: { x: number; y: number },
): Promise<EventVisualAsset> {
  await assertUserCanManageEvent(user, eventId);
  const existing = await prisma.eventVisualAsset.findFirst({ where: { id: assetId, eventId }, select: { id: true } });
  if (!existing) throw new Error("Visual revision not found");

  const row = await prisma.eventVisualAsset.update({
    where: { id: assetId },
    data: { focalX: clampFocalCoordinate(focalPoint.x), focalY: clampFocalCoordinate(focalPoint.y) },
  });
  return mapEventVisualAsset(row);
}

/** Counts AI generation attempts for an event since `since`, for rate limiting. */
export async function countAiVisualAttempts(eventId: string, since: Date): Promise<number> {
  return prisma.eventVisualAsset.count({
    where: { eventId, source: "ai_generated", createdAt: { gte: since } },
  });
}

// ── Teams ─────────────────────────────────────────────────────────────────────

/**
 * Cached (30s, tag "teams") team list for an event, ordered by registration time.
 * Cache is busted by `revalidateTag("teams")` after any team mutation.
 * Also memoised per-request via React cache to prevent duplicate DB hits within a render.
 */
export const getTeamsForEvent = cache(
  unstable_cache(
    async (eventId: string): Promise<Team[]> => {
      try {
        const rows = await prisma.team.findMany({ where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { captain: { select: { id: true, name: true } } } });
        return rows.map(mapTeam);
      } catch {
        return demoStore.getTeamsForEvent(eventId);
      }
    },
    ["teams-for-event"],
    { revalidate: 30, tags: ["teams"] },
  ),
);

/** Batch-fetches teams for multiple events in one query. */
export async function getTeamsForEvents(eventIds: string[]): Promise<Map<string, Team[]>> {
  const teamsByEvent = new Map(eventIds.map((eventId) => [eventId, [] as Team[]]));
  if (!eventIds.length) return teamsByEvent;

  try {
    const rows = await prisma.team.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { captain: { select: { id: true, name: true } } },
    });
    for (const team of rows.map(mapTeam)) {
      if (team.eventId) teamsByEvent.get(team.eventId)?.push(team);
    }
  } catch {
    for (const eventId of eventIds) {
      teamsByEvent.set(eventId, demoStore.getTeamsForEvent(eventId));
    }
  }

  return teamsByEvent;
}

/** Batch-counts teams for event summary UI without transferring every team row. */
export async function getTeamCountsForEvents(eventIds: string[]): Promise<Map<string, number>> {
  const counts = new Map(eventIds.map((eventId) => [eventId, 0]));
  if (!eventIds.length) return counts;

  try {
    const rows = await prisma.team.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.eventId) counts.set(row.eventId, row._count._all);
    }
  } catch {
    for (const eventId of eventIds) {
      counts.set(eventId, demoStore.getTeamsForEvent(eventId).length);
    }
  }

  return counts;
}

/** Returns all teams registered by a specific captain across all events. Returns empty array for undefined userId. */
export async function getCaptainTeams(userId: string | undefined): Promise<Team[]> {
  if (!userId) return [];
  const rows = await prisma.team.findMany({ where: { captainId: userId }, include: { captain: { select: { id: true, name: true } } } });
  return rows.map(mapTeam);
}

export async function updateTeamLogo(user: AppUser, teamId: string, logoUrl: string): Promise<Team> {
  try {
    await assertUserCanManageTeam(user, teamId);
    const row = await prisma.team.update({
      where: { id: teamId },
      data: { logoUrl },
    });
    return mapTeam(row);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") throw error;
    const team = demoStore.updateTeamLogo(user, teamId, logoUrl);
    if (!team) throw new Error("Not authorized");
    return team;
  }
}

export async function updateCaptainTeamLogo(captainId: string, teamId: string, logoUrl: string): Promise<Team> {
  try {
    const team = await prisma.team.findFirst({
      where: { id: teamId, captainId },
      select: { id: true },
    });
    if (!team) throw new Error("Not authorized");

    const row = await prisma.team.update({
      where: { id: teamId },
      data: { logoUrl },
    });
    return mapTeam(row);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") throw error;
    const team = demoStore.updateCaptainTeamLogo(captainId, teamId, logoUrl);
    if (!team) throw new Error("Not authorized");
    return team;
  }
}

// ── Players ───────────────────────────────────────────────────────────────────

/** Returns all players for a single team, ordered by registration time. */
export async function getPlayersForTeam(teamId: string): Promise<Player[]> {
  try {
    const rows = await prisma.player.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapPlayer);
  } catch {
    return demoStore.getPlayersForTeam(teamId);
  }
}

/** Batch-fetches players for multiple teams in a single query, ordered by team then jersey number. */
export async function getPlayersForTeams(teamIds: string[]): Promise<Player[]> {
  if (!teamIds.length) return [];
  try {
    const rows = await prisma.player.findMany({
      where: { teamId: { in: teamIds } },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    });
    return rows.map(mapPlayer);
  } catch {
    return teamIds.flatMap((teamId) => demoStore.getPlayersForTeam(teamId));
  }
}

/** Returns all players across all teams registered in a given event. */
export async function getPlayersForEvent(eventId: string): Promise<Player[]> {
  try {
    const rows = await prisma.player.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapPlayer);
  } catch {
    return demoStore.getPlayersForEvent(eventId);
  }
}

// ── Matches ───────────────────────────────────────────────────────────────────

/**
 * Cached (30s, tag "teams") match list for an event. Busted alongside teams so bracket
 * projection always reflects fresh results after any match mutation.
 * Also memoised per-request via React cache.
 */
export const getMatchesForEvent = cache(
  unstable_cache(
    async (eventId: string): Promise<Match[]> => {
      try {
        const rows = await prisma.match.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
        return rows.map(mapMatch);
      } catch {
        return demoStore.getMatchesForEvent(eventId);
      }
    },
    ["matches-for-event"],
    { revalidate: 30, tags: ["teams"] },
  ),
);

const ROSTER_LOCKED_MESSAGE = "Roster tim sudah terkunci setelah drawing dipublikasikan atau turnamen berjalan.";

type RosterLockReader = Pick<Prisma.TransactionClient, "event" | "competitionPhase" | "match">;

async function readEventRosterLocked(db: RosterLockReader, eventId: string): Promise<boolean> {
  const [event, publishedPhases, startedMatches] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { status: true } }),
    db.competitionPhase.count({ where: { eventId, status: { in: ["active", "completed"] } } }),
    db.match.count({ where: { eventId, status: { in: ["Live", "Completed"] } } }),
  ]);
  if (!event) return false;
  return event.status === "Ongoing" || event.status === "Finished" || publishedPhases > 0 || startedMatches > 0;
}

/**
 * Serializes every event-roster mutation against competition operations through
 * Event.competitionVersion. If a drawing is published first this transaction
 * rolls back; if the roster wins the race, a stale drawing publish fails CAS and
 * must be rebuilt from the new authoritative roster.
 */
async function assertEventRosterMutable(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  const claimed = await tx.event.updateMany({
    where: { id: eventId },
    data: { competitionVersion: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new Error("Event tidak ditemukan.");
  if (await readEventRosterLocked(tx, eventId)) throw new Error(ROSTER_LOCKED_MESSAGE);
}

/** Returns true for every format once the public drawing or tournament is authoritative. */
export async function isEventBracketLocked(eventId: string): Promise<boolean> {
  return readEventRosterLocked(prisma, eventId);
}

// ── Bracket helpers (copied from demo-store, now async) ───────────────────────

function getBracketRoundLabel(round: number, totalRounds: number) {
  const roundsRemaining = totalRounds - round + 1;
  if (roundsRemaining === 1) return "Final";
  if (roundsRemaining === 2) return "Semifinal";
  if (roundsRemaining === 3) return "Quarterfinal";
  if (roundsRemaining === 4) return "Round of 16";
  return `Round ${round}`;
}

function matchesProjectedPairing(
  match: Pick<Match, "homeTeamId" | "awayTeamId">,
  projected: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,
) {
  return match.homeTeamId === projected.homeTeamId && match.awayTeamId === projected.awayTeamId;
}

async function getProjectedBracketMatches(event: Event, database?: Prisma.TransactionClient): Promise<Match[]> {
  const teams = database
    ? (await database.team.findMany({ where: { eventId: event.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(mapTeam)
    : await getTeamsForEvent(event.id);
  const existingMatches = database
    ? (await database.match.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } })).map(mapMatch)
    : await getMatchesForEvent(event.id);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const bracket = projectSingleEliminationBracket({
    teams: teamSeeds,
    slotCount: getBracketSlotCount(teams.length),
    results: existingMatches,
    eventId: event.id,
  }) as BracketMatch[];
  const existingBySlot = new Map(
    existingMatches
      .filter((m) => m.round != null && m.slot != null)
      .map((m) => [`${m.round}:${m.slot}`, m]),
  );
  const totalRounds = Math.max(...bracket.map((match) => match.round), 1);

  return bracket
    .filter((match) => Boolean(match.homeTeamId && match.awayTeamId))
    .map((match) => {
      const existing = match.round != null && match.slot != null
        ? existingBySlot.get(`${match.round}:${match.slot}`)
        : undefined;
      const aligned = existing ?? null;
      return {
        id: match.id, eventId: event.id,
        roundLabel: getBracketRoundLabel(match.round, totalRounds),
        homeTeamId: match.homeTeamId!, awayTeamId: match.awayTeamId!,
        homeScore: aligned?.homeScore ?? 0, awayScore: aligned?.awayScore ?? 0,
        status: aligned?.status ?? "Scheduled",
        round: match.round, slot: match.slot,
        winnerTeamId: aligned?.winnerTeamId ?? null,
      } satisfies Match;
    })
    .sort((l, r) => (l.round! - r.round!) || (l.slot! - r.slot!));
}

/**
 * Returns the admin-facing list of bracket matches for an event object.
 * For single-elimination: projects the bracket and merges recorded results.
 * For league: returns stored matches with round/slot set.
 */
export async function getBracketManageableMatchesForEvent(event: Event): Promise<Match[]> {
  if (event.format === "Single Elimination") {
    return getProjectedBracketMatches(event);
  }
  const rows = await prisma.match.findMany({
    where: { eventId: event.id, round: { not: null }, slot: { not: null } },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  return rows.map(mapMatch);
}

/** Same as `getBracketManageableMatchesForEvent` but accepts an eventId string, fetching the event internally. */
export async function getBracketManageableMatches(eventId: string): Promise<Match[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, format: true, participantCap: true, slug: true, name: true, description: true, gameId: true, gameModeId: true, status: true, registrationWindow: true, startsAt: true, venue: true, logoUrl: true, gameImageUrl: true } });
  if (!event) return [];

  const fullEvent = mapEvent({ ...event, stream: null });

  if (event.format === "Single Elimination") {
    return getProjectedBracketMatches(fullEvent);
  }

  const rows = await prisma.match.findMany({
    where: { eventId, round: { not: null }, slot: { not: null } },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  return rows.map(mapMatch);
}

/**
 * Saves a BO1 match result (direct scores). Draws are rejected for single-elimination.
 * If the match row doesn't exist yet, it is created from the projected bracket.
 * Returns null if the event or match is not found.
 */
async function legacyResultTransaction<T>(eventId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    // Serialize with V3's event CAS and invalidate a concurrent initializer's
    // snapshot. Rejection rolls the version increment back with the write.
    const locked = await tx.event.updateMany({ where: { id: eventId }, data: { competitionVersion: { increment: 1 } } });
    if (locked.count !== 1) throw new Error("Event not found");
    const completion = await tx.tournamentCompletion.findUnique({
      where: { eventId },
      select: { status: true },
    });
    if (completion?.status === "completed") throw new Error("Tournament completion locks competitive writes");
    if (await tx.competitionPhase.count({ where: { eventId } })) throw new Error("Use the versioned competition operation to submit or correct this result.");
    return work(tx);
  });
}

export async function setMatchResult(input: {
  eventId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}): Promise<Match | null> {
  return legacyResultTransaction(input.eventId, tx => setLegacyMatchResult(tx, input));
}

async function setLegacyMatchResult(prisma: Prisma.TransactionClient, input: { eventId: string; matchId: string; homeScore: number; awayScore: number }): Promise<Match | null> {
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { format: true } });
  if (!event) return null;

  if (event.format === "Single Elimination" && input.homeScore === input.awayScore) {
    throw new Error("Single elimination matches cannot end in a draw.");
  }

  const existingRow = await prisma.match.findFirst({
    where: { id: input.matchId, eventId: input.eventId },
  });
  if (existingRow?.phaseId || (existingRow?.resultVersion ?? 0) > 0) {
    throw new Error("Use the versioned competition operation to submit or correct this result.");
  }

  let homeTeamId: string;
  let awayTeamId: string;
  let roundLabel: string;
  let round: number | null = null;
  let slot: number | null = null;

  if (existingRow) {
    homeTeamId = existingRow.homeTeamId;
    awayTeamId = existingRow.awayTeamId;
    roundLabel = existingRow.roundLabel;
    round = existingRow.round;
    slot = existingRow.slot;
  } else if (event.format === "Single Elimination") {
    const fullEvent = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!fullEvent) return null;
    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }));
    const projMatch = projected.find((m) => m.id === input.matchId);
    if (!projMatch) return null;
    homeTeamId = projMatch.homeTeamId;
    awayTeamId = projMatch.awayTeamId;
    roundLabel = projMatch.roundLabel;
    round = projMatch.round ?? null;
    slot = projMatch.slot ?? null;
  } else {
    return null;
  }

  const winnerTeamId = input.homeScore > input.awayScore ? homeTeamId : awayTeamId;

  const row = await prisma.match.upsert({
    where: { id: input.matchId },
    update: { homeScore: input.homeScore, awayScore: input.awayScore, status: "Completed", winnerTeamId },
    create: {
      id: input.matchId, eventId: input.eventId, roundLabel, homeTeamId, awayTeamId,
      homeScore: input.homeScore, awayScore: input.awayScore,
      status: "Completed", round, slot, winnerTeamId,
    },
  });

  return mapMatch(row);
}

// ── Leaderboard / standings ───────────────────────────────────────────────────

const _getLeaderboardForEvent = unstable_cache(
  async (eventId: string, gameId: string) => {
    const game = findGameConfig(gameId);
    if (!game) return [];

    const metric = getGamePrimaryStatKey(game.id);
    let playerIds: string[];
    try {
      playerIds = (await prisma.player.findMany({ where: { eventId }, select: { id: true } })).map((p) => p.id);
    } catch {
      return demoStore.getLeaderboardForEvent(eventId);
    }

    let stats;
    try {
      stats = await prisma.playerStat.findMany({
        where: { gameSlug: game.slug, playerId: { in: playerIds } },
      });
    } catch {
      return demoStore.getLeaderboardForEvent(eventId);
    }

    const statInputs: PlayerMatchStatInput[] = stats.map((s) => ({
      matchId: s.matchId,
      playerId: s.playerId,
      playerName: s.playerName,
      teamId: s.teamId,
      position: s.position,
      gameSlug: s.gameSlug,
      stats: s.stats as Record<string, number>,
    }));

    return aggregatePlayerLeaderboard(statInputs, metric);
  },
  ["leaderboard-for-event"],
  { revalidate: 60, tags: ["stats"] },
);

/**
 * Returns the player leaderboard for an event, aggregated from approved stat submissions.
 * Cached (60s, tag "stats"). Primary metric is "goals" for Flashpeak, "points" for others.
 */
export async function getLeaderboardForEvent(eventId: string, gameId?: string) {
  try {
    const resolvedGameId = gameId ?? (await prisma.event.findUnique({ where: { id: eventId }, select: { gameId: true } }))?.gameId;
    if (!resolvedGameId) return [];
    return _getLeaderboardForEvent(eventId, resolvedGameId);
  } catch {
    return demoStore.getLeaderboardForEvent(eventId);
  }
}

/** Computes league standings from completed match results for an event. Ranked by points → score diff → score for. */
export async function getTeamStandings(eventId: string) {
  const teams = await getTeamsForEvent(eventId);
  const matches = await getMatchesForEvent(eventId);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const results: MatchResultInput[] = matches
    .filter((match) => match.status === "Completed")
    .map((match) => ({
      id: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    }));

  return buildLeagueStandings(teamSeeds, results);
}

// ── Bracket preview ───────────────────────────────────────────────────────────

/**
 * Returns the fully projected bracket (all rounds, including downstream TBD slots).
 * For single-elimination: uses `projectSingleEliminationBracket` with all results applied.
 * For league: returns the round-robin schedule. Used internally and in the admin bracket view.
 */
export async function getBracketPreview(eventId: string) {
  let event;
  try {
    event = await prisma.event.findUnique({ where: { id: eventId } });
  } catch {
    return demoStore.getBracketPreview(eventId);
  }
  if (!event) return [];

  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));

  if (event.format === "Single Elimination") {
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount: getBracketSlotCount(teams.length),
      results: matches,
      eventId,
    });
  }

  return generateRoundRobinSchedule(teamSeeds);
}

/**
 * Returns the public-visible bracket. Before kickoff (Published/Registration Closed),
 * hides downstream rounds until both teams are known. After kickoff (Ongoing/Finished),
 * shows the full projected bracket including TBD placeholders for undecided rounds.
 */
export async function getPublicVisibleBracketPreview(eventId: string) {
  let event;
  try {
    event = await prisma.event.findUnique({ where: { id: eventId } });
  } catch {
    return demoStore.getPublicVisibleBracketPreview(eventId);
  }
  if (!event || event.format !== "Single Elimination") return getBracketPreview(eventId);

  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);
  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));
  const slotCount = getBracketSlotCount(teams.length);

  // Once the event is live (or finished), the bracket is locked in — show the
  // fully projected bracket so every round's cards render (including TBD
  // placeholders for rounds that haven't been decided yet), instead of the
  // "only reveal what's already determined" view used before kickoff.
  if (event.status === "Ongoing" || event.status === "Finished") {
    return projectSingleEliminationBracket({
      teams: teamSeeds,
      slotCount,
      results: matches,
      eventId,
    });
  }

  return getPublicVisibleSingleEliminationBracket({
    teams: teamSeeds,
    slotCount,
    results: matches,
    eventId,
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────

/** Looks up a user by ID. Returns null for undefined input or missing records. Used by session resolution. */
export async function getCaptainById(userId: string | undefined): Promise<AppUser | null> {
  if (!userId) return null;
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) return null;
  return mapUser(row);
}

/** Lists organizer accounts that platform admins can assign as event owners. */
export async function getOrganizerUsers(): Promise<AppUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: "organizer" },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });
  return rows.map(mapUser);
}

/** Looks up one organizer account for server-side event ownership assignment. */
export async function getOrganizerUserById(userId: string): Promise<AppUser | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, role: "organizer" },
    select: { id: true, email: true, name: true, role: true },
  });
  return row ? mapUser(row) : null;
}

/** Looks up a user by email without exposing the password hash. For duplicate-email checks and session resolution. */
export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return mapUser(row);
}

/** Fetches user with passwordHash included. Only used by the sign-in flow for bcrypt comparison. */
export async function getUserWithPasswordByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.passwordHash };
}

/** Fetches only the password hash for the change-password flow. Returns null if user not found. */
export async function getUserPasswordHashById(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return row?.passwordHash ?? null;
}

/** Returns all captain-role users, for admin assignment dropdown. */
export async function getCaptainUsersForAdmin() {
  return prisma.user.findMany({
    where: { role: "captain" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Returns true if the user still has a temporary password set from a CSV import. Used to prompt password change on first login. */
export async function hasTempPassword(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tempPassword: true } });
  return row?.tempPassword != null;
}

/** Updates a password hash and clears any first-login lock without retaining the temporary secret. */
export async function updateUserPassword(userId: string, newHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, tempPassword: null, mustChangePassword: false } as never,
  });
}

/** Legacy captain alias retained for current captain settings and imports. */
export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {
  await updateUserPassword(userId, newHash);
}
// ── Import snapshot ───────────────────────────────────────────────────────────

/**
 * Returns a lightweight snapshot of events and registered teams used by CSV import validation.
 * Includes `bracketLocked` flag so the validator can reject imports into locked events.
 */
export async function getImportSnapshot(user?: AppUser) {
  const eventWhere = user?.role === "organizer" ? { organizerUserId: user.id } : undefined;
  const events = await prisma.event.findMany({
    where: eventWhere,
    select: { id: true, slug: true, participantCap: true },
  });
  const eventIds = events.map((event) => event.id);
  const teams = await prisma.team.findMany({
    where: eventWhere ? { eventId: { in: eventIds } } : { eventId: { not: null } },
    select: { eventId: true, name: true, tag: true },
  });

  const lockedSet = new Set<string>();
  await Promise.all(
    events.map(async (event) => {
      const locked = await isEventBracketLocked(event.id);
      if (locked) lockedSet.add(event.id);
    }),
  );

  return {
    events: events.map((event) => ({
      id: event.id,
      slug: event.slug,
      participantCap: event.participantCap,
      bracketLocked: lockedSet.has(event.id),
    })),
    teams: teams.flatMap((team) => team.eventId ? [{ eventId: team.eventId, name: team.name, tag: team.tag }] : []),
  };
}

/** Returns teams created via CSV import. Organizers only see teams from their own events. */
export async function getImportedTeams(user?: AppUser): Promise<Team[]> {
  const rows = await prisma.team.findMany({
    where: {
      eventId: { not: null },
      source: { in: ["csv-import", "registration-intake"] },
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
    include: { captain: { select: { id: true, name: true } } },
  });
  return rows.map(mapTeam);
}

/**
 * Returns captain credentials (email + temp password) for all CSV-imported teams in an event.
 * Used by the admin panel to distribute login details to captains after import.
 */
export async function getCaptainCredentialsForEvent(eventId: string) {
  const teams = await prisma.team.findMany({
    where: { eventId, source: { in: ["csv-import", "registration-intake"] } },
    orderBy: { createdAt: "asc" },
    include: { captain: { select: { id: true, name: true } } },
  });
  const captainIds = teams.map((t) => t.captainId).filter(Boolean) as string[];
  const users = captainIds.length
    ? await prisma.user.findMany({ where: { id: { in: captainIds } } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return teams.map((team) => {
    const user = team.captainId ? userMap.get(team.captainId) : null;
    return {
      teamName: team.name,
      teamTag: team.tag,
      captainName: team.captainName ?? "",
      captainContact: team.captainContact ?? "",
      email: user?.email ?? "",
      tempPassword: user?.tempPassword ?? "",
    };
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export type CreateOrganizerAndEventDraftInput = {
  actorId: string;
  organizer: {
    name: string;
    organizationName: string;
    email: string;
    contactChannel: string;
    contactValue: string;
    temporaryPassword: string;
  };
  event: {
    name: string;
    slug: string;
    gameModeId: string;
    format: Event["format"];
    formatConfig?: import("@/lib/tournament/formats/types").TournamentFormatConfig;
    participantCap: Event["participantCap"];
    organizerName: string;
  };
};

/** Creates a first-login-protected organizer, its public profile, and its Draft event atomically. */
export async function createOrganizerAndEventDraft(input: CreateOrganizerAndEventDraftInput): Promise<{ organizer: AppUser; event: Event }> {
  const passwordHash = await bcrypt.hash(input.organizer.temporaryPassword, 10);
  const gameId = getGameIdForMode(input.event.gameModeId);

  return prisma.$transaction(async (tx) => {
    const organizer = await tx.user.create({
      data: {
        email: input.organizer.email,
        name: input.organizer.name,
        role: "organizer",
        passwordHash,
        // The temporary password is never persisted in plaintext. The flag is
        // enforced by login and V3 organizer actions until it is changed.
        mustChangePassword: true,
      } as never,
    });
    await tx.organizerProfile.create({
      data: {
        userId: organizer.id,
        organizationName: input.organizer.organizationName,
        contactChannel: input.organizer.contactChannel,
        contactValue: input.organizer.contactValue,
      },
    });
    const event = await tx.event.create({
      data: {
        slug: input.event.slug,
        name: input.event.name,
        description: "New event created from platform admin.",
        gameId,
        gameModeId: input.event.gameModeId,
        format: input.event.format,
        formatConfig: input.event.formatConfig,
        status: "Draft",
        participantCap: input.event.participantCap,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: organizer.id,
        organizerName: input.event.organizerName,
        organizerVerified: false,
      },
      include: { stream: true },
    });
    return { organizer: mapUser(organizer), event: mapEvent(event) };
  });
}
/**
 * Creates a new event in "Draft" status. Game ID is resolved from the gameModeId.
 * Default description, venue ("Online"), and dates ("TBD") are set automatically.
 */
export async function createEvent(input: {
  name: string;
  slug: string;
  gameModeId: string;
  format: Event["format"];
  formatConfig?: import("@/lib/tournament/formats/types").TournamentFormatConfig;
  participantCap: Event["participantCap"];
  organizerUserId?: string;
  organizerName?: string;
  organizerVerified?: boolean;
}): Promise<Event> {
  const gameId = getGameIdForMode(input.gameModeId);
  const row = await prisma.event.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: "New event created from admin panel.",
      gameId,
      gameModeId: input.gameModeId,
      format: input.format,
      formatConfig: input.formatConfig,
      status: "Draft",
      participantCap: input.participantCap,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      organizerUserId: input.organizerUserId,
      organizerName: input.organizerName,
      organizerVerified: input.organizerVerified ?? false,
    },
    include: { stream: true },
  });
  return mapEvent(row);
}

/** Updates an event's lifecycle status. Use `autoTransitionEventToOngoing` for the match-triggered transition. */
export async function setEventStatus(eventId: string, status: Event["status"]): Promise<Event | null> {
  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const updatedEvent = await tx.event.update({ where: { id: eventId }, data: { status }, include: eventPublicInclude });
    await applyEventLifecycleSideEffects(tx, eventId, status, now);
    return updatedEvent;
  });
  return mapEvent(row);
}

/**
 * Idempotently transitions an event from "Published" or "Registration Closed" to "Ongoing".
 * The same transaction discards active private revisions and revokes every preview token.
 */
export async function autoTransitionEventToOngoing(eventId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.event.updateMany({
      where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },
      data: { status: "Ongoing" },
    });
    if (transitioned.count === 0) return;
    await applyEventLifecycleSideEffects(tx, eventId, "Ongoing", now);
  });
}

type CaptainRegistrationDraft = {
  id: string;
  name: string;
  tag: string;
  logoText: string;
  logoUrl: string | null;
  captainName: string | null;
  captainContact: string | null;
  captainIgn: string | null;
  captainUid: string | null;
  captainIsPlayer: boolean;
  players: Array<{
    displayName: string;
    nickname: string;
    position: string;
    jerseyNumber: number | null;
  }>;
};

async function resolveCaptainRegistrationTeam(input: {
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
}): Promise<{ name: string; tag: string; draftTeam: CaptainRegistrationDraft | null }> {
  let name = input.name?.trim() ?? "";
  let tag = input.tag?.trim().toUpperCase() ?? "";
  let draftTeam: CaptainRegistrationDraft | null = null;

  if (input.draftTeamId) {
    draftTeam = await prisma.team.findFirst({
      where: { id: input.draftTeamId, captainId: input.captainId, eventId: null, source: "draft" },
      include: { players: { orderBy: { createdAt: "asc" } } },
    });
    if (!draftTeam) {
      throw new Error("Draft tim tidak ditemukan untuk akun ini.");
    }

    name = draftTeam.name.trim();
    tag = draftTeam.tag.trim().toUpperCase();
    const hasInvalidRoster = draftTeam.players.some(
      (player) => player.displayName.trim().length < 2 || player.nickname.trim().length < 2,
    );
    if (draftTeam.players.length === 0 || hasInvalidRoster) {
      throw new Error("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");
    }
  }

  if (name.length < 2) {
    throw new Error("Nama tim minimal 2 karakter.");
  }
  if (tag.length < 2 || tag.length > 5) {
    throw new Error("Tag tim harus 2-5 karakter.");
  }

  return { name, tag, draftTeam };
}

function copyDraftPlayersForEvent(draftTeam: CaptainRegistrationDraft, teamId: string, eventId: string) {
  return draftTeam.players.map((player) => ({
    teamId,
    eventId,
    displayName: player.displayName.trim(),
    nickname: player.nickname.trim(),
    position: player.position?.trim() ?? "",
    jerseyNumber: player.jerseyNumber,
  }));
}


function assertDraftRosterFitsGameMode(
  draftTeam: CaptainRegistrationDraft | null,
  gameModeId: string,
): void {
  if (!draftTeam) return;
  const maximumRoster = getGameModeConfig(gameModeId).maxRosterSize;
  if (draftTeam.players.length > maximumRoster) {
    throw new Error(`Roster tim maksimal ${maximumRoster} pemain untuk mode pertandingan ini.`);
  }
}

/** Registers one team for an existing captain while the event is still open. */
export async function registerTeam(input: {
  eventId: string;
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
}): Promise<Team> {
  const { name, tag, draftTeam } = await resolveCaptainRegistrationTeam(input);

  try {
    return await runSerializableRegistrationTransaction(async (tx) => {
      await assertEventRosterMutable(tx, input.eventId);
      const event = await tx.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          slug: true,
          status: true,
          participantCap: true,
          format: true,
          registrationFeeRequired: true,
          gameModeId: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
        },
      });
      if (!event) throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
      assertNewRegistrationWindowOpen(event);
      assertDraftRosterFitsGameMode(draftTeam, event.gameModeId);
      if (event.registrationFeeRequired) {
        throw new Error("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.");
      }

      const [registeredTeams, pendingReviewRequests, existingCaptainTeam, completedMatches] = await Promise.all([
        tx.team.count({ where: { eventId: input.eventId } }),
        tx.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
        tx.team.findFirst({
          where: { eventId: input.eventId, captainId: input.captainId },
          select: { id: true },
        }),
        event.format === "Single Elimination"
          ? tx.match.count({ where: { eventId: input.eventId, status: "Completed" } })
          : Promise.resolve(0),
      ]);

      if (registeredTeams + pendingReviewRequests >= event.participantCap) {
        throw new Error("Slot pendaftaran event ini sudah penuh.");
      }
      if (existingCaptainTeam) {
        throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
      }
      if (completedMatches > 0) {
        throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
      }

      if (draftTeam) {
        const row = await tx.team.create({
          data: {
            eventId: input.eventId,
            captainId: input.captainId,
            name,
            logoText: draftTeam.logoText || tag.slice(0, 2),
            logoUrl: draftTeam.logoUrl,
            tag,
            captainIgn: draftTeam.captainIgn,
            captainUid: draftTeam.captainUid,
            captainIsPlayer: draftTeam.captainIsPlayer,
            captainName: draftTeam.captainName,
            captainContact: draftTeam.captainContact,
            source: "registration",
          },
        });
        await tx.player.createMany({ data: copyDraftPlayersForEvent(draftTeam, row.id, input.eventId) });
        return mapTeam(row);
      }

      const row = await tx.team.create({
        data: {
          eventId: input.eventId,
          captainId: input.captainId,
          name,
          logoText: tag.slice(0, 2),
          tag,
          source: "registration",
        },
      });
      return mapTeam(row);
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || message.includes("Unique constraint")) {
      throw new Error("Tag atau nama tim sudah digunakan di event ini.");
    }
    throw error;
  }
}

export async function createTeamRegistrationRequest(input: {
  eventId: string;
  captainId: string;
  name?: string;
  tag?: string;
  draftTeamId?: string;
}): Promise<TeamRegistrationRequest> {
  await expireStaleRegistrationRequests();
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      slug: true,
      status: true,
      participantCap: true,
      format: true,
      registrationFeeRequired: true,
      gameModeId: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
    },
  });
  if (!event) throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
  assertNewRegistrationWindowOpen(event);
  if (!event.registrationFeeRequired) {
    throw new Error("Event ini tidak membutuhkan verifikasi pembayaran.");
  }

  const { name, tag, draftTeam } = await resolveCaptainRegistrationTeam(input);
  assertDraftRosterFitsGameMode(draftTeam, event.gameModeId);
  const [registeredTeams, pendingReviewRequests, existingCaptainTeam, existingCaptainRequest, existingTeamIdentity, existingRequestIdentity, completedMatches] = await Promise.all([
    prisma.team.count({ where: { eventId: input.eventId } }),
    prisma.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
    prisma.team.findFirst({ where: { eventId: input.eventId, captainId: input.captainId }, select: { id: true } }),
    prisma.teamRegistrationRequest.findFirst({
      where: { eventId: input.eventId, captainId: input.captainId, status: { in: ACTIVE_REGISTRATION_REQUEST_STATUSES } },
      select: { id: true },
    }),
    prisma.team.findFirst({
      where: { eventId: input.eventId, OR: [{ name }, { tag }] },
      select: { id: true },
    }),
    prisma.teamRegistrationRequest.findFirst({
      where: { eventId: input.eventId, status: { in: RESERVED_REGISTRATION_REQUEST_STATUSES }, OR: [{ teamName: name }, { teamTag: tag }] },
      select: { id: true },
    }),
    event.format === "Single Elimination" ? prisma.match.count({ where: { eventId: input.eventId, status: "Completed" } }) : Promise.resolve(0),
  ]);

  if (registeredTeams + (pendingReviewRequests ?? 0) >= event.participantCap) {
    throw new Error("Slot pendaftaran event ini sudah penuh.");
  }
  if (existingCaptainTeam || existingCaptainRequest) {
    throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
  }
  if (completedMatches > 0) {
    throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
  }
  if (existingTeamIdentity || existingRequestIdentity) {
    throw new Error("Tag atau nama tim sudah digunakan di event ini.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let pendingTeamId: string | undefined;
      if (draftTeam) {
        const pendingTeam = await tx.team.create({
          data: {
            eventId: null,
            captainId: input.captainId,
            name,
            logoText: draftTeam.logoText || tag.slice(0, 2),
            logoUrl: draftTeam.logoUrl,
            tag,
            captainIgn: draftTeam.captainIgn,
            captainUid: draftTeam.captainUid,
            captainIsPlayer: draftTeam.captainIsPlayer,
            captainName: draftTeam.captainName,
            captainContact: draftTeam.captainContact,
            source: "registration-intake",
          },
        });
        pendingTeamId = pendingTeam.id;
        await tx.player.createMany({
          data: draftTeam.players.map((player) => ({
            teamId: pendingTeam.id,
            displayName: player.displayName.trim(),
            nickname: player.nickname.trim(),
            position: player.position?.trim() ?? "",
            jerseyNumber: player.jerseyNumber,
          })),
        });
      }

      const row = await tx.teamRegistrationRequest.create({
        data: {
          eventId: input.eventId,
          captainId: input.captainId,
          ...(pendingTeamId ? { teamId: pendingTeamId } : {}),
          teamName: name,
          teamTag: tag,
          status: "pending_payment",
          expiresAt: new Date(Date.now() + PAYMENT_REQUEST_TTL_MS),
        },
        include: registrationRequestInclude,
      });
      return mapTeamRegistrationRequest(row);
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || message.includes("Unique constraint")) {
      throw new Error("Tag atau nama tim sudah digunakan di event ini.");
    }
    throw error;
  }
}

/** Creates or updates the captain's reusable draft team outside any event. */
export async function createOrUpdateCaptainDraftTeam(input: {
  captainId: string;
  captainName: string;
  name: string;
  tag: string;
}): Promise<Team> {
  const tag = input.tag.trim().toUpperCase();
  const existing = await prisma.team.findFirst({
    where: { captainId: input.captainId, eventId: null, source: "draft" },
    select: { id: true },
  });
  const data = {
    eventId: null,
    captainId: input.captainId,
    captainName: input.captainName,
    name: input.name.trim(),
    logoText: tag.slice(0, 2),
    tag,
    source: "draft",
  };

  const row = existing
    ? await prisma.team.update({ where: { id: existing.id }, data })
    : await prisma.team.create({ data });

  return mapTeam(row);
}

export async function updateTeamRegistrationProof(
  captainId: string,
  requestId: string,
  proofImageUrl: string,
): Promise<TeamRegistrationRequest> {
  const result = await runSerializableRegistrationTransaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({
      where: { id: requestId, captainId },
      include: registrationRequestInclude,
    });
    if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
    if (!["pending_payment", "rejected"].includes(request.status)) {
      throw new Error("Bukti pembayaran untuk pendaftaran ini tidak bisa diubah.");
    }

    const now = new Date();
    if (request.expiresAt <= now) {
      await tx.teamRegistrationRequest.update({
        where: { id: request.id },
        data: { status: "expired" },
      });
      return { kind: "expired" as const };
    }
    if (!["Published", "Registration Closed"].includes(request.event.status)) {
      throw new Error("Event sudah dimulai sehingga bukti pembayaran tidak bisa diterima.");
    }

    const [activeTeamCount, pendingReviewCount] = await Promise.all([
      tx.team.count({ where: { eventId: request.eventId } }),
      tx.teamRegistrationRequest.count({
        where: { eventId: request.eventId, status: "pending_review" },
      }),
    ]);
    if (activeTeamCount + pendingReviewCount >= request.event.participantCap) {
      throw new Error(
        "Slot pendaftaran event ini sudah penuh. Bukti belum diterima; hubungi organizer untuk bantuan.",
      );
    }

    const row = await tx.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { proofImageUrl, rejectReason: null, status: "pending_review" },
      include: registrationRequestInclude,
    });
    return { kind: "updated" as const, row };
  });

  if (result.kind === "expired") {
    throw new Error("Pendaftaran pembayaran sudah kedaluwarsa.");
  }
  return mapTeamRegistrationRequest(result.row);
}

export async function getCaptainRegistrationRequests(captainId: string): Promise<TeamRegistrationRequest[]> {
  if (!captainId) return [];
  await expireStaleRegistrationRequests();
  const rows = await prisma.teamRegistrationRequest.findMany({
    where: { captainId, status: { in: ["pending_payment", "pending_review", "rejected", "expired"] } },
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapTeamRegistrationRequest);
}

export async function getPaymentRegistrationRequestsForAdmin(user: AppUser, filters: { eventId?: string; status?: TeamRegistrationRequestStatus } = {}): Promise<TeamRegistrationRequest[]> {
  await expireStaleRegistrationRequests();
  const where: Prisma.TeamRegistrationRequestWhereInput = {};
  if (filters.eventId) where.eventId = filters.eventId;
  if (filters.status) where.status = filters.status;
  if (user.role === "organizer") where.event = { organizerUserId: user.id };
  else if (user.role !== "platform_admin" && user.role !== "admin") throw new Error("Not authorized");

  const rows = await prisma.teamRegistrationRequest.findMany({
    where,
    include: registrationRequestInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapTeamRegistrationRequest);
}

export async function approveTeamRegistrationRequest(
  user: AppUser,
  requestId: string,
  precondition?: RegistrationReviewPrecondition,
): Promise<Team> {
  const initial = await prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId },
    select: { eventId: true, status: true, updatedAt: true },
  });
  if (!initial) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  await assertUserCanManageEvent(user, initial.eventId);
  if (
    precondition?.expectedStatus && initial.status !== precondition.expectedStatus
    || precondition?.expectedUpdatedAt && initial.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
  ) {
    throw new RegistrationMutationConflictError(undefined, initial.updatedAt);
  }

  const teamRow = await runSerializableRegistrationTransaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({
      where: { id: requestId },
      include: registrationRequestInclude,
    });
    if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
    if (
      precondition?.expectedStatus && request.status !== precondition.expectedStatus
      || precondition?.expectedUpdatedAt && request.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
    ) {
      throw new RegistrationMutationConflictError(undefined, request.updatedAt);
    }
    if (request.status !== "pending_review") throw new Error("Pendaftaran belum siap diverifikasi.");
    if (!["Published", "Registration Closed"].includes(request.event.status)) {
      throw new Error("Event sudah dimulai sehingga pendaftaran tidak bisa disetujui.");
    }
    await assertEventRosterMutable(tx, request.eventId);

    const [registeredTeams, existingCaptainTeam, completedMatches] = await Promise.all([
      tx.team.count({ where: { eventId: request.eventId } }),
      tx.team.findFirst({
        where: {
          eventId: request.eventId,
          captainId: request.captainId,
          ...(request.teamId ? { id: { not: request.teamId } } : {}),
        },
        select: { id: true },
      }),
      request.event.format === "Single Elimination"
        ? tx.match.count({ where: { eventId: request.eventId, status: "Completed" } })
        : Promise.resolve(0),
    ]);
    if (registeredTeams >= request.event.participantCap) throw new Error("Slot pendaftaran event ini sudah penuh.");
    if (existingCaptainTeam) throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
    if (completedMatches > 0) {
      throw new Error(`Event "${request.event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
    }

    const row = request.teamId
      ? await tx.team.update({ where: { id: request.teamId }, data: { eventId: request.eventId, source: "registration" } })
      : await tx.team.create({
          data: {
            eventId: request.eventId,
            captainId: request.captainId,
            name: request.teamName,
            logoText: request.teamTag.slice(0, 2),
            tag: request.teamTag,
            source: "registration",
          },
    });
    await tx.player.updateMany({ where: { teamId: row.id }, data: { eventId: request.eventId } });
    const approvalData = { status: "approved", teamId: row.id, approvedAt: new Date(), approvedById: user.id };
    if (precondition) {
      const claimed = await tx.teamRegistrationRequest.updateMany({
        where: {
          id: request.id,
          status: precondition.expectedStatus ?? "pending_review",
          ...(precondition.expectedUpdatedAt ? { updatedAt: precondition.expectedUpdatedAt } : {}),
        },
        data: approvalData,
      });
      if (claimed.count !== 1) {
        const current = await tx.teamRegistrationRequest.findFirst({ where: { id: request.id }, select: { updatedAt: true } });
        throw new RegistrationMutationConflictError(undefined, current?.updatedAt);
      }
    } else {
      await tx.teamRegistrationRequest.update({
        where: { id: request.id },
        data: approvalData,
        include: registrationRequestInclude,
      });
    }
    return row;
  });
  return mapTeam(teamRow);
}

export async function rejectTeamRegistrationRequest(
  user: AppUser,
  requestId: string,
  reason: string,
  precondition?: RegistrationReviewPrecondition,
): Promise<TeamRegistrationRequest> {
  const request = await prisma.teamRegistrationRequest.findFirst({ where: { id: requestId }, include: registrationRequestInclude });
  if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  await assertUserCanManageEvent(user, request.eventId);
  if (!["pending_review", "pending_payment"].includes(request.status)) throw new Error("Pendaftaran ini tidak bisa ditolak.");
  if (
    precondition?.expectedStatus && request.status !== precondition.expectedStatus
    || precondition?.expectedUpdatedAt && request.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
  ) {
    throw new RegistrationMutationConflictError(undefined, request.updatedAt);
  }
  if (!precondition) {
    const row = await prisma.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { status: "rejected", rejectReason: reason, proofImageUrl: null },
      include: registrationRequestInclude,
    });
    return mapTeamRegistrationRequest(row);
  }
  const update = await prisma.teamRegistrationRequest.updateMany({
    where: {
      id: request.id,
      status: precondition.expectedStatus ?? { in: ["pending_review", "pending_payment"] },
      ...(precondition.expectedUpdatedAt ? { updatedAt: precondition.expectedUpdatedAt } : {}),
    },
    data: { status: "rejected", rejectReason: reason, proofImageUrl: null },
  });
  if (update.count !== 1) {
    const current = await prisma.teamRegistrationRequest.findFirst({ where: { id: request.id }, select: { updatedAt: true } });
    throw new RegistrationMutationConflictError(undefined, current?.updatedAt);
  }
  const row = await prisma.teamRegistrationRequest.findFirst({ where: { id: request.id }, include: registrationRequestInclude });
  if (!row) throw new Error("Pendaftaran pembayaran tidak ditemukan setelah penolakan.");
  return mapTeamRegistrationRequest(row);
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const row = await prisma.paymentSettings.findUnique({ where: { id: PAYMENT_SETTINGS_ID } });
  return mapPaymentSettings(row);
}

export async function updatePaymentSettings(input: { qrisImageUrl?: string | null; instructions?: string | null }): Promise<PaymentSettings> {
  const data = {
    qrisImageUrl: input.qrisImageUrl ?? null,
    instructions: input.instructions ?? null,
  };
  const row = await prisma.paymentSettings.upsert({
    where: { id: PAYMENT_SETTINGS_ID },
    update: data,
    create: { id: PAYMENT_SETTINGS_ID, ...data },
  });
  return mapPaymentSettings(row);
}
/**
 * Bulk-imports teams from a validated CSV row list. For each team, generates a captain User
 * (upserted by email) with a temp password, then creates the Team row.
 * Bcrypt hashing runs outside the DB transaction to avoid holding a connection during slow crypto.
 * Throws if any target event's bracket is already locked.
 */
export async function importTeams(input: Array<{
  eventId: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
  captainEmail?: string;
}>): Promise<Team[]> {
  const eventIds = [...new Set(input.map((row) => row.eventId))];

  // Hashing remains outside the transaction; every database write is committed
  // atomically only after each target event wins the roster-version lock.
  const usedEmails = new Set<string>();
  const preparedRows = await Promise.all(
    input.map(async (row) => {
      const email = generateCaptainEmail(row.teamTag, usedEmails, row.captainEmail);
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return { ...row, email, tempPassword, passwordHash };
    }),
  );

  const rows = await runSerializableRegistrationTransaction(async (tx) => {
    for (const eventId of eventIds) await assertEventRosterMutable(tx, eventId);
    const created = [];
    for (const prep of preparedRows) {
      const captain = await tx.user.upsert({
        where: { email: prep.email },
        update: { name: prep.captainName, passwordHash: prep.passwordHash, tempPassword: prep.tempPassword },
        create: {
          email: prep.email,
          name: prep.captainName,
          role: "captain",
          passwordHash: prep.passwordHash,
          tempPassword: prep.tempPassword,
        },
      });
      created.push(await tx.team.create({
        data: {
          eventId: prep.eventId,
          captainId: captain.id,
          name: prep.teamName,
          logoText: prep.teamTag.slice(0, 2).toUpperCase(),
          tag: prep.teamTag.toUpperCase(),
          captainName: prep.captainName,
          captainContact: prep.captainContact,
          source: "csv-import",
        },
      }));
    }
    return created;
  });

  return rows.map(mapTeam);
}

export async function saveRegistrationImportPreviewBatch(input: {
  user: AppUser;
  eventId: string;
  sourceKind: RegistrationSourceKind;
  sourceLabel: string;
  worksheetName?: string;
  headerSignature: string;
  mapping: Prisma.InputJsonValue;
  items: RegistrationPreviewItem[];
  summary: Prisma.InputJsonValue;
}) {
  await assertUserCanManageEvent(input.user, input.eventId);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const profile = await prisma.registrationImportProfile.create({
    data: {
      eventId: input.eventId,
      createdById: input.user.id,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      worksheetName: input.worksheetName,
      headerSignature: input.headerSignature,
      mapping: input.mapping,
    },
  });

  return prisma.registrationImportBatch.create({
    data: {
      eventId: input.eventId,
      profileId: profile.id,
      createdById: input.user.id,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      worksheetName: input.worksheetName,
      status: "draft",
      summary: input.summary,
      expiresAt,
      items: {
        create: input.items.map((item) => ({
          sourceRow: item.sourceRow,
          status: item.status,
          selected: item.selected,
          normalizedData: item.normalized as Prisma.InputJsonValue | undefined,
          diff: item.diff as Prisma.InputJsonValue | undefined,
          validationErrors: item.errors as Prisma.InputJsonValue | undefined,
          teamId: item.existingTeamId,
        })),
      },
    },
    include: { items: true },
  });
}

export async function getRegistrationImportBatchesForEvent(user: AppUser, eventId: string) {
  await assertUserCanManageEvent(user, eventId);
  return prisma.registrationImportBatch.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { items: { select: { id: true, status: true, teamId: true }, take: ORGANIZER_READER_ROW_LIMIT } },
  });
}

export type RegistrationImportHistoryEntry = {
  id: string;
  eventId: string;
  sourceKind: string;
  sourceLabel: string;
  worksheetName?: string | null;
  status: string;
  summary: unknown;
  expiresAt: Date;
  committedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  items: Array<{ id: string; status: string; teamId?: string | null }>;
};

export type PaymentReviewEntry = {
  id: string;
  eventId: string;
  captainId: string;
  teamId?: string | null;
  teamName: string;
  teamTag: string;
  status: TeamRegistrationRequestStatus;
  proofImageUrl?: string | null;
  rejectReason?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  captain?: { id: string; name: string; email?: string } | null;
};

export type RegistrationImportEventContext = {
  id: string;
  slug: string;
  name: string;
  gameModeId: string;
  participantCap: number;
  format: string;
  teams: Array<{
    id: string;
    name: string;
    tag: string;
    captainName: string | null;
    captainContact: string | null;
    players: Array<{ nickname: string; displayName: string; position: string }>;
  }>;
};

export type TeamRegistrationRequestTarget = {
  id: string;
  eventId: string;
  captainId: string;
  teamId: string | null;
  teamName: string;
  teamTag: string;
  status: TeamRegistrationRequestStatus;
  proofImageUrl: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export type EventPaymentManagerSettings = ResolvedEventPaymentSettings & { eventId: string; source: "event" };

export async function getRegistrationRecordsForEvent(user: AppUser, eventId: string): Promise<RegistrationRecord[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);

  const [teams, requests] = await Promise.all([
    prisma.team.findMany({
      where: { eventId },
      include: {
        players: { select: { id: true }, take: ORGANIZER_READER_ROW_LIMIT },
        captain: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ORGANIZER_READER_ROW_LIMIT,
    }),
    prisma.teamRegistrationRequest.findMany({
      where: {
        eventId,
        status: { in: ["pending_payment", "pending_review", "rejected", "expired"] },
      },
      include: { captain: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ORGANIZER_READER_ROW_LIMIT,
    }),
  ]);

  const teamIds = teams.map((team) => team.id);
  const importedItems = teamIds.length === 0
    ? []
    : await prisma.registrationImportItem.findMany({
        where: { teamId: { in: teamIds } },
        select: { teamId: true, batch: { select: { sourceKind: true } } },
        orderBy: { createdAt: "desc" },
        take: ORGANIZER_READER_ROW_LIMIT,
      });
  const importKindByTeam = new Map<string, string>();
  for (const item of importedItems) {
    if (item.teamId && !importKindByTeam.has(item.teamId)) importKindByTeam.set(item.teamId, item.batch.sourceKind);
  }

  const teamRecords: RegistrationRecord[] = teams.map((team) => ({
    id: team.id,
    eventId,
    teamId: team.id,
    teamName: team.name,
    teamTag: team.tag,
    captainName: team.captainName ?? team.captain?.name ?? "",
    ...(team.captainContact ? { captainContact: team.captainContact } : {}),
    ...(team.captainIgn ? { captainIgn: team.captainIgn } : {}),
    ...(team.captainUid ? { captainUid: team.captainUid } : {}),
    captainIsPlayer: team.captainIsPlayer,
    rosterCount: team.players.length,
    source: normalizeRegistrationSource(team.source, importKindByTeam.get(team.id)),
    status: "accepted",
    createdAt: team.createdAt,
    origin: "Team",
  }));

  const requestRecords: RegistrationRecord[] = requests.map((request) => ({
    id: request.id,
    eventId,
    ...(request.teamId ? { teamId: request.teamId } : {}),
    teamName: request.teamName,
    teamTag: request.teamTag,
    captainName: request.captain?.name ?? "",
    ...(request.captain?.email ? { captainContact: request.captain.email } : {}),
    captainIsPlayer: true,
    rosterCount: 0,
    source: "captain_registration",
    status: mapRequestStatus(request.status as TeamRegistrationRequestStatus),
    createdAt: request.createdAt,
    origin: "TeamRegistrationRequest",
  }));

  return [...teamRecords, ...requestRecords];
}

export async function getRegistrationImportHistoryForEvent(user: AppUser, eventId: string): Promise<RegistrationImportHistoryEntry[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const rows = await prisma.registrationImportBatch.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ORGANIZER_READER_HISTORY_LIMIT,
    include: { items: { select: { id: true, status: true, teamId: true }, orderBy: { sourceRow: "asc" }, take: ORGANIZER_READER_ROW_LIMIT } },
  });
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel,
    worksheetName: row.worksheetName,
    status: row.status,
    summary: row.summary,
    expiresAt: row.expiresAt,
    committedAt: row.committedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount: row.items.length,
    items: row.items.map((item) => ({ id: item.id, status: item.status, teamId: item.teamId })),
  }));
}

export async function getPaymentReviewForEvent(user: AppUser, eventId: string, status?: TeamRegistrationRequestStatus): Promise<PaymentReviewEntry[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  await expireStaleRegistrationRequests();
  const rows = await prisma.teamRegistrationRequest.findMany({
    where: {
      eventId,
      status: status ?? { in: ["pending_payment", "pending_review"] },
    },
    include: { captain: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ORGANIZER_READER_HISTORY_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    captainId: row.captainId,
    teamId: row.teamId,
    teamName: row.teamName,
    teamTag: row.teamTag,
    status: row.status as TeamRegistrationRequestStatus,
    proofImageUrl: row.proofImageUrl,
    rejectReason: row.rejectReason,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    captain: row.captain,
  }));
}

export async function getRegistrationImportEventContext(user: AppUser, eventId: string): Promise<RegistrationImportEventContext | null> {
  await assertUserCanManageEvent(user, eventId);
  const row = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, slug: true, name: true, gameModeId: true, participantCap: true, format: true,
      teams: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: ORGANIZER_READER_ROW_LIMIT,
        select: {
          id: true, name: true, tag: true, captainName: true, captainContact: true,
          players: { select: { nickname: true, displayName: true, position: true }, orderBy: { createdAt: "asc" }, take: ORGANIZER_READER_ROW_LIMIT },
        },
      },
    },
  });
  if (!row) return null;
  return row;
}

export async function getRegistrationImportUsersByEmails(user: AppUser, eventId: string, emails: string[]) {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return [];
  return prisma.user.findMany({ where: { email: { in: normalized } }, select: { id: true, email: true, role: true } });
}

export async function getTeamRegistrationRequestForEvent(user: AppUser, eventId: string, requestId: string): Promise<TeamRegistrationRequestTarget | null> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const row = await prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId, eventId },
    select: {
      id: true, eventId: true, captainId: true, teamId: true, teamName: true, teamTag: true,
      status: true, proofImageUrl: true, updatedAt: true, createdAt: true,
    },
  });
  if (!row) return null;
  return { ...row, status: row.status as TeamRegistrationRequestStatus };
}

export async function getEventPaymentSettingsForManager(user: AppUser, eventId: string): Promise<EventPaymentManagerSettings> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const row = await prisma.eventPaymentSettings.findUnique({ where: { eventId } });
  if (!row) {
    return { id: `event-payment-${eventId}`, eventId, source: "event", status: "draft", version: 0 };
  }
  return {
    id: row.id,
    eventId: row.eventId,
    source: "event",
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    updatedAt: row.updatedAt,
  };
}

export async function getRegistrationImportBatchForAdmin(user: AppUser, batchId: string) {
  const batch = await prisma.registrationImportBatch.findFirst({
    where: { id: batchId },
    include: {
      items: { orderBy: { sourceRow: "asc" } },
    },
  });
  if (!batch) return null;
  await assertUserCanManageEvent(user, batch.eventId);
  return batch;
}

export async function commitRegistrationImportBatch(
  user: AppUser,
  batchId: string,
  selectedItemIds: string[],
): Promise<{
  importedCount: number;
  credentials: Array<{
    teamName: string;
    teamTag: string;
    captainName: string;
    captainContact: string;
    email: string;
    tempPassword: string;
  }>;
}> {
  const batch = await prisma.registrationImportBatch.findFirst({
    where: { id: batchId },
    include: {
      event: { select: { id: true, slug: true, format: true, participantCap: true } },
      items: true,
    },
  });

  if (!batch) throw new Error("Batch import registrasi tidak ditemukan.");
  await assertUserCanManageEvent(user, batch.eventId);
  const locked = await isEventBracketLocked(batch.eventId);
  if (locked) {
    throw new Error(ROSTER_LOCKED_MESSAGE);
  }

  if (batch.status === "committed") return { importedCount: 0, credentials: [] };
  if (batch.expiresAt <= new Date()) throw new Error("Batch import registrasi sudah kedaluwarsa.");
  if (batch.items.some((item) => item.status === "error")) {
    throw new Error("Perbaiki semua baris error sebelum melakukan import.");
  }
  const candidateItems = batch.items.filter((item) => item.status === "new" || item.status === "changed");
  const selectedIds = new Set(selectedItemIds);
  if (candidateItems.length === 0) throw new Error("Tidak ada baris baru atau berubah untuk diimport.");
  if (selectedIds.size !== candidateItems.length || candidateItems.some((item) => !selectedIds.has(item.id))) {
    throw new Error("Import harus menyertakan seluruh baris baru dan berubah dalam satu transaksi.");
  }

  const usedEmails = new Set<string>();
  const prepared = await Promise.all(
    candidateItems.map(async (item) => {
      const normalized = item.normalizedData as RegistrationNormalizedTeam | null;
      if (!normalized) throw new Error("Item import tidak memiliki data normalisasi.");

      const explicitEmail = normalized.captainEmail?.trim().toLowerCase();
      const email = explicitEmail || generateSyntheticRegistrationEmail(batch.event.slug, normalized.teamTag, usedEmails);
      if (explicitEmail) usedEmails.add(explicitEmail);

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true, name: true },
      });
      if (existingUser && existingUser.role !== "captain") {
        throw new Error("Email kapten sudah dipakai akun non-captain.");
      }
      if (existingUser) {
        return { item, normalized, captainId: existingUser.id, email, tempPassword: null };
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return { item, normalized, captainId: null, email, tempPassword, passwordHash };
    }),
  );

  const credentials: Array<{
    teamName: string;
    teamTag: string;
    captainName: string;
    captainContact: string;
    email: string;
    tempPassword: string;
  }> = [];

  const committed = await runSerializableRegistrationTransaction(async (tx) => {
    credentials.length = 0;
    const claim = await tx.registrationImportBatch.updateMany({
      where: { id: batch.id, status: batch.status, committedAt: null },
      data: { committedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await assertEventRosterMutable(tx, batch.eventId);

    const additionalTeams = prepared.filter((row) => row.item.status === "new").length;
    const [activeTeamCount, pendingReviewCount] = await Promise.all([
      tx.team.count({ where: { eventId: batch.eventId } }),
      tx.teamRegistrationRequest.count({ where: { eventId: batch.eventId, status: "pending_review" } }),
    ]);
    if (
      typeof batch.event.participantCap === "number"
      && activeTeamCount + pendingReviewCount + additionalTeams > batch.event.participantCap
    ) {
      throw new Error("Slot pendaftaran event ini tidak cukup untuk seluruh tim import yang dipilih.");
    }

    for (const row of prepared) {
      let captainId = row.captainId;
      if (!captainId) {
        const captain = await tx.user.create({
          data: {
            email: row.email,
            name: row.normalized.captainName,
            role: "captain",
            passwordHash: row.passwordHash!,
            tempPassword: row.tempPassword,
          },
        });
        captainId = captain.id;
        credentials.push({
          teamName: row.normalized.teamName,
          teamTag: row.normalized.teamTag,
          captainName: row.normalized.captainName,
          captainContact: row.normalized.captainContact,
          email: row.email,
          tempPassword: row.tempPassword!,
        });
      }

      let teamId = row.item.teamId ?? "";
      const teamData = {
        eventId: batch.eventId,
        captainId,
        name: row.normalized.teamName,
        logoText: row.normalized.teamTag.slice(0, 2).toUpperCase(),
        tag: row.normalized.teamTag.toUpperCase(),
        captainName: row.normalized.captainName,
        captainContact: row.normalized.captainContact,
        captainIgn: row.normalized.captainIgn,
        captainUid: row.normalized.captainUid,
        captainIsPlayer: row.normalized.captainIsPlayer,
        source: "registration-intake",
      };

      if (row.item.status === "changed" && row.item.teamId) {
        const updated = await tx.team.update({
          where: { id: row.item.teamId },
          data: teamData,
        });
        teamId = updated.id;
        await tx.player.deleteMany({ where: { teamId } });
      } else {
        const created = await tx.team.create({ data: teamData });
        teamId = created.id;
      }

      if (row.normalized.players.length > 0) {
        await tx.player.createMany({
          data: row.normalized.players.map((player) => ({
            teamId,
            eventId: batch.eventId,
            displayName: player.displayName,
            nickname: player.nickname,
            position: player.position,
          })),
        });
      }

      await tx.registrationImportItem.update({
        where: { id: row.item.id },
        data: {
          selected: true,
          status: "imported",
          teamId,
          committedAt: new Date(),
        },
      });
    }

    await tx.registrationImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "committed",
        committedAt: new Date(),
      },
    });
    return true;
  });

  if (!committed) return { importedCount: 0, credentials: [] };
  return { importedCount: prepared.length, credentials };
}

/** Adds a new player to a team. UID and IGN are required; position and jersey number remain optional. */
export async function addPlayer(input: {
  teamId: string;
  eventId?: string;
  captainId?: string;
  displayName: string;
  nickname: string;
  position?: string;
  jerseyNumber?: number;
}): Promise<Player> {
  try {
    return await runSerializableRegistrationTransaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: input.teamId, ...(input.captainId ? { captainId: input.captainId } : {}) },
        select: { eventId: true },
      });
      if (!team) throw new Error("Tim tidak ditemukan untuk akun ini.");
      if (input.eventId && team.eventId && input.eventId !== team.eventId) {
        throw new Error("Data event pemain tidak cocok dengan tim.");
      }
      const eventId = input.eventId ?? team.eventId ?? undefined;
      if (eventId) await assertEventRosterMutable(tx, eventId);
      const row = await tx.player.create({ data: {
        teamId: input.teamId,
        ...(eventId ? { eventId } : {}),
        displayName: input.displayName.trim(),
        nickname: input.nickname.trim(),
        position: input.position?.trim() ?? "",
        ...(input.jerseyNumber != null ? { jerseyNumber: input.jerseyNumber } : {}),
      } });
      return mapPlayer(row);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Pemain dengan IGN ini sudah ada di tim.");
    }
    throw e;
  }
}

/**
 * Updates a player's profile. Throws "Not authorized" if the player's team does not
 * belong to `captainUserId`. Ownership is enforced at the DB layer, not the action layer.
 * Also throws if the team's event roster is locked (event Ongoing/Finished).
 */
export async function updatePlayer(
  id: string,
  captainUserId: string,
  data: { displayName?: string; nickname?: string; position?: string; jerseyNumber?: number | null },
): Promise<Player> {
  return runSerializableRegistrationTransaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to edit this player.");
    }
    if (player.team.eventId) await assertEventRosterMutable(tx, player.team.eventId);
    return mapPlayer(await tx.player.update({ where: { id }, data }));
  });
}

/**
 * Deletes a player. Throws "Not authorized" if the player's team does not belong to `captainUserId`.
 * Ownership check mirrors `updatePlayer`. Also throws if the team's event roster is locked
 * (event Ongoing/Finished).
 */
export async function deletePlayer(id: string, captainUserId: string): Promise<void> {
  await runSerializableRegistrationTransaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to delete this player.");
    }
    if (player.team.eventId) await assertEventRosterMutable(tx, player.team.eventId);
    await tx.player.delete({ where: { id } });
  });
}

export async function setTeamCaptainDisplay(teamId: string, captainUserId: string, playerId: string): Promise<void> {
  const player = await prisma.player.findFirst({
    where: { id: playerId, teamId, team: { captainId: captainUserId } },
    select: { displayName: true },
  });
  if (!player) {
    throw new Error("Not authorized to update this team.");
  }
  await prisma.team.update({ where: { id: teamId }, data: { captainName: player.displayName } });
}

// ── Stat Submissions (captain) ────────────────────────────────────────────────

export type CompletedMatchRow = {
  matchId: string;
  matchLabel: string;
  slot: number | null;
  eventId: string;
  eventName: string;
  gameId: string;
  gameModeId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  scoreGameNumbers: number[] | null;
  submission: {
    id: string;
    status: string;
    rejectionNote: string | null;
    stats: PlayerStatPayloadMap;
  } | null;
};

export type PlayerStatFormContext = {
  match: {
    id: string;
    eventId: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
  };
  allowedStatKeys: string[];
  scoreGameNumbers: number[] | null;
};

export async function getPlayerStatFormContext(matchId: string, eventId: string): Promise<PlayerStatFormContext> {
  const match = await prisma.match.findFirst({
    where: { id: matchId, eventId, status: "Completed" },
    select: {
      id: true,
      eventId: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      roundLabel: true,
      resultSnapshot: true,
      games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
      event: { select: { gameId: true, gameModeId: true } },
    },
  });
  if (!match) throw new Error("Completed match not found.");
  const allowedStatKeys = getStatKeysForMode(match.event.gameModeId, match.event.gameId);
  if (match.event.gameId !== "game-flashpeak") {
    return {
      match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      allowedStatKeys,
      scoreGameNumbers: null,
    };
  }
  const roundConfig = await prisma.eventRoundConfig.findUnique({
    where: { eventId_roundLabel: { eventId, roundLabel: match.roundLabel } },
    select: { bestOf: true },
  });
  const snapshotBestOf = match.resultSnapshot && typeof match.resultSnapshot === "object" && !Array.isArray(match.resultSnapshot)
    && Number.isSafeInteger((match.resultSnapshot as { bestOf?: unknown }).bestOf)
    ? Number((match.resultSnapshot as { bestOf: number }).bestOf)
    : null;
  const scoreGameNumbers = resolvePlayerScoreGameNumbers({
    matchGames: match.games,
    resultSnapshot: match.resultSnapshot,
    roundBestOf: roundConfig?.bestOf ?? snapshotBestOf ?? 1,
  });
  return {
    match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
    allowedStatKeys,
    scoreGameNumbers,
  };
}

/**
 * Public discovery read without fixtures or demo fallbacks.
 *
 * Callers own timeout/error presentation so they can state honestly that live
 * tournament data is temporarily unavailable.
 */
export async function getPublicDiscoveryEvents(): Promise<PublicDiscoveryEvent[]> {
  const rows = await prisma.event.findMany({
    where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    include: {
      ...eventPublicInclude,
      competitionPhases: {
        where: { sequence: 1 },
        select: { status: true },
        take: 1,
      },
      matches: {
        where: { status: "Live" },
        select: { id: true },
        take: 1,
      },
      _count: { select: { teams: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
  });

  return rows.map((row) => ({
    event: mapEvent(row),
    phaseStatus: row.competitionPhases[0]?.status ?? null,
    hasLiveMatch: row.matches.length > 0,
    teamCount: row._count.teams,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Reads the V3 Flashpeak leaderboard from completed matches only.
 *
 * This public discovery path intentionally has no demo fallback: an unavailable
 * database must produce an honest empty/error state instead of invented players.
 */
export async function getFlashpeakLeaderboardForEvent(
  eventId: string,
): Promise<FlashpeakLeaderboardEntry[]> {
  try {
    const rows = await prisma.playerStat.findMany({
      where: {
        gameSlug: "flashpeak",
        match: { eventId, status: "Completed" },
      },
      select: {
        matchId: true,
        teamId: true,
        stats: true,
        match: {
          select: {
            resultSnapshot: true,
            games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
          },
        },
        player: {
          select: {
            id: true,
            displayName: true,
            nickname: true,
            position: true,
            team: { select: { id: true, name: true, eventId: true } },
          },
        },
      },
    });
    const sources: FlashpeakLeaderboardSource[] = rows.flatMap((row) => {
      const stored = row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? row.stats as Record<string, unknown>
        : null;
      try {
        if (row.teamId !== row.player.team.id || row.player.team.eventId !== eventId) {
          throw new Error("PlayerStat roster identity does not match its event.");
        }
        if (stored && "scores" in stored) {
          const gameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: row.match.games,
            resultSnapshot: row.match.resultSnapshot,
            roundBestOf: 1,
          });
          if (!Array.isArray(stored.scores)) throw new Error("Invalid stored player score array.");
          parsePlayerScoreArray(stored.scores, gameNumbers.length);
        }
      } catch (error) {
        console.error("Ignoring invalid Flashpeak PlayerStat row", { eventId, matchId: row.matchId, playerId: row.player.id, error });
        return [];
      }
      return [{
        matchId: row.matchId,
        playerId: row.player.id,
        playerName: row.player.displayName,
        nickname: row.player.nickname,
        teamId: row.player.team.id,
        teamName: row.player.team.name,
        position: row.player.position,
        stats: row.stats,
      }];
    });
    return aggregateFlashpeakLeaderboard(sources);
  } catch (error) {
    console.error("Failed to load Flashpeak leaderboard", { eventId, error });
    return [];
  }
}

/**
 * Returns all completed matches where the captain's teams participated, including stat submission status.
 * Batches event/team/submission lookups in a single `Promise.all` to avoid N+1 queries.
 */
export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]> {
  const captainTeams = await prisma.team.findMany({
    where: { captainId },
    select: { id: true, name: true, eventId: true },
  });
  if (captainTeams.length === 0) return [];

  const eventTeams = captainTeams.filter((team): team is (typeof captainTeams)[number] & { eventId: string } => Boolean(team.eventId));
  if (eventTeams.length === 0) return [];

  const teamIds = eventTeams.map((t) => t.id);
  const eventIds = [...new Set(eventTeams.map((t) => t.eventId))];

  const [matches, events, allTeams, submissions, roundConfigs] = await Promise.all([
    prisma.match.findMany({
      where: {
        eventId: { in: eventIds },
        status: "Completed",
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
      include: { games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } } },
    }),
    prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true, gameId: true, gameModeId: true },
    }),
    prisma.team.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, name: true, eventId: true },
    }),
    prisma.statSubmission.findMany({
      where: { teamId: { in: teamIds } },
    }),
    prisma.eventRoundConfig.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, roundLabel: true, bestOf: true },
    }),
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e]));
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));
  const submissionMap = new Map(submissions.map((s) => [`${s.matchId}::${s.teamId}`, s]));

  return matches.flatMap((match) => {
    const rows: CompletedMatchRow[] = [];
    for (const team of captainTeams) {
      const isHome = match.homeTeamId === team.id;
      const isAway = match.awayTeamId === team.id;
      if (!isHome && !isAway) continue;

      const event = eventMap.get(match.eventId);
      if (!event) continue;

      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = teamMap.get(opponentId);
      const submission = submissionMap.get(`${match.id}::${team.id}`) ?? null;
      const roundBestOf = roundConfigs.find((config) => config.eventId === event.id && config.roundLabel === match.roundLabel)?.bestOf ?? 1;
      let scoreGameNumbers: number[] | null = null;
      if (event.gameId === "game-flashpeak") {
        try {
          scoreGameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: match.games,
            resultSnapshot: match.resultSnapshot,
            roundBestOf,
          });
        } catch {
          scoreGameNumbers = [];
        }
      }

      rows.push({
        matchId: match.id,
        matchLabel: match.roundLabel,
        slot: match.slot,
        eventId: event.id,
        eventName: event.name,
        gameId: event.gameId,
        gameModeId: event.gameModeId,
        teamId: team.id,
        teamName: team.name,
        opponentName: opponent?.name ?? "Unknown",
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        scoreGameNumbers,
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              rejectionNote: submission.rejectionNote,
              stats: submission.stats as PlayerStatPayloadMap,
            }
          : null,
      });
    }
    return rows;
  });
}

/**
 * Verifies that a captain-submitted stat form targets one of their completed matches.
 * Hidden form IDs are attacker-controlled, so every relationship is rechecked server-side.
 */
export async function assertCaptainCanSubmitStats(input: {
  captainId: string;
  matchId: string;
  teamId: string;
  eventId: string;
}): Promise<void> {
  const match = await prisma.match.findFirst({
    where: {
      id: input.matchId,
      eventId: input.eventId,
      status: "Completed",
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });
  if (!match) {
    throw new Error("Not authorized");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: input.teamId,
      eventId: input.eventId,
      captainId: input.captainId,
    },
    select: { id: true },
  });
  if (!team) {
    throw new Error("Not authorized");
  }
}

async function assertAwardSourceWriteAllowed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  // Updating the shared version serializes this write with Completion's CAS.
  // Any rejection below rolls the increment back with the award-source write.
  const locked = await tx.event.updateMany({
    where: { id: eventId },
    data: { competitionVersion: { increment: 1 } },
  });
  if (locked.count !== 1) throw new Error("Event not found");

  const completion = await tx.tournamentCompletion.findUnique({
    where: { eventId },
    select: { status: true },
  });
  if (completion?.status === "completed") {
    throw new Error("Tournament completion locks award-source writes");
  }
}

async function awardSourceTransaction<T>(
  eventId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await assertAwardSourceWriteAllowed(tx, eventId);
    return work(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type PlayerStatWriteGuard = {
  eventId: string; matchId: string; expectedVersion: number;
  expectedResultVersion: number; operationId: string; submittedAt?: string;
};

export type EventMatchStatistics = Awaited<ReturnType<typeof readEventMatchStatistics>>;
export async function readEventMatchStatistics(eventId:string,matchId:string,actorId:string) {
  return prisma.$transaction(async tx => {
    const [actor,event]=await Promise.all([
      tx.user.findUnique({where:{id:actorId},select:{id:true,role:true,mustChangePassword:true}}),
      tx.event.findUnique({where:{id:eventId},select:{organizerUserId:true,competitionVersion:true}}),
    ]);
    if(!actor||!event||!["admin","platform_admin","organizer"].includes(actor.role)||actor.role==="organizer"&&(actor.mustChangePassword||event.organizerUserId!==actor.id))throw new Error("Not authorized");
    const match=await tx.match.findFirst({where:{id:matchId,eventId},select:{
      id:true,status:true,homeTeamId:true,awayTeamId:true,resultVersion:true,roundLabel:true,resultSnapshot:true,
      games:{select:{gameNumber:true,homeScore:true,awayScore:true},orderBy:{gameNumber:"asc"}},
      event:{select:{gameId:true,gameModeId:true}},
    }});
    if(!match)throw new Error("Match not found");
    const teamIds=[match.homeTeamId,match.awayTeamId].filter(Boolean);
    const [teams,players,statRows,submissions,revisions,round]=await Promise.all([
      tx.team.findMany({where:{eventId,id:{in:teamIds}},select:{id:true,name:true}}),
      tx.player.findMany({where:{teamId:{in:teamIds}},select:{id:true,teamId:true,nickname:true,position:true},orderBy:{id:"asc"}}),
      tx.playerStat.findMany({where:{matchId},select:{playerId:true,stats:true}}),
      tx.statSubmission.findMany({where:{eventId,matchId},orderBy:{submittedAt:"desc"},take:20}),
      tx.matchResultRevision.findMany({where:{eventId,matchId},orderBy:{version:"desc"},take:100,select:{id:true,version:true,homeScore:true,awayScore:true,reason:true,actorUserId:true,createdAt:true}}),
      tx.eventRoundConfig.findUnique({where:{eventId_roundLabel:{eventId,roundLabel:match.roundLabel}},select:{bestOf:true}}),
    ]);
    const snapshot=match.resultSnapshot as {bestOf?:number;games?:{gameNumber:number;homeScore:number;awayScore:number}[]}|null;
    const games=[...(match.games.length?match.games:snapshot?.games??[])].sort((a,b)=>a.gameNumber-b.gameNumber);
    let scoreGameNumbers:number[]|null=null;
    let scoreContextUnavailable=false;
    if(match.status==="Completed"&&match.event.gameId==="game-flashpeak"){
      try{scoreGameNumbers=resolvePlayerScoreGameNumbers({matchGames:match.games,resultSnapshot:match.resultSnapshot,roundBestOf:round?.bestOf??snapshot?.bestOf??1});}
      catch{scoreContextUnavailable=true;}
    }
    return {
      eventId,matchId,eventVersion:event.competitionVersion,resultVersion:match.resultVersion,games,
      allowedStatKeys:getStatKeysForMode(match.event.gameModeId,match.event.gameId),scoreGameNumbers,scoreContextUnavailable,
      teams:teamIds.map(id=>teams.find(team=>team.id===id)).filter((team):team is NonNullable<typeof team>=>!!team).map(team=>({...team,players:players.filter(player=>player.teamId===team.id)})),
      stats:Object.fromEntries(statRows.map(row=>[row.playerId,row.stats])) as PlayerStatPayloadMap,
      submissions:submissions.map(row=>({id:row.id,teamId:row.teamId,status:row.status,stats:row.stats as PlayerStatPayloadMap,submittedAt:row.submittedAt.toISOString(),reviewedAt:row.reviewedAt?.toISOString()??null,reviewedBy:row.reviewedBy,rejectionNote:row.rejectionNote})),
      revisions:revisions.map(row=>({...row,createdAt:row.createdAt.toISOString()})),
    };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}

function statFingerprint(value: unknown): string {
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

/** Every organizer entry point, including legacy adapters, shares this guarded transaction. */
async function managePlayerStats(input: {
  actorId: string; action: "save" | "approve" | "reject"; submissionId?: string;
  eventId?: string; matchId?: string; teamId?: string; stats?: PlayerStatPayloadMap;
  note?: string; guard?: PlayerStatWriteGuard;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const submission = input.submissionId ? await tx.statSubmission.findUnique({ where: { id: input.submissionId } }) : null;
    if (input.submissionId && !submission) throw new Error("Submission not found");
    const eventId = submission?.eventId ?? input.eventId!;
    const matchId = submission?.matchId ?? input.matchId!;
    const teamId = submission?.teamId ?? input.teamId!;
    const [actor, event, match] = await Promise.all([
      tx.user.findUnique({ where: { id: input.actorId }, select: { id: true, role: true, mustChangePassword: true } }),
      tx.event.findUnique({ where: { id: eventId }, select: { id: true, organizerUserId: true, competitionVersion: true } }),
      tx.match.findFirst({ where: { id: matchId, eventId }, select: { id: true, eventId: true, resultVersion: true, homeTeamId: true, awayTeamId: true, status: true } }),
    ]);
    if (!actor || !event || !["admin", "platform_admin", "organizer"].includes(actor.role)
      || actor.role === "organizer" && (actor.mustChangePassword || event.organizerUserId !== actor.id)) throw new Error("Not authorized");
    if (!match || match.eventId !== eventId || ![match.homeTeamId, match.awayTeamId].includes(teamId)) throw new Error("Match, team, and event relationship is invalid.");
    const guard = input.guard ?? {
      eventId, matchId, expectedVersion: event.competitionVersion, expectedResultVersion: match.resultVersion,
      operationId: randomUUID(), ...(submission ? { submittedAt: submission.submittedAt?.toISOString() } : {}),
    };
    if (guard.eventId !== eventId || guard.matchId !== matchId || !guard.operationId || guard.operationId.length > 200
      || !Number.isSafeInteger(guard.expectedVersion) || guard.expectedVersion < 0
      || !Number.isSafeInteger(guard.expectedResultVersion) || guard.expectedResultVersion < 0) throw new Error("Statistics conflict");
    const reason = input.note?.trim() ?? "";
    if (input.action === "reject" && (!reason || reason.length > 4000)) throw new Error("Rejection reason is required.");
    const fingerprint = statFingerprint({ ...input, guard, note: reason });
    const prior = await tx.competitionAuditLog.findFirst({ where: { eventId, idempotencyKey: guard.operationId } });
    if (prior) {
      if (prior.actorUserId !== actor.id || (prior.payload as { fingerprint?: string } | null)?.fingerprint !== fingerprint) throw new Error("Statistics conflict: operation reused.");
      return;
    }
    if (event.competitionVersion !== guard.expectedVersion || match.resultVersion !== guard.expectedResultVersion) throw new Error("Statistics conflict: stale version.");
    if (submission?.status !== undefined && submission.status !== "pending") throw new Error("Submission is no longer pending.");
    if (submission && input.guard && (!guard.submittedAt || submission.submittedAt.toISOString() !== guard.submittedAt)) throw new Error("Statistics conflict: stale submission.");
    if (match.status !== "Completed") throw new Error("Completed match required.");
    const locked = await tx.event.updateMany({ where: { id: eventId, competitionVersion: guard.expectedVersion }, data: { competitionVersion: { increment: 1 } } });
    if (locked.count !== 1) throw new Error("Statistics conflict: stale version.");
    const completion = await tx.tournamentCompletion.findUnique({ where: { eventId }, select: { status: true } });
    if (completion?.status === "completed") throw new Error("Tournament completion locks award-source writes");
    const stats = (submission?.stats ?? input.stats) as PlayerStatPayloadMap;
    const context = input.action !== "reject" ? await validatePlayerStatWriteContext(tx, { eventId, matchId, teamId, stats }) : null;
    if (submission) {
      const transitioned = await tx.statSubmission.updateMany({
        where: { id: submission.id, status: "pending", ...(input.guard ? { submittedAt: new Date(guard.submittedAt!) } : {}) },
        data: { status: input.action === "approve" ? "approved" : "rejected", reviewedBy: actor.id, reviewedAt: new Date(), rejectionNote: input.action === "reject" ? reason : null },
      });
      if (transitioned.count !== 1) throw new Error("Submission is no longer pending.");
    }
    if (context) await writePlayerStatsToDb(tx, matchId, teamId, context.gameSlug, stats, context.roster, {
      source: submission ? "captain" : "admin", lastUpdatedBy: actor.id,
    });
    await tx.competitionAuditLog.create({ data: {
      eventId, matchId, actorUserId: actor.id, action: `player_stats_${input.action}`,
      reason: reason || null, idempotencyKey: guard.operationId,
      payload: { fingerprint, teamId, submissionId: submission?.id ?? null, previousVersion: guard.expectedVersion, version: guard.expectedVersion + 1, resultVersion: guard.expectedResultVersion, source: submission ? "captain" : "organizer" },
    } });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 20_000,
  });
}

/**
 * Creates or replaces a captain's stat submission for a match.
 * Re-submission resets status to "pending" and clears any prior rejection note.
 */
export async function upsertStatSubmission(input: {
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  stats: PlayerStatPayloadMap;
}): Promise<void> {
  await awardSourceTransaction(input.eventId, async (tx) => {
    await validatePlayerStatWriteContext(tx, {
      matchId: input.matchId,
      teamId: input.teamId,
      eventId: input.eventId,
      stats: input.stats,
      captainId: input.submittedBy,
    });
    await tx.statSubmission.upsert({
      where: { matchId_teamId: { matchId: input.matchId, teamId: input.teamId } },
      update: {
        status: "pending",
        rejectionNote: null,
        reviewedAt: null,
        reviewedBy: null,
        stats: input.stats,
        submittedBy: input.submittedBy,
        submittedAt: new Date(),
      },
      create: {
        matchId: input.matchId,
        teamId: input.teamId,
        eventId: input.eventId,
        submittedBy: input.submittedBy,
        status: "pending",
        stats: input.stats,
      },
    });
  });
}

// ── Stat Submissions (admin) ──────────────────────────────────────────────────

/** Request-memoised count of pending stat submissions. Used for the admin notification badge. */
export const getPendingStatSubmissionCount = cache(async (user?: AppUser): Promise<number> => {
  return prisma.statSubmission.count({
    where: {
      status: "pending",
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
  });
});

export type StatSubmissionRow = {
  id: string;
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  status: string;
  rejectionNote: string | null;
  stats: PlayerStatPayloadMap;
  submittedAt: Date;
  matchLabel: string;
  teamName: string;
  captainEmail: string;
  eventName: string;
};

/** Returns pending stat submissions with denormalized display fields (match label, team name, captain email). */
export async function getPendingStatSubmissions(user?: AppUser): Promise<StatSubmissionRow[]> {
  const rows = await prisma.statSubmission.findMany({
    where: {
      status: "pending",
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
    orderBy: { submittedAt: "asc" },
  });
  if (rows.length === 0) return [];

  const [matches, teams, events, captains] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: rows.map((r) => r.matchId) } },
      select: { id: true, roundLabel: true, slot: true },
    }),
    prisma.team.findMany({
      where: { id: { in: rows.map((r) => r.teamId) } },
      select: { id: true, name: true },
    }),
    prisma.event.findMany({
      where: { id: { in: rows.map((r) => r.eventId) } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.submittedBy) } },
      select: { id: true, email: true },
    }),
  ]);

  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const captainMap = new Map(captains.map((u) => [u.id, u]));

  return rows.map((row) => ({
    id: row.id,
    matchId: row.matchId,
    teamId: row.teamId,
    eventId: row.eventId,
    submittedBy: row.submittedBy,
    status: row.status,
    rejectionNote: row.rejectionNote,
    stats: row.stats as PlayerStatPayloadMap,
    submittedAt: row.submittedAt,
    matchLabel: (() => {
      const m = matchMap.get(row.matchId);
      return m ? `${m.roundLabel}${m.slot != null ? ` · Match ${m.slot}` : ""}` : row.matchId;
    })(),
    teamName: teamMap.get(row.teamId)?.name ?? row.teamId,
    captainEmail: captainMap.get(row.submittedBy)?.email ?? row.submittedBy,
    eventName: eventMap.get(row.eventId)?.name ?? row.eventId,
  }));
}

/**
 * Upserts PlayerStat rows for each playerId in `statsMap` within a transaction.
 * Players must belong to the validated roster. Existing stats JSON is replaced, not merged.
 */
async function writePlayerStatsToDb(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  matchId: string,
  teamId: string,
  gameSlug: string,
  statsMap: PlayerStatPayloadMap,
  roster: ReadonlyMap<string, { nickname: string; position: string }>,
  audit?: { source: string; lastUpdatedBy: string },
): Promise<void> {
  for (const [playerId, playerStats] of Object.entries(statsMap)) {
    const player = roster.get(playerId);
    if (!player) throw new Error("Player does not belong to the submitted team and event.");

    await tx.playerStat.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      update: {
        teamId,
        playerName: player.nickname,
        position: player.position,
        gameSlug,
        stats: playerStats as object,
        ...(audit ? { source: audit.source, lastUpdatedBy: audit.lastUpdatedBy } : {}),
      },
      create: {
        matchId,
        playerId,
        playerName: player.nickname,
        teamId,
        position: player.position,
        gameSlug,
        stats: playerStats as object,
        ...(audit ? { source: audit.source, lastUpdatedBy: audit.lastUpdatedBy } : {}),
      },
    });
  }
}

async function validatePlayerStatWriteContext(
  tx: Prisma.TransactionClient,
  input: { matchId: string; teamId: string; eventId: string; stats: PlayerStatPayloadMap; captainId?: string },
): Promise<{ gameSlug: string; roster: Map<string, { nickname: string; position: string }> }> {
  const [match, team, players] = await Promise.all([
    tx.match.findFirst({
      where: {
        id: input.matchId,
        eventId: input.eventId,
        status: "Completed",
        OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
      },
      select: {
        id: true,
        roundLabel: true,
        resultSnapshot: true,
        games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
        event: { select: { gameId: true, gameModeId: true } },
      },
    }),
    tx.team.findFirst({
      where: {
        id: input.teamId,
        eventId: input.eventId,
        ...(input.captainId ? { captainId: input.captainId } : {}),
      },
      select: { id: true },
    }),
    tx.player.findMany({
      where: { teamId: input.teamId },
      select: { id: true, nickname: true, position: true },
    }),
  ]);
  if (!match || !team) throw new Error("Match, team, and event relationship is invalid.");

  const roundConfig = match.event.gameId === "game-flashpeak"
    ? await tx.eventRoundConfig.findUnique({
        where: { eventId_roundLabel: { eventId: input.eventId, roundLabel: match.roundLabel } },
        select: { bestOf: true },
      })
    : null;
  const snapshotBestOf = match.resultSnapshot && typeof match.resultSnapshot === "object" && !Array.isArray(match.resultSnapshot)
    && Number.isSafeInteger((match.resultSnapshot as { bestOf?: unknown }).bestOf)
    ? Number((match.resultSnapshot as { bestOf: number }).bestOf)
    : null;
  const scoreGameNumbers = match.event.gameId === "game-flashpeak"
    ? resolvePlayerScoreGameNumbers({
        matchGames: match.games,
        resultSnapshot: match.resultSnapshot,
        roundBestOf: roundConfig?.bestOf ?? snapshotBestOf ?? 1,
      })
    : null;
  validatePlayerStatPayload(input.stats, {
    allowedStatKeys: getStatKeysForMode(match.event.gameModeId, match.event.gameId),
    scoreSlotCount: scoreGameNumbers?.length ?? null,
  });

  const roster = new Map(players.map((player) => [player.id, { nickname: player.nickname, position: player.position }]));
  for (const playerId of Object.keys(input.stats)) {
    if (!roster.has(playerId)) throw new Error("Player does not belong to the submitted team and event.");
  }
  const game = getGameConfig(match.event.gameId);
  return { gameSlug: game?.slug ?? "unknown", roster };
}

/**
 * Approves a stat submission: writes `PlayerStat` rows for each player and marks the
 * submission as "approved" in one guarded transaction. Foreign players reject the entire write.
 */
export async function approveStatSubmission(submissionId: string, adminId: string, guard?: PlayerStatWriteGuard): Promise<void> {
  await managePlayerStats({ actorId: adminId, action: "approve", submissionId, guard });
}

/**
 * Returns a match with its roster (players from both teams) and existing PlayerStat rows.
 * Used by Admin to pre-fill the player statistics editor.
 */
export async function getMatchWithRosterAndStats(matchId: string): Promise<{
  match: { id: string; homeTeamId: string; awayTeamId: string; status: string; eventId: string };
  homePlayers: Player[];
  awayPlayers: Player[];
  existingStats: PlayerStatPayloadMap;
  scoreGameNumbers: number[] | null;
} | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, homeTeamId: true, awayTeamId: true, status: true, eventId: true },
  });
  if (!match || !match.homeTeamId || !match.awayTeamId) return null;

  const [allPlayers, statRows, statContext] = await Promise.all([
    getPlayersForTeams([match.homeTeamId, match.awayTeamId]),
    prisma.playerStat.findMany({ where: { matchId } }),
    getPlayerStatFormContext(match.id, match.eventId).catch(() => null),
  ]);

  const existingStats: PlayerStatPayloadMap = {};
  for (const row of statRows) {
    existingStats[row.playerId] = row.stats as PlayerStatPayloadMap[string];
  }

  return {
    match,
    homePlayers: allPlayers.filter((p) => p.teamId === match.homeTeamId),
    awayPlayers: allPlayers.filter((p) => p.teamId === match.awayTeamId),
    existingStats,
    scoreGameNumbers: statContext?.scoreGameNumbers ?? null,
  };
}

/**
 * Writes player match statistics directly (admin override, bypasses captain submission queue).
 * Stats JSON is replaced per player — safe for editing existing values without double-counting.
 */
export async function adminWriteMatchPlayerStats(input: {
  matchId: string;
  teamId: string;
  eventId: string;
  adminId: string;
  stats: PlayerStatPayloadMap;
  guard?: PlayerStatWriteGuard;
}): Promise<void> {
  await managePlayerStats({ actorId: input.adminId, action: "save", eventId: input.eventId, matchId: input.matchId, teamId: input.teamId, stats: input.stats, guard: input.guard });
}

/** Rejects a stat submission with a note shown to the captain. Does not delete PlayerStat rows. */
export async function rejectStatSubmission(
  submissionId: string,
  adminId: string,
  note: string,
  guard?: PlayerStatWriteGuard,
): Promise<void> {
  await managePlayerStats({ actorId: adminId, action: "reject", submissionId, note, guard });
}

/**
 * Sets or replaces the live stream URL for an event. Parses the URL to determine platform
 * (YouTube, TikTok, or external) and stores it as enabled + live immediately.
 */
export async function updateEventStream(eventId: string, url: string, label: string): Promise<Event | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const stream = getLiveStreamPresentation(url);
  await prisma.eventStream.upsert({
    where: { eventId },
    update: { platform: stream.platform, url, label, enabled: true, isLive: true },
    create: { eventId, platform: stream.platform, url, label, enabled: true, isLive: true },
  });

  const updated = await prisma.event.findUnique({ where: { id: eventId }, include: { stream: true } });
  return updated ? mapEvent(updated) : null;
}

// ── Captain self sign-up ──────────────────────────────────────────────────────

/**
 * Atomically creates a captain User and their first Team in a Prisma transaction.
 * Used by the self sign-up flow; teamTag is uppercased and used as the logoText.
 */
/** Creates a captain User without requiring an active event or team registration. */
export async function createCaptainAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<{ userId: string }> {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: "captain",
      passwordHash: input.passwordHash,
    },
  });
  return { userId: user.id };
}

export async function createCaptainWithTeam(input: {
  email: string;
  name: string;
  passwordHash: string;
  eventId: string;
  teamName: string;
  teamTag: string;
}): Promise<{ userId: string; teamId: string }> {
  const tag = input.teamTag.toUpperCase();
  return runSerializableRegistrationTransaction(async (tx) => {
    await assertEventRosterMutable(tx, input.eventId);
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        slug: true,
        status: true,
        participantCap: true,
        format: true,
        registrationFeeRequired: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
      },
    });
    if (!event) throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
    assertNewRegistrationWindowOpen(event);
    if (event.registrationFeeRequired) {
      throw new Error("Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.");
    }

    const [registeredTeams, pendingReviewRequests, existingIdentity, completedMatches] = await Promise.all([
      tx.team.count({ where: { eventId: input.eventId } }),
      tx.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
      tx.team.findFirst({
        where: { eventId: input.eventId, OR: [{ name: input.teamName }, { tag }] },
        select: { id: true },
      }),
      event.format === "Single Elimination"
        ? tx.match.count({ where: { eventId: input.eventId, status: "Completed" } })
        : Promise.resolve(0),
    ]);
    if (registeredTeams + pendingReviewRequests >= event.participantCap) {
      throw new Error("Slot pendaftaran event ini sudah penuh.");
    }
    if (existingIdentity) throw new Error("Tag atau nama tim sudah digunakan di event ini.");
    if (completedMatches > 0) {
      throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
    }

    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "captain",
        passwordHash: input.passwordHash,
      },
    });
    const team = await tx.team.create({
      data: {
        eventId: input.eventId,
        captainId: user.id,
        name: input.teamName,
        tag,
        logoText: tag,
        source: "registration",
      },
    });
    return { userId: user.id, teamId: team.id };
  });
}

/**
 * Atomically creates a captain User and a pending-payment TeamRegistrationRequest
 * (no Team row yet) for paid events. Used by the self sign-up flow when the target
 * event has registrationFeeRequired enabled.
 */
export async function createCaptainWithPendingPayment(input: {
  email: string;
  name: string;
  passwordHash: string;
  eventId: string;
  teamName: string;
  teamTag: string;
}): Promise<{ userId: string; requestId: string }> {
  const tag = input.teamTag.toUpperCase();

  return runSerializableRegistrationTransaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        slug: true,
        status: true,
        participantCap: true,
        format: true,
        registrationFeeRequired: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
      },
    });
    if (!event) throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
    assertNewRegistrationWindowOpen(event);
    if (!event.registrationFeeRequired) {
      throw new Error("Event ini tidak membutuhkan verifikasi pembayaran.");
    }

    const [registeredTeams, pendingReviewRequests, existingTeamIdentity, existingRequestIdentity, completedMatches] = await Promise.all([
      tx.team.count({ where: { eventId: input.eventId } }),
      tx.teamRegistrationRequest.count({ where: { eventId: input.eventId, status: "pending_review" } }),
      tx.team.findFirst({ where: { eventId: input.eventId, OR: [{ name: input.teamName }, { tag }] }, select: { id: true } }),
      tx.teamRegistrationRequest.findFirst({
        where: {
          eventId: input.eventId,
          status: { in: RESERVED_REGISTRATION_REQUEST_STATUSES },
          OR: [{ teamName: input.teamName }, { teamTag: tag }],
        },
        select: { id: true },
      }),
      event.format === "Single Elimination"
        ? tx.match.count({ where: { eventId: input.eventId, status: "Completed" } })
        : Promise.resolve(0),
    ]);
    if (registeredTeams + pendingReviewRequests >= event.participantCap) {
      throw new Error("Slot pendaftaran event ini sudah penuh.");
    }
    if (existingTeamIdentity || existingRequestIdentity) {
      throw new Error("Tag atau nama tim sudah digunakan di event ini.");
    }
    if (completedMatches > 0) {
      throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
    }

    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "captain",
        passwordHash: input.passwordHash,
      },
    });
    const request = await tx.teamRegistrationRequest.create({
      data: {
        eventId: input.eventId,
        captainId: user.id,
        teamName: input.teamName,
        teamTag: tag,
        status: "pending_payment",
        expiresAt: new Date(Date.now() + PAYMENT_REQUEST_TTL_MS),
      },
    });
    return { userId: user.id, requestId: request.id };
  });
}

// ── Round config (Best of N) ──────────────────────────────────────────────────

/** Returns all Best-of-N round configurations for an event (one per round label). Cached 30s under tag "teams". */
export const getEventRoundConfigs = cache(
  unstable_cache(
    async (eventId: string): Promise<EventRoundConfig[]> => {
      try {
        const rows = await prisma.eventRoundConfig.findMany({ where: { eventId } });
        return rows.map((r) => ({ id: r.id, eventId: r.eventId, roundLabel: r.roundLabel, bestOf: r.bestOf }));
      } catch {
        return [];
      }
    },
    ["event-round-configs"],
    { revalidate: 30, tags: ["teams"] },
  ),
);

/** Creates or updates the Best-of-N setting for a specific round label within an event. */
export async function upsertRoundConfig(eventId: string, roundLabel: string, bestOf: number): Promise<void> {
  if (![1, 3, 5].includes(bestOf)) throw new Error("Invalid event round configuration");
  await legacyResultTransaction(eventId, tx => tx.eventRoundConfig.upsert({
    where: { eventId_roundLabel: { eventId, roundLabel } },
    update: { bestOf },
    create: { eventId, roundLabel, bestOf },
  }));
}

// ── Match games (Best of N results) ──────────────────────────────────────────

/** Returns per-game scores for a single match, ordered by game number ascending. */
export async function getMatchGames(matchId: string): Promise<MatchGame[]> {
  const rows = await prisma.matchGame.findMany({ where: { matchId }, orderBy: { gameNumber: "asc" } });
  return rows.map((r) => ({ id: r.id, matchId: r.matchId, gameNumber: r.gameNumber, homeScore: r.homeScore, awayScore: r.awayScore }));
}

const _getMatchGamesForEventCached = cache(
  unstable_cache(
    async (eventId: string): Promise<Array<{ matchId: string; games: MatchGame[] }>> => {
      let rows;
      try {
        rows = await prisma.matchGame.findMany({
          where: { match: { eventId } },
          orderBy: { gameNumber: "asc" },
        });
      } catch {
        return [];
      }
      const acc: Record<string, MatchGame[]> = {};
      for (const row of rows) {
        (acc[row.matchId] ??= []).push({ id: row.id, matchId: row.matchId, gameNumber: row.gameNumber, homeScore: row.homeScore, awayScore: row.awayScore });
      }
      return Object.entries(acc).map(([matchId, games]) => ({ matchId, games }));
    },
    ["match-games-for-event"],
    { revalidate: 30, tags: ["teams"] },
  ),
);

/**
 * Fetches all per-game scores for every match in an event in one query.
 * Returns a Map keyed by matchId for O(1) lookup during bracket page rendering.
 * Cached 30s under tag "teams" so score detail panels stay fresh after match saves.
 */
export async function getMatchGamesForEvent(eventId: string): Promise<Map<string, MatchGame[]>> {
  try {
    const entries = await _getMatchGamesForEventCached(eventId);
    return new Map(entries.map((e) => [e.matchId, e.games]));
  } catch {
    return new Map();
  }
}

/**
 * Saves per-game scores for a Best-of-N match. Automatically stops counting games once
 * a series winner is reached (`ceil(bestOf / 2)` wins). Upserts the parent Match row
 * with series win counts and deletes+recreates MatchGame rows atomically.
 * Throws if the match or event is not found.
 */
export async function setMatchGames(
  matchId: string,
  eventId: string,
  games: { gameNumber: number; homeScore: number; awayScore: number }[],
): Promise<void> {
  return legacyResultTransaction(eventId, tx => setLegacyMatchGames(tx, matchId, eventId, games));
}

async function setLegacyMatchGames(
  prisma: Prisma.TransactionClient,
  matchId: string,
  eventId: string,
  games: { gameNumber: number; homeScore: number; awayScore: number }[],
): Promise<void> {
  let homeTeamId: string;
  let awayTeamId: string;
  let roundLabel: string;
  let round: number | null = null;
  let slot: number | null = null;

  const existingRow = await prisma.match.findFirst({ where: { id: matchId, eventId } });
  if (existingRow?.phaseId || (existingRow?.resultVersion ?? 0) > 0) {
    throw new Error("Use the versioned competition operation to submit or correct this result.");
  }
  if (existingRow) {
    homeTeamId = existingRow.homeTeamId;
    awayTeamId = existingRow.awayTeamId;
    roundLabel = existingRow.roundLabel;
    round = existingRow.round;
    slot = existingRow.slot;
  } else {
    const fullEvent = await prisma.event.findUnique({ where: { id: eventId } });
    if (!fullEvent) throw new Error("Event not found");
    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }), prisma);
    const projMatch = projected.find((m) => m.id === matchId);
    if (!projMatch) throw new Error("Match not found");
    homeTeamId = projMatch.homeTeamId;
    awayTeamId = projMatch.awayTeamId;
    roundLabel = projMatch.roundLabel;
    round = projMatch.round ?? null;
    slot = projMatch.slot ?? null;
  }

  const roundRule = await prisma.eventRoundConfig.findUnique({
    where: { eventId_roundLabel: { eventId, roundLabel } },
    select: { bestOf: true },
  });
  const bestOf = roundRule?.bestOf ?? 1;
  if (![1, 3, 5].includes(bestOf)) throw new Error("Invalid event round configuration");
  const winsNeeded = Math.ceil(bestOf / 2);
  let homeWins = 0;
  let awayWins = 0;
  const playedGames: typeof games = [];

  for (const game of [...games].sort((a, b) => a.gameNumber - b.gameNumber)) {
    if (playedGames.length >= bestOf || homeWins >= winsNeeded || awayWins >= winsNeeded) break;
    playedGames.push(game);
    if (game.homeScore > game.awayScore) homeWins++;
    else if (game.awayScore > game.homeScore) awayWins++;
  }

  const winnerTeamId =
    homeWins >= winsNeeded ? homeTeamId : awayWins >= winsNeeded ? awayTeamId : null;

    await prisma.match.upsert({
      where: { id: matchId },
      update: {
        homeScore: homeWins,
        awayScore: awayWins,
        status: winnerTeamId ? "Completed" : "Scheduled",
        winnerTeamId,
      },
      create: {
        id: matchId, eventId, roundLabel, homeTeamId, awayTeamId,
        homeScore: homeWins, awayScore: awayWins,
        status: winnerTeamId ? "Completed" : "Scheduled",
        round, slot, winnerTeamId,
      },
    });
    await prisma.matchGame.deleteMany({ where: { matchId } });
    await prisma.matchGame.createMany({
      data: playedGames.map((g) => ({ matchId, gameNumber: g.gameNumber, homeScore: g.homeScore, awayScore: g.awayScore })),
    });
}

// ── Certificates ──────────────────────────────────────────────────────────────

/** Updates the character art URL and accent color for an event's certificate assets. */
export async function updateEventCertificateAssets(
  eventId: string,
  updates: { characterArtUrl?: string; accentColor?: string },
): Promise<void> {
  await prisma.event.update({ where: { id: eventId }, data: updates });
}

export async function updateEventBrandAssets(
  eventId: string,
  updates: { logoUrl?: string; gameImageUrl?: string },
): Promise<void> {
  try {
    await prisma.event.update({ where: { id: eventId }, data: updates });
  } catch {
    demoStore.updateEventBrandAssets(eventId, updates);
  }
}

/** Longest error message we persist on a failed certificate row. */
const MAX_CERTIFICATE_ERROR_LENGTH = 500;

async function runSerializableCertificateTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if ((code !== "P2034" && code !== "P2002") || attempt === 2) throw error;
    }
  }
  throw new Error("Certificate version changed concurrently. Please retry.");
}

type CertificateRow = {
  id: string;
  eventId: string;
  teamId: string;
  imageUrl: string;
  status: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    imageUrl: row.imageUrl,
    status: row.status === "ready" || row.status === "published" ? "ready" : "failed",
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const LEGACY_CHAMPION_CERTIFICATE_FILTER = {
  type: "champion",
  recipientKind: "team",
} as const;

const LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  templateVersion: "legacy-v1",
} as const;

const LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  status: "ready",
  publishedUrl: { not: null },
} as const;

async function getCertificateRecipientName(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return team?.name ?? teamId;
}

async function assertLegacyCertificateWriteAllowed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const completion = await tx.tournamentCompletion.findFirst({
    where: { eventId },
    select: { id: true },
  });
  if (completion) {
    throw new Error("Completion V3 certificates must be generated in Certificate Studio");
  }
}

/** Marks an event's Champion certificate as successfully generated, clearing any previous failure. */
export async function recordCertificateSuccess(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {
  const recipientName = await getCertificateRecipientName(teamId);
  const now = new Date();
  const createData = {
    eventId,
    teamId,
    ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
    recipientId: teamId,
    recipientName,
    imageUrl,
    publishedUrl: imageUrl,
    status: "ready",
    generatedAt: now,
    publishedAt: now,
    lastError: null,
    attemptCount: 1,
  } as const;
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const isPublished = Boolean(existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl));

    if (isPublished && existing) {
      const nextVersion = existing.version + 1;
      await tx.certificate.update({
        where: { id: existing.id },
        data: { supersededByVersion: nextVersion },
      });
      return tx.certificate.create({ data: { ...createData, version: nextVersion } });
    }
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          imageUrl,
          publishedUrl: imageUrl,
          status: "ready",
          generatedAt: now,
          publishedAt: now,
          lastError: null,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({ data: createData });
  });
  return toCertificate(row);
}

/**
 * Records a failed generation attempt so the admin panel can surface the reason and offer a retry.
 * Keeps the Champion row so the failure is visible instead of looking like "no certificate yet".
 */
export async function recordCertificateFailure(eventId: string, teamId: string, message: string): Promise<Certificate> {
  const lastError = message.slice(0, MAX_CERTIFICATE_ERROR_LENGTH);
  const recipientName = await getCertificateRecipientName(teamId);
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    if (existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl)) return existing;
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          status: "failed",
          lastError,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({
      data: {
        eventId,
        teamId,
        ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        recipientId: teamId,
        recipientName,
        imageUrl: "",
        status: "failed",
        lastError,
        attemptCount: 1,
      },
    });
  });
  return toCertificate(row);
}

/** Returns the latest Champion team certificate for an event, preserving the legacy API. */
export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {
  const publishedRow = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (publishedRow) return toCertificate(publishedRow);

  const row = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (!row) return null;
  return toCertificate(row);
}

/** Batch-fetches generated certificates for multiple events. */
export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {
  const certificates = new Map(eventIds.map((eventId) => [eventId, null as Certificate | null]));
  if (!eventIds.length) return certificates;

  try {
    const rows = await prisma.certificate.findMany({
      where: { eventId: { in: eventIds }, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    for (const row of rows) {
      if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
    }
    const eventIdsWithoutPublishedCertificate = eventIds.filter((eventId) => !certificates.get(eventId));
    if (eventIdsWithoutPublishedCertificate.length) {
      const fallbackRows = await prisma.certificate.findMany({
        where: {
          eventId: { in: eventIdsWithoutPublishedCertificate },
          ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      });
      for (const row of fallbackRows) {
        if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
      }
    }
  } catch {
    await Promise.all(
      eventIds.map(async (eventId) => {
        certificates.set(eventId, await getCertificateByEvent(eventId));
      }),
    );
  }

  return certificates;
}

/**
 * Counts successfully generated certificates for a given game prefix (e.g. "game-flashpeak")
 * to generate sequential IDs. Failed attempts are excluded so the sequence has no gaps.
 */
export async function countCertificatesForGame(gameId: string): Promise<number> {
  return prisma.certificate.count({
    where: { status: "ready", ...LEGACY_CHAMPION_CERTIFICATE_FILTER, event: { gameId } },
  });
}
