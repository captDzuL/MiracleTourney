import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  registration: vi.fn(),
  drawing: vi.fn(),
  ongoing: vi.fn(),
  finished: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: { event: { findUnique: mocks.eventFindUnique } },
}));
vi.mock("./public-registration", () => ({ readPublicRegistration: mocks.registration }));
vi.mock("./public-drawing", () => ({ readPublicDrawing: mocks.drawing }));
vi.mock("./public-ongoing", () => ({ readPublicOngoing: mocks.ongoing, getPublicOngoingEvent: mocks.ongoing }));
vi.mock("./public-finished", () => ({ readPublicFinished: mocks.finished }));

import {
  projectCompatiblePublicV3Event,
  readPublicV3Event,
} from "./public-v3-read";
import type { CompatiblePublicEventInput } from "./public-v3-types";

const baseEvent = {
  id: "event-1",
  slug: "miracle-cup",
  name: "Miracle Cup",
  description: "A public event",
  gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5",
  format: "Single Elimination",
  status: "Ongoing",
  participantCap: 16,
  registrationWindow: "1–20 September 2026",
  startsAt: "2026-09-20T02:00:00.000Z",
  eventStartsAt: new Date("2026-09-20T02:00:00.000Z"),
  registrationOpensAt: new Date("2026-09-01T00:00:00.000Z"),
  registrationClosesAt: new Date("2026-09-19T00:00:00.000Z"),
  timezone: "Asia/Jakarta",
  venue: "Arena",
  venueAddress: null,
  organizerName: "Flash Peak Organizer",
  organizerVerified: true,
  prizePoolLabel: "Rp5.000.000",
};

const viewer = { id: "captain-1", email: "captain@example.test", name: "Captain", role: "captain" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindUnique.mockResolvedValue(baseEvent);
  for (const reader of [mocks.registration, mocks.drawing, mocks.ongoing, mocks.finished]) reader.mockResolvedValue(null);
});

describe("normalized public V3 event reader", () => {
  it("prefers the authoritative reader when a complete V3 lifecycle view exists", async () => {
    mocks.ongoing.mockResolvedValue({
      mode: "ongoing",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      matches: [], liveMatches: [], nextMatches: [], recentResults: [], standings: [], announcements: [], stream: null,
      schedule: null, leaderboardHref: "/events/miracle-cup/leaderboards", stateVersion: "state-1", lastUpdatedAt: "2026-09-20T02:00:00.000Z",
    });

    const view = await readPublicV3Event("miracle-cup", viewer, new Date("2026-09-20T03:00:00.000Z"));

    expect(view).toMatchObject({
      source: "authoritative",
      mode: "ongoing",
      identity: {
        slug: "miracle-cup",
        title: "Miracle Cup",
        game: { id: "game-flashpeak" },
        organizer: { name: "Flash Peak Organizer", verified: true },
        facts: { participantCap: 16, venue: "Arena" },
        navigation: { overview: true, participants: true, schedule: true, bracket: true, leaderboard: true },
      },
    });
    expect(mocks.ongoing).toHaveBeenCalledWith("miracle-cup", expect.any(Date));
    expect(mocks.registration).not.toHaveBeenCalled();
  });

  it("projects a legacy event without CompetitionPhase as honest TBD drawing slots", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Registration Closed" },
      teams: [
        { id: "team-a", name: "Alpha" },
        { id: "team-b", name: "Beta" },
      ],
      matches: [],
    });

    expect(view).toMatchObject({ source: "compatible", mode: "drawing", identity: { slug: "miracle-cup" } });
    if (view.mode !== "drawing") throw new Error("Expected drawing projection");
    expect(view.drawing.published).toBe(false);
    expect(view.drawing.slots.every((slot) => slot.home === "TBD" && slot.away === "TBD")).toBe(true);
    expect(view.drawing.seeds).toEqual([]);
  });

  it("keeps finished certificates in preparing state when the current publication is missing", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Finished" },
      completion: {
        id: "completion-1",
        status: "completed",
        sourceSnapshot: { version: 4 },
        podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }],
        awards: [{ type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: null } }],
      },
      certificates: [],
      publication: null,
    });

    expect(view).toMatchObject({ source: "compatible", mode: "finished" });
    if (view.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.certificates).toMatchObject({ status: "preparing", publishedCount: 0, expectedCount: 7, isCurrent: false, isComplete: false });
    expect(view.podium[0]?.certificate).toBeNull();
    expect(view.awards[0]?.certificate).toBeNull();
  });

  it("returns null for an unknown slug without trying any lifecycle reader", async () => {
    mocks.eventFindUnique.mockResolvedValue(null);

    await expect(readPublicV3Event("missing", viewer)).resolves.toBeNull();
    expect(mocks.registration).not.toHaveBeenCalled();
    expect(mocks.drawing).not.toHaveBeenCalled();
    expect(mocks.ongoing).not.toHaveBeenCalled();
    expect(mocks.finished).not.toHaveBeenCalled();
  });

  it("accepts legacy goals and assists aliases without treating blocks or tackles as defense", () => {
    const input: CompatiblePublicEventInput = {
      event: { ...baseEvent, status: "Ongoing" },
      leaderboard: [{
        playerId: "p1", playerName: "Nyx", nickname: "Nyx", teamId: "team-a", teamName: "Alpha", position: "Forward", game: 2,
        stats: { goals: 3, assists: 4, blocks: 99, tackles: 88 },
      }],
    };
    const view = projectCompatiblePublicV3Event(input);
    if (view.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.leaderboard[0]).toMatchObject({ goal: 3, assist: 4, passing: 0, defense: 0 });
  });
});
