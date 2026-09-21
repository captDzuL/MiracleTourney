import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redactIdentifier } from "@/lib/observability/logger";
import {
  authorizeWorkspaceResource,
  setAuthorizationAuditSink,
} from "./authorization";

describe("authorization audit logging", () => {
  beforeEach(() => {
    setAuthorizationAuditSink(null);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setAuthorizationAuditSink(null);
    vi.restoreAllMocks();
  });

  it("serializes platform-admin exceptions with hashed identifiers and structured fields", () => {
    authorizeWorkspaceResource(
      { id: "platform-user-raw", role: "platform_admin" },
      { eventId: "event-id-raw" },
      "organizer-id-raw",
    );

    expect(console.info).toHaveBeenCalledTimes(1);
    const serialized = vi.mocked(console.info).mock.calls[0]?.[0];
    expect(typeof serialized).toBe("string");
    expect(serialized).not.toContain("platform-user-raw");
    expect(serialized).not.toContain("event-id-raw");
    expect(JSON.parse(String(serialized))).toMatchObject({
      phase: "done",
      operation: "authorization_platform_admin_exception",
      route: "/server/authorization",
      durationMs: 0,
      status: 200,
      actorId: redactIdentifier("platform-user-raw"),
      resourceId: redactIdentifier("event-id-raw"),
    });
  });
});
