import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  teamFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  playerStatFindMany: vi.fn(),
  eventAnnouncementFindMany: vi.fn(),
  registration: vi.fn(),
  drawing: vi.fn(),
  ongoing: vi.fn(),
  finished: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findUnique: mocks.eventFindUnique },
    team: { findMany: mocks.teamFindMany },
    player: { findMany: mocks.playerFindMany },
    playerStat: { findMany: mocks.playerStatFindMany },
    eventAnnouncement: { findMany: mocks.eventAnnouncementFindMany },
  },
}));
vi.mock("./public-registration", () => ({ readPublicRegistration: mocks.registration }));
vi.mock("./public-drawing", () => ({ readPublicDrawing: mocks.drawing }));
vi.mock("./public-ongoing", () => ({ readPublicOngoing: mocks.ongoing, getPublicOngoingEvent: mocks.ongoing }));
vi.mock("./public-finished", () => ({ readPublicFinished: mocks.finished }));

import {
  projectCompatiblePublicV3Event,
  projectPublicHomeFeaturedEvent,
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
  mocks.teamFindMany.mockResolvedValue([]);
  mocks.playerFindMany.mockResolvedValue([]);
  mocks.playerStatFindMany.mockResolvedValue([]);
  mocks.eventAnnouncementFindMany.mockResolvedValue([]);
  for (const reader of [mocks.registration, mocks.drawing, mocks.ongoing, mocks.finished]) reader.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalized public V3 event reader", () => {
  it("shows only the organizer profile's explicitly public contact on the event view", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Published", organizer: { organizerProfile: {
      contactChannel: "WhatsApp", contactValue: "+62 812 3456 7890", organizationName: "Miracle Community",
    }, email: "private@example.test" } });
    const view = await readPublicV3Event("miracle-cup", null);
    expect(view?.organizer).toMatchObject({ contactChannel: "WhatsApp", contactValue: "+62 812 3456 7890" });
    expect(mocks.eventFindUnique).toHaveBeenCalledWith({ where: { slug: "miracle-cup" }, include: {
      organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } },
    } });
    expect(JSON.stringify(view)).not.toContain("private@example.test");

    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Published", organizer: { email: "private@example.test", organizerProfile: null } });
    const withoutPublicContact = await readPublicV3Event("miracle-cup", null);
    expect(withoutPublicContact?.organizer.contactValue).toBe("");
    expect(JSON.stringify(withoutPublicContact)).not.toContain("private@example.test");
  });

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
    if (!view) throw new Error("expected public view");
    const home = projectPublicHomeFeaturedEvent(view);
    expect(home).toMatchObject({ source: "authoritative", mode: "ongoing", identity: { slug: "miracle-cup" } });
    expect(home).not.toHaveProperty("leaderboard");
    expect(home).not.toHaveProperty("standings");
    expect(home).not.toHaveProperty("updates");
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

  it("projects participant-cap-sized TBD positions for compatible registration", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Published", participantCap: 8 },
    });

    expect(view).toMatchObject({ source: "compatible", mode: "registration" });
    if (view.mode !== "registration") throw new Error("Expected registration projection");
    expect(view.registration.bracket.slots).toHaveLength(8);
    expect(view.registration.bracket.slots.every((slot) => slot.home === "TBD" && slot.away === "TBD" && slot.status === "tbd")).toBe(true);
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
    expect(view.awards).toMatchObject([{ type: "mvp", recipientId: "p1", certificate: null }]);
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


  it("maps authoritative drawing data into explicit normalized fields", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Registration Closed" });
    mocks.drawing.mockResolvedValue({
      mode: "drawing",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      drawing: { published: true, seeds: [{ teamId: "team-a", teamName: "Alpha", seed: 1 }] },
      matches: [{ id: "match-1", roundLabel: "Final", home: "Alpha", away: "Beta", status: "scheduled", homeScore: null, awayScore: null, start: "2026-09-20T03:00:00.000Z", room: "A", bestOf: 3 }],
      standings: [{ phaseId: "phase-1", groupId: null, rows: [{ teamId: "team-a", name: "Alpha" }] }],
      schedule: { version: 2, publishedAt: "2026-09-19T12:00:00.000Z" },
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "drawing") throw new Error("Expected drawing projection");
    expect(view.matches[0]).toMatchObject({ id: "match-1", roundLabel: "Final", home: "Alpha", away: "Beta", official: false, end: null });
    expect(view.drawing.seeds).toEqual([{ teamId: "team-a", teamName: "Alpha", seed: 1 }]);
    expect(view.standings).toEqual([{ phaseId: "phase-1", groupId: null, rows: [{ teamId: "team-a", name: "Alpha" }] }]);
    expect(view.schedule).toEqual({ version: 2, publishedAt: "2026-09-19T12:00:00.000Z" });
  });

  it("maps authoritative ongoing data into explicit normalized fields", async () => {
    mocks.ongoing.mockResolvedValue({
      mode: "ongoing",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      matches: [{ id: "match-1", home: "Alpha", away: "Beta", round: 2, phaseId: "phase-1", groupId: null, groupNumber: null, isPlayoff: true, bracket: "final", bestOf: 3, status: "completed", start: "2026-09-20T03:00:00.000Z", end: "2026-09-20T04:00:00.000Z", room: "A", scheduledLabel: null, homeScore: 2, awayScore: 1, resultVersion: 1, confirmedAt: "2026-09-20T04:01:00.000Z" }],
      liveMatches: [], nextMatches: [], recentResults: [],
      schedule: { version: 2, publishedAt: "2026-09-19T12:00:00.000Z", changes: [] },
      standings: [{ phaseId: "phase-1", groupId: null, groupNumber: null, label: "Final", complete: true, qualificationCutline: null, rows: [{ teamId: "team-a", name: "Alpha" }] }],
      leaderboard: [{ playerId: "p1", playerName: "Nyx", nickname: "Nyx", teamId: "team-a", teamName: "Alpha", position: "Forward", game: 1, score: 8, goal: 2, assist: 1, passing: 3, defense: 4 }],
      stream: null, stateVersion: "state-1", lastUpdatedAt: "2026-09-20T04:01:00.000Z",
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.matches[0]).toMatchObject({ id: "match-1", roundLabel: "Round 2", home: "Alpha", away: "Beta", status: "completed", homeScore: 2, awayScore: 1, end: "2026-09-20T04:00:00.000Z", official: true });
    expect(view.recentResults[0]?.id).toBe("match-1");
    expect(view.leaderboard[0]).toMatchObject({ playerId: "p1", score: 8, goal: 2, assist: 1, passing: 3, defense: 4 });
    expect(view.schedule).toEqual({ version: 2, publishedAt: "2026-09-19T12:00:00.000Z", changes: [] });
    expect(view.standings[0]).toMatchObject({ phaseId: "phase-1", rows: [{ teamId: "team-a", name: "Alpha" }] });
  });

  it("preserves published match context for group standings and playoff brackets", async () => {
    mocks.ongoing.mockResolvedValue({
      mode: "ongoing",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "group_playoffs" },
      matches: [
        { id: "group-1", home: "Alpha", away: "Beta", round: 1, phaseId: "phase-groups", groupId: "group-a", groupNumber: 1, isPlayoff: false, bracket: "round_robin", status: "completed", start: "2026-09-20T03:00:00.000Z", end: "2026-09-20T04:00:00.000Z", homeScore: 2, awayScore: 0, resultVersion: 1 },
        { id: "playoff-1", home: "Alpha", away: "Gamma", round: 1, phaseId: "phase-playoffs", groupId: null, groupNumber: null, isPlayoff: true, bracket: "single", status: "scheduled", start: "2026-09-21T03:00:00.000Z", end: null, homeScore: null, awayScore: null, resultVersion: 0 },
      ],
      liveMatches: [], nextMatches: [], recentResults: [], schedule: null,
      standings: [{ phaseId: "phase-groups", groupId: "group-a", groupNumber: 1, label: "Group A", complete: true, qualificationCutline: 2, rows: [{ teamId: "team-a", name: "Alpha", rank: 1, played: 1, points: 3 }] }],
      leaderboard: [], stream: null, stateVersion: "state-1", lastUpdatedAt: "2026-09-20T04:00:00.000Z",
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.matches).toMatchObject([
      { id: "group-1", round: 1, phaseId: "phase-groups", groupId: "group-a", groupNumber: 1, isPlayoff: false, bracket: "round_robin" },
      { id: "playoff-1", round: 1, phaseId: "phase-playoffs", groupId: null, isPlayoff: true, bracket: "single" },
    ]);
    expect(view.standings[0]).toMatchObject({ groupId: "group-a", groupNumber: 1, label: "Group A" });
  });

  it("preserves published match context for finished bracket output", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Finished" });
    mocks.finished.mockResolvedValue({
      mode: "finished",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      certificates: { status: "preparing", publishedCount: 0, expectedCount: 7 },
      podium: [], awards: [],
      matches: [{ id: "final-1", round: 3, phaseId: "phase-final", groupId: null, isPlayoff: true, bracket: "grand_final", home: "Alpha", away: "Beta", status: "completed", start: "2026-09-20T03:00:00.000Z", end: "2026-09-20T04:00:00.000Z", homeScore: 3, awayScore: 1, resultVersion: 1 }],
      standings: [],
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.matches[0]).toMatchObject({ round: 3, phaseId: "phase-final", isPlayoff: true, bracket: "grand_final" });
  });

  it.each(["Published", "Registration Closed", "Ongoing", "Finished"] as const)("maps only active published announcements for %s", async status => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status });
    mocks.eventAnnouncementFindMany.mockResolvedValue([
      { id: "published", status: "published", title: "Published notice", body: "Visible body", publishedAt: new Date("2026-09-20T01:00:00.000Z"), startsAt: null, endsAt: null },
      { id: "draft", status: "draft", title: "Draft notice", body: "Hidden draft", publishedAt: null, startsAt: null, endsAt: null },
      { id: "future", status: "published", title: "Future notice", body: "Hidden future", publishedAt: new Date("2026-09-20T01:00:00.000Z"), startsAt: new Date("2026-09-21T00:00:00.000Z"), endsAt: null },
    ]);
    if (status === "Published") mocks.registration.mockResolvedValue({ mode: "registration", registration: {} });
    if (status === "Registration Closed") mocks.drawing.mockResolvedValue({ mode: "drawing", drawing: {}, matches: [], standings: [] });
    if (status === "Ongoing") mocks.ongoing.mockResolvedValue({ mode: "ongoing", matches: [], liveMatches: [], nextMatches: [], recentResults: [], standings: [], schedule: null, leaderboard: [], announcements: [], stream: null, stateVersion: "1", lastUpdatedAt: "2026-09-20T02:00:00.000Z" });
    if (status === "Finished") mocks.finished.mockResolvedValue({ mode: "finished", certificates: { status: "preparing", publishedCount: 0, expectedCount: 7 }, podium: [], awards: [], matches: [], standings: [] });

    const view = await readPublicV3Event("miracle-cup", viewer, new Date("2026-09-20T02:00:00.000Z"));

    expect(view?.updates).toEqual([{ id: "published", title: "Published notice", body: "Visible body", publishedAt: "2026-09-20T01:00:00.000Z" }]);
  });

  it("carries only persisted published announcements into a compatible overview", async () => {
    mocks.ongoing.mockResolvedValue(null);
    mocks.eventAnnouncementFindMany.mockResolvedValue([
      { id: "published", status: "published", title: "Saved notice", body: "Visible body", publishedAt: new Date("2026-09-20T01:00:00.000Z"), startsAt: null, endsAt: null },
      { id: "draft", status: "draft", title: "Draft notice", body: "Hidden draft", publishedAt: null, startsAt: null, endsAt: null },
    ]);

    const view = await readPublicV3Event("miracle-cup", viewer, new Date("2026-09-20T02:00:00.000Z"));

    expect(view?.source).toBe("compatible");
    expect(view?.updates).toEqual([{ id: "published", title: "Saved notice", body: "Visible body", publishedAt: "2026-09-20T01:00:00.000Z" }]);
  });

  it("keeps an authoritative event page available when announcements fail", async () => {
    const announcementFailure = new Error("database unavailable secret@example.test token=announcement-token query=SELECT");
    mocks.eventAnnouncementFindMany.mockRejectedValueOnce(announcementFailure);
    mocks.ongoing.mockResolvedValue({
      mode: "ongoing",
      matches: [], liveMatches: [], nextMatches: [], recentResults: [], standings: [], leaderboard: [],
      schedule: null, announcements: [], stream: null, stateVersion: "state-1", lastUpdatedAt: "2026-09-20T02:00:00.000Z",
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const view = await readPublicV3Event("miracle-cup", viewer);

    expect(view).toMatchObject({ source: "authoritative", mode: "ongoing", updates: [] });
    const records = info.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
    const degradation = records.find(record => record.stage === "optional_announcements_ongoing");
    expect(degradation).toMatchObject({
      phase: "failed",
      operation: "public_event_read",
      route: expect.any(String),
      status: 500,
      terminal: "failed",
      errorCode: "internal_error",
      requestId: expect.any(String),
      resourceId: expect.stringMatching(/^sha256:/),
    });
    expect(JSON.stringify(degradation)).not.toMatch(/database unavailable|secret@example\.test|announcement-token|SELECT/);
  });

  it("keeps a compatible event page available when announcements fail", async () => {
    mocks.eventAnnouncementFindMany.mockRejectedValueOnce(new Error("announcement query failed"));
    mocks.ongoing.mockResolvedValue(null);

    const view = await readPublicV3Event("miracle-cup", viewer);

    expect(view).toMatchObject({ source: "compatible", mode: "ongoing", updates: [] });
  });

  it("publishes only completed compatible statistics for this event and a matching roster", async () => {
    mocks.ongoing.mockResolvedValue(null);
    mocks.teamFindMany.mockResolvedValue([{ id: "team-a", name: "Alpha" }, { id: "team-b", name: "Beta" }]);
    mocks.playerFindMany.mockResolvedValue([
      { id: "p1", displayName: "Nyx", nickname: "Nyx", teamId: "team-a", position: "Forward" },
      { id: "p2", displayName: "Lux", nickname: "Lux", teamId: "team-b", position: "Forward" },
    ]);
    const matches = new Map([
      ["completed", { eventId: "event-1", status: "Completed" }],
      ["live", { eventId: "event-1", status: "Live" }],
      ["scheduled", { eventId: "event-1", status: "Scheduled" }],
      ["foreign", { eventId: "other-event", status: "Completed" }],
    ]);
    const stats = [
      { matchId: "completed", playerId: "p1", playerName: "Nyx", teamId: "team-a" },
      { matchId: "live", playerId: "p1", playerName: "Nyx", teamId: "team-a" },
      { matchId: "scheduled", playerId: "p1", playerName: "Nyx", teamId: "team-a" },
      { matchId: "foreign", playerId: "p1", playerName: "Nyx", teamId: "team-a" },
      { matchId: "completed", playerId: "p2", playerName: "Lux", teamId: "team-a" },
    ].map((row) => ({ ...row, position: "Forward", gameSlug: "flashpeak", stats: { scores: [8], goal: 2, assist: 1, passing: 3, defense: 4 } }));
    mocks.playerStatFindMany.mockImplementation(async ({ where }: { where: { gameSlug: string; playerId: { in: string[] }; match?: { eventId: string; status: string } } }) => stats.filter((stat) => {
      const match = matches.get(stat.matchId);
      return stat.gameSlug === where.gameSlug && where.playerId.in.includes(stat.playerId)
        && (!where.match || (match?.eventId === where.match.eventId && match.status === where.match.status));
    }));

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.leaderboard).toMatchObject([{ playerId: "p1", nickname: "Nyx", game: 1, score: 8, goal: 2, assist: 1, passing: 3, defense: 4 }]);
    expect(view.leaderboard).toHaveLength(1);
  });

  it("does not project non-Flashpeak persisted stats into a compatible leaderboard", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Ongoing", gameId: "game-mobile-legends" });
    mocks.ongoing.mockResolvedValue(null);
    mocks.playerFindMany.mockResolvedValue([{ id: "p1", displayName: "Nyx", nickname: "Nyx", teamId: "team-a", position: "Mid Lane" }]);
    mocks.playerStatFindMany.mockResolvedValue([{ matchId: "match-1", playerId: "p1", playerName: "Nyx", teamId: "team-a", position: "Mid Lane", gameSlug: "mobile-legends", stats: { kills: 9, assists: 4, deaths: 1 } }]);

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.leaderboard).toEqual([]);
    expect(mocks.playerStatFindMany).not.toHaveBeenCalled();
  });

  it("propagates authoritative and event read failures", async () => {
    const readFailure = new Error("authoritative read failed");
    mocks.ongoing.mockRejectedValueOnce(readFailure);
    await expect(readPublicV3Event("miracle-cup", viewer)).rejects.toBe(readFailure);

    const databaseFailure = new Error("event query failed");
    mocks.eventFindUnique.mockRejectedValueOnce(databaseFailure);
    await expect(readPublicV3Event("miracle-cup", viewer)).rejects.toBe(databaseFailure);
  });


  it("maps published authoritative team and individual certificates into finished items", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Finished" });
    mocks.finished.mockResolvedValue({
      mode: "finished",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      certificates: { status: "published", publishedCount: 7, expectedCount: 7 },
      podium: [
        { rank: 1, teamId: "team-a", teamName: "Alpha", certificate: { publishedUrl: "https://cert/1", verificationCode: "CERT-1" } },
        { rank: 2, teamId: "team-b", teamName: "Beta", certificate: { publishedUrl: "https://cert/2", verificationCode: "CERT-2" } },
        { rank: 3, teamId: "team-c", teamName: "Gamma", certificate: { publishedUrl: "https://cert/3", verificationCode: "CERT-3" } },
      ],
      awards: [
        { type: "mvp", recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: "Final performance", certificate: { publishedUrl: "https://cert/4", verificationCode: "CERT-4" } },
        { type: "top_scorer", recipientId: "p2", recipientName: "Lux", teamId: "team-b", teamName: "Beta", reason: null, certificate: { publishedUrl: "https://cert/5", verificationCode: "CERT-5" } },
        { type: "top_defender", recipientId: "p3", recipientName: "Rin", teamId: "team-c", teamName: "Gamma", reason: null, certificate: { publishedUrl: "https://cert/6", verificationCode: "CERT-6" } },
        { type: "top_assist", recipientId: "p4", recipientName: "Sol", teamId: "team-a", teamName: "Alpha", reason: null, certificate: { publishedUrl: "https://cert/7", verificationCode: "CERT-7" } },
      ],
      matches: [], standings: [],
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.certificates).toMatchObject({ status: "published", isCurrent: true, isComplete: true, publishedCount: 7 });
    expect(view.certificates.items).toHaveLength(7);
    expect(view.podium[0]?.certificate).toMatchObject({ type: "champion", publishedUrl: "https://cert/1", verificationCode: "CERT-1" });
    expect(view.awards[0]?.certificate).toMatchObject({ type: "mvp", publishedUrl: "https://cert/4", verificationCode: "CERT-4" });
  });

  it("keeps authoritative approved awards visible while certificate links are preparing", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Finished" });
    mocks.finished.mockResolvedValue({
      mode: "finished",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", format: "single_elimination" },
      certificates: { status: "preparing", publishedCount: 0, expectedCount: 7 },
      podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha", certificate: null }],
      awards: [{ type: "mvp", recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: null, certificate: null }],
      matches: [], standings: [],
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.awards).toMatchObject([{ type: "mvp", recipientId: "p1", certificate: null }]);
    expect(view.certificates.items).toEqual([]);
  });

  it("routes closed legacy registration to compatible drawing without invoking a registration projection", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Registration Closed" });
    mocks.drawing.mockResolvedValue(null);
    mocks.registration.mockResolvedValue({ mode: "registration", registration: { availability: "closed" } });

    const view = await readPublicV3Event("miracle-cup", viewer);

    expect(view).toMatchObject({ source: "compatible", mode: "drawing" });
    expect(mocks.registration).not.toHaveBeenCalled();
  });

  it("propagates viewer CTA and authoritative participant facts to the top level", async () => {
    mocks.eventFindUnique.mockResolvedValue({ ...baseEvent, status: "Published" });
    mocks.registration.mockResolvedValue({
      mode: "registration",
      event: { id: "event-1", slug: "miracle-cup", name: "Miracle Cup", description: "A public event", timezone: "Asia/Jakarta", formatLabel: "Single Elimination", eventStartsAt: "2026-09-20T02:00:00.000Z", venue: "Arena", prize: "Rp5.000.000", gameName: "FlashPeak", modeName: "5v5" },
      registration: { availability: "open", opensAt: "2026-09-01T00:00:00.000Z", closesAt: "2026-09-19T00:00:00.000Z", activeTeamCount: 3, pendingReviewCount: 1, occupiedSlots: 4, remainingSlots: 12, participantCap: 16, feeRequired: false, feeAmount: null, feeLabel: "", minimumRoster: 1, maximumRoster: 5 },
      viewer: { state: "pending_review", cta: { kind: "status", label: "view_registration_status", href: "/captain?tab=registration&eventId=event-1", enabled: true } },
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "registration") throw new Error("Expected registration projection");
    expect(view.viewer).toMatchObject({ state: "pending_review", cta: { kind: "status", href: "/captain?tab=registration&eventId=event-1" } });
    expect(view.cta).toMatchObject({ kind: "status", label: "view_registration_status", href: "/id/captain?tab=registration&eventId=event-1", enabled: true });
    expect(view.facts.participants).toBe(3);
    expect(view.registration.activeTeamCount).toBe(3);
  });

  it("uses standings navigation for round-robin compatible drawing and marks absent facts as TBD", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Registration Closed", format: "League", organizerName: null, venue: null, venueAddress: null },
      matches: [{ id: "match-1", status: "Completed", homeScore: null, awayScore: null }],
    });
    if (view.mode !== "drawing") throw new Error("Expected drawing projection");
    expect(view.cta).toMatchObject({ kind: "link", label: "view_standings", href: "/id/events/miracle-cup/standings" });
    expect(view.navigation).toMatchObject({ bracket: false, leaderboard: true });
    expect(view.identity.organizer.name).toBe("TBD");
    expect(view.identity.facts.venue).toBe("TBD");
    expect(view.matches[0]).toMatchObject({ homeScore: null, awayScore: null });
  });

  it("hides certificate links when any record misses the current publication", () => {
    const certificateTypes = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"];
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Finished" },
      completion: {
        id: "completion-1",
        status: "completed",
        sourceSnapshot: { version: 4 },
        podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }],
        awards: [{ type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: null } }],
      },
      publication: { completionId: "completion-1", completionVersion: 4, version: 5, certificateIds: certificateTypes.map((type) => "cert-" + type) },
      certificates: certificateTypes.map((type) => ({
        id: "cert-" + type,
        type,
        recipientKind: type === "mvp" ? "player" : "team",
        recipientId: "recipient-" + type,
        recipientName: type,
        publishedUrl: "https://cert/" + type,
        verificationCode: "CODE-" + type,
        status: "published",
        completionId: "completion-1",
        completionVersion: type === "top_assist" ? 3 : 4,
      })),
    });
    if (view.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.certificates).toMatchObject({ status: "preparing", isCurrent: true, isComplete: false, publishedCount: 0 });
    expect(view.certificates.items).toEqual([]);
    expect(view.awards).toMatchObject([{ type: "mvp", recipientId: "p1", certificate: null }]);
  });

  it("exposes compatible certificate links only for a complete current publication", () => {
    const certificateTypes = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"];
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Finished" },
      completion: {
        id: "completion-1",
        status: "completed",
        sourceSnapshot: { version: 4 },
        podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }],
        awards: [{ type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: null } }],
      },
      publication: { completionId: "completion-1", completionVersion: 4, version: 5, certificateIds: certificateTypes.map((type) => "cert-" + type) },
      certificates: certificateTypes.map((type) => ({
        id: "cert-" + type,
        type,
        recipientKind: type === "mvp" ? "player" : "team",
        recipientId: "recipient-" + type,
        recipientName: type,
        publishedUrl: "https://cert/" + type,
        verificationCode: "CODE-" + type,
        status: "published",
        completionId: "completion-1",
        completionVersion: 4,
      })),
    });
    if (view.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.certificates).toMatchObject({ status: "published", isCurrent: true, isComplete: true, publishedCount: 7 });
    expect(view.certificates.items).toHaveLength(7);
    expect(view.awards).toHaveLength(1);
    expect(view.awards[0]?.certificate).toMatchObject({ type: "mvp" });
  });


  it("emits locale-safe overview and detail targets for both supported locales", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Registration Closed", format: "League" },
    });
    if (view.mode !== "drawing") throw new Error("Expected drawing projection");
    expect(view.identity.routes.overview.hrefByLocale).toEqual({
      id: "/id/events/miracle-cup",
      en: "/en/events/miracle-cup",
    });
    expect(view.navigation.targets.leaderboard.hrefByLocale).toEqual({
      id: "/id/events/miracle-cup/leaderboards",
      en: "/en/events/miracle-cup/leaderboards",
    });
    expect(view.cta.href).toBe("/id/events/miracle-cup/standings");
    expect(view.cta.hrefByLocale).toEqual({
      id: "/id/events/miracle-cup/standings",
      en: "/en/events/miracle-cup/standings",
    });
  });

  it("keeps a human-readable status explanation separate from its localization key", () => {
    const view = projectCompatiblePublicV3Event({ event: { ...baseEvent, status: "Ongoing" } });
    expect(view.statusExplanationKey).toBe("ongoing.compatible");
    expect(view.statusExplanation).not.toBe(view.statusExplanationKey);
    expect(view.statusExplanation).toMatch(/[A-Za-z].* /);
  });

  it("keeps reopened completions in preparing state even when publication versions match", () => {
    const certificateTypes = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"];
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Finished" },
      completion: {
        id: "completion-reopened",
        status: "reopened",
        sourceSnapshot: { version: 4 },
        podium: [{ rank: 1, teamId: "team-a", teamName: "Alpha" }],
        awards: [{ type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-a", teamName: "Alpha", reason: null } }],
      },
      publication: { completionId: "completion-reopened", completionVersion: 4, version: 5, certificateIds: certificateTypes.map((type) => "cert-" + type) },
      certificates: certificateTypes.map((type) => ({
        id: "cert-" + type,
        type,
        recipientKind: type === "mvp" ? "player" : "team",
        recipientId: "recipient-" + type,
        recipientName: type,
        publishedUrl: "https://cert/" + type,
        verificationCode: "CODE-" + type,
        status: "published",
        completionId: "completion-reopened",
        completionVersion: 4,
      })),
    });
    if (view.mode !== "finished") throw new Error("Expected finished projection");
    expect(view.certificates).toMatchObject({ status: "preparing", isCurrent: false, isComplete: false, publishedCount: 0 });
    expect(view.certificates.items).toEqual([]);
    expect(view.podium).toEqual([]);
    expect(view.awards).toEqual([]);
  });
});
