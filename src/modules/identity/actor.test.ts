import { describe, expect, it } from "vitest";

import type { AppUser } from "@/lib/platform/types";

import { toActorContext } from "./actor";
import { toEventReadActorCompatibility } from "./compatibility";

function user(overrides: Partial<AppUser>): AppUser {
  return {
    id: "user-1",
    email: "user@test.com",
    name: "User",
    role: "captain",
    ...overrides,
  };
}

describe("toActorContext", () => {
  it("maps active captain to captain actor with null tenant", () => {
    expect(toActorContext(user({ role: "captain" }))).toEqual({
      userId: "user-1",
      role: "captain",
      tenantId: null,
    });
  });

  it("maps active organizer to organizer actor with self tenant", () => {
    expect(toActorContext(user({ id: "org-1", role: "organizer" }))).toEqual({
      userId: "org-1",
      role: "organizer",
      tenantId: "org-1",
    });
  });

  it("maps active platform admin to platform_admin actor with null tenant", () => {
    expect(toActorContext(user({ role: "platform_admin" }))).toEqual({
      userId: "user-1",
      role: "platform_admin",
      tenantId: null,
    });
  });

  it("returns null for deactivated users", () => {
    expect(toActorContext(user({ deactivatedAt: new Date(), role: "captain" }))).toBeNull();
  });

  it("returns null for legacy admin users", () => {
    expect(toActorContext(user({ role: "admin" }))).toBeNull();
  });

  it("keeps canonical actor mapping rejecting legacy admin while compatibility mapping scopes legacy admin to organizer tenant", () => {
    const legacyAdmin = user({ id: "legacy-admin-1", role: "admin" });

    expect(toActorContext(legacyAdmin)).toBeNull();
    expect(toEventReadActorCompatibility(legacyAdmin)).toEqual({
      userId: "legacy-admin-1",
      role: "organizer",
      tenantId: "legacy-admin-1",
    });
  });

  it("returns null for missing users", () => {
    expect(toActorContext(null)).toBeNull();
  });
});
