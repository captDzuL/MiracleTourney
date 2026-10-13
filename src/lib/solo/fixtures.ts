import type { SoloCandidate, SoloRules } from "./types";

/** Flashpeak 5v5: one goalkeeper per team of five. */
export const FLASHPEAK_RULES: SoloRules = { teamSize: 5, requiredPositions: { Goalkeeper: 1 } };

/** Kuroko 3v3 as planned: one Center per team of three. */
export const KUROKO_RULES: SoloRules = { teamSize: 3, requiredPositions: { Center: 1 } };

const BASE_TIME = 1_700_000_000_000;
const FIELD_POSITIONS = ["Forward", "Midfielder", "Defender"] as const;

export function makeCandidate(number: number, overrides: Partial<SoloCandidate> = {}): SoloCandidate {
  const id = String(number).padStart(3, "0");
  return {
    registrationId: `r-${id}`,
    ign: `ign-${id}`,
    uid: `uid-${id}`,
    primaryPosition: FIELD_POSITIONS[number % FIELD_POSITIONS.length],
    secondaryPosition: null,
    willingCaptain: false,
    registeredAt: BASE_TIME + number * 60_000,
    ...overrides,
  };
}

/**
 * A pool in registration order: keepers first, then emergency keepers (field players who
 * also list the required position), then plain field players.
 */
export function buildPool(
  counts: { keepers: number; emergency: number; field: number },
  options: { requiredPosition?: string; fieldPositions?: readonly string[] } = {},
): SoloCandidate[] {
  const requiredPosition = options.requiredPosition ?? "Goalkeeper";
  const fieldPositions = options.fieldPositions ?? FIELD_POSITIONS;
  const pool: SoloCandidate[] = [];
  let number = 1;
  for (let index = 0; index < counts.keepers; index += 1, number += 1) {
    pool.push(makeCandidate(number, { primaryPosition: requiredPosition }));
  }
  for (let index = 0; index < counts.emergency; index += 1, number += 1) {
    pool.push(makeCandidate(number, {
      primaryPosition: fieldPositions[number % fieldPositions.length],
      secondaryPosition: requiredPosition,
    }));
  }
  for (let index = 0; index < counts.field; index += 1, number += 1) {
    pool.push(makeCandidate(number, { primaryPosition: fieldPositions[number % fieldPositions.length] }));
  }
  return pool;
}
