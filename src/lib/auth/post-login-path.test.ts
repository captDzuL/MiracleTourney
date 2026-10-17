import { describe, expect, it } from "vitest";

import { resolvePostLoginPath } from "./post-login-path";

describe("resolvePostLoginPath", () => {
  it("sends a captain to the captain area by default", () => {
    expect(resolvePostLoginPath({ role: "captain" })).toBe("/captain");
  });

  it("sends a captain back to the safe return path they came from", () => {
    expect(resolvePostLoginPath({ role: "captain", returnTo: "/events/nusantara-cup/register" }))
      .toBe("/events/nusantara-cup/register");
  });

  it("sends a captain to registration for the event they chose", () => {
    expect(resolvePostLoginPath({ role: "captain", eventId: "event-abc" }))
      .toBe("/captain?tab=registration&eventId=event-abc");
  });

  it("prefers the return path over the event id for a captain", () => {
    expect(resolvePostLoginPath({ role: "captain", returnTo: "/events/a/register", eventId: "event-abc" }))
      .toBe("/events/a/register");
  });

  it("ignores an event id that is not a plain identifier", () => {
    expect(resolvePostLoginPath({ role: "captain", eventId: "abc/../admin" })).toBe("/captain");
    expect(resolvePostLoginPath({ role: "captain", eventId: "a b" })).toBe("/captain");
  });

  it("sends an organizer to the organizer workspace", () => {
    expect(resolvePostLoginPath({ role: "organizer" })).toBe("/organizer");
  });

  it("makes an organizer with a temporary password change it first", () => {
    expect(resolvePostLoginPath({ role: "organizer", mustChangePassword: true })).toBe("/organizer/change-password");
  });

  it.each(["admin", "platform_admin"] as const)("sends %s to the admin area", (role) => {
    expect(resolvePostLoginPath({ role })).toBe("/admin");
  });

  it("sends a player to the player area", () => {
    expect(resolvePostLoginPath({ role: "player" })).toBe("/player");
  });

  it("sends a player back to the safe return path they came from", () => {
    expect(resolvePostLoginPath({ role: "player", returnTo: "/events/solo-cup/register" })).toBe("/events/solo-cup/register");
  });

  it("ignores an event id for a player, who comes back through the return path instead", () => {
    expect(resolvePostLoginPath({ role: "player", eventId: "event-abc" })).toBe("/player");
    expect(resolvePostLoginPath({ role: "player", eventId: "abc/../admin" })).toBe("/player");
  });

  it("never sends a player to the captain area by default", () => {
    expect(resolvePostLoginPath({ role: "player" })).not.toContain("/captain");
  });

  it("does not let a return path or event id redirect anyone but a captain", () => {
    expect(resolvePostLoginPath({ role: "organizer", returnTo: "/events/a/register", eventId: "event-abc" })).toBe("/organizer");
    expect(resolvePostLoginPath({ role: "platform_admin", returnTo: "/events/a/register" })).toBe("/admin");
  });
});
