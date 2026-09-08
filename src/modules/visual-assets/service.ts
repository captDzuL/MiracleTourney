import type { ActorContext } from "@/modules/identity";

import {
  approveVisualAssetForActor,
  assertActorCanManageVisualEvent as assertActorCanManageVisualEventInRepository,
  countAiVisualAttempts as countAiVisualAttemptsForEvent,
  createVisualAssetForActor,
  listVisualAssetsForActor,
  rejectVisualAssetForActor,
  setVisualAssetFocalPointForActor,
} from "./repository";

import type { ApproveVisualAssetOptions, CreateVisualAssetInput, EventVisualAsset, FocalPoint } from "./types";

/**
 * Public preflight authorization check. Lets Server Actions deny access to
 * another tenant's event *before* performing side effects (such as uploading
 * a file to Blob storage) that a mutation's own transactional ownership check
 * cannot undo. This is a preflight only — every mutation below still
 * re-verifies ownership inside its own transaction so a denial can never rely
 * solely on this earlier check.
 */
export async function assertActorCanManageVisualEvent(actor: ActorContext | null, eventId: string): Promise<void> {
  return assertActorCanManageVisualEventInRepository(actor, eventId);
}

export async function listEventVisualAssets(actor: ActorContext | null, eventId: string): Promise<EventVisualAsset[]> {
  return listVisualAssetsForActor(actor, eventId);
}

export async function createEventVisualAsset(
  actor: ActorContext | null,
  input: CreateVisualAssetInput,
): Promise<EventVisualAsset> {
  return createVisualAssetForActor(actor, input);
}

export async function approveEventVisualAsset(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
  options: ApproveVisualAssetOptions = {},
): Promise<EventVisualAsset> {
  return approveVisualAssetForActor(actor, eventId, assetId, options);
}

export async function rejectEventVisualAsset(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
): Promise<EventVisualAsset> {
  return rejectVisualAssetForActor(actor, eventId, assetId);
}

export async function setEventVisualFocalPoint(
  actor: ActorContext | null,
  eventId: string,
  assetId: string,
  focalPoint: FocalPoint,
): Promise<EventVisualAsset> {
  return setVisualAssetFocalPointForActor(actor, eventId, assetId, focalPoint);
}

export async function countAiVisualAttempts(eventId: string, since: Date): Promise<number> {
  return countAiVisualAttemptsForEvent(eventId, since);
}
