import type { ActorContext } from "@/modules/identity";

import {
  assertActorCanManageCertificateEvent as assertActorCanManageCertificateEventInRepository,
  countCertificatesForGame as countCertificatesForGameInRepository,
  generateCertificateIfFinal as generateCertificateIfFinalInRepository,
  getCertificateByEvent as getCertificateByEventInRepository,
  getCertificatesForEvents as getCertificatesForEventsInRepository,
  regenerateCertificateForActor,
  updateCertificateAssetsForActor,
} from "./repository";

import type { Certificate, CertificateAssetUpdates } from "./types";

/**
 * Public preflight authorization check. Lets Server Actions deny access to
 * another tenant's event *before* performing side effects (such as uploading
 * character art to Blob storage) that a mutation's own ownership-scoped write
 * cannot undo. This is a preflight only — `updateCertificateAssets` still
 * re-verifies ownership at its own write, so a denial never rests solely on
 * this earlier check.
 */
export async function assertActorCanManageCertificateEvent(actor: ActorContext | null, eventId: string): Promise<void> {
  return assertActorCanManageCertificateEventInRepository(actor, eventId);
}

export async function updateCertificateAssets(
  actor: ActorContext | null,
  eventId: string,
  updates: CertificateAssetUpdates,
): Promise<void> {
  return updateCertificateAssetsForActor(actor, eventId, updates);
}

export async function regenerateCertificate(actor: ActorContext | null, eventId: string): Promise<string> {
  return regenerateCertificateForActor(actor, eventId);
}

/**
 * Internal/system generation path — not actor-gated. Only ever called from
 * already-authorized match-result Server Actions in `@/lib/actions`, after
 * their own event-ownership check has passed for the match write itself.
 * Never wire this to a manager-facing Server Action directly; doing so would
 * bypass certificate authorization entirely. This is the one actor-less
 * export intentionally kept on the primary barrel — see
 * `@/modules/certificates/compatibility` for the other actor-less
 * primitives, which are deliberately kept off this barrel.
 */
export async function generateCertificateIfFinal(matchId: string, eventId: string): Promise<void> {
  return generateCertificateIfFinalInRepository(matchId, eventId);
}

export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {
  return getCertificateByEventInRepository(eventId);
}

export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {
  return getCertificatesForEventsInRepository(eventIds);
}

export async function countCertificatesForGame(gameId: string): Promise<number> {
  return countCertificatesForGameInRepository(gameId);
}

