import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicEvent: vi.fn(), phase: vi.fn(), matchRows: vi.fn(), teamRows: vi.fn(), legacy: vi.fn(), organizerBracket: vi.fn(), roundConfigs: vi.fn(),
  session: vi.fn(), organizerEvent: vi.fn(), appearance: vi.fn(),
}));
vi.mock("@/lib/platform/repository", () => ({
  getPublicEventBySlug: mocks.publicEvent,
  getPublicVisibleBracketPreview: mocks.legacy,
  getBracketPreview: mocks.organizerBracket,
  getTeamsForEvent: mocks.teamRows,
  getMatchesForEvent: mocks.matchRows,
  getEventRoundConfigs: mocks.roundConfigs,
  getMatchGamesForEvent: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/platform/db", () => ({ prisma: {
  competitionPhase: { findFirst: mocks.phase },
  match: { findMany: mocks.matchRows },
  team: { findMany: mocks.teamRows },
  event: { findUnique: mocks.organizerEvent },
}}));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.session }));
vi.mock("./appearance", () => ({ getBracketAppearance: mocks.appearance }));
import { readOrganizerSocialBracket, readPublicSocialBracket } from "./read";

const event = { id: "event", slug: "cup", name: "Cup", logoUrl: null, format: "Single Elimination", status: "Ongoing", organizerUserId: "owner" };
const graph = {
  eventId: "event", config: { kind: "single_elimination" },
  phases: [{ id: "phase", sequence: 1, kind: "single_elimination", standingsRules: null }],
  groups: [], dependencies: [], qualificationDependencies: [],
  matches: [{ id: "final", phaseId: "phase", groupId: null, bracket: "single", round: 1, slot: 1, leg: 1, bestOf: 3,
    home: { kind: "team", teamId: "alpha", seed: 1 }, away: { kind: "team", teamId: "beta", seed: 2 }, status: "pending", advance: null }],
  placements: [{ rank: 1, source: { kind: "match", matchId: "final", outcome: "winner" } }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicEvent.mockResolvedValue(event);
  mocks.organizerEvent.mockResolvedValue(event);
  mocks.phase.mockResolvedValue({ status: "active", configuration: { graph } });
  mocks.matchRows.mockResolvedValue([{ id: "final", homeTeamId: "alpha", awayTeamId: "beta", homeScore: 2, awayScore: 1, winnerTeamId: "alpha", resultVersion: 1, status: "Completed", scheduledAt: null, resultSnapshot: null }]);
  mocks.teamRows.mockResolvedValue([{ id: "alpha", name: "Alpha", logoUrl: "/a.png" }, { id: "beta", name: "Beta", logoUrl: null }]);
  mocks.appearance.mockResolvedValue({ backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 });
  mocks.legacy.mockResolvedValue([]);
  mocks.organizerBracket.mockResolvedValue([]);
  mocks.roundConfigs.mockResolvedValue([]);
});
describe("social bracket readers", () => {
  it("returns published graph results and identity without raw configuration", async () => {
    const model = await readPublicSocialBracket("cup", "id");
    expect(model?.champion?.id).toBe("alpha");
    expect(model?.matches[0]?.home.team?.logoUrl).toBe("/a.png");
    expect(JSON.stringify(model)).not.toContain("configuration");
    expect(JSON.stringify(model)).not.toContain("seed");
  });
  it("does not read or leak a draft graph publicly", async () => {
    mocks.phase.mockResolvedValue({ status: "draft", configuration: { graph } });
    const model = await readPublicSocialBracket("cup", "en");
    expect(model?.matches).toEqual([]);
    expect(model?.champion).toBeNull();
    expect(mocks.matchRows).not.toHaveBeenCalled();
    expect(mocks.teamRows).not.toHaveBeenCalled();
  });
  it("numbers legacy league fixtures within each round", async () => {
    mocks.phase.mockResolvedValue(null);
    mocks.publicEvent.mockResolvedValue({ ...event, format: "League" });
    mocks.legacy.mockResolvedValue([
      { id: "r1a", round: 1, homeTeamId: "alpha", awayTeamId: "beta" },
      { id: "r1b", round: 1, homeTeamId: "alpha", awayTeamId: "beta" },
      { id: "r2a", round: 2, homeTeamId: "alpha", awayTeamId: "beta" },
    ]);
    const model = await readPublicSocialBracket("cup", "id");
    expect(model?.matches.map((match) => match.slot)).toEqual([1, 2, 1]);
  });
  it.each([
    ["id", "Babak Play-in"],
    ["en", "Play-in Round"],
  ] as const)("labels a published 24-team opening round from full depth in %s without exposing future matches", async (locale, label) => {
    mocks.phase.mockResolvedValue(null);
    mocks.publicEvent.mockResolvedValue({ ...event, status: "Published", participantCap: 24 });
    const opening = { id: "opening", round: 1, slot: 1, homeTeamId: "alpha", awayTeamId: null, byeForTeamId: "alpha" };
    mocks.legacy.mockResolvedValue([opening]);
    mocks.organizerBracket.mockResolvedValue([opening, { id: "hidden-final", round: 5, slot: 1, homeTeamId: null, awayTeamId: null }]);
    mocks.roundConfigs.mockResolvedValue([{ roundLabel: "Play-in Round", bestOf: 3 }]);

    const model = await readPublicSocialBracket("cup", locale);
    expect(model?.matches.map((match) => match.id)).toEqual(["opening"]);
    expect(model?.matches[0]).toMatchObject({ roundLabel: label, bestOf: 3 });
    expect(JSON.stringify(model)).not.toContain("hidden-final");
  });
  it("uses the full legacy preview for the owning organizer", async () => {
    mocks.session.mockResolvedValue({ id: "owner", role: "organizer" });
    mocks.phase.mockResolvedValue(null);
    mocks.organizerBracket.mockResolvedValue([
      { id: "private-next-round", round: 2, slot: 1, homeTeamId: null, awayTeamId: null },
    ]);
    const model = await readOrganizerSocialBracket("event", "en");
    expect(model?.preview).toBe(true);
    expect(model?.matches.map((match) => match.id)).toEqual(["private-next-round"]);
  });
  it("checks ownership before reading organizer graph data", async () => {
    mocks.session.mockResolvedValue({ id: "other", role: "organizer" });
    expect(await readOrganizerSocialBracket("event", "id")).toBeNull();
    expect(mocks.phase).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ id: "owner", role: "organizer" });
    mocks.phase.mockResolvedValue({ status: "draft", configuration: { graph } });
    const model = await readOrganizerSocialBracket("event", "id");
    expect(model?.preview).toBe(true);
    expect(model?.matches[0]?.id).toBe("final");
  });
});
