import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/identity";
import { resolveEventAccessScope } from "./policy";

function actor(input: Partial<ActorContext>): ActorContext {
  return {
    userId: input.userId ?? "user-1",
    role: input.role ?? "captain",
    tenantId: input.tenantId ?? null,
  };
}

describe("events policy scope", () => {
  it("grants global scope to platform admins", () => {
    expect(resolveEventAccessScope(actor({ role: "platform_admin", tenantId: null }))).toEqual({
      kind: "platform_admin",
    });
  });

  it("grants organizer scope by tenant ownership only", () => {
    expect(resolveEventAccessScope(actor({ role: "organizer", tenantId: "org-tenant-1" }))).toEqual({
      kind: "organizer",
      organizerUserId: "org-tenant-1",
    });
  });

  it("denies organizer when tenant id is missing", () => {
    expect(resolveEventAccessScope(actor({ role: "organizer", tenantId: null }))).toEqual({ kind: "none" });
  });

  it("denies captain and unauthenticated actors", () => {
    expect(resolveEventAccessScope(actor({ role: "captain", tenantId: null }))).toEqual({ kind: "none" });
    expect(resolveEventAccessScope(null)).toEqual({ kind: "none" });
  });
});
