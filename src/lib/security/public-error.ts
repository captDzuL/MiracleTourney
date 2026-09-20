export type PublicErrorCode = "forbidden" | "invalid_input" | "internal_error";

export type PublicErrorBody = Readonly<{
  code: PublicErrorCode;
  requestId: string;
}>;

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
