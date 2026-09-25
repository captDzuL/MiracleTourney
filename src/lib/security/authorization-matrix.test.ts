import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeWorkspaceResource,
  setAuthorizationAuditSink,
  type WorkspaceActor,
  type WorkspaceResource,
} from "./authorization";

const actors: Record<string, WorkspaceActor | null> = {
  anonymous: null,
  "captain-a": { id: "captain-a", role: "captain" },
  "captain-b": { id: "captain-b", role: "captain" },
  "organizer-a": { id: "organizer-a", role: "organizer" },
  "organizer-b": { id: "organizer-b", role: "organizer" },
  admin: { id: "admin-1", role: "admin" },
  "platform-admin": { id: "platform-1", role: "platform_admin" },
};

const resources: Array<{ kind: string; id: string; resource: WorkspaceResource; owner: string | null }> = [
  { kind: "event", id: "event-b", resource: { eventId: "event-b", ownerUserId: "organizer-b" }, owner: "organizer-b" },
  { kind: "team", id: "team-b", resource: { eventId: "event-b", ownerUserId: "captain-b" }, owner: "organizer-b" },
  { kind: "match", id: "match-b", resource: { eventId: "event-b" }, owner: "organizer-b" },
  { kind: "player", id: "player-b", resource: { eventId: "event-b", ownerUserId: "captain-b" }, owner: "organizer-b" },
  { kind: "submission", id: "submission-b", resource: { eventId: "event-b" }, owner: "organizer-b" },
  { kind: "paymentRequest", id: "payment-b", resource: { eventId: "event-b", ownerUserId: "captain-b" }, owner: "organizer-b" },
  { kind: "importBatch", id: "import-b", resource: { eventId: "event-b" }, owner: "organizer-b" },
  { kind: "certificate", id: "certificate-b", resource: { eventId: "event-b" }, owner: "organizer-b" },
  { kind: "nested", id: "nested-b", resource: { eventId: "event-b", ownerUserId: "organizer-b" }, owner: "organizer-b" },
];

describe("workspace authorization matrix", () => {
  const audit = vi.fn();

  beforeEach(() => {
    setAuthorizationAuditSink(() => undefined);
  });

  afterEach(() => {
    audit.mockReset();
    setAuthorizationAuditSink(null);
  });

  it.each(resources.flatMap(resource => Object.entries(actors).map(([actorLabel, actor]) => ({ ...resource, actorLabel, actor }))))
    ("applies the $actorLabel policy to a manipulated $kind ID without target metadata or writes", ({ id, resource, owner, actorLabel, actor }) => {
    const write = vi.fn();
    const decision = authorizeWorkspaceResource(actor, resource, owner);
    const shouldAllow = actorLabel === "admin"
      || actorLabel === "platform-admin"
      || actorLabel === `organizer-${owner?.split("-").at(-1)}`
      || (actor !== null && resource.ownerUserId === actor.id);

    if (decision.ok) write(id);
    if (shouldAllow) {
      expect(decision).toEqual({ ok: true, platformAdminException: actorLabel === "platform-admin" });
      expect(write).toHaveBeenCalledWith(id);
    } else {
      expect(decision).toEqual({ ok: false, status: expect.any(Number), code: "forbidden" });
      expect(JSON.stringify(decision)).not.toContain(id);
      expect(JSON.stringify(decision)).not.toContain("organizer-b");
      expect(JSON.stringify(decision)).not.toContain("captain-b");
      expect(JSON.stringify(decision)).not.toMatch(/name|email|secret|password/i);
      expect(write).not.toHaveBeenCalled();
    }
  });

  it.each(Object.entries(actors))("returns a generic denial for %s when the event is missing", (_label, actor) => {
    const decision = authorizeWorkspaceResource(actor, null, null);
    expect(decision).toEqual({ ok: false, status: expect.any(Number), code: "forbidden" });
    expect(JSON.stringify(decision)).not.toMatch(/event|team|match|player|email|name/i);
  });

  it.each(["anonymous", "captain-a", "captain-b", "organizer-b"])("denies %s from organizer A's event", label => {
    const write = vi.fn();
    const decision = authorizeWorkspaceResource(actors[label], { eventId: "event-a", ownerUserId: "organizer-a" }, "organizer-a");
    if (decision.ok) write();
    expect(decision).toEqual({ ok: false, status: expect.any(Number), code: "forbidden" });
    expect(write).not.toHaveBeenCalled();
  });

  it("permits the owner and the shared admin role without a platform exception", () => {
    expect(authorizeWorkspaceResource(actors["organizer-a"], { eventId: "event-a", ownerUserId: "organizer-a" }, "organizer-a"))
      .toEqual({ ok: true, platformAdminException: false });
    expect(authorizeWorkspaceResource(actors.admin, { eventId: "event-a", ownerUserId: "organizer-a" }, "organizer-a"))
      .toEqual({ ok: true, platformAdminException: false });
  });

  it("marks and audits a platform-admin exception without target secrets or PII", () => {
    setAuthorizationAuditSink(audit);
    const decision = authorizeWorkspaceResource(actors["platform-admin"], { eventId: "event-a", ownerUserId: "organizer-a" }, "organizer-a");

    expect(decision).toEqual({ ok: true, platformAdminException: true });
    expect(audit).toHaveBeenCalledWith({ actorUserId: "platform-1", eventId: "event-a", reason: "platform_admin_exception" });
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toMatch(/password|email|secret|name/i);
  });
});
