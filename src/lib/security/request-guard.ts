import { z } from "zod";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const safeEntityIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

function newRequestId(request: Request): string {
  return request.headers.get("x-vercel-id")?.trim()
    || globalThis.crypto?.randomUUID?.()
    || "request-unknown";
}

/**
 * Rejects cross-origin state-changing requests before a route or server action
 * can read request-controlled data or perform a mutation. Safe methods are
 * deliberately not origin-gated because public GETs may be embedded or
 * prefetched by browsers.
 */
export function requireSameOrigin(request: Request): Response | null {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return null;

  const origin = request.headers.get("origin");
  if (!origin) {
    return Response.json(
      { code: "forbidden", requestId: newRequestId(request) },
      { status: 403, headers: { "Cache-Control": "no-store", "Vary": "Origin" } },
    );
  }

  let requestOrigin: string;
  let originValue: string;
  try {
    requestOrigin = new URL(request.url).origin;
    originValue = new URL(origin).origin;
  } catch {
    return Response.json(
      { code: "forbidden", requestId: newRequestId(request) },
      { status: 403, headers: { "Cache-Control": "no-store", "Vary": "Origin" } },
    );
  }

  if (originValue === requestOrigin) return null;

  return Response.json(
    { code: "forbidden", requestId: newRequestId(request) },
    { status: 403, headers: { "Cache-Control": "no-store", "Vary": "Origin" } },
  );
}

/** IDs used in route paths must not contain delimiters, traversal, or SQL syntax. */
export function isSafeEntityId(value: string): boolean {
  return safeEntityIdSchema.safeParse(value).success;
}

/** Public URL fields accept only absolute HTTP(S) URLs, never scriptable schemes. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

/** Upload names are metadata only; path separators and traversal are rejected. */
export function isSafeFilename(value: string): boolean {
  const name = value.trim();
  return name.length > 0
    && name.length <= 255
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\")
    && !name.includes("..")
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** Prefixes spreadsheet formula-leading values so exports remain inert text. */
export function neutralizeSpreadsheetFormula(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}
