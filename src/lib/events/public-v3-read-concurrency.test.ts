import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCompetitionGraph } from "@/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const db = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventFindFirst: vi.fn(),
  announcementFindMany: vi.fn(),
  phaseFindFirst: vi.fn(),
  completionFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  teamFindMany: vi.fn(),
  publicationFindFirst: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({
  prisma: {
    event: { findUnique: db.eventFindUnique, findFirst: db.eventFindFirst },
    eventAnnouncement: { findMany: db.announcementFindMany },
    competitionPhase: { findFirst: db.phaseFindFirst },
    tournamentCompletion: { findUnique: db.completionFindUnique },
    match: { findMany: db.matchFindMany },
    team: { findMany: db.teamFindMany },
    certificatePublication: { findFirst: db.publicationFindFirst },
  },
}));

import { readPublicV3Event } from "./public-v3-read";

const event = {
  id: "event-1",
  slug: "finished-cup",
  name: "Finished Cup",
  description: "Official results",
  status: "Finished",
  gameId: "game-flashpeak",
  gameModeId: "mode-flashpeak-5v5",
  timezone: "Asia/Jakarta",
  format: "Single Elimination",
  startsAt: "2026-09-20T02:00:00.000Z",
  eventStartsAt: new Date("2026-09-20T02:00:00.000Z"),
  venue: "Arena",
  venueAddress: null,
  prizePoolLabel: null,
  participantCap: 8,
  organizerName: "Organizer",
  organizerVerified: true,
  publishedScheduleVersion: null,
};
const graph = generateCompetitionGraph({
  eventId: event.id,
  config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  teams: [{ id: "team-a", seed: 1 }, { id: "team-b", seed: 2 }],
});
const phase = { status: "completed", configuration: { graph } };
const completion = {
  id: "completion-1",
  status: "completed",
  sourceSnapshot: { version: 1 },
  podiumPlacements: [],
  awards: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.eventFindUnique.mockResolvedValue(event);
  db.eventFindFirst.mockResolvedValue(event);
  db.announcementFindMany.mockResolvedValue([]);
  db.phaseFindFirst.mockResolvedValue(phase);
  db.completionFindUnique.mockResolvedValue(completion);
  db.matchFindMany.mockResolvedValue([]);
  db.teamFindMany.mockResolvedValue([]);
  db.publicationFindFirst.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("Finished public event reader concurrency", () => {
  it("shares one live public projection across simultaneous viewers", async () => {
    let releasePhase!: (value: typeof phase) => void;
    const waitingPhase = new Promise<typeof phase>((resolve) => { releasePhase = resolve; });
    db.phaseFindFirst.mockImplementation(() => waitingPhase);
    const viewers = [null, { id: "captain-1", role: "captain", name: "Captain", email: "captain@example.test" }] as const;

    const reads = Array.from({ length: 10 }, (_, index) => readPublicV3Event(event.slug, viewers[index % 2]));
    await new Promise((resolve) => setTimeout(resolve, 10));
    releasePhase(phase);
    const views = await Promise.all(reads);

    expect(views).toHaveLength(10);
    expect(views.every((view) => view?.mode === "finished" && view.identity.title === "Finished Cup")).toBe(true);
    if (!views[0] || !views[1]) throw new Error("Missing finished projection");
    views[0].identity.title = "Mutated by a caller";
    expect(views[1].identity.title).toBe("Finished Cup");
    expect(db.eventFindUnique).toHaveBeenCalledTimes(10);
    expect(db.announcementFindMany).toHaveBeenCalledTimes(10);
    expect(db.eventFindFirst).toHaveBeenCalledTimes(1);
    expect(db.phaseFindFirst).toHaveBeenCalledTimes(1);
    expect(db.completionFindUnique).toHaveBeenCalledTimes(1);
    expect(db.publicationFindFirst).toHaveBeenCalledTimes(1);
    expect(db.teamFindMany).toHaveBeenCalledTimes(2);
  });

  it("reads updated public details afresh after the shared projection settles", async () => {
    const first = await readPublicV3Event(event.slug, null);
    db.eventFindFirst.mockResolvedValue({ ...event, name: "Revised Finished Cup" });
    const second = await readPublicV3Event(event.slug, null);

    expect(first?.identity.title).toBe("Finished Cup");
    expect(second?.identity.title).toBe("Revised Finished Cup");
    expect(db.eventFindFirst).toHaveBeenCalledTimes(2);
  });

  it("does not share a slug's projection with a replacement event", async () => {
    const replacement = { ...event, id: "event-2", name: "Replacement Cup" };
    const replacementGraph = generateCompetitionGraph({
      eventId: replacement.id,
      config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "team-c", seed: 1 }, { id: "team-d", seed: 2 }],
    });
    let releaseFirst!: (value: typeof phase) => void;
    const waitingFirst = new Promise<typeof phase>((resolve) => { releaseFirst = resolve; });
    db.eventFindUnique.mockResolvedValueOnce(event).mockResolvedValueOnce(replacement);
    db.eventFindFirst.mockResolvedValueOnce(event).mockResolvedValueOnce(replacement);
    db.phaseFindFirst.mockImplementation(({ where }: { where: { eventId: string } }) =>
      where.eventId === event.id ? waitingFirst : { status: "completed", configuration: { graph: replacementGraph } });

    const first = readPublicV3Event(event.slug, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = readPublicV3Event(replacement.slug, null);
    releaseFirst(phase);
    const [firstView, secondView] = await Promise.all([first, second]);

    expect(firstView?.identity.title).toBe("Finished Cup");
    expect(secondView?.identity.title).toBe("Replacement Cup");
    expect(db.phaseFindFirst).toHaveBeenCalledTimes(2);
  });

  it("filters published announcements at each default read time while the phase is shared", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
    db.announcementFindMany.mockResolvedValue([{
      id: "update-1", title: "Schedule update", body: "Public notice", status: "published",
      publishedAt: new Date("2026-10-04T00:00:00.000Z"),
      startsAt: new Date("2026-10-05T00:00:05.000Z"), endsAt: null,
    }]);
    let releasePhase!: (value: typeof phase) => void;
    const waitingPhase = new Promise<typeof phase>((resolve) => { releasePhase = resolve; });
    db.phaseFindFirst.mockImplementation(() => waitingPhase);

    const beforeStart = readPublicV3Event(event.slug, null);
    await Promise.resolve();
    await Promise.resolve();
    vi.setSystemTime(new Date("2026-10-05T00:00:10.000Z"));
    const afterStart = readPublicV3Event(event.slug, null);
    releasePhase(phase);
    const [before, after] = await Promise.all([beforeStart, afterStart]);

    expect(before?.updates).toEqual([]);
    expect(after?.updates).toMatchObject([{ id: "update-1", title: "Schedule update" }]);
    expect(db.phaseFindFirst).toHaveBeenCalledTimes(1);
  });

  it("retries a fresh public projection after an in-flight failure", async () => {
    db.phaseFindFirst.mockRejectedValueOnce(new Error("phase temporarily unavailable"));
    await expect(readPublicV3Event(event.slug, null)).rejects.toThrow("phase temporarily unavailable");

    const recovered = await readPublicV3Event(event.slug, null);

    expect(recovered?.identity.title).toBe("Finished Cup");
    expect(db.phaseFindFirst).toHaveBeenCalledTimes(2);
  });
});
