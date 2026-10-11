export type PublicErrorCode = "forbidden" | "invalid_input" | "internal_error";

export type PublicErrorBody = Readonly<{
  code: PublicErrorCode;
  requestId: string;
}>;

const SAFE_ACTION_MESSAGES = new Set([
  "Not authorized",
  "Not authorized for event",
  "Not authorized to update this team.",
  "Not your player",
  "Forbidden",
  "Forbidden event",
  "Score rejected",
  "Configuration locked",
  "Match not found.",
  "Organizer not found.",
  "Tim tidak ditemukan.",
  "Team is not part of this match",
  "Match does not belong to this event",
  "Cannot reject the active visual revision",
  "Series winner not yet determined",
  "Event ini membutuhkan verifikasi pembayaran sebelum tim aktif.",
  "Konfirmasi hak publikasi artwork terlebih dahulu.",
]);

/**
 * A business-rule rejection whose message is written for the end user and is safe to show as-is
 * (for example "Slot pendaftaran event ini sudah penuh."). Never put internal details in one.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export type ActionErrorDescription = Readonly<{ name: string; code: string | undefined }>;

/**
 * Loggable identity of an unexpected action failure: error class and Prisma code only.
 * The message is left out on purpose; Prisma messages embed the failing query arguments (team names, contacts).
 */
export function describeActionError(error: unknown): ActionErrorDescription {
  if (!(error instanceof Error)) return { name: "NonError", code: undefined };
  const code = (error as { code?: unknown }).code;
  return { name: error.name, code: typeof code === "string" ? code : undefined };
}

/** True when the error is an expected rejection whose message may reach the user (as opposed to an unexpected failure). */
export function isUserSafeActionError(error: unknown): boolean {
  if (error instanceof UserFacingError) return true;
  return error instanceof Error && SAFE_ACTION_MESSAGES.has(error.message);
}

/** Preserves user-facing errors and deliberately allowlisted action messages; everything else becomes the fallback. */
export function toSafeActionMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (error instanceof Error && error.name === "ImageUploadValidationError" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string"
      && ["invalid_entity_id", "missing_file", "file_too_large", "unsupported_type", "signature_mismatch", "decode_failed", "invalid_dimensions"].includes(code)
      && message.length <= 160
      && !/[<>\u0000-\u001f]/.test(message)) {
      return message;
    }
  }
  return SAFE_ACTION_MESSAGES.has(message) ? message : fallback;
}

function isValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; issues?: unknown; code?: unknown; status?: unknown };
  return candidate.name === "ZodError"
    || Array.isArray(candidate.issues)
    || candidate.code === "invalid_input"
    || candidate.status === 400;
}

function isForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  if (candidate.code === "forbidden" || candidate.code === "unauthorized") return true;
  if (candidate.status === 401 || candidate.status === 403) return true;
  if (typeof candidate.message !== "string") return false;
  return /^(?:unauthorized|forbidden|not authorized|password change required)(?:\b|$)/i.test(candidate.message.trim());
}

/** Converts server failures into a deliberately tiny, stable client contract. */
export function toPublicError(error: unknown, requestId: string): { status: 400 | 403 | 500; body: PublicErrorBody } {
  if (isValidationError(error)) {
    return { status: 400, body: { code: "invalid_input", requestId } };
  }
  if (isForbiddenError(error)) {
    return { status: 403, body: { code: "forbidden", requestId } };
  }
  return { status: 500, body: { code: "internal_error", requestId } };
}
