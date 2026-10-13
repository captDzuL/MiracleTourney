import { beforeEach, describe, expect, it, vi } from "vitest";

// Queries that used to be written inside the server actions (regenerating a certificate).

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import { getFinalWinnerTeamId } from "@/lib/certificate/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getFinalWinnerTeamId", () => {
  it("returns the winner of the Final of the event", async () => {
    prisma.match.findFirst.mockResolvedValue({ id: "match-final", winnerTeamId: "team-winner" });

    await expect(getFinalWinnerTeamId("event-1")).resolves.toBe("team-winner");

    expect(prisma.match.findFirst).toHaveBeenCalledWith({ where: { eventId: "event-1", roundLabel: "Final", winnerTeamId: { not: null } } });
  });

  it("returns null while no Final result has been saved", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(getFinalWinnerTeamId("event-1")).resolves.toBeNull();
  });

  it("passes on a database error", async () => {
    prisma.match.findFirst.mockRejectedValue(new Error("db down"));

    await expect(getFinalWinnerTeamId("event-1")).rejects.toThrow("db down");
  });
});
