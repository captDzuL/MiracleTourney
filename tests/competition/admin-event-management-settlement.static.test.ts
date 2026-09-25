import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const adminEventManagementSpec = readFileSync(
  resolve(root, "tests/e2e/admin-event-management.spec.ts"),
  "utf8",
);

describe("locked-roster preview settlement contract", () => {
  it("pre-arms the exact locked-roster preview payload before click", () => {
    const lockedCaseStart = adminEventManagementSpec.indexOf(
      'test("admin sees error when importing CSV after bracket is locked"',
    );
    const lockedCaseEnd = adminEventManagementSpec.indexOf(
      '\n  test("admin can update live stream URL"',
      lockedCaseStart,
    );
    const lockedCase = adminEventManagementSpec.slice(lockedCaseStart, lockedCaseEnd);

    expect(lockedCase).toContain('url.pathname === "/en/admin"');
    expect(lockedCase).toContain('url.searchParams.get("phase") === "registration"');
    expect(lockedCase).toContain('url.searchParams.get("activeEventId") === lockedEventId');
    expect(lockedCase).toContain('url.searchParams.has("registrationBatchId")');
    expect(lockedCase).toContain('url.searchParams.get("success") === "registration-preview-ready"');
    expect(lockedCase).toContain('request.headers()["rsc"] === "1"');
    expect(lockedCase).toContain('request.resourceType() === "document"');
    expect(lockedCase).toContain("await settlementResponse.finished()");

    const waiterIndex = lockedCase.indexOf("const settledPreviewResponse");
    const clickIndex = lockedCase.indexOf(".click()");
    expect(waiterIndex).toBeGreaterThan(-1);
    expect(waiterIndex).toBeLessThan(clickIndex);
  });

  it("uses Playwright's timeout-aware requestfinished waiter", () => {
    const lockedCaseStart = adminEventManagementSpec.indexOf(
      'test("admin sees error when importing CSV after bracket is locked"',
    );
    const lockedCaseEnd = adminEventManagementSpec.indexOf(
      '\n  test("admin can update live stream URL"',
      lockedCaseStart,
    );
    const lockedCase = adminEventManagementSpec.slice(lockedCaseStart, lockedCaseEnd);

    expect(lockedCase).toContain('const settledPreviewResponse = page.waitForEvent("requestfinished"');
    expect(lockedCase).toContain("predicate: async (request) =>");
    expect(lockedCase).toContain("const response = await request.response()");
    expect(lockedCase).not.toContain("new Promise<Response>");
    expect(lockedCase).not.toContain('page.on("requestfinished"');
  });
});
