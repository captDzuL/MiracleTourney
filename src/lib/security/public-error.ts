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

/** Preserves only deliberately allowlisted user-facing action messages. */
export function toSafeActionMessage(error: unknown, fallback: string): string {
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
