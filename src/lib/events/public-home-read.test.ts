import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const boundary = vi.hoisted(() => ({
  enabled: true,
  full: vi.fn(),
  transaction: vi.fn(),
  event: vi.fn(),
  revision: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => boundary.enabled }));
vi.mock("@/lib/platform/db", () => ({ prisma: {
  $transaction: boundary.transaction,
  event: { findFirst: boundary.event, findUnique: boundary.detail },
  scheduleRevision: { findFirst: boundary.revision },
  team: { findMany: boundary.detail }, player: { findMany: boundary.detail },
  playerStat: { findMany: boundary.detail }, eventAnnouncement: { findMany: boundary.detail },
} }));
vi.mock("./public-v3-read", async (importOriginal) => ({
  ...await importOriginal<typeof import("./public-v3-read")>(),
  readPublicV3Event: boundary.full,
}));

const now = new Date("2026-09-20T03:00:00.000Z");
const graph = {
  eventId: "event-1", config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  phases: [], groups: [],
  matches: [
    { id: "match-late", status: "pending", round: 1, phaseId: "phase-1", groupId: null, bracket: "single", bestOf: 3 },
    { id: "match-live", status: "pending", round: 1, phaseId: "phase-1", groupId: null, bracket: "single", bestOf: 3 },
    { id: "match-official", status: "pending", round: 1, phaseId: "phase-1", groupId: null, bracket: "single", bestOf: 3 },
  ],
};
const match = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, homeTeamId: "a", awayTeamId: "b", status: "Scheduled", scheduleStatus: "estimated",
  scheduledLabel: null, homeScore: 99, awayScore: 88, resultVersion: 0, resultConfirmedAt: null,
  ...overrides,
});
const event = () => ({
  id: "event-1", slug: "cup", name: "Miracle Cup", description: "Public competition", gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5", format: "Single Elimination", status: "Ongoing", participantCap: 8,
  startsAt: "2026-09-20T02:00:00.000Z", eventStartsAt: now, timezone: "Asia/Jakarta", venue: "Arena",
  venueAddress: null, organizerName: "Organizer", organizerVerified: true, prizePoolLabel: "Rp1.000.000",
  logoUrl: null, gameImageUrl: null, publishedScheduleVersion: 2,
  competitionPhases: [{ configuration: { graph } }],
  teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
  matches: [match("match-late"), match("match-live", { status: "Live", scheduleStatus: "live" }), match("match-official", { status: "Completed", resultVersion: 1, homeScore: 2, awayScore: 1, resultConfirmedAt: now })],
});

beforeEach(() => {
  vi.clearAllMocks(); boundary.enabled = true;
  boundary.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } }));
  boundary.event.mockResolvedValue(event());
  boundary.revision.mockResolvedValue({ version: 2, status: "published", snapshot: { draft: { assignments: [
    { matchId: "match-live", start: "2026-09-20T03:00:00.000Z", end: "2026-09-20T04:00:00.000Z", roomId: "A" },
    { matchId: "match-late", start: "2026-09-20T05:00:00.000Z", end: "2026-09-20T06:00:00.000Z", roomId: "B" },
  ] } } });
});

describe("narrow public homepage featured read", () => {
  it("uses at most two joined snapshot data reads and projects authoritative ordered highlights without detail overfetch", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const view = await readPublicHomeFeaturedEvent("cup", now);
    expect(view).toMatchObject({ source: "authoritative", mode: "ongoing", identity: {
      id: "event-1", title: "Miracle Cup", organizer: { name: "Organizer", verified: true },
      facts: { participants: 2, participantCap: 8 }, navigation: { schedule: true, leaderboard: true },
      cta: { label: "view_live_event", enabled: true },
    } });
    if (view?.mode !== "ongoing") throw new Error("expected ongoing hero");
    expect(view.liveMatches.map((row) => row.id)).toEqual(["match-live"]);
    expect(view.nextMatches.map((row) => row.id)).toEqual(["match-late"]);
    expect(view.recentResults.map((row) => row.id)).toEqual(["match-official"]);
    expect(view.liveMatches[0]).toMatchObject({ home: "Alpha", away: "Beta", homeScore: null, awayScore: null, official: false, start: "2026-09-20T03:00:00.000Z" });
    expect(view.recentResults[0]).toMatchObject({ homeScore: 2, awayScore: 1, official: true });
    expect(boundary.event).toHaveBeenCalledWith(expect.objectContaining({ relationLoadStrategy: "join", where: { slug: "cup", status: "Ongoing" } }));
    expect(boundary.revision).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event-1", version: 2, status: "published" } }));
    expect(boundary.event).toHaveBeenCalledTimes(1);
    expect(boundary.revision).toHaveBeenCalledTimes(1);
    expect(boundary.detail).not.toHaveBeenCalled();
    expect(boundary.full).not.toHaveBeenCalled();
  });

  it("does not use a draft or missing schedule revision to reveal assignments", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.revision.mockResolvedValue(null);
    const view = await readPublicHomeFeaturedEvent("cup", now);
    if (view?.mode !== "ongoing") throw new Error("expected ongoing hero");
    expect(view.liveMatches[0].start).toBeNull();
    expect(boundary.revision).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "published" }) }));
    boundary.revision.mockResolvedValue({ version: 2, status: "draft", snapshot: { draft: { assignments: [{ matchId: "match-live", start: "private", end: "private", roomId: "private" }] } } });
    const draft = await readPublicHomeFeaturedEvent("cup", now);
    if (draft?.mode !== "ongoing") throw new Error("expected ongoing hero");
    expect(draft.liveMatches[0].start).toBeNull();
  });

  it("keeps the graph parent and joined relation bounds before making a fast projection", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.event.mockResolvedValueOnce({ ...event(), competitionPhases: [{ configuration: { graph: { ...graph, eventId: "another-event" } } }] });
    boundary.full.mockResolvedValue(null);
    await expect(readPublicHomeFeaturedEvent("cup", now)).resolves.toBeNull();
    expect(boundary.revision).not.toHaveBeenCalled();
    expect(boundary.event).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      competitionPhases: expect.objectContaining({ where: { sequence: 1, status: "active" }, take: 1 }),
      matches: expect.objectContaining({ take: 501 }),
      teams: expect.objectContaining({ take: 501 }),
    }) }));
  });

  it.each([
    ["missing config", { ...graph, config: null }],
    ["null match", { ...graph, matches: [null] }],
    ["null group", { ...graph, groups: [null] }],
    ["null phase", { ...graph, config: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs, phases: [null] }],
  ])("falls back safely for a graph with %s", async (_case, malformed) => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.event.mockResolvedValueOnce({ ...event(), competitionPhases: [{ configuration: { graph: malformed } }] });
    boundary.full.mockResolvedValue(null);
    await expect(readPublicHomeFeaturedEvent("cup", now)).resolves.toBeNull();
    expect(boundary.full).toHaveBeenCalledWith("cup", null, now);
    expect(boundary.revision).not.toHaveBeenCalled();
  });

  it("falls back instead of displaying a silently truncated public list", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.event.mockResolvedValueOnce({ ...event(), teams: Array.from({ length: 501 }, (_, index) => ({ id: `team-${index}`, name: `Team ${index}` })) });
    boundary.full.mockResolvedValue(null);
    await expect(readPublicHomeFeaturedEvent("cup", now)).resolves.toBeNull();
    expect(boundary.full).toHaveBeenCalledWith("cup", null, now);
    expect(boundary.revision).not.toHaveBeenCalled();
  });

  it("selects the earliest published live match and newest official result", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.event.mockResolvedValueOnce({
      ...event(),
      competitionPhases: [{ configuration: { graph: { ...graph, matches: [...graph.matches,
        { id: "match-first", status: "pending", round: 1, phaseId: "phase-1", groupId: null, bracket: "single", bestOf: 3 },
        { id: "match-new-result", status: "pending", round: 1, phaseId: "phase-1", groupId: null, bracket: "single", bestOf: 3 },
      ] } } }],
      matches: [...event().matches,
        match("match-first", { status: "Live", scheduleStatus: "live" }),
        match("match-new-result", { status: "Completed", resultVersion: 2, homeScore: 3, awayScore: 2, resultConfirmedAt: new Date("2026-09-20T04:00:00.000Z") }),
      ],
    });
    boundary.revision.mockResolvedValueOnce({ version: 2, status: "published", snapshot: { draft: { assignments: [
      { matchId: "match-live", start: "2026-09-20T03:00:00.000Z", end: "2026-09-20T04:00:00.000Z", roomId: "A" },
      { matchId: "match-first", start: "2026-09-20T02:00:00.000Z", end: "2026-09-20T03:00:00.000Z", roomId: "A" },
    ] } } });
    const view = await readPublicHomeFeaturedEvent("cup", now);
    if (view?.mode !== "ongoing") throw new Error("expected ongoing hero");
    expect(view.liveMatches.map((row) => row.id)).toEqual(["match-first", "match-live"]);
    expect(view.recentResults.map((row) => row.id)).toEqual(["match-new-result", "match-official"]);
  });

  it("falls back to the existing reader for absent graph, other status, and disabled flags", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const full = await import("./public-v3-read");
    const compatible = full.projectCompatiblePublicV3Event({ event: { id: "event-1", slug: "cup", name: "Cup", status: "Registration Closed" } });
    boundary.full.mockResolvedValue(compatible);
    boundary.event.mockResolvedValueOnce({ ...event(), competitionPhases: [] });
    expect(await readPublicHomeFeaturedEvent("cup", now)).toMatchObject({ mode: "drawing", source: "compatible" });
    expect(boundary.full).toHaveBeenCalledWith("cup", null, now);
    boundary.event.mockResolvedValueOnce(null);
    expect(await readPublicHomeFeaturedEvent("cup", now)).toMatchObject({ mode: "drawing" });
    boundary.enabled = false;
    const before = boundary.transaction.mock.calls.length;
    expect(await readPublicHomeFeaturedEvent("cup", now)).toMatchObject({ mode: "drawing" });
    expect(boundary.transaction.mock.calls.length).toBe(before);
  });

  it("returns null for a private or deleted event and does not manufacture a hero", async () => {
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    boundary.event.mockResolvedValue(null);
    boundary.full.mockResolvedValue(null);
    await expect(readPublicHomeFeaturedEvent("private", now)).resolves.toBeNull();
    boundary.event.mockResolvedValueOnce({ ...event(), status: "Draft" });
    await expect(readPublicHomeFeaturedEvent("cup", now)).resolves.toBeNull();
    expect(boundary.revision).not.toHaveBeenCalled();
  });
});
