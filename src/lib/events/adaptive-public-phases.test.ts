import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateCompetitionGraph } from "@/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const mocks = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  phaseFindFirst: vi.fn(),
  matchFindMany: vi.fn(),
  teamFindMany: vi.fn(),
  scheduleFindFirst: vi.fn(),
  completionFindUnique: vi.fn(),
  publicationFindFirst: vi.fn(),
  certificateFindMany: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findFirst: mocks.eventFindFirst },
    competitionPhase: { findFirst: mocks.phaseFindFirst },
    match: { findMany: mocks.matchFindMany },
    team: { findMany: mocks.teamFindMany },
    scheduleRevision: { findFirst: mocks.scheduleFindFirst },
    tournamentCompletion: { findUnique: mocks.completionFindUnique },
    certificatePublication: { findFirst: mocks.publicationFindFirst },
    certificate: { findMany: mocks.certificateFindMany },
  },
}));

import { getPublicCompetitionPhaseVisibility, getPublicDrawingEvent, getPublicFinishedEvent } from "./adaptive-public-phases";

const event = {
  id: "event-1",
  slug: "miracle-cup",
  name: "Miracle Cup",
  description: "Event",
  status: "Registration Closed",
  timezone: "Asia/Jakarta",
  format: "Single Elimination",
  startsAt: "20 September 2026",
  eventStartsAt: new Date("2026-09-20T02:00:00.000Z"),
  venue: "Arena",
  venueAddress: null,
  prizePoolLabel: "Rp5.000.000",
  participantCap: 16,
  organizerName: "Flash Peak Organizer",
  organizerVerified: true,
  publishedScheduleVersion: null,
};

const graph = generateCompetitionGraph({
  eventId: "event-1",
  config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  teams: [{ id: "team-b", seed: 1 }, { id: "team-a", seed: 2 }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindFirst.mockResolvedValue(event);
  mocks.phaseFindFirst.mockResolvedValue({
    status: "active",
    configuration: { graph, drawing: { teams: [{ id: "team-b", seed: 1 }, { id: "team-a", seed: 2 }] } },
  });
  mocks.matchFindMany.mockResolvedValue(graph.matches.map((match) => ({
    id: match.id,
    status: "Scheduled",
    homeTeamId: match.home.kind === "team" ? match.home.teamId : "",
    awayTeamId: match.away.kind === "team" ? match.away.teamId : "",
    homeScore: 0,
    awayScore: 0,
    resultVersion: 0,
    scheduledAt: null,
    scheduleRoom: null,
  })));
  mocks.teamFindMany.mockResolvedValue([
    { id: "team-a", name: "Alpha" },
    { id: "team-b", name: "Beta" },
  ]);
  mocks.scheduleFindFirst.mockResolvedValue(null);
});

describe("adaptive public drawing", () => {
  it("distinguishes legacy events from private drafts and publicly readable phases", async () => {
    mocks.phaseFindFirst.mockResolvedValueOnce(null);
    await expect(getPublicCompetitionPhaseVisibility("event-legacy")).resolves.toBe("none");
    mocks.phaseFindFirst.mockResolvedValueOnce({ status: "draft" });
    await expect(getPublicCompetitionPhaseVisibility("event-private")).resolves.toBe("private");
    mocks.phaseFindFirst.mockResolvedValueOnce({ status: "active" });
    await expect(getPublicCompetitionPhaseVisibility("event-public")).resolves.toBe("public");
  });

  it("reads only an active published phase and keeps unresolved slots as TBD", async () => {
    const view = await getPublicDrawingEvent("miracle-cup");
    expect(view).toMatchObject({
      mode: "drawing",
      event: { id: "event-1", slug: "miracle-cup" },
      drawing: { published: true, seeds: expect.arrayContaining([{ teamId: "team-b", teamName: "Beta", seed: 1 }]) },
      schedule: null,
    });
    expect(view?.matches[0]).toMatchObject({ home: "Beta", away: "Alpha" });
    expect(view?.matches[0]?.bestOf).toBe(graph.matches[0]?.bestOf);
    expect(mocks.phaseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", sequence: 1, status: "active" },
    }));
  });

  it("does not expose a private draft phase", async () => {
    mocks.phaseFindFirst.mockResolvedValue(null);
    await expect(getPublicDrawingEvent("miracle-cup")).resolves.toBeNull();
  });
});

describe("adaptive public finished event", () => {
  it("publishes organizer-approved individual awards and certificate links only from the publication", async () => {
    mocks.eventFindFirst.mockResolvedValue({ ...event, status: "Finished" });
    mocks.completionFindUnique.mockResolvedValue({
      id: "completion-1",
      status: "completed",
      sourceSnapshot: { version: 3 },
      podiumPlacements: [
        { rank: 1, teamId: "team-b", teamName: "Beta" },
        { rank: 2, teamId: "team-a", teamName: "Alpha" },
      ],
      awards: [
        { type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-b", teamName: "Beta", reason: "Organizer decision" } },
        { type: "top_scorer", status: "approved", decision: { recipientId: "p2", recipientName: "Vok", teamId: "team-a", teamName: "Alpha", reason: null } },
        { type: "top_defender", status: "approved", decision: { recipientId: "p3", recipientName: "Aegis", teamId: "team-b", teamName: "Beta", reason: null } },
        { type: "top_assist", status: "approved", decision: { recipientId: "p4", recipientName: "Orbit", teamId: "team-a", teamName: "Alpha", reason: null } },
      ],
    });
    const types = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"];
    const certificates = types.map((type) => ({
      id: `cert-${type}`,
      type,
      completionId: "completion-1",
      completionVersion: 3,
      publishedUrl: `/certificates/${type}.png`,
      verificationCode: `VERIFY-${type}`,
      status: "ready",
    }));
    mocks.publicationFindFirst.mockResolvedValue({
      completionId: "completion-1",
      completionVersion: 3,
      certificateIds: certificates.map(({ id }) => id),
    });
    mocks.certificateFindMany.mockResolvedValue(certificates);

    const view = await getPublicFinishedEvent("miracle-cup");
    expect(view?.awards.map((award) => award.type)).toEqual(["mvp", "top_scorer", "top_defender", "top_assist"]);
    expect(view?.awards[0]).toMatchObject({
      recipientName: "Nyx",
      certificate: { publishedUrl: "/certificates/mvp.png", verificationCode: "VERIFY-mvp" },
    });
    expect(view?.awards[2].certificate).toMatchObject({ publishedUrl: "/certificates/top_defender.png" });
    expect(mocks.certificateFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: certificates.map(({ id }) => id) }, status: { in: ["ready", "published"] }, publishedUrl: { not: null } },
    }));
  });

  it("withholds certificate links from stale or incomplete publications", async () => {
    mocks.eventFindFirst.mockResolvedValue({ ...event, status: "Finished" });
    mocks.completionFindUnique.mockResolvedValue({
      id: "completion-1",
      status: "completed",
      sourceSnapshot: { version: 4 },
      podiumPlacements: [],
      awards: [
        { type: "mvp", status: "approved", decision: { recipientId: "p1", recipientName: "Nyx", teamId: "team-b", teamName: "Beta", reason: null } },
      ],
    });
    mocks.publicationFindFirst.mockResolvedValue({
      completionId: "completion-1",
      completionVersion: 3,
      certificateIds: ["cert-mvp"],
    });

    const view = await getPublicFinishedEvent("miracle-cup");

    expect(view?.awards[0]?.certificate).toBeNull();
    expect(mocks.certificateFindMany).not.toHaveBeenCalled();
  });
});
