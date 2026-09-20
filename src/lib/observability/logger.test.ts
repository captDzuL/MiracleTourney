import { afterEach, describe, expect, it, vi } from "vitest";

import { getRequestId, redactIdentifier, withServerLog, writeServerLog } from "@/lib/observability/logger";

describe("structured server logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("correlates Vercel requests and redacts actor/resource identifiers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("https://app.example/api/me", { headers: { "x-vercel-id": "iad1::request-123" } });

    expect(getRequestId(request)).toBe("iad1::request-123");
    writeServerLog({
      phase: "done",
      operation: "read_me",
      route: "/api/me",
      requestId: "iad1::request-123",
      durationMs: 12,
      status: 200,
      actorId: "organizer@example.test",
      resourceId: "event-secret",
    });

    const record = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(record).toMatchObject({ phase: "done", operation: "read_me", status: 200 });
    expect(record.actorId).toBe(redactIdentifier("organizer@example.test"));
    expect(record.resourceId).toBe(redactIdentifier("event-secret"));
    expect(JSON.stringify(record)).not.toContain("organizer@example.test");
    expect(JSON.stringify(record)).not.toContain("event-secret");
  });

  it("emits start and done records without logging work payloads", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const payload = { email: "private@example.test", token: "secret-token", paymentProofUrl: "https://blob.example/private" };
    const value = await withServerLog(
      new Request("https://app.example/api/private", { headers: { "x-vercel-id": "req-1" } }),
      "private_operation",
      async () => ({ status: 204, value: payload }),
    );

    expect(value).toBe(payload);
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.map(([line]) => JSON.parse(String(line)).phase)).toEqual(["start", "done"]);
    expect(info.mock.calls.map(([line]) => String(line)).join("\n")).not.toContain("private@example.test");
    expect(info.mock.calls.map(([line]) => String(line)).join("\n")).not.toContain("secret-token");
  });

  it("emits a safe failed record and rethrows the original error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const failure = new Error("Prisma P2028 stack secret");

    await expect(withServerLog(
      new Request("https://app.example/api/private", { headers: { "x-vercel-id": "req-2" } }),
      "private_operation",
      async () => { throw failure; },
    )).rejects.toBe(failure);

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records.map((record) => record.phase)).toEqual(["start", "failed"]);
    expect(records[1]).toMatchObject({ status: 500, errorCode: "internal_error", requestId: "req-2" });
    expect(JSON.stringify(records)).not.toMatch(/Prisma|P2028|stack|secret/i);
  });
});
