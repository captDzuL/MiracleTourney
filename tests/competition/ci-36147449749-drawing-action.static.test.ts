import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const helper = readFileSync(resolve(root, "tests/e2e/helpers/server-action.ts"), "utf8");
const overnightSpec = readFileSync(resolve(root, "tests/e2e/overnight-smoke.spec.ts"), "utf8");

describe("drawing action settlement contract", () => {
  it("parses only a completed exact response before exposing the result", () => {
    expect(helper).toContain("export function parseServerActionResult");
    expect(helper).toContain("await response.finished()");
    expect(helper).toContain("await response.text()");
    expect(overnightSpec).toContain("waitForServerActionResult");

    const start = overnightSpec.indexOf("const drawingResponsePromise");
    const end = overnightSpec.indexOf('await expect.poll(', start);
    const drawingSettlement = overnightSpec.slice(start, end);
    expect(drawingSettlement).toContain('request.method() === "POST"');
    expect(drawingSettlement).toContain("requestUrl.pathname === `/en/organizer/events/${encodeURIComponent(eventId)}/competition`");
    expect(drawingSettlement).toContain('Boolean(request.headers()["next-action"])');
    expect(drawingSettlement).toContain("postData.includes(eventId)");
    expect(drawingSettlement).toContain('postData.includes(\'"drawing_save"\')');
    expect(drawingSettlement).toContain('expect(drawingResponse.result.status, "Save drawing action result").toBe("saved")');
    expect(drawingSettlement.indexOf("const drawingResponse = await drawingResponsePromise")).toBeGreaterThan(-1);
    expect(drawingSettlement.indexOf('expect(drawingResponse.result.status')).toBeGreaterThan(drawingSettlement.indexOf("const drawingResponse = await drawingResponsePromise"));
    expect(drawingSettlement).not.toContain("request: () => true");
  });
});
