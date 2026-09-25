import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const helper = read("tests/e2e/helpers/server-action.ts");
const action = read("src/lib/actions/registration-v3-actions.ts");
const route = read("src/app/[locale]/organizer/events/[eventId]/registration/page.tsx");

function expectOrdered(source: string, markers: string[]) {
  let previous = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    expect(index, `missing milestone ${marker}`).toBeGreaterThan(-1);
    expect(index, `${marker} must follow the preceding milestone`).toBeGreaterThan(previous);
    previous = index;
  }
}

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? source.length : end);
}

function assertUiSettledServerAction(source: string) {
  expect(source).toContain("const responsePromise = waitForServerActionResponseHeaders(page, options.request);");
  expect(source).toContain("const triggerPromise = Promise.resolve().then(() => options.trigger());");
  expect(source).toContain("const [response] = await Promise.all([responsePromise, triggerPromise]);");
  expect(source).toContain("response.status() < 400");
  expect(source).toContain("await options.uiReady();");
  expect(source).not.toContain("response.finished()");
  expect(source).not.toContain("response.text()");
  expect(source).not.toContain("requestfinished");
  expect(source).not.toContain("requestfailed");
  expect(source).not.toMatch(/\btimeout\s*:/);
  expect(source.indexOf("const responsePromise = waitForServerActionResponseHeaders")).toBeLessThan(
    source.indexOf("const triggerPromise = Promise.resolve().then(() => options.trigger());"),
  );
  expect(source.indexOf("const triggerPromise = Promise.resolve().then(() => options.trigger());")).toBeLessThan(
    source.indexOf("const [response] = await Promise.all([responsePromise, triggerPromise]);"),
  );
  expect(source.indexOf("const [response] = await Promise.all([responsePromise, triggerPromise]);")).toBeLessThan(
    source.indexOf("response.status() < 400"),
  );
  expect(source.indexOf("response.status() < 400")).toBeLessThan(source.indexOf("await options.uiReady();"));
}

function assertRedirectHelperExcludesEof(source: string) {
  expect(source).toContain("x-action-redirect");
  expect(source).toContain("waitForURL");
  expect(source).not.toContain("response.finished()");
}

describe("CSV preview settlement observability contract", () => {
  it("settles CSV preview through exact headers, status, and a UI-ready callback", () => {
    const uiSettlement = sliceBetween(
      helper,
      "export async function runAndSettleServerActionUi(",
      "function parseJsonCandidate",
    );
    assertUiSettledServerAction(uiSettlement);
    expect(helper).toContain("export async function runAndSettleServerActionUi(");
  });

  it("keeps redirect settlement independent from response EOF", () => {
    const redirectHelper = helper.slice(helper.indexOf("export async function runAndSettleServerActionRedirect("));
    assertRedirectHelperExcludesEof(redirectHelper);
  });

  it("rejects missing status, UI-ready, or EOF-free settlement guards", () => {
    const uiSettlement = sliceBetween(
      helper,
      "export async function runAndSettleServerActionUi(",
      "function parseJsonCandidate",
    );
    const redirectHelper = helper.slice(helper.indexOf("export async function runAndSettleServerActionRedirect("));
    expect(() => assertUiSettledServerAction(uiSettlement)).not.toThrow();
    expect(() => assertUiSettledServerAction(uiSettlement.replace("response.status() < 400", "response.status() >= 400"))).toThrow();
    expect(() => assertUiSettledServerAction(uiSettlement.replace("await options.uiReady();", "return response;"))).toThrow();
    expect(() => assertUiSettledServerAction(uiSettlement.replace("await options.uiReady();", "await response.finished();"))).toThrow();
    expect(() => assertRedirectHelperExcludesEof(redirectHelper.replace("const actionRedirect", "await response.finished();\n  const actionRedirect"))).toThrow();
  });

  it("records every action milestone around the existing preview awaits", () => {
    for (const marker of [
      'trace("action_enter"',
      'trace("initial_gate_done"',
      'trace?.("rate_limit_done"',
      'trace?.("ownership_done"',
      'trace?.("access_gate_done"',
      'trace?.("event_context_done"',
      'trace?.("source_parsed"',
      'trace?.("users_resolved"',
      'trace?.("bracket_lock_done"',
      'trace?.("preview_batch_saved"',
      'trace("revalidation_requested"',
      'trace("action_return"',
    ]) expect(action).toContain(marker);
    const actionImpl = sliceBetween(action, "async function previewEventRegistrationImportActionImpl(", "export async function previewEventRegistrationImportAction(");
    expectOrdered(actionImpl, [
      'trace("action_enter"',
      'trace("initial_gate_done"',
      'trace("revalidation_requested"',
    ]);
    const revalidationIndex = actionImpl.indexOf('trace("revalidation_requested"');
    const actionReturnIndex = actionImpl.lastIndexOf('trace("action_return"');
    expect(actionReturnIndex).toBeGreaterThan(revalidationIndex);
    expectOrdered(sliceBetween(action, "export async function previewRegistrationImportForUser(", "async function previewEventRegistrationImportActionImpl("), [
      'trace?.("rate_limit_done"',
      'trace?.("ownership_done"',
      'trace?.("access_gate_done"',
      'trace?.("event_context_done"',
      'trace?.("source_parsed"',
      'trace?.("users_resolved"',
      'trace?.("bracket_lock_done"',
      'trace?.("preview_batch_saved"',
    ]);
    expect(action).toContain("createServerMilestoneLogger");
    expect(action).toContain('terminal: "failed"');
    expect(action).not.toContain("response.status() < 400");
    expect(action).not.toContain("waitForTimeout");
    expect(action).not.toContain("retry");
  });

  it("records the revalidated route context and history boundaries in order", () => {
    for (const marker of [
      'trace("route_enter"',
      'trace("route_context_done"',
      'trace("route_history_done"',
      'trace("route_return"',
    ]) expect(route).toContain(marker);
    expectOrdered(sliceBetween(route, 'if (query.view === "import") {', 'if (query.view === "payments")'), [
      'trace("route_history_done"',
      'trace("route_return"',
    ]);
    expect(route).toContain("createServerMilestoneLogger");
    expect(route).toContain("return <RegistrationWorkspace {...base} capacity={0} acceptedCount={0} error />;");
    expect(route).not.toContain("waitForTimeout");
    expect(route).not.toContain("revalidatePath");
  });

  it("keeps milestone sources free of raw import payload and credentials", () => {
    expect(action).toContain("resourceId");
    expect(action).toContain("locale");
    expect(action).not.toMatch(/trace\([^\n]*(?:file|formData|email|token|password)/i);
    expect(route).not.toMatch(/trace\([^\n]*(?:cookie|token|password|email)/i);
  });
});
