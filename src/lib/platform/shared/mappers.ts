// Row mappers and the Prisma include sets they depend on. Moved out of repository.ts without changes (refactor PR 1.1).

import { PAYMENT_SETTINGS_ID } from "./constants";
import { getFallbackLogoUrl } from "@/lib/platform/config";
import type { AppUser, Event, EventStatus, EventStream, EventVisualAsset, Match, PaymentSettings, Player, Team, TeamRegistrationRequest, TeamRegistrationRequestStatus, TournamentFormat, VisualAssetSource, VisualAssetStatus } from "@/lib/platform/types";
import { tournamentFormatConfigSchema } from "@/lib/tournament/formats/types";
import { Prisma } from "@prisma/client";

/** Single relation set every mapped-event query loads, so `mapEvent` stays the only mapping site. */
export const eventPublicInclude = { stream: true, activeVisualAsset: true } satisfies Prisma.EventInclude;

export type EventVisualAssetRow = {
  id: string; eventId: string; source: string; status: string;
  url?: string | null; mimeType?: string | null; width?: number | null; height?: number | null; byteSize?: number | null;
  storageProvider?: string | null; storageKey?: string | null; contentSha256?: string | null; purpose?: string | null;
  focalX: number; focalY: number;
  provider?: string | null; model?: string | null; promptVersion?: string | null;
  workflowRunId?: string | null; sourceUrl?: string | null; rightsAttestedAt?: Date | null;
  errorCode?: string | null; createdByUserId?: string | null; approvedAt?: Date | null;
  createdAt: Date; updatedAt: Date;
};

export function mapEventVisualAsset(row: EventVisualAssetRow): EventVisualAsset {
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

export function mapTeam(row: {
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

export function mapPaymentSettings(row: { id: string; qrisImageUrl: string | null; instructions: string | null; updatedAt?: Date } | null): PaymentSettings {
  if (!row) return { id: PAYMENT_SETTINGS_ID };
  return {
    id: row.id,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

export const registrationRequestInclude = {
  event: { include: { stream: true } },
  captain: { select: { id: true, name: true, email: true } },
} as const;

export function mapTeamRegistrationRequest(row: {
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

export function mapPlayer(row: {
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

export function mapUser(row: {
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

export function mapMatch(row: {
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
