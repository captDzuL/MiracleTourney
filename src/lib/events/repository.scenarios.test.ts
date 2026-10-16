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

import { getPublicDiscoveryEvents, getManageableEventsForUser, getManageableEventDraft, setEventStatus, updateEventPublicInfo, updatePublishedEventSlugAsAdmin } from "@/lib/events/repository";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { updateTeamLogo } from "@/lib/teams/repository";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

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

describe("event lifecycle status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it("revokes every active preview token atomically on an explicit status transition", async () => {
    prisma.event.update.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Event",
      logoUrl: null, gameImageUrl: null, gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", status: "Draft", participantCap: 16,
      registrationWindow: "TBD", startsAt: "TBD", venue: "Online", stream: null,
    });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(setEventStatus("event-1", "Draft")).resolves.toMatchObject({ status: "Draft" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("discards an active revision when status becomes Ongoing", async () => {
    prisma.event.update.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Event",
      logoUrl: null, gameImageUrl: null, gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", status: "Ongoing", participantCap: 16,
      registrationWindow: "TBD", startsAt: "TBD", venue: "Online", stream: null, activeVisualAsset: null,
    });
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });
    await setEventStatus("event-1", "Ongoing");
    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "Draft" },
      data: { status: "Discarded", discardedAt: expect.any(Date), discardReason: "event_started" },
    });
  });

  it("lets only platform admins change a published slug while preserving the old URL", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1", slug: "old-slug" })
      .mockResolvedValueOnce(null);
    prisma.eventSlugRedirect.findUnique.mockResolvedValue(null);
    prisma.eventSlugRedirect.create.mockResolvedValue({ id: "redirect-1" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });
    await expect(updatePublishedEventSlugAsAdmin(platformAdmin, "event-1", "new-slug"))
      .resolves.toEqual({ oldSlug: "old-slug", slug: "new-slug" });
    expect(prisma.eventSlugRedirect.create).toHaveBeenCalledWith({ data: { oldSlug: "old-slug", eventId: "event-1" } });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" }, data: { slug: "new-slug", publishedRevision: { increment: 1 } },
    });
    await expect(updatePublishedEventSlugAsAdmin(organizer, "event-1", "nope"))
      .rejects.toThrow("Not authorized");
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
      include: { stream: true, activeVisualAsset: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("allows platform admin to read all manageable events", async () => {
    await getManageableEventsForUser(platformAdmin);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      include: { stream: true, activeVisualAsset: true },
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

  it("loads draft workspace data only through the organizer ownership filter", async () => {
    prisma.event.findFirst.mockResolvedValue({
      id: "event-1", slug: "owned-event", name: "Owned Event", description: "Owned", gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", formatConfig: null, participantCap: 8, registrationOpensAt: null,
      registrationClosesAt: null, eventStartsAt: null, timezone: "Asia/Jakarta", venue: "Online", venueAddress: null,
      registrationFeeRequired: false, registrationFeeAmount: null, logoUrl: null, gameImageUrl: null,
      draftRevision: 3, status: "Draft", organizer: { organizerProfile: null },
    });

    await expect(getManageableEventDraft(organizer, "event-1")).resolves.toEqual(expect.objectContaining({
      id: "event-1", name: "Owned Event", formatConfig: null, draftRevision: 3, status: "Draft",
    }));
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: expect.objectContaining({ id: true, name: true, draftRevision: true, organizer: expect.any(Object) }),
    });
  });

  it("lets platform admins load a draft without an organizer ownership filter", async () => {
    prisma.event.findFirst.mockResolvedValue({
      id: "event-1", name: "Owned Event", formatConfig: null, draftRevision: 3, status: "Draft",
    });

    await getManageableEventDraft(platformAdmin, "event-1");

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1" },
      select: expect.objectContaining({ id: true, name: true, draftRevision: true, organizer: expect.any(Object) }),
    });
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
      include: { stream: true, activeVisualAsset: true },
    });
  });
});

describe("public discovery V3 reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("separates guarded connection, query, and mapping stages without logging event data", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const lines: string[] = [];
    const logger = vi.spyOn(console, "info").mockImplementation((line: string) => { lines.push(line); });
    let finishConnect: (() => void) | undefined;
    prisma.$connect.mockImplementation(() => new Promise<void>((resolve) => { finishConnect = resolve; }));
    prisma.event.findMany.mockResolvedValue([{ ...publishedEventRow({ id: "private-event-id", name: "private-event-name" }), updatedAt: new Date("2026-09-12T10:00:00.000Z"), competitionPhases: [], matches: [], promotions: [], _count: { teams: 0 } }]);
    try {
      const pending = getPublicDiscoveryEvents();
      expect(prisma.event.findMany).not.toHaveBeenCalled();
      finishConnect?.();
      await expect(pending).resolves.toHaveLength(1);
      expect(lines.map((line) => line.split(" ms=")[0])).toEqual([
        "[public-v3-discovery] connect-start", "[public-v3-discovery] connect-done",
        "[public-v3-discovery] query-start", "[public-v3-discovery] query-done", "[public-v3-discovery] map-done",
      ]);
      expect(lines.every((line) => /^\[public-v3-discovery\] (connect-start|query-start|(connect-done|query-done|map-done) ms=\d{1,5})$/.test(line))).toBe(true);
      expect(lines.join(" ")).not.toMatch(/private-event/);
    } finally { logger.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("returns public database events with drawing, live, count, and freshness metadata", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        ...publishedEventRow({ id: "event-1", status: "Ongoing" }),
        updatedAt: new Date("2026-09-12T10:00:00.000Z"),
        competitionPhases: [{ status: "active" }],
        matches: [{ id: "match-live" }],
        promotions: [],
        _count: { teams: 12 },
      },
    ]);
    const now = new Date("2026-10-11T08:00:00.000Z");

    await expect(getPublicDiscoveryEvents(now)).resolves.toEqual([
      expect.objectContaining({
        event: expect.objectContaining({ id: "event-1", status: "Ongoing" }),
        phaseStatus: "active",
        hasLiveMatch: true,
        teamCount: 12,
        updatedAt: "2026-09-12T10:00:00.000Z",
        pinnedFeatured: false,
      }),
    ]);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      relationLoadStrategy: "join",
      where: { status: { in: ["Published", "Registration Closed", "Ongoing", "Finished"] } },
      include: {
        stream: true,
        activeVisualAsset: true,
        competitionPhases: { where: { sequence: 1 }, select: { status: true }, take: 1 },
        matches: { where: { status: "Live" }, select: { id: true }, take: 1 },
        promotions: { where: { type: "featured", active: true, startsAt: { lte: now }, endsAt: { gte: now } }, select: { id: true }, take: 1 },
        _count: { select: { teams: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
    });
  });

  it("marks an event pinned when it has an active featured promotion", async () => {
    prisma.event.findMany.mockResolvedValue([
      { ...publishedEventRow({ id: "event-1", status: "Ongoing" }), updatedAt: new Date("2026-09-12T10:00:00.000Z"), competitionPhases: [], matches: [], promotions: [{ id: "promo-1" }], _count: { teams: 4 } },
    ]);

    await expect(getPublicDiscoveryEvents()).resolves.toEqual([expect.objectContaining({ pinnedFeatured: true })]);
  });

  it("rejects database failures instead of returning fixture events", async () => {
    prisma.event.findMany.mockRejectedValue(new Error("database unavailable"));
    await expect(getPublicDiscoveryEvents()).rejects.toThrow("database unavailable");
  });
});