// Upload size limits shared by the server actions. Plain module on purpose: not a server action file.
// Moved out of actions.ts without changes (refactor PR 1.5).



export const MAX_LOGO_IMAGE_BYTES = 2 * 1024 * 1024;
/** Same ceiling as CERTIFICATE_ASSET_LIMITS.maxDimension, so a stored logo can always become a certificate asset. */
export const MAX_LOGO_IMAGE_DIMENSION = 4096;

export const MAX_BACKGROUND_IMAGE_BYTES = 5 * 1024 * 1024;

export const MAX_PAYMENT_PROOF_BYTES = 2 * 1024 * 1024;

export const MAX_QRIS_IMAGE_BYTES = 2 * 1024 * 1024;
