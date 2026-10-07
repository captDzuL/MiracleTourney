/**
 * Certificate regeneration abuse-guard policy shared by the server action
 * and its externally testable rate-limit contract.
 */
export const CERTIFICATE_REGENERATION_RATE_LIMIT = 20;
export const CERTIFICATE_REGENERATION_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
