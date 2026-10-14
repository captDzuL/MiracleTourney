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

import { getEventsByIds } from "@/lib/events/repository";
import { addPlayer, deletePlayer, getTeamCountsForEvents, getTeamsForEvents, updatePlayer } from "@/lib/teams/repository";

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});

function publishedEventRow(overrides: Partial<{ id: string; slug: string; name: string; status: string; participantCap: number; format: string }> = {}) {
  return {
    id: overrides.id ?? "event-open",
    slug: overrides.slug ?? overrides.id ?? "event-open",
    name: overrides.name ?? "Open Event",
    description: "Open registration event",
    logoUrl: null,
    gameImageUrl: null,
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    format: overrides.format ?? "Single Elimination",
    status: overrides.status ?? "Published",
    participantCap: overrides.participantCap ?? 8,
    registrationWindow: "Aug 24 - Aug 31",
    startsAt: "2026-09-01",
    venue: "Online",
    organizerUserId: null,
    organizerName: null,
    organizerVerified: null,
    characterArtUrl: null,
    accentColor: null,
    stream: null,
  };
}

describe("dashboard batch lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches selected captain events without loading the full event catalog", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "event-one",
        name: "Event One",
        description: "Event",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Ongoing",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: null,
        organizerName: null,
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
      },
    ]);

    await expect(getEventsByIds(["event-1"])).resolves.toHaveLength(1);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["event-1"] } },
      include: { stream: true, activeVisualAsset: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("batch-fetches teams grouped by event", async () => {
    prisma.team.findMany.mockResolvedValue([
      {
        id: "team-1",
        eventId: "event-1",
        captainId: null,
        name: "Alpha",
        logoText: "AL",
        logoUrl: null,
        tag: "ALP",
        captainName: null,
        captainContact: null,
        source: "demo",
      },
      {
        id: "team-2",
        eventId: "event-2",
        captainId: null,
        name: "Beta",
        logoText: "BE",
        logoUrl: null,
        tag: "BET",
        captainName: null,
        captainContact: null,
        source: "demo",
      },
    ]);

    const result = await getTeamsForEvents(["event-1", "event-2"]);

    expect(result.get("event-1")).toHaveLength(1);
    expect(result.get("event-2")).toHaveLength(1);
    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["event-1", "event-2"] } },
      include: { captain: { select: { id: true, name: true } } },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("batch-counts teams without fetching every team row", async () => {
    prisma.team.groupBy.mockResolvedValue([
      { eventId: "event-1", _count: { _all: 32 } },
    ]);

    const result = await getTeamCountsForEvents(["event-1", "event-2"]);

    expect(result.get("event-1")).toBe(32);
    expect(result.get("event-2")).toBe(0);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
    expect(prisma.team.groupBy).toHaveBeenCalledWith({
      by: ["eventId"],
      where: { eventId: { in: ["event-1", "event-2"] } },
      _count: { _all: true },
    });
  });
});

describe("captain roster edits respect the event lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // In the old single test file an earlier describe left this transaction mock behind; here it is set on purpose.
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it.each(["Published", "Registration Closed"] as const)(
    "allows addPlayer when the event is %s",
    async (status) => {
      prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));
      prisma.player.create.mockResolvedValue({
        id: "player-1",
        teamId: "team-1",
        eventId: "event-1",
        displayName: "New Player",
        nickname: "NP",
        position: "Top",
        jerseyNumber: null,
      });

      await expect(
        addPlayer({ teamId: "team-1", eventId: "event-1", displayName: "New Player", nickname: "NP", position: "Top" }),
      ).resolves.toEqual(expect.objectContaining({ id: "player-1" }));
      expect(prisma.player.create).toHaveBeenCalled();
    },
  );

  it.each(["Ongoing", "Finished"] as const)("rejects addPlayer when the event is %s", async (status) => {
    prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));

    await expect(
      addPlayer({ teamId: "team-1", eventId: "event-1", displayName: "New Player", nickname: "NP", position: "Top" }),
    ).rejects.toThrow("Roster tim sudah terkunci");
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it.each(["Published", "Registration Closed"] as const)(
    "allows updatePlayer/deletePlayer when the event is %s",
    async (status) => {
      prisma.player.findUnique.mockResolvedValue({
        id: "player-1",
        team: { captainId: "captain-1", eventId: "event-1" },
      });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));
      prisma.player.update.mockResolvedValue({ id: "player-1", displayName: "Updated" });

      await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" })).resolves.toEqual(
        expect.objectContaining({ id: "player-1" }),
      );
      await expect(deletePlayer("player-1", "captain-1")).resolves.toBeUndefined();
      expect(prisma.player.update).toHaveBeenCalled();
      expect(prisma.player.delete).toHaveBeenCalled();
    },
  );

  it.each(["Ongoing", "Finished"] as const)("rejects updatePlayer/deletePlayer when the event is %s", async (status) => {
    prisma.player.findUnique.mockResolvedValue({
      id: "player-1",
      team: { captainId: "captain-1", eventId: "event-1" },
    });
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));

    await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" })).rejects.toThrow(
      "Roster tim sudah terkunci",
    );
    await expect(deletePlayer("player-1", "captain-1")).rejects.toThrow(
      "Roster tim sudah terkunci",
    );
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.delete).not.toHaveBeenCalled();
  });

  it.each(["single_elimination", "double_elimination", "round_robin", "group_playoffs"])(
    "locks player roster edits after a %s drawing is published",
    async () => {
      prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
      prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status: "Registration Closed" }));
      prisma.competitionPhase.count.mockResolvedValue(1);

      await expect(addPlayer({
        teamId: "team-1", eventId: "event-1", displayName: "Late Player", nickname: "Late",
      })).rejects.toThrow("Roster tim sudah terkunci");
      expect(prisma.player.create).not.toHaveBeenCalled();
    },
  );

  it("still enforces ownership for a manipulated player ID before checking status or writing", async () => {
    prisma.player.findUnique.mockResolvedValue({
      id: "player-b",
      team: { captainId: "other-captain", eventId: "event-1" },
    });

    await expect(updatePlayer("player-b", "captain-1", { displayName: "Updated" })).rejects.toThrow(
      "Not authorized to edit this player.",
    );
    await expect(deletePlayer("player-b", "captain-1")).rejects.toThrow(
      "Not authorized to delete this player.",
    );
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.delete).not.toHaveBeenCalled();
  });
});