import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const helper = read(resolve(root, "tests/e2e/helpers/server-action.ts"));
const overnightSpec = read(resolve(root, "tests/e2e/overnight-smoke.spec.ts"));
const organizerSpec = read(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"));
const publicLifecycleSpec = read(resolve(root, "tests/e2e/v3-public-event-lifecycle.spec.ts"));

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("server action settlement contract", () => {
  it("selects exact POST response headers through the timeout-aware waiter", () => {
    const headerWaiter = sliceBetween(
      helper,
      "async function waitForServerActionResponseHeaders(",
      "export async function waitForServerActionResponse(",
    );

    expect(headerWaiter).toContain("return page.waitForResponse(async (response) => {");
    expect(headerWaiter).toContain("const request = response.request();");
    expect(headerWaiter).toContain('if (request.method() !== "POST") return false;');
    expect(headerWaiter).toContain("return matcher(request, new URL(request.url()));");
    expect(headerWaiter).not.toContain('page.waitForEvent("requestfinished"');
    expect(headerWaiter).not.toContain('page.on("requestfinished"');
    expect(headerWaiter).not.toContain('page.on("requestfailed"');
    expect(headerWaiter).not.toContain("new Promise<Response>");
  });

  it("keeps non-redirect body completion after exact response selection", () => {
    const responseHelper = sliceBetween(
      helper,
      "export async function waitForServerActionResponse(",
      "export type ServerActionRedirectOptions =",
    );

    expect(responseHelper).toContain("const response = await waitForServerActionResponseHeaders(page, matcher);");
    expect(responseHelper).toContain("response.status() < 400");
    expect(responseHelper).toContain("await response.finished()");
    expect(responseHelper).toContain("response.finished() !== null");
    expect(responseHelper.indexOf("const response = await waitForServerActionResponseHeaders")).toBeLessThan(
      responseHelper.indexOf("response.status() < 400"),
    );
    expect(responseHelper.indexOf("response.status() < 400")).toBeLessThan(
      responseHelper.indexOf("await response.finished()"),
    );
    expect(responseHelper).not.toContain("requestfinished");
    expect(responseHelper).not.toContain("requestfailed");
  });

  it("pre-arms redirect headers and destination, then validates status and action redirect", () => {
    const redirectHelper = helper.slice(helper.indexOf("export async function runAndSettleServerActionRedirect("));

    expect(helper).toContain("export async function runAndSettleServerActionRedirect");
    expect(redirectHelper).toContain("const responsePromise = waitForServerActionResponseHeaders(page, options.request);");
    expect(helper).toContain('page.waitForURL(options.destination, { waitUntil: "domcontentloaded" })');
    expect(redirectHelper).toContain("const destinationPromise = page.waitForURL(options.destination, { waitUntil: \"domcontentloaded\" });");
    expect(redirectHelper).toContain("void destinationPromise.catch(() => undefined);");
    expect(redirectHelper).toContain("const actionRedirect = response.headers()[\"x-action-redirect\"];");
    expect(redirectHelper).toContain("options.expectedActionRedirect");
    expect(redirectHelper).toContain("const triggerPromise = options.trigger();");
    expect(redirectHelper).toContain("await Promise.all([destinationPromise, triggerPromise]);");
    expect(redirectHelper).toContain("response.status() < 400");
    expect(redirectHelper).not.toContain("response.finished()");
    expect(redirectHelper).not.toContain("requestfinished");
    expect(redirectHelper).not.toContain("requestfailed");
    expect(redirectHelper).not.toMatch(/\btimeout\s*:/);

    const responseArmIndex = redirectHelper.indexOf("const responsePromise = waitForServerActionResponseHeaders");
    const destinationArmIndex = redirectHelper.indexOf("const destinationPromise = page.waitForURL");
    const triggerIndex = redirectHelper.indexOf("const triggerPromise = options.trigger();");
    expect(responseArmIndex).toBeGreaterThan(-1);
    expect(destinationArmIndex).toBeGreaterThan(responseArmIndex);
    expect(triggerIndex).toBeGreaterThan(destinationArmIndex);

    const responseIndex = redirectHelper.indexOf("const response = await responsePromise;");
    const statusIndex = redirectHelper.indexOf("response.status() < 400");
    const redirectHeaderIndex = redirectHelper.indexOf("response.headers()[\"x-action-redirect\"]");
    expect(responseIndex).toBeGreaterThan(triggerIndex);
    expect(statusIndex).toBeGreaterThan(responseIndex);
    expect(redirectHeaderIndex).toBeGreaterThan(statusIndex);
  });

  it("settles both legacy admin actions before retaining their URL assertions", () => {
    const publishCase = sliceBetween(
      overnightSpec,
      'test("admin can publish, import, enter a result, and see bracket advancement publicly"',
      '\novernightTest("registration order stays private',
    );
    const createCase = sliceBetween(
      overnightSpec,
      'overnightTest("registration order stays private and imports stop after drawing publication"',
      "\n});",
    );

    expect(overnightSpec).toContain('import { runAndSettleServerActionRedirect } from "./helpers/server-action";');
    expect(publishCase).toContain("runAndSettleServerActionRedirect(page, {");
    expect(publishCase).toContain('requestUrl.pathname === "/en/admin"');
    expect(publishCase).toContain('requestUrl.searchParams.get("phase") === "prepare"');
    expect(publishCase).toContain('expectedActionRedirect: "/en/admin?success=event-status-updated&event=kuroko-summer-cup;push"');
    expect(publishCase).toContain('await expect(page).toHaveURL(/\\/admin\\?success=event-status-updated/);');
    expect(publishCase.indexOf("runAndSettleServerActionRedirect")).toBeLessThan(publishCase.indexOf('await expect(page).toHaveURL(/\\/admin\\?success=event-status-updated/);'));

    expect(createCase).toContain("runAndSettleServerActionRedirect(page, {");
    expect(createCase).toContain('requestUrl.pathname === "/en/admin"');
    expect(createCase).toContain('requestUrl.searchParams.get("phase") === "prepare"');
    expect(createCase).toContain('expectedActionRedirect: "/en/admin?success=event-created;push"');
    expect(createCase).toContain('await expect(page).toHaveURL(/\\/admin\\?success=event-created/);');
    expect(createCase.indexOf("runAndSettleServerActionRedirect")).toBeLessThan(createCase.indexOf('await expect(page).toHaveURL(/\\/admin\\?success=event-created/);'));
    expect(overnightSpec.match(/runAndSettleServerActionRedirect\(page, \{/g)).toHaveLength(2);
  });

  it("settles every lifecycle status transition through the shared redirect helper", () => {
    const updateStatus = sliceBetween(
      publicLifecycleSpec,
      "const updateStatus = async",
      "    };\n\n    await page.goto(url);",
    );

    expect(publicLifecycleSpec).toContain('import { runAndSettleServerActionRedirect } from "./helpers/server-action";');
    expect(updateStatus).toContain("runAndSettleServerActionRedirect(page, {");
    expect(updateStatus).toContain('requestUrl.pathname === "/en/admin"');
    expect(updateStatus).toContain('requestUrl.searchParams.get("phase") === "prepare"');
    expect(updateStatus).toContain('requestUrl.searchParams.get("activeEventId") === eventId');
    expect(updateStatus).toContain('url.searchParams.get("success") === "event-status-updated"');
    expect(updateStatus).toContain('await expect(page).toHaveURL(/success=event-status-updated/);');
    expect(updateStatus.indexOf("runAndSettleServerActionRedirect")).toBeLessThan(updateStatus.indexOf('await expect(page).toHaveURL(/success=event-status-updated/);'));
    expect(updateStatus.match(/runAndSettleServerActionRedirect\(page, \{/g)).toHaveLength(1);
  });

  it("settles the exact localized organizer preview response before commit readiness", () => {
    const previewBlock = sliceBetween(
      organizerSpec,
      "  await expectLocalizedRegistrationSurface(page, registrationFixture, locale, \"import\");",
      "  await page.locator(\"[data-commit]\").click();",
    );

    expect(organizerSpec).toContain('import { waitForServerActionResponse } from "./helpers/server-action";');
    expect(previewBlock).toContain("waitForServerActionResponse(page,");
    expect(previewBlock).toContain('requestUrl.pathname === `/${locale}/organizer/events/${encodeURIComponent(fixture.registrationEventId)}/registration`');
    expect(previewBlock).toContain('requestUrl.searchParams.get("view") === "import"');
    expect(previewBlock).toContain("const previewResponse");
    expect(previewBlock).toContain('await expect(page.locator("[data-commit]")).toBeEnabled();');
    expect(previewBlock.indexOf("waitForServerActionResponse")).toBeLessThan(previewBlock.indexOf('page.locator("[data-preview]").click()'));
    expect(previewBlock.indexOf("previewResponse")).toBeLessThan(previewBlock.indexOf('await expect(page.locator("[data-commit]")).toBeEnabled();'));
    expect(previewBlock).not.toContain("waitForTimeout");
    expect(previewBlock).not.toContain("retry");
    expect(previewBlock).not.toContain("test.slow");
    expect(previewBlock).not.toContain("force: true");
    expect(previewBlock).not.toMatch(/\btimeout\s*:/);
    expect(previewBlock).not.toContain("requestfinished");
    expect(previewBlock).not.toContain("requestfailed");
  });
});
