import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
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
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    registrationImportBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    registrationImportItem: {
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
    },
    certificate: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
  getEventsByIds,
  getLeaderboardForEvent,
  getManageableEventsForUser,
  getMatchGamesForEvent,
  getMatchesForEvent,
  getOrganizerUserById,
  getOrganizerUsers,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  commitRegistrationImportBatch,
  getTeamCountsForEvents,
  getTeamsForEvent,
  getTeamsForEvents,
  updateEventPublicInfo,
  updateTeamLogo,
} from "./repository";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

describe("organizer user lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizer accounts for platform-admin event assignment", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    await expect(getOrganizerUsers()).resolves.toEqual([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "organizer" },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true },
    });
  });

  it("finds only organizer accounts by id", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    await expect(getOrganizerUserById("org-1")).resolves.toEqual({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "org-1", role: "organizer" },
      select: { id: true, email: true, name: true, role: true },
    });
  });
});

describe("registration intake commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", slug: "redclover-cup", format: "Single Elimination" });
    prisma.match.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") return callback(prisma);
      return callback;
    });
  });

  it("creates teams, players, and only exports credentials for newly created captain accounts", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-new",
          status: "new",
          normalizedData: {
            teamName: "Gamma",
            teamTag: "GAM",
            captainName: "Gina",
            captainContact: "081",
            captainEmail: "gina@example.com",
            players: [{ nickname: "Gina", displayName: "Gina", position: "Unassigned" }],
          },
        },
        {
          id: "item-existing",
          status: "changed",
          teamId: "team-alpha",
          normalizedData: {
            teamName: "Alpha",
            teamTag: "ALP",
            captainName: "Alya",
            captainContact: "082",
            captainEmail: "alya@example.com",
            players: [{ nickname: "Alya", displayName: "Alya", position: "Guard" }],
          },
        },
      ],
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "captain-existing", email: "alya@example.com", role: "captain", name: "Alya" });
    prisma.user.create.mockResolvedValue({ id: "captain-new", email: "gina@example.com", role: "captain", name: "Gina" });
    prisma.team.create.mockResolvedValue({ id: "team-gamma" });
    prisma.team.update.mockResolvedValue({ id: "team-alpha" });

    const result = await commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new", "item-existing"]);

    expect(result.importedCount).toBe(2);
    expect(result.credentials).toHaveLength(1);
    expect(result.credentials[0]).toMatchObject({
      teamName: "Gamma",
      teamTag: "GAM",
      captainName: "Gina",
      email: "gina@example.com",
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.team.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ captainId: "captain-new", source: "registration-intake" }),
    }));
    expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "team-alpha" },
      data: expect.objectContaining({ captainId: "captain-existing" }),
    }));
    expect(prisma.player.deleteMany).toHaveBeenCalledWith({ where: { teamId: "team-alpha" } });
    expect(prisma.player.createMany).toHaveBeenCalledTimes(2);
  });

  it("rejects a selected row when the captain email belongs to a non-captain user", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-staff",
          status: "new",
          normalizedData: {
            teamName: "Staff",
            teamTag: "STF",
            captainName: "Staff",
            captainContact: "081",
            captainEmail: "staff@example.com",
            players: [{ nickname: "Staff", displayName: "Staff", position: "Unassigned" }],
          },
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "organizer-1", email: "staff@example.com", role: "organizer", name: "Staff" });

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-staff"]))
      .rejects.toThrow("Email kapten sudah dipakai akun non-captain.");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("blocks commits after the event has recorded match results", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [],
    });
    prisma.match.count.mockResolvedValue(1);

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", []))
      .rejects.toThrow("already has recorded match results");
  });
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

  it("updates a team logo only when the organizer owns the team's event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.team.update.mockResolvedValue({
      id: "team-1",
      eventId: "event-1",
      captainId: null,
      name: "Logo Squad",
      logoText: "LS",
      logoUrl: "/team-logos/team-1.png",
      tag: "LOG",
      captainName: null,
      captainContact: null,
      source: "demo",
    });

    await expect(updateTeamLogo(organizer, "team-1", "/team-logos/team-1.png")).resolves.toMatchObject({
      id: "team-1",
      logoUrl: "/team-logos/team-1.png",
    });

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: { id: true, eventId: true },
    });
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { logoUrl: "/team-logos/team-1.png" },
    });
  });

  it("rejects a team logo update when the organizer does not own the team's event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-other" });
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(updateTeamLogo(organizer, "team-1", "/team-logos/team-1.png")).rejects.toThrow("Not authorized");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("updates public event info only after ownership is verified", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.update.mockResolvedValue({
      id: "event-1",
      slug: "owned-event",
      name: "Owned Event",
      description: "Fresh public description",
      logoUrl: null,
      gameImageUrl: null,
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      status: "Published",
      participantCap: 8,
      registrationWindow: "Aug 20 - Aug 28",
      startsAt: "Aug 30, 2026",
      venue: "Online",
      organizerUserId: "org-1",
      organizerName: "Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp1.000.000",
      registrationFeeLabel: null,
      registrationUrl: null,
      characterArtUrl: null,
      accentColor: null,
      stream: null,
    });

    const result = await updateEventPublicInfo(organizer, "event-1", {
      description: "Fresh public description",
      registrationWindow: "Aug 20 - Aug 28",
      startsAt: "Aug 30, 2026",
      venue: "Online",
      prizePoolLabel: "Rp1.000.000",
      registrationFeeLabel: null,
      registrationUrl: null,
    });

    expect(result).toMatchObject({
      id: "event-1",
      prizePoolLabel: "Rp1.000.000",
    });
    expect(result).not.toHaveProperty("registrationFeeLabel");

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        description: "Fresh public description",
        registrationWindow: "Aug 20 - Aug 28",
        startsAt: "Aug 30, 2026",
        venue: "Online",
        prizePoolLabel: "Rp1.000.000",
        registrationFeeLabel: null,
        registrationUrl: null,
      },
      include: { stream: true },
    });
  });
});

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
      include: { stream: true },
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
        expect.objectContaining({ id: expect.stringMatching(/^event-kuroko-summer-r\d+-m\d+$/) }),
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
