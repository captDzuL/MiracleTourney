import { beforeEach, describe, expect, it, vi } from "vitest";

// Queries that used to be written inside the server actions (captain team logo, admin delete team).

const { prisma } = vi.hoisted(() => ({
  prisma: {
    team: { findFirst: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn }));

import { deleteTeam, findCaptainTeamRef, getTeamForDeletion } from "@/lib/teams/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findCaptainTeamRef", () => {
  it("finds a team only when it belongs to the captain", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });

    await expect(findCaptainTeamRef("team-1", "captain-1")).resolves.toEqual({ id: "team-1", eventId: "event-1" });

    expect(prisma.team.findFirst).toHaveBeenCalledWith({ where: { id: "team-1", captainId: "captain-1" }, select: { id: true, eventId: true } });
  });

  it("returns null for a team of another captain", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(findCaptainTeamRef("team-1", "captain-2")).resolves.toBeNull();
  });

  it("keeps a team outside any event as eventId null", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "draft-1", eventId: null });

    await expect(findCaptainTeamRef("draft-1", "captain-1")).resolves.toEqual({ id: "draft-1", eventId: null });
  });
});

describe("getTeamForDeletion", () => {
  it("returns the team with the status of its event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1", event: { id: "event-1", status: "Draft" } });

    await expect(getTeamForDeletion("team-1", "event-1")).resolves.toEqual({ id: "team-1", eventId: "event-1", eventStatus: "Draft" });

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1", eventId: "event-1" },
      include: { event: { select: { id: true, status: true } } },
    });
  });

  it("returns null when the team is not in that event", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(getTeamForDeletion("team-1", "event-9")).resolves.toBeNull();
  });

  it("returns null for a team that has no event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: null, event: null });

    await expect(getTeamForDeletion("team-1", "event-1")).resolves.toBeNull();
  });
});

describe("deleteTeam", () => {
  it("deletes exactly the team with the given id", async () => {
    await deleteTeam("team-1");

    expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: "team-1" } });
  });
});
