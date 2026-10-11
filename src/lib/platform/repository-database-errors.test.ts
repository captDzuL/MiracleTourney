import { beforeEach, describe, expect, it, vi } from "vitest";

// PR 0.6: when the database fails, repository functions pass the error on. They no longer fall back to demo data,
// which showed made-up events, hid failed saves and cached the made-up data (see docs/refactor/demo-fallback-decision.md).

const failure = new Error("database unavailable");

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventVisualAsset: { findMany: vi.fn() },
    team: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn(), update: vi.fn() },
    player: { findMany: vi.fn() },
    match: { findMany: vi.fn() },
    playerStat: { findMany: vi.fn() },
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  getBracketPreview,
  getEventBySlug,
  getEventsByIds,
  getLeaderboardForEvent,
  getMatchesForEvent,
  getPlayersForEvent,
  getPlayersForTeam,
  getPlayersForTeams,
  getPublicEventBySlug,
  getPublicEvents,
  getPublicVisibleBracketPreview,
  getTeamCountsForEvents,
  getTeamsForEvent,
  getTeamsForEvents,
  listEventVisualAssets,
  updateCaptainTeamLogo,
  updateEventBrandAssets,
  updateEventPublicInfo,
  updateTeamLogo,
} from "./repository";

// Slugs and ids that exist in the demo data. Before PR 0.6 these were answered from made-up data when the database failed.
const DEMO_EVENT_ID = "event-kuroko-summer";
const DEMO_SLUG = "kuroko-summer-cup";
const admin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };

beforeEach(() => {
  vi.resetAllMocks();
  for (const model of Object.values(prisma)) {
    for (const method of Object.values(model)) method.mockRejectedValue(failure);
  }
});

describe("readers pass the database error on", () => {
  it.each([
    ["getEventsByIds", () => getEventsByIds([DEMO_EVENT_ID])],
    ["getPublicEvents", () => getPublicEvents()],
    ["getEventBySlug", () => getEventBySlug(DEMO_SLUG)],
    ["getPublicEventBySlug", () => getPublicEventBySlug(DEMO_SLUG)],
    ["listEventVisualAssets", () => listEventVisualAssets(admin, DEMO_EVENT_ID)],
    ["getTeamsForEvent", () => getTeamsForEvent(DEMO_EVENT_ID)],
    ["getTeamsForEvents", () => getTeamsForEvents([DEMO_EVENT_ID])],
    ["getTeamCountsForEvents", () => getTeamCountsForEvents([DEMO_EVENT_ID])],
    ["getPlayersForTeam", () => getPlayersForTeam("team-seirin")],
    ["getPlayersForTeams", () => getPlayersForTeams(["team-seirin"])],
    ["getPlayersForEvent", () => getPlayersForEvent(DEMO_EVENT_ID)],
    ["getMatchesForEvent", () => getMatchesForEvent(DEMO_EVENT_ID)],
    ["getBracketPreview", () => getBracketPreview(DEMO_EVENT_ID)],
    ["getPublicVisibleBracketPreview", () => getPublicVisibleBracketPreview(DEMO_EVENT_ID)],
  ])("%s rejects instead of returning demo data", async (_name, call) => {
    await expect(call()).rejects.toThrow("database unavailable");
  });

  describe("getLeaderboardForEvent", () => {
    it("rejects when the game lookup fails", async () => {
      await expect(getLeaderboardForEvent(DEMO_EVENT_ID)).rejects.toThrow("database unavailable");
    });

    it("rejects when the player lookup fails", async () => {
      await expect(getLeaderboardForEvent(DEMO_EVENT_ID, "game-kuroko")).rejects.toThrow("database unavailable");
    });

    it("rejects when the stat lookup fails", async () => {
      prisma.player.findMany.mockResolvedValue([{ id: "player-1" }]);

      await expect(getLeaderboardForEvent(DEMO_EVENT_ID, "game-kuroko")).rejects.toThrow("database unavailable");
    });
  });

  it("does not remember a failure: the next call asks the database again", async () => {
    await expect(getTeamsForEvent(DEMO_EVENT_ID)).rejects.toThrow("database unavailable");
    prisma.team.findMany.mockResolvedValue([]);

    await expect(getTeamsForEvent(DEMO_EVENT_ID)).resolves.toEqual([]);
  });
});

describe("writers pass the database error on", () => {
  it("updateEventPublicInfo rejects with the database error, not 'Not authorized'", async () => {
    await expect(updateEventPublicInfo(admin, DEMO_EVENT_ID, { description: "x", registrationWindow: "Open", startsAt: "2026-12-01", venue: "Online" })).rejects.toThrow("database unavailable");
  });

  it("updateTeamLogo rejects with the database error, not 'Not authorized'", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: DEMO_EVENT_ID });

    await expect(updateTeamLogo(admin, "team-1", "/logo.png")).rejects.toThrow("database unavailable");
  });

  it("updateCaptainTeamLogo rejects with the database error, not 'Not authorized'", async () => {
    await expect(updateCaptainTeamLogo("captain-1", "team-1", "/logo.png")).rejects.toThrow("database unavailable");
  });

  it("updateEventBrandAssets rejects instead of pretending the logo was saved", async () => {
    await expect(updateEventBrandAssets(DEMO_EVENT_ID, { logoUrl: "/logo.png" })).rejects.toThrow("database unavailable");
  });

  it("keeps 'Not authorized' for a captain who does not own the team", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(updateCaptainTeamLogo("captain-1", "team-1", "/logo.png")).rejects.toThrow("Not authorized");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});
