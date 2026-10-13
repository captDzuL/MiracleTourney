// Moved out of platform/repository.test.ts without changes (refactor Phase 4).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    competitionPhase: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    matchResultRevision: { findMany: vi.fn() },
    eventRoundConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    matchGame: {
      findMany: vi.fn(),
    },
    team: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    teamRegistrationRequest: {
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organizerProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    eventPreviewToken: {
      updateMany: vi.fn(),
    },
    eventEditRevision: {
      updateMany: vi.fn(),
    },
    eventSlugRedirect: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    eventVisualAsset: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registrationImportBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    eventPaymentSettings: {
      findUnique: vi.fn(),
    },
    registrationImportItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    statSubmission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    certificate: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tournamentCompletion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    competitionAuditLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $connect: vi.fn(),
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { assertCaptainCanSubmitStats, getFlashpeakLeaderboardForEvent, getFlashpeakLeaderboardForEventResult } from "@/lib/player-stats/repository";

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});


describe("assertCaptainCanSubmitStats", () => {
  const input = {
    captainId: "captain-1",
    eventId: "event-1",
    matchId: "match-1",
    teamId: "team-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.match.findFirst.mockResolvedValue({ id: "match-1" });
    prisma.team.findFirst.mockResolvedValue({ id: "team-1" });
  });

  it("allows a captain to submit stats only for their completed match participant", async () => {
    await expect(assertCaptainCanSubmitStats(input)).resolves.toBeUndefined();

    expect(prisma.match.findFirst).toHaveBeenCalledWith({
      where: {
        id: "match-1",
        eventId: "event-1",
        status: "Completed",
        OR: [{ homeTeamId: "team-1" }, { awayTeamId: "team-1" }],
      },
      select: { id: true },
    });
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: {
        id: "team-1",
        eventId: "event-1",
        captainId: "captain-1",
      },
      select: { id: true },
    });
  });

  it("rejects when the match is not a completed match for that event and team", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(assertCaptainCanSubmitStats(input)).rejects.toThrow("Not authorized");
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when the team does not belong to the authenticated captain", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(assertCaptainCanSubmitStats(input)).rejects.toThrow("Not authorized");
  });
});

describe("Flashpeak V3 leaderboard reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates only completed event matches without demo fallback", async () => {
    prisma.playerStat.findMany.mockResolvedValue([
      {
        matchId: "match-1",
        teamId: "team-1",
        stats: { scores: [7.6, null, 8.1], goal: 3, assist: 4, passing: 28, defense: 12 },
        match: {
          resultSnapshot: { bestOf: 3, games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] },
          games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }],
        },
        player: {
          id: "player-1",
          displayName: "Nadia Putri",
          nickname: "Nyx",
          position: "Forward",
          team: { id: "team-1", name: "Garuda Nova", eventId: "event-1" },
        },
      },
    ]);

    await expect(getFlashpeakLeaderboardForEvent("event-1")).resolves.toEqual([
      expect.objectContaining({
        playerId: "player-1",
        nickname: "Nyx",
        game: 2,
        score: 7.85,
        goal: 3,
        assist: 4,
        passing: 28,
        defense: 12,
      }),
    ]);
    expect(prisma.playerStat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameSlug: "flashpeak",
        match: { eventId: "event-1", status: "Completed" },
      },
    }));
  });

  it("returns an honest empty state when the database is unavailable", async () => {
    const error = new Error("database unavailable");
    prisma.playerStat.findMany.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getFlashpeakLeaderboardForEvent("event-1")).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load Flashpeak leaderboard",
      expect.objectContaining({ eventId: "event-1", error }),
    );
    consoleError.mockRestore();
  });

  it("reports a successful empty read separately from a database error", async () => {
    prisma.playerStat.findMany.mockResolvedValue([]);
    await expect(getFlashpeakLeaderboardForEventResult("event-1")).resolves.toEqual({ status: "empty", entries: [] });

    prisma.playerStat.findMany.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(getFlashpeakLeaderboardForEventResult("event-1")).resolves.toEqual({ status: "error", entries: [] });
    consoleError.mockRestore();
  });

  it("reports malformed completed rows as unavailable instead of no statistics", async () => {
    prisma.playerStat.findMany.mockResolvedValue([{
      matchId: "match-invalid-score",
      teamId: "team-1",
      stats: { scores: ["not-a-score"], goal: 1, assist: 0, passing: 0, defense: 0 },
      match: { resultSnapshot: { bestOf: 1 }, games: [{ gameNumber: 1 }] },
      player: {
        id: "player-1",
        displayName: "Nadia Putri",
        nickname: "Nyx",
        position: "Forward",
        team: { id: "team-1", name: "Garuda Nova", eventId: "event-1" },
      },
    }]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getFlashpeakLeaderboardForEventResult("event-1")).resolves.toEqual({ status: "error", entries: [] });

    consoleError.mockRestore();
  });

  it("reports completed rows with roster mismatches as unavailable instead of no statistics", async () => {
    prisma.playerStat.findMany.mockResolvedValue([{
      matchId: "match-invalid-roster",
      teamId: "team-other",
      stats: { scores: [8], goal: 1, assist: 0, passing: 0, defense: 0 },
      match: { resultSnapshot: { bestOf: 1 }, games: [{ gameNumber: 1 }] },
      player: {
        id: "player-1",
        displayName: "Nadia Putri",
        nickname: "Nyx",
        position: "Forward",
        team: { id: "team-1", name: "Garuda Nova", eventId: "event-1" },
      },
    }]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getFlashpeakLeaderboardForEventResult("event-1")).resolves.toEqual({ status: "error", entries: [] });

    consoleError.mockRestore();
  });
});