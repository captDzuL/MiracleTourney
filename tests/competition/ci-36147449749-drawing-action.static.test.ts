import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseServerActionResult } from "../e2e/helpers/server-action";

const root = resolve(import.meta.dirname, "../..");
const helper = readFileSync(resolve(root, "tests/e2e/helpers/server-action.ts"), "utf8");
const overnightSpec = readFileSync(resolve(root, "tests/e2e/overnight-smoke.spec.ts"), "utf8");
const actionSource = readFileSync(resolve(root, "src/lib/actions/competition-v3-actions.ts"), "utf8");
const announcementsSource = readFileSync(resolve(root, "src/components/v3/organizer/AnnouncementsWorkspace.tsx"), "utf8");

function assertDrawingSettlementOrder(source: string) {
  const responseIndex = source.indexOf("const drawingResponse = await drawingResponsePromise");
  const guardIndex = source.indexOf('if (drawingResponse.result.status !== "saved")');
  const diagnosticIndex = source.indexOf("throw new Error(`Save drawing failed");
  const assertionIndex = source.indexOf('expect(drawingResponse.result.status, "Save drawing action result").toBe("saved")');
  expect(responseIndex).toBeGreaterThan(-1);
  expect(guardIndex).toBeGreaterThan(responseIndex);
  expect(diagnosticIndex).toBeGreaterThan(guardIndex);
  expect(diagnosticIndex).toBeLessThan(assertionIndex);
  expect(assertionIndex).toBeGreaterThan(responseIndex);
}

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
    assertDrawingSettlementOrder(drawingSettlement);
    expect(drawingSettlement).not.toContain("request: () => true");

    const diagnosticBlock = `  if (drawingResponse.result.status !== "saved") {\n    throw new Error(` + "`Save drawing failed with ${drawingResponse.result.code ?? \"unknown\"} (correlation ${drawingResponse.result.correlationId ?? \"missing\"}).`" + `);\n  }\n`;
    const assertionLine = `  expect(drawingResponse.result.status, "Save drawing action result").toBe("saved");\n`;
    const reordered = drawingSettlement.replace(`${diagnosticBlock}${assertionLine}`, `${assertionLine}${diagnosticBlock}`);
    expect(reordered).not.toBe(drawingSettlement);
    expect(() => assertDrawingSettlementOrder(reordered)).toThrow();
  });

  it("parses representative React Flight result frames and rejects ambiguity or malformed bodies", () => {
    expect(parseServerActionResult<{ status: string; receipt: { version: number } }>(
      '0:"$Sreact.fragment"\n1:{"status":"saved","receipt":{"version":7}}\n',
    )).toEqual({ status: "saved", receipt: { version: 7 } });
    expect(parseServerActionResult<{ status: string; code: string; correlationId: string }>(
      '1:{"status":"failed","code":"internal_error","correlationId":"req-7"}\n',
    )).toMatchObject({ status: "failed", code: "internal_error", correlationId: "req-7" });
    expect(parseServerActionResult<{ status: string; receipt: { version: number } }>(
      'a:{"status":"saved","receipt":{"version":8}}\n',
    )).toEqual({ status: "saved", receipt: { version: 8 } });
    expect(parseServerActionResult<{ status: string; code: string; correlationId: string }>(
      'A:{"status":"failed","code":"internal_error","correlationId":"req-8"}\n',
    )).toMatchObject({ status: "failed", code: "internal_error", correlationId: "req-8" });

    expect(() => parseServerActionResult('0:{"status":"pending"}\n1:{"status":"saved"}\n')).toThrow(/ambiguous/i);
    expect(() => parseServerActionResult('1:{"status":"saved"\n')).toThrow();
    expect(() => parseServerActionResult('0:"$undefined"\n1:{"receipt":{"version":7}}\n')).toThrow(/result/i);
  });

  it("exports the action result union and keeps local transport failure separate", () => {
    expect(actionSource).toContain("export type CompetitionMutationActionResult");
    expect(actionSource).toContain("isCompetitionExpectedError(error)");
    expect(actionSource).not.toMatch(/\/conflict\|stale\/i/);
    expect(actionSource).not.toMatch(/\/authorized\|password\|unavailable\/i/);
    expect(announcementsSource).toContain("type MutationOutcome");
    expect(announcementsSource).not.toContain("as MutationResult");
    expect(announcementsSource).not.toContain('return { status: "failed" as const }');
  });
});
