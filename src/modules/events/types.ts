import type { Prisma } from "@prisma/client";

import type { Event, EventStatus, EventVisualAsset, TournamentFormat, VisualAssetSource, VisualAssetStatus } from "@/lib/platform/types";
import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";

export type EventAccessScope =
  | { kind: "platform_admin" }
  | { kind: "organizer"; organizerUserId: string }
  | { kind: "none" };

export type EventVisualAssetRow = {
  id: string;
  eventId: string;
  source: string;
  status: string;
  url?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  focalX: number;
  focalY: number;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  workflowRunId?: string | null;
  sourceUrl?: string | null;
  rightsAttestedAt?: Date | null;
  errorCode?: string | null;
  createdByUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EventRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  gameImageUrl: string | null;
  gameId: string;
  gameModeId: string;
  format: string;
  status: string;
  formatConfig?: Prisma.JsonValue | null;
  participantCap: number;
  registrationWindow: string;
  startsAt: string;
  venue: string;
  characterArtUrl?: string | null;
  accentColor?: string | null;
  organizerUserId?: string | null;
  organizerName?: string | null;
  organizerVerified?: boolean | null;
  prizePoolLabel?: string | null;
  registrationFeeRequired?: boolean | null;
  registrationFeeAmount?: number | null;
  registrationFeeLabel?: string | null;
  registrationUrl?: string | null;
  stream?: {
    platform: string;
    url: string;
    label: string;
    enabled: boolean;
    isLive: boolean;
  } | null;
  activeVisualAssetId?: string | null;
  activeVisualAsset?: EventVisualAssetRow | null;
};

export type ManageableEventDraftRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  gameId: string;
  gameModeId: string;
  format: string;
  formatConfig: Prisma.JsonValue | null;
  participantCap: number;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  eventStartsAt: Date | null;
  timezone: string;
  venue: string;
  venueAddress: string | null;
  registrationFeeRequired: boolean;
  registrationFeeAmount: number | null;
  logoUrl: string | null;
  gameImageUrl: string | null;
  draftRevision: number;
  status: string;
  organizer: {
    organizerProfile: {
      contactChannel: string;
      contactValue: string;
    } | null;
  } | null;
};

export type ManageableEventDraft = Omit<ManageableEventDraftRow, "status" | "formatConfig"> & {
  status: EventStatus;
  formatConfig: TournamentFormatConfig | null;
};

export type { Event, EventStatus, EventVisualAsset, TournamentFormat, VisualAssetSource, VisualAssetStatus };
