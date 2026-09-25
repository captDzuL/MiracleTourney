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

describe("CSV preview settlement observability contract", () => {
  it("keeps non-redirect preview settlement at status plus response EOF", () => {
    expect(helper).toContain("await response.finished()");
    expect(helper).toContain("response.finished() !== null");
    expect(helper).not.toContain("requestfinished");
    expect(helper).not.toContain("requestfailed");
  });

  it("keeps redirect settlement independent from response EOF", () => {
    const redirectHelper = helper.slice(helper.indexOf("export async function runAndSettleServerActionRedirect("));
    expect(redirectHelper).toContain("x-action-redirect");
    expect(redirectHelper).toContain("waitForURL");
    expect(redirectHelper).not.toContain("response.finished()");
  });

  it("records every action milestone around the existing preview awaits", () => {
    for (const marker of [
      'trace("action_enter"',
      'trace("access_gate_done"',
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
      'trace("access_gate_done"',
      'trace("revalidation_requested"',
    ]);
    const revalidationIndex = actionImpl.indexOf('trace("revalidation_requested"');
    const actionReturnIndex = actionImpl.lastIndexOf('trace("action_return"');
    expect(actionReturnIndex).toBeGreaterThan(revalidationIndex);
    expectOrdered(sliceBetween(action, "export async function previewRegistrationImportForUser(", "async function previewEventRegistrationImportActionImpl("), [
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
