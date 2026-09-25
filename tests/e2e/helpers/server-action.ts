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

/** Extracts the action return value from a completed React Flight response. */
export function parseServerActionResult<T>(body: string): T {
  const candidates = [body.trim(), ...body.split("\n").map((line) => {
    const separator = line.indexOf(":");
    return separator >= 0 ? line.slice(separator + 1).trim() : line.trim();
  })];
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed && typeof parsed === "object" && "status" in parsed) return parsed as T;
    if (typeof parsed === "string") {
      const nested = parseJsonCandidate(parsed);
      if (nested && typeof nested === "object" && "status" in nested) return nested as T;
    }
  }
  throw new Error("Server Action response did not contain a settled result.");
}

export async function waitForServerActionResult<T>(
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
