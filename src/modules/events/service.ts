import { getGameIdForMode } from "@/lib/platform/config";
import type { Event } from "@/lib/platform/types";
import { getLegacyTournamentFormat, TOURNAMENT_FORMAT_PRESETS, type TournamentFormatConfig } from "@/lib/tournament/formats/types";
import type { ActorContext } from "@/modules/identity";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/identity";

import { eventDraftSchema, saveEventDraft } from "./event-draft";
import { publishEvent } from "./publish-readiness";
import { createEventPreviewToken, revokeEventPreviewTokens } from "./preview-token";

import {
  archiveEventForActor,
  assertActorCanManageEvent,
  createEventRecord,
  getActiveOrganizerIdentityById,
  setEventStatusForActor,
  updateEventOrganizerContactForActor,
  updateEventPublicInfoForActor,
} from "./repository";

type EventManagerRole = "organizer" | "platform_admin" | "admin";

export function resolveEventFormatConfig(kind: "single_elimination" | "double_elimination" | "round_robin" | "group_playoffs") {
  return {
    single_elimination: TOURNAMENT_FORMAT_PRESETS.singleElimination,
    double_elimination: TOURNAMENT_FORMAT_PRESETS.doubleElimination,
    round_robin: TOURNAMENT_FORMAT_PRESETS.roundRobin,
    group_playoffs: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs,
  }[kind];
}

export async function createEventForManager(input: {
  actor: ActorContext;
  organizerDisplayName: string;
  name: string;
  slug: string;
  gameModeId: string;
  formatConfig: TournamentFormatConfig;
  participantCap: Event["participantCap"];
  organizerUserId?: string;
}) {
  const actor = input.actor;

  let targetOrganizerUserId = actor.tenantId;
  let targetOrganizerName = input.organizerDisplayName;

  if (!targetOrganizerUserId) {
    if (!input.organizerUserId) {
      throw new NotFoundError("Organizer selection is required.");
    }

    const organizer = await getActiveOrganizerIdentityById(input.organizerUserId);
    if (!organizer) {
      throw new NotFoundError("Organizer not found.");
    }

    targetOrganizerUserId = organizer.id;
    targetOrganizerName = organizer.name;
  } else if (input.organizerUserId && input.organizerUserId !== targetOrganizerUserId) {
    throw new ForbiddenError();
  }

  if (!targetOrganizerUserId) {
    throw new ForbiddenError();
  }

  const gameId = getGameIdForMode(input.gameModeId);
  return createEventRecord({
    name: input.name,
    slug: input.slug,
    gameId,
    gameModeId: input.gameModeId,
    format: getLegacyTournamentFormat(input.formatConfig),
    formatConfig: input.formatConfig,
    participantCap: input.participantCap,
    organizerUserId: targetOrganizerUserId,
    organizerName: targetOrganizerName,
    organizerVerified: false,
  });
}

export async function updateEventStatusForManager(input: {
  actor: ActorContext;
  eventId: string;
  status: Event["status"];
  enableV3PublishFlow: boolean;
}) {
  const actor = input.actor;
  await assertActorCanManageEvent(actor, input.eventId);

  if (input.status === "Published" && input.enableV3PublishFlow) {
    return publishEvent(input.eventId, {
      id: actor.tenantId ?? actor.userId,
      role: actor.role === "platform_admin" ? "platform_admin" : "organizer",
    });
  }

  const event = await setEventStatusForActor(actor, input.eventId, input.status);
  if (!event) {
    throw new NotFoundError();
  }

  return { status: "updated" as const, event };
}

export async function archiveEventForManager(input: {
  actor: ActorContext;
  eventId: string;
  action: "archive" | "delete";
}) {
  const result = await archiveEventForActor(input.actor, input.eventId, input.action);

  if (result === "not_found") {
    throw new NotFoundError();
  }

  return result;
}

export async function updateEventPublicInfoForManager(input: {
  actor: ActorContext;
  eventId: string;
  updates: {
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
}) {
  return updateEventPublicInfoForActor(input.actor, input.eventId, input.updates);
}

export async function updateEventOrganizerContactForManager(input: {
  actor: ActorContext;
  organizerDisplayName: string;
  eventId: string;
  contactChannel: string;
  contactValue: string;
}) {
  await updateEventOrganizerContactForActor(input.actor, {
    eventId: input.eventId,
    contactChannel: input.contactChannel,
    contactValue: input.contactValue,
    fallbackOrganizationName: input.organizerDisplayName,
  });
}

export async function saveEventDraftForManager(input: {
  actor: ActorContext;
  eventId: string;
  expectedRevision: number;
  mutationId: string;
  draft: unknown;
}) {
  const actor = input.actor;
  const parsedDraft = eventDraftSchema.parse(input.draft);

  return saveEventDraft({
    eventId: input.eventId,
    actor: {
      id: actor.tenantId ?? actor.userId,
      role: actor.role === "platform_admin" ? "platform_admin" : "organizer",
    },
    expectedRevision: input.expectedRevision,
    mutationId: input.mutationId,
    draft: parsedDraft,
  });
}

export async function publishEventForManager(input: {
  actor: ActorContext;
  eventId: string;
}) {
  await assertActorCanManageEvent(input.actor, input.eventId);

  return publishEvent(input.eventId, {
    id: input.actor.tenantId ?? input.actor.userId,
    role: input.actor.role === "platform_admin" ? "platform_admin" : "organizer",
  });
}

export async function createEventPreviewForManager(input: {
  actor: ActorContext;
  eventId: string;
}) {
  await assertActorCanManageEvent(input.actor, input.eventId);

  return createEventPreviewToken({
    eventId: input.eventId,
    actor: {
      id: input.actor.tenantId ?? input.actor.userId,
      role: input.actor.role === "platform_admin" ? "platform_admin" : "organizer",
    },
  });
}

export async function revokeEventPreviewForManager(input: {
  actor: ActorContext;
  eventId: string;
}) {
  await assertActorCanManageEvent(input.actor, input.eventId);

  return revokeEventPreviewTokens({
    eventId: input.eventId,
    actor: {
      id: input.actor.tenantId ?? input.actor.userId,
      role: input.actor.role === "platform_admin" ? "platform_admin" : "organizer",
    },
  });
}

export function mapLegacyPublishFailureToConflict(result: { status: string }) {
  if (result.status === "conflict" || result.status === "not_draft") {
    throw new ConflictError();
  }

  return result;
}

export type { EventManagerRole };