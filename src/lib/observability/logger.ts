import { createHash } from "node:crypto";

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

type ServerLogResult<T> = Readonly<{
  status: number;
  value: T;
  errorCode?: string;
}>;

function safeText(value: string, maxLength = 160): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function safeCode(value: string): string {
  return safeText(value).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
}

const STATIC_ROUTE_SEGMENTS = new Set([
  "api", "admin", "captain", "captain-credentials", "competition", "debug-locale", "en", "events",
  "health", "id", "login", "me", "ongoing", "organizer", "overview", "registration", "server", "settings",
  "authorization",
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

function statusErrorCode(status: number): string | undefined {
  if (status >= 500) return "internal_error";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  return undefined;
}

function redirectStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return undefined;
  const parts = digest.split(";");
  if (parts[0] !== "NEXT_REDIRECT") return undefined;
  const status = Number(parts.at(-2));
  return Number.isInteger(status) && status >= 300 && status < 400 ? status : undefined;
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
  work: () => Promise<ServerLogResult<T>>,
): Promise<T> {
  const requestId = getRequestId(request);
  const route = (() => {
    try { return new URL(request.url).pathname; } catch { return "unknown"; }
  })();
  const startedAt = Date.now();
  writeServerLog({ phase: "start", operation, route, requestId, durationMs: 0, status: 0 });

  try {
    const result = await work();
    const errorCode = result.errorCode ?? statusErrorCode(result.status);
    writeServerLog(errorCode
      ? {
        phase: "failed",
        operation,
        route,
        requestId,
        durationMs: Date.now() - startedAt,
        status: result.status,
        errorCode,
      }
      : {
        phase: "done",
        operation,
        route,
        requestId,
        durationMs: Date.now() - startedAt,
        status: result.status,
      });
    return result.value;
  } catch (error) {
    const redirect = redirectStatus(error);
    if (redirect !== undefined) {
      writeServerLog({
        phase: "done",
        operation,
        route,
        requestId,
        durationMs: Date.now() - startedAt,
        status: redirect,
      });
      throw error;
    }
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
  work: (request: Request) => Promise<Response>,
): Promise<Response> {
  const requestId = getRequestId(request);
  const tracedRequest = request.headers.has("x-vercel-id")
    ? request
    : new Request(request, { headers: new Headers({ ...Object.fromEntries(request.headers), "x-vercel-id": requestId }) });
  return withServerLog(tracedRequest, operation, async () => {
    const value = await work(tracedRequest);
    return { status: value.status, value };
  });
}

function actionResultStatus(value: unknown): Pick<ServerLogResult<unknown>, "status" | "errorCode"> {
  if (!value || typeof value !== "object") return { status: 200 };
  const result = value as { status?: unknown; code?: unknown; statusCode?: unknown };
  const status = result.status;
  const code = result.code;
  const safeActionCodes = new Set([
    "failed", "forbidden", "unauthorized", "rate_limited", "delivery_failed", "token_invalid", "upload_failed",
  ]);
  const safeCodeValue = typeof code === "string" && safeActionCodes.has(code) ? code : undefined;
  const explicitStatus = typeof result.statusCode === "number"
    && Number.isInteger(result.statusCode)
    && result.statusCode >= 400
    && result.statusCode <= 599
    ? result.statusCode
    : undefined;
  if (status === "failed") return { status: explicitStatus ?? 500, errorCode: safeCodeValue ?? "failed" };
  if (status === "unauthorized" || (status === "blocked" && code === "unauthorized")) {
    return { status: 401, errorCode: "unauthorized" };
  }
  if (status === "blocked" && code === "forbidden") return { status: 403, errorCode: "forbidden" };
  if (status === "blocked" && code === "upload_failed") return { status: 500, errorCode: "upload_failed" };
  if (status === "rate_limited" || ((status === "blocked" || status === "error") && code === "rate_limited")) {
    return { status: 429, errorCode: "rate_limited" };
  }
  return { status: 200 };
}

function logServerActionFailure(
  operation: string,
  route: string,
  requestId: string,
  startedAt: number,
  error: unknown,
): void {
  const redirect = redirectStatus(error);
  if (redirect !== undefined) {
    writeServerLog({
      phase: "done",
      operation,
      route,
      requestId,
      durationMs: Date.now() - startedAt,
      status: redirect,
    });
    return;
  }
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
}

/** Wraps a server action or reader without adding an extra foreground await. */
export function withServerActionLog<T>(
  operation: string,
  route: string,
  work: () => Promise<T>,
): Promise<T> {
  const request = new Request(`https://internal.invalid${route}`);
  const requestId = getRequestId(request);
  const startedAt = Date.now();
  writeServerLog({ phase: "start", operation, route, requestId, durationMs: 0, status: 0 });

  let result: Promise<T>;
  try {
    result = work();
  } catch (error) {
    logServerActionFailure(operation, route, requestId, startedAt, error);
    return Promise.reject(error);
  }

  void result.then(
    (value) => {
      const outcome = actionResultStatus(value);
      const errorCode = outcome.errorCode ?? statusErrorCode(outcome.status);
      writeServerLog(errorCode
        ? {
          phase: "failed",
          operation,
          route,
          requestId,
          durationMs: Date.now() - startedAt,
          status: outcome.status,
          errorCode,
        }
        : {
          phase: "done",
          operation,
          route,
          requestId,
          durationMs: Date.now() - startedAt,
          status: outcome.status,
        });
    },
    (error: unknown) => logServerActionFailure(operation, route, requestId, startedAt, error),
  );
  return result;
}
