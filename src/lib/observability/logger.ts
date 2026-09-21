import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { toPublicError } from "@/lib/security/public-error";

export type ServerLogPhase = "start" | "done" | "failed";

export type ServerLogEvent = Readonly<{
  phase: ServerLogPhase;
  operation: string;
  route: string;
  requestId: string;
  durationMs: number;
  status: number;
  errorCode?: string;
  actorId?: string;
  resourceId?: string;
}>;

function safeText(value: string, maxLength = 160): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function safeCode(value: string): string {
  return safeText(value).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
}

const STATIC_ROUTE_SEGMENTS = new Set([
  "api", "admin", "captain", "captain-credentials", "competition", "debug-locale", "en", "events",
  "health", "id", "login", "me", "ongoing", "organizer", "overview", "registration", "settings",
]);

function redactRoute(value: string): string {
  const route = safeText(value);
  if (/^\/api\/events\/[^/]+\/ongoing\/?$/.test(route)) return "/api/events/:slug/ongoing";
  if (/^\/api\/organizer\/events\/[^/]+\/competition\/?$/.test(route)) return "/api/organizer/events/:eventId/competition";
  return route.split("/").map((segment) => {
    if (!segment || STATIC_ROUTE_SEGMENTS.has(segment)) return segment;
    return `:${redactIdentifier(segment)}`;
  }).join("/");
}

/** Keeps identifiers useful for correlation without putting PII into logs. */
export function redactIdentifier(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function safeEvent(event: ServerLogEvent): ServerLogEvent {
  const result: ServerLogEvent = {
    phase: event.phase,
    operation: safeCode(event.operation),
    route: redactRoute(event.route),
    requestId: safeText(event.requestId),
    durationMs: Number.isFinite(event.durationMs) ? Math.max(0, Math.round(event.durationMs)) : 0,
    status: Number.isInteger(event.status) ? event.status : 500,
    ...(event.errorCode ? { errorCode: safeCode(event.errorCode) } : {}),
    ...(event.actorId ? { actorId: redactIdentifier(event.actorId) } : {}),
    ...(event.resourceId ? { resourceId: redactIdentifier(event.resourceId) } : {}),
  };
  return result;
}

/** Emits only the allowlisted structured event fields to the platform logger. */
export function writeServerLog(event: ServerLogEvent): void {
  console.info(JSON.stringify(safeEvent(event)));
}

export function getRequestId(request: Request): string {
  return request.headers.get("x-vercel-id") ?? globalThis.crypto.randomUUID();
}

export async function withServerLog<T>(
  request: Request,
  operation: string,
  work: () => Promise<{ status: number; value: T }>,
): Promise<T> {
  const requestId = getRequestId(request);
  const route = (() => {
    try { return new URL(request.url).pathname; } catch { return "unknown"; }
  })();
  const startedAt = Date.now();
  writeServerLog({ phase: "start", operation, route, requestId, durationMs: 0, status: 0 });

  try {
    const result = await work();
    writeServerLog({
      phase: "done",
      operation,
      route,
      requestId,
      durationMs: Date.now() - startedAt,
      status: result.status,
    });
    return result.value;
  } catch (error) {
    const publicError = toPublicError(error, requestId);
    writeServerLog({
      phase: "failed",
      operation,
      route,
      requestId,
      durationMs: Date.now() - startedAt,
      status: publicError.status,
      errorCode: publicError.body.code,
    });
    throw error;
  }
}

/** Wraps a route that returns a Response while preserving the exact logger contract. */
export async function withRouteLog(
  request: Request,
  operation: string,
  work: () => Promise<Response>,
): Promise<Response> {
  return withServerLog(request, operation, async () => {
    const value = await work();
    return { status: value.status, value };
  });
}

/** Wraps a server action or reader that does not receive a Request object. */
export async function withServerActionLog<T>(
  operation: string,
  route: string,
  work: () => Promise<T>,
): Promise<T> {
  let vercelId: string | null = null;
  try {
    vercelId = (await headers()).get("x-vercel-id");
  } catch {
    // Unit tests and non-request jobs have no Next request context; correlation
    // falls back to the generated request ID required by withServerLog.
  }
  const request = new Request(`https://internal.invalid${route}`, vercelId === null ? undefined : {
    headers: { "x-vercel-id": vercelId },
  });
  return withServerLog(request, operation, async () => ({ status: 200, value: await work() }));
}
