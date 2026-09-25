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
  void triggerPromise.catch(() => undefined);
  const response = await responsePromise;
  if (!(response.status() < 400)) throw new Error(`Server Action failed with HTTP ${response.status()}.`);
  const actionRedirect = response.headers()["x-action-redirect"];
  if (actionRedirect !== options.expectedActionRedirect) {
    throw new Error(`Unexpected Server Action redirect: ${actionRedirect ?? "<missing>"}`);
  }
  await Promise.all([destinationPromise, triggerPromise]);
  return response;
}
