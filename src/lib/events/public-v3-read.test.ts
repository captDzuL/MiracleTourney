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
    expect(view.awards).toEqual([]);
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
      stream: null, stateVersion: "state-1", lastUpdatedAt: "2026-09-20T04:01:00.000Z",
    });

    const view = await readPublicV3Event("miracle-cup", viewer);

    if (view?.mode !== "ongoing") throw new Error("Expected ongoing projection");
    expect(view.matches[0]).toMatchObject({ id: "match-1", roundLabel: "Round 2", home: "Alpha", away: "Beta", status: "completed", homeScore: 2, awayScore: 1, end: "2026-09-20T04:00:00.000Z", official: true });
    expect(view.recentResults[0]?.id).toBe("match-1");
    expect(view.schedule).toEqual({ version: 2, publishedAt: "2026-09-19T12:00:00.000Z", changes: [] });
    expect(view.standings[0]).toMatchObject({ phaseId: "phase-1", rows: [{ teamId: "team-a", name: "Alpha" }] });
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
    expect(view.cta).toMatchObject({ kind: "status", label: "view_registration_status", href: "/captain?tab=registration&eventId=event-1", enabled: true });
    expect(view.facts.participants).toBe(3);
    expect(view.registration.activeTeamCount).toBe(3);
  });

  it("uses standings navigation for round-robin compatible drawing and marks absent facts as TBD", () => {
    const view = projectCompatiblePublicV3Event({
      event: { ...baseEvent, status: "Registration Closed", format: "League", organizerName: null, venue: null, venueAddress: null },
      matches: [{ id: "match-1", status: "Completed", homeScore: null, awayScore: null }],
    });
    if (view.mode !== "drawing") throw new Error("Expected drawing projection");
    expect(view.cta).toMatchObject({ kind: "link", label: "view_leaderboard", href: "/events/miracle-cup/leaderboards" });
    expect(view.navigation).toMatchObject({ bracket: false, leaderboard: true });
    expect(view.identity.organizer.name).toBe("TBD");
    expect(view.identity.facts.venue).toBe("TBD");
    expect(view.matches[0]).toMatchObject({ homeScore: null, awayScore: null });
  });

  it("requires every certificate record to match the current publication before exposing awards", () => {
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
    expect(view.awards).toEqual([]);
  });

  it("exposes compatible awards and certificates only for a complete current publication", () => {
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
});
