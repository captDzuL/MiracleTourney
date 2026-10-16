import { beforeEach, describe, expect, it, vi } from "vitest";

// Refactor PR 1.2: pin the behavior of the three authorization checks before they move out of repository.ts.
// They decide who may change an event, a team or a stat submission, so every role is covered, including the denials.

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: { findFirst: vi.fn() },
    team: { findFirst: vi.fn() },
    statSubmission: { findFirst: vi.fn() },
  },
}));

vi.mock("../db", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import type { AppUser } from "../types";
import * as authz from "./authz";
import { assertUserCanManageEvent, assertUserCanManageTeam, assertUserCanReviewStatSubmission } from "@/lib/platform/shared/authz";

const user = (role: AppUser["role"], id = `${role}-1`): AppUser => ({ id, role, email: `${id}@test.com`, name: id });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the public API of repository.ts", () => {
  it("still exports the three checks, as the very same functions that live in shared/authz", () => {
    expect(assertUserCanManageEvent).toBe(authz.assertUserCanManageEvent);
    expect(assertUserCanManageTeam).toBe(authz.assertUserCanManageTeam);
    expect(assertUserCanReviewStatSubmission).toBe(authz.assertUserCanReviewStatSubmission);
  });
});

describe("assertUserCanManageEvent", () => {
  it("denies a role it does not know, without asking the database (it fails closed)", async () => {
    const stranger = { ...user("captain"), role: "superuser" } as unknown as AppUser;

    await expect(authz.assertUserCanManageEvent(stranger, "event-1")).rejects.toThrow("Not authorized");
    await expect(authz.assertUserCanReviewStatSubmission(stranger, "submission-1")).rejects.toThrow("Not authorized");
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.statSubmission.findFirst).not.toHaveBeenCalled();
  });

  it.each(["platform_admin", "admin"] as const)("lets %s manage any event without asking the database", async (role) => {
    await expect(assertUserCanManageEvent(user(role), "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it.each(["captain", "public"] as const)("denies %s without asking the database", async (role) => {
    await expect(assertUserCanManageEvent(user(role as AppUser["role"]), "event-1")).rejects.toThrow("Not authorized");
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it("lets an organizer manage an event they organize, and asks for exactly that event and organizer", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(assertUserCanManageEvent(user("organizer", "org-1"), "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).toHaveBeenCalledWith({ where: { id: "event-1", organizerUserId: "org-1" }, select: { id: true } });
  });

  it("denies an organizer for an event they do not organize", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(assertUserCanManageEvent(user("organizer"), "event-other")).rejects.toThrow("Not authorized");
  });

  it("passes a database failure on instead of treating it as allowed or denied", async () => {
    prisma.event.findFirst.mockRejectedValue(new Error("database unavailable"));

    await expect(assertUserCanManageEvent(user("organizer"), "event-1")).rejects.toThrow("database unavailable");
  });
});

describe("assertUserCanReviewStatSubmission", () => {
  it.each(["platform_admin", "admin"] as const)("lets %s review any submission without asking the database", async (role) => {
    await expect(assertUserCanReviewStatSubmission(user(role), "submission-1")).resolves.toBeUndefined();
    expect(prisma.statSubmission.findFirst).not.toHaveBeenCalled();
  });

  it.each(["captain", "public"] as const)("denies %s", async (role) => {
    await expect(assertUserCanReviewStatSubmission(user(role as AppUser["role"]), "submission-1")).rejects.toThrow("Not authorized");
    expect(prisma.statSubmission.findFirst).not.toHaveBeenCalled();
  });

  it("lets an organizer review only a pending submission of an event they organize", async () => {
    prisma.statSubmission.findFirst.mockResolvedValue({ id: "submission-1" });

    await expect(assertUserCanReviewStatSubmission(user("organizer", "org-1"), "submission-1")).resolves.toBeUndefined();
    expect(prisma.statSubmission.findFirst).toHaveBeenCalledWith({
      where: { id: "submission-1", status: "pending", event: { organizerUserId: "org-1" } },
      select: { id: true },
    });
  });

  it("denies an organizer when the submission is not pending or belongs to another organizer", async () => {
    prisma.statSubmission.findFirst.mockResolvedValue(null);

    await expect(assertUserCanReviewStatSubmission(user("organizer"), "submission-1")).rejects.toThrow("Not authorized");
  });
});

describe("assertUserCanManageTeam", () => {
  it("returns the event of the team when the user may manage that event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });

    await expect(assertUserCanManageTeam(user("platform_admin"), "team-1")).resolves.toEqual({ eventId: "event-1" });
    expect(prisma.team.findFirst).toHaveBeenCalledWith({ where: { id: "team-1" }, select: { id: true, eventId: true } });
  });

  it("denies a team that does not exist or has no event, before any role check", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "team-1", eventId: null });

    await expect(assertUserCanManageTeam(user("platform_admin"), "missing")).rejects.toThrow("Not authorized");
    await expect(assertUserCanManageTeam(user("platform_admin"), "team-1")).rejects.toThrow("Not authorized");
  });

  it("applies the event rule: an organizer of another event is denied", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(assertUserCanManageTeam(user("organizer"), "team-1")).rejects.toThrow("Not authorized");
    expect(prisma.event.findFirst).toHaveBeenCalledWith({ where: { id: "event-1", organizerUserId: "organizer-1" }, select: { id: true } });
  });

  it("lets an organizer manage a team of an event they organize", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(authz.assertUserCanManageTeam(user("organizer", "org-1"), "team-1")).resolves.toEqual({ eventId: "event-1" });
    expect(prisma.event.findFirst).toHaveBeenCalledWith({ where: { id: "event-1", organizerUserId: "org-1" }, select: { id: true } });
  });

  it("passes a database failure in the team lookup on", async () => {
    prisma.team.findFirst.mockRejectedValue(new Error("database unavailable"));

    await expect(authz.assertUserCanManageTeam(user("platform_admin"), "team-1")).rejects.toThrow("database unavailable");
  });

  it("denies a captain even for their own team", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });

    await expect(assertUserCanManageTeam(user("captain"), "team-1")).rejects.toThrow("Not authorized");
  });
});
