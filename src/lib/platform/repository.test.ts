import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    eventRoundConfig: {
      findMany: vi.fn(),
    },
    matchGame: {
      findMany: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  assertUserCanManageEvent,
  assertCaptainCanSubmitStats,
  getEventRoundConfigs,
  getLeaderboardForEvent,
  getManageableEventsForUser,
  getMatchGamesForEvent,
  getMatchesForEvent,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  getTeamsForEvent,
} from "./repository";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

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

describe("organizer event ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "owned-event",
        name: "Owned Event",
        description: "Owned",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Draft",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: "org-1",
        organizerName: "Organizer",
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
      },
    ]);
  });

  it("filters manageable events to the authenticated organizer", async () => {
    await expect(getManageableEventsForUser(organizer)).resolves.toEqual([
      expect.objectContaining({ id: "event-1", organizerUserId: "org-1" }),
    ]);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { organizerUserId: "org-1" },
      include: { stream: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("allows platform admin to read all manageable events", async () => {
    await getManageableEventsForUser(platformAdmin);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      include: { stream: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("allows an organizer to manage only their own event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(assertUserCanManageEvent(organizer, "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
  });

  it("rejects an organizer managing someone else's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(assertUserCanManageEvent(organizer, "event-other")).rejects.toThrow("Not authorized");
  });
});

describe("public demo fallback reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockRejectedValue(new Error("database unavailable"));
    prisma.event.findUnique.mockRejectedValue(new Error("database unavailable"));
    prisma.team.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.match.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.eventRoundConfig.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.matchGame.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.player.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.playerStat.findMany.mockRejectedValue(new Error("database unavailable"));
  });

  it("resolves a public demo event by slug when Prisma cannot connect", async () => {
    await expect(getPublicEventBySlug("kuroko-summer-cup")).resolves.toMatchObject({
      id: "event-kuroko-summer",
      slug: "kuroko-summer-cup",
      status: "Ongoing",
    });
  });

  it("resolves demo teams and matches for public demo event pages when Prisma cannot connect", async () => {
    await expect(getTeamsForEvent("event-kuroko-summer")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "team-seirin", name: "Seirin" }),
      ]),
    );
    await expect(getMatchesForEvent("event-kuroko-summer")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "match-kuroko-1", status: "Completed" }),
      ]),
    );
  });

  it("resolves demo public bracket projection when Prisma cannot connect", async () => {
    const preview = await getPublicVisibleBracketPreview("event-kuroko-summer");

    expect(preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringContaining("bracket-") }),
      ]),
    );
  });

  it("resolves empty bracket metadata when Prisma cannot connect", async () => {
    await expect(getEventRoundConfigs("event-kuroko-summer")).resolves.toEqual([]);
    await expect(getMatchGamesForEvent("event-kuroko-summer")).resolves.toEqual(new Map());
  });

  it("resolves demo leaderboard when Prisma cannot connect", async () => {
    await expect(getLeaderboardForEvent("event-kuroko-summer", "game-kuroko")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerName: "Taiga Kagami" }),
      ]),
    );
  });
});
