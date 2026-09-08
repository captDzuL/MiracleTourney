/**
 * Compatibility-only entrypoint for legacy `src/lib` facades.
 *
 * Hosts the actor-less low-level certificate mutation/generation primitives that must never be
 * reachable from the primary `@/modules/certificates` barrel: exposing them there would make it
 * easy for future manager-facing code to bypass `ActorContext` ownership checks entirely.
 *
 * Only legacy `src/lib` facades (`src/lib/certificate/generate.ts`,
 * `src/lib/platform/repository.ts`) may import from this file. Active app/module callers must use
 * the actor-scoped service API exported from `@/modules/certificates` instead. This file itself is
 * the one place inside the module allowed to deep-import the private `./repository` on their
 * behalf.
 */
import {
  generateCertificate as generateCertificateInRepository,
  recordCertificateFailure as recordCertificateFailureInRepository,
  recordCertificateSuccess as recordCertificateSuccessInRepository,
  updateEventCertificateAssets as updateEventCertificateAssetsInRepository,
} from "./repository";

import type { Certificate, CertificateAssetUpdates } from "./types";

/**
 * Actor-less compatibility surface matching the original legacy contract: the caller is expected
 * to have already checked ownership itself (e.g. an operator-run script). Never call this from a
 * manager-facing Server Action — use the actor-scoped `updateCertificateAssets` from
 * `@/modules/certificates` instead.
 */
export async function updateEventCertificateAssets(eventId: string, updates: CertificateAssetUpdates): Promise<void> {
  return updateEventCertificateAssetsInRepository(eventId, updates);
}

/**
 * Actor-less compatibility surfaces for the low-level persistence primitives. `generateCertificate`
 * already calls these internally; exported here only so legacy scripts/facades importing them by
 * name keep working.
 */
export async function recordCertificateSuccess(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {
  return recordCertificateSuccessInRepository(eventId, teamId, imageUrl);
}

export async function recordCertificateFailure(eventId: string, teamId: string, message: string): Promise<Certificate> {
  return recordCertificateFailureInRepository(eventId, teamId, message);
}

/**
 * Actor-less low-level certificate generator/renderer. `generateCertificateIfFinal` (public, on
 * the primary barrel) is the sanctioned system trigger for the automatic post-match path; this
 * export exists only for the legacy manual-regeneration compatibility path and standalone scripts
 * that already gate ownership themselves before calling it.
 */
export async function generateCertificate(eventId: string, winnerTeamId: string): Promise<string> {
  return generateCertificateInRepository(eventId, winnerTeamId);
}
