import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRequestId,
  redactIdentifier,
  withRouteLog,
  withServerActionLog,
  withServerLog,
  writeServerLog,
} from "@/lib/observability/logger";

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

  it("generates a request ID when Vercel did not provide one", () => {
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("generated-request-id");

    expect(getRequestId(new Request("https://app.example/api/me"))).toBe("generated-request-id");
    expect(randomUUID).toHaveBeenCalledTimes(1);
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

  it("classifies a returned route 500 as failed while preserving the response", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await withRouteLog(
      new Request("https://app.example/api/failure"),
      "api_failure",
      async () => new Response(JSON.stringify({ code: "internal_error" }), { status: 500 }),
    );

    expect(response.status).toBe(500);
    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records.map((record) => record.phase)).toEqual(["start", "failed"]);
    expect(records[1]).toMatchObject({ status: 500, errorCode: "internal_error" });
  });

  it.each([
    ["failed", 500],
    ["unauthorized", 401],
    ["rate_limited", 429],
  ] as const)("classifies an action result with status %s as failed", async (status, expectedStatus) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await withServerActionLog(`action_${status}`, "/server-actions/test", async () => ({ status }));

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records.map((record) => record.phase)).toEqual(["start", "failed"]);
    expect(records[1]).toMatchObject({ status: expectedStatus, errorCode: status });
  });

  it("logs NEXT_REDIRECT as done and rethrows the original redirect error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const redirectError = Object.assign(new Error("redirect"), {
      digest: "NEXT_REDIRECT;replace;/login;303;",
    });

    await expect(withServerLog(
      new Request("https://app.example/server-action"),
      "redirecting_action",
      async () => { throw redirectError; },
    )).rejects.toBe(redirectError);

    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records.map((record) => record.phase)).toEqual(["start", "done"]);
    expect(records[1]).toMatchObject({ status: 303 });
    expect(records[1]).not.toHaveProperty("errorCode");
  });

  it("uses one generated request ID for a route response and both log records", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("generated-route-id");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await withRouteLog(
      new Request("https://app.example/api/me"),
      "api_me",
      async (request) => {
        const requestId = getRequestId(request);
        return Response.json({ requestId });
      },
    );

    expect(await response.json()).toEqual({ requestId: "generated-route-id" });
    const records = info.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.requestId)).toEqual(["generated-route-id", "generated-route-id"]);
  });

  it("redacts dynamic path identifiers from route fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeServerLog({
      phase: "start",
      operation: "read_event",
      route: "/api/events/event-secret-123/ongoing",
      requestId: "req-route",
      durationMs: 0,
      status: 0,
    });

    const record = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(record.route).not.toContain("event-secret-123");
    expect(record.route).toContain("/api/events/");
  });

  it("serializes only the allowlisted fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeServerLog({
      phase: "done",
      operation: "safe_operation",
      route: "/api/me",
      requestId: "req-safe",
      durationMs: 4,
      status: 200,
      errorCode: "safe_code",
      actorId: "actor-1",
      resourceId: "resource-1",
      payload: { email: "private@example.test", token: "secret-token" },
      error: new Error("stack secret"),
    } as Parameters<typeof writeServerLog>[0]);

    const record = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(record).toEqual({
      phase: "done",
      operation: "safe_operation",
      route: "/api/me",
      requestId: "req-safe",
      durationMs: 4,
      status: 200,
      errorCode: "safe_code",
      actorId: redactIdentifier("actor-1"),
      resourceId: redactIdentifier("resource-1"),
    });
    expect(JSON.stringify(record)).not.toMatch(/private@example\.test|secret-token|stack secret/);
  });

  it("uses the canonical event route template when a dynamic slug equals a static segment", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeServerLog({
      phase: "start",
      operation: "read_event",
      route: "/api/events/admin/ongoing",
      requestId: "req-route-collision",
      durationMs: 0,
      status: 0,
    });

    const record = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(record.route).toBe("/api/events/:slug/ongoing");
    expect(record.route).not.toContain("admin");
  });
});
