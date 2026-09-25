import type { Page, Request, Response } from "@playwright/test";

export type ServerActionRequestMatcher = (request: Request, requestUrl: URL) => boolean | Promise<boolean>;
export type ServerActionDestination = (url: URL) => boolean;

async function waitForServerActionResponseHeaders(
  page: Page,
  matcher: ServerActionRequestMatcher,
): Promise<Response> {
  return page.waitForResponse(async (response) => {
    const request = response.request();
    if (request.method() !== "POST") return false;
    return matcher(request, new URL(request.url()));
  });
}

export async function waitForServerActionResponse(
  page: Page,
  matcher: ServerActionRequestMatcher,
): Promise<Response> {
  const response = await waitForServerActionResponseHeaders(page, matcher);
  if (!(response.status() < 400)) throw new Error(`Server Action failed with HTTP ${response.status()}.`);
  if (await response.finished() !== null) throw new Error("Server Action response body did not finish cleanly.");
  return response;
}

function parseJsonCandidate(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isServerActionResult(value: unknown): value is { status: string } {
  if (value === null || typeof value !== "object" || !("status" in value)) return false;
  return typeof (value as { status?: unknown }).status === "string";
}

/** Extracts the action return value from a completed React Flight response. */
export function parseServerActionResult<T extends { status: string }>(body: string): T {
  const direct = parseJsonCandidate(body.trim());
  if (isServerActionResult(direct)) return direct as T;
  if (typeof direct === "string") {
    const nested = parseJsonCandidate(direct);
    if (isServerActionResult(nested)) return nested as T;
  }

  const framedResults: Array<{ status: string }> = [];
  for (const line of body.split(/\r?\n/)) {
    const frame = line.match(/^\d+:(.*)$/);
    if (!frame) continue;
    const payload = frame[1].trim();
    const parsed = parseJsonCandidate(payload);
    if (parsed === undefined) {
      if (/^[\[{]/.test(payload)) throw new Error("Malformed Server Action response frame.");
      continue;
    }
    const candidate = typeof parsed === "string" ? parseJsonCandidate(parsed) : parsed;
    if (isServerActionResult(candidate)) framedResults.push(candidate);
  }

  if (framedResults.length > 1) throw new Error("Server Action response contained ambiguous settled results.");
  if (framedResults.length === 1) return framedResults[0] as T;
  throw new Error("Server Action response did not contain a settled result.");
}

export async function waitForServerActionResult<T extends { status: string }>(
  page: Page,
  matcher: ServerActionRequestMatcher,
): Promise<{ response: Response; result: T }> {
  const response = await waitForServerActionResponse(page, matcher);
  return { response, result: parseServerActionResult<T>(await response.text()) };
}

export type ServerActionRedirectOptions = {
  request: ServerActionRequestMatcher;
  expectedActionRedirect: string;
  destination: ServerActionDestination;
  trigger: () => Promise<unknown> | unknown;
};

export async function runAndSettleServerActionRedirect(
  page: Page,
  options: ServerActionRedirectOptions,
): Promise<Response> {
  const responsePromise = waitForServerActionResponseHeaders(page, options.request);
  const destinationPromise = page.waitForURL(options.destination, { waitUntil: "domcontentloaded" });
  void destinationPromise.catch(() => undefined);
  const triggerPromise = Promise.resolve().then(() => options.trigger());
  const [response] = await Promise.all([responsePromise, triggerPromise]);
  if (!(response.status() < 400)) throw new Error(`Server Action failed with HTTP ${response.status()}.`);
  const actionRedirect = response.headers()["x-action-redirect"];
  if (actionRedirect !== options.expectedActionRedirect) {
    throw new Error(`Unexpected Server Action redirect: ${actionRedirect ?? "<missing>"}`);
  }
  await destinationPromise;
  return response;
}
