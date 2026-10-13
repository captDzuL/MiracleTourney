import { createHash } from "node:crypto";

import { normalizeKey } from "./normalize";
import type { SoloCandidate } from "./types";

/**
 * Fingerprint of everything that can change a draw. Stored with the draw and compared
 * again when teams are locked, so a changed player list cannot be locked by accident.
 * The input order does not matter.
 */
export function hashDrawInput(candidates: readonly SoloCandidate[]): string {
  const rows = [...candidates]
    .sort((left, right) => (left.registrationId < right.registrationId ? -1 : left.registrationId > right.registrationId ? 1 : 0))
    .map((candidate) => [
      candidate.registrationId,
      candidate.ign.trim(),
      candidate.uid.trim(),
      normalizeKey(candidate.primaryPosition),
      candidate.secondaryPosition === null ? "" : normalizeKey(candidate.secondaryPosition),
      candidate.willingCaptain,
      candidate.registeredAt,
    ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
