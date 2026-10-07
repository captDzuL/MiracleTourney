import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const legacySpec = readFileSync(resolve(root, "tests/e2e-legacy/matchday-flags-off.spec.ts"), "utf8").replace(/\r\n/g, "\n");

function unavailableHelper() {
  const start = legacySpec.indexOf("async function expectV3Unavailable");
  const end = legacySpec.indexOf("\n}\n\nasync function openLegacyMatch", start);
  if (start < 0 || end < 0) throw new Error("Unable to isolate the legacy V3 availability helper");
  return legacySpec.slice(start, end + 2);
}

const NON_EMPTY_REQUEST_ID_ASSERTION = "expect(privateResponse.body.requestId.length).toBeGreaterThan(0)";

function assertLegacyFlagsOffContract(helper: string) {
  expect(helper).toContain("status: response.status");
  expect(helper).toContain("body: await response.json()");
  expect(helper).toContain('cacheControl: response.headers.get("cache-control")');
  expect(helper).toContain('vary: response.headers.get("vary")');
  expect(helper).toContain("expect(publicStatus, `/api/events/${fixture.slug}/ongoing`).toBe(404)");
  expect(helper).toContain("expect(privateResponse.status, `/api/organizer/events/${fixture.id}/competition`).toBe(503)");
  expect(helper).toContain(
    'expect(privateResponse.body).toEqual({ code: "internal_error", requestId: expect.any(String) })',
  );
  if (!helper.includes(NON_EMPTY_REQUEST_ID_ASSERTION)) {
    throw new Error("legacy flags-off helper must enforce a non-empty requestId");
  }
  expect(helper).toContain('expect(privateResponse.cacheControl).toBe("private, no-store, max-age=0")');
  expect(helper).toContain('expect(privateResponse.vary).toContain("Cookie")');
  expect(helper).not.toContain("/api/organizer/events/${fixture.id}/competition`)).toBe(404)");
}

describe("legacy flags-off API contract", () => {
  it("asserts the public 404 and private opaque 503 boundary", () => {
    assertLegacyFlagsOffContract(unavailableHelper());
  });

  it("rejects a helper that stops enforcing non-empty request ids", () => {
    const helper = unavailableHelper();
    const withoutNonEmptyRequestId = helper.replace(
      "  expect(privateResponse.body.requestId.length).toBeGreaterThan(0);\n",
      "",
    );

    expect(withoutNonEmptyRequestId).not.toContain(NON_EMPTY_REQUEST_ID_ASSERTION);
    expect(() => assertLegacyFlagsOffContract(withoutNonEmptyRequestId)).toThrow(/non-empty requestId/);
  });
});
