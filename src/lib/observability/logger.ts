import { createHash } from "node:crypto";

import { toPublicError } from "@/lib/security/public-error";

export type ServerLogPhase = "start" | "done" | "failed";
export type ServerLogLocale = "id" | "en";

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
  locale?: ServerLogLocale;
  stage?: string;
  counts?: Readonly<Record<string, number>>;
  terminal?: "retry" | "failed";
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

function safeCounts(value: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value)
    .filter(([key, count]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && Number.isFinite(count))
    .slice(0, 16)
    .map(([key, count]) => [key, Math.max(0, Math.min(Math.round(count), 1_000_000_000))] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
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
  const counts = safeCounts(event.counts);
  const locale = event.locale === "id" || event.locale === "en" ? event.locale : undefined;
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
    ...(locale ? { locale } : {}),
    ...(event.stage ? { stage: safeCode(event.stage) } : {}),
    ...(counts ? { counts } : {}),
    ...(event.terminal ? { terminal: event.terminal } : {}),
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

export type ServerMilestoneContext = Readonly<{
  operation: string;
  route: string;
  requestId: string;
}>;

export type ServerMilestoneEvent = Readonly<{
  locale?: ServerLogLocale;
  resourceId?: string;
  status?: number;
  terminal?: "failed";
  counts?: Readonly<Record<string, number>>;
  errorCode?: string;
}>;

const SAFE_MILESTONE_ERROR_CODES = new Set([
  "forbidden", "internal_error", "invalid_input", "not_found", "operation_failed", "rate_limited", "unauthorized",
]);

/** Emits a redacted, correlated stage record without observing or changing the awaited work. */
export function createServerMilestoneLogger(context: ServerMilestoneContext) {
  const startedAt = Date.now();
  return (stage: string, event: ServerMilestoneEvent = {}): void => {
    const failed = event.terminal === "failed";
    const errorCode = event.errorCode && SAFE_MILESTONE_ERROR_CODES.has(event.errorCode)
      ? event.errorCode
      : undefined;
    writeServerLog({
      phase: failed ? "failed" : "done",
      operation: context.operation,
      route: context.route,
      requestId: context.requestId,
      durationMs: Date.now() - startedAt,
      status: event.status ?? (failed ? 500 : 200),
      stage,
      ...(event.locale ? { locale: event.locale } : {}),
      ...(event.resourceId ? { resourceId: event.resourceId } : {}),
      ...(event.counts ? { counts: event.counts } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(event.terminal ? { terminal: event.terminal } : {}),
    });
  };
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
  if (!request.headers.has("x-vercel-id")) request.headers.set("x-vercel-id", requestId);
  return withServerLog(request, operation, async () => {
    const value = await work(request);
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
    "transaction_timeout", "internal_error", "serialization_conflict", "operation_failed",
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
  if (status === "blocked" && code === "operation_failed") return { status: 500, errorCode: "operation_failed" };
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
export type ServerActionLogContext = Readonly<{ requestId: string }>;

export function withServerActionLog<T>(
  operation: string,
  route: string,
  work: (context: ServerActionLogContext) => Promise<T>,
): Promise<T> {
  const request = new Request(`https://internal.invalid${route}`);
  const requestId = getRequestId(request);
  const startedAt = Date.now();
  writeServerLog({ phase: "start", operation, route, requestId, durationMs: 0, status: 0 });

  let result: Promise<T>;
  try {
    result = work({ requestId });
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
