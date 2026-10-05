import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCompetitionGraph } from "@/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const db = vi.hoisted(() => ({
  eventFindUnique: vi.fn(), eventFindFirst: vi.fn(), announcementFindMany: vi.fn(),
  phaseFindFirst: vi.fn(), completionFindUnique: vi.fn(), matchFindMany: vi.fn(),
  teamFindMany: vi.fn(), publicationFindFirst: vi.fn(), certificateFindMany: vi.fn(),
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
    certificate: { findMany: db.certificateFindMany },
  },
}));

import { readPublicV3Event } from "./public-v3-read";

const event = {
  id: "event-1", slug: "finished-cup", name: "Finished Cup", description: "Official results",
  status: "Finished", gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5",
  timezone: "Asia/Jakarta", format: "Single Elimination",
  startsAt: "2026-09-20T02:00:00.000Z", eventStartsAt: new Date("2026-09-20T02:00:00.000Z"),
  venue: "Arena", venueAddress: null, prizePoolLabel: null, participantCap: 8,
  organizerName: "Organizer", organizerVerified: true, publishedScheduleVersion: null,
};
const graph = generateCompetitionGraph({
  eventId: event.id, config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
  teams: [{ id: "team-a", seed: 1 }, { id: "team-b", seed: 2 }],
});
const completion = { id: "completion-1", status: "completed", sourceSnapshot: { version: 1 }, podiumPlacements: [], awards: [] };
const joinedEvent = {
  ...event, completion, competitionPhases: [{ status: "completed", configuration: { graph } }],
  matches: [], teams: [], certificatePublications: [],
};

function holdFirstJoinedRead() {
  let release!: (value: typeof joinedEvent) => void;
  const waiting = new Promise<typeof joinedEvent>((resolve) => { release = resolve; });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  db.eventFindFirst.mockImplementationOnce(() => { markStarted(); return waiting; });
  return { started, release };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.eventFindUnique.mockResolvedValue(event);
  db.eventFindFirst.mockResolvedValue(joinedEvent);
  db.announcementFindMany.mockResolvedValue([]);
  db.teamFindMany.mockResolvedValue([]);
  db.certificateFindMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("Finished public event reader concurrency", () => {
  it("reads ten overlapping public snapshots independently", async () => {
    const gate = holdFirstJoinedRead();
    const viewers = [null, { id: "captain-1", role: "captain", name: "Captain", email: "captain@example.test" }] as const;
    const reads = Array.from({ length: 10 }, (_, index) => readPublicV3Event(event.slug, viewers[index % 2]));
    await gate.started;
    gate.release(joinedEvent);
    const views = await Promise.all(reads);

    expect(views).toHaveLength(10);
    expect(views.every((view) => view?.mode === "finished" && view.identity.title === "Finished Cup")).toBe(true);
    if (!views[0] || !views[1]) throw new Error("Missing finished projection");
    views[0].identity.title = "Mutated by a caller";
    expect(views[1].identity.title).toBe("Finished Cup");
    expect(db.eventFindFirst).toHaveBeenCalledTimes(10);
    expect(db.announcementFindMany).toHaveBeenCalledTimes(10);
    expect(db.phaseFindFirst).not.toHaveBeenCalled();
    expect(db.completionFindUnique).not.toHaveBeenCalled();
    expect(db.publicationFindFirst).not.toHaveBeenCalled();
  });

  it("reads updated public details after the earlier snapshot settles", async () => {
    const first = await readPublicV3Event(event.slug, null);
    db.eventFindFirst.mockResolvedValue({ ...joinedEvent, name: "Revised Finished Cup" });
    const second = await readPublicV3Event(event.slug, null);

    expect(first?.identity.title).toBe("Finished Cup");
    expect(second?.identity.title).toBe("Revised Finished Cup");
  });

  it("does not mix a replacement event's snapshot with the old slug owner", async () => {
    const replacement = { ...event, id: "event-2", name: "Replacement Cup" };
    const replacementGraph = generateCompetitionGraph({
      eventId: replacement.id, config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      teams: [{ id: "team-c", seed: 1 }, { id: "team-d", seed: 2 }],
    });
    const gate = holdFirstJoinedRead();
    db.eventFindUnique.mockResolvedValueOnce(event).mockResolvedValueOnce(replacement);
    db.eventFindFirst.mockResolvedValueOnce({ ...joinedEvent, ...replacement, competitionPhases: [{ status: "completed", configuration: { graph: replacementGraph } }] });

    const olderRead = readPublicV3Event(event.slug, null);
    await gate.started;
    const newerRead = readPublicV3Event(replacement.slug, null);
    gate.release(joinedEvent);
    const [older, newer] = await Promise.all([olderRead, newerRead]);

    expect(older?.identity.title).toBe("Finished Cup");
    expect(newer?.identity.title).toBe("Replacement Cup");
  });

  it("keeps a later same-ID identity visible during overlap", async () => {
    const revised = { ...event, name: "Revised Finished Cup", publishedRevision: 2 };
    const gate = holdFirstJoinedRead();
    db.eventFindUnique.mockResolvedValueOnce(event).mockResolvedValueOnce(revised);
    db.eventFindFirst.mockResolvedValueOnce({ ...joinedEvent, ...revised });

    const olderRead = readPublicV3Event(event.slug, null);
    await gate.started;
    const newerRead = readPublicV3Event(event.slug, null);
    gate.release(joinedEvent);
    const [older, newer] = await Promise.all([olderRead, newerRead]);

    expect(older?.identity.title).toBe("Finished Cup");
    expect(newer?.identity.title).toBe("Revised Finished Cup");
  });

  it("keeps a later same-ID completion and certificate publication visible without an Event edit", async () => {
    const types = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"];
    const publishedCompletion = {
      ...completion,
      podiumPlacements: [1, 2, 3].map((rank) => ({ rank, teamId: `team-${rank}`, teamName: `Team ${rank}` })),
      awards: ["mvp", "top_scorer", "top_defender", "top_assist"].map((type) => ({
        type, status: "approved", decision: { recipientId: `player-${type}`, recipientName: type, teamId: "team-1", teamName: "Team 1", reason: null },
      })),
    };
    const publication = { completionId: completion.id, completionVersion: 1, certificateIds: types.map((type) => `cert-${type}`) };
    db.certificateFindMany.mockResolvedValue(types.map((type) => ({
      id: `cert-${type}`, type, completionId: completion.id, completionVersion: 1,
      publishedUrl: `/certificates/${type}.png`, verificationCode: `VERIFY-${type}`, status: "ready",
    })));
    const revisedSnapshot = { ...joinedEvent, completion: publishedCompletion, certificatePublications: [publication] };
    const gate = holdFirstJoinedRead();
    db.eventFindFirst.mockResolvedValueOnce(revisedSnapshot);

    const olderRead = readPublicV3Event(event.slug, null);
    await gate.started;
    const newerRead = readPublicV3Event(event.slug, null);
    gate.release(joinedEvent);
    const [older, newer] = await Promise.all([olderRead, newerRead]);

    if (older?.mode !== "finished" || newer?.mode !== "finished") throw new Error("Expected Finished projections");
    expect(older?.identity.title).toBe("Finished Cup");
    expect(older?.certificates.status).toBe("preparing");
    expect(newer?.identity.title).toBe("Finished Cup");
    expect(newer?.certificates.status).toBe("published");
    expect(newer?.certificates.items).toHaveLength(7);
  });

  it("filters announcements at each request's default read time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
    db.announcementFindMany.mockResolvedValue([{
      id: "update-1", title: "Schedule update", body: "Public notice", status: "published",
      publishedAt: new Date("2026-10-04T00:00:00.000Z"),
      startsAt: new Date("2026-10-05T00:00:05.000Z"), endsAt: null,
    }]);
    const gate = holdFirstJoinedRead();

    const beforeStart = readPublicV3Event(event.slug, null);
    await gate.started;
    vi.setSystemTime(new Date("2026-10-05T00:00:10.000Z"));
    const afterStart = readPublicV3Event(event.slug, null);
    gate.release(joinedEvent);
    const [before, after] = await Promise.all([beforeStart, afterStart]);

    expect(before?.updates).toEqual([]);
    expect(after?.updates).toMatchObject([{ id: "update-1", title: "Schedule update" }]);
  });

  it("retries a fresh joined read after a transient failure", async () => {
    db.eventFindFirst.mockRejectedValueOnce(new Error("snapshot temporarily unavailable"));
    await expect(readPublicV3Event(event.slug, null)).rejects.toThrow("snapshot temporarily unavailable");

    const recovered = await readPublicV3Event(event.slug, null);

    expect(recovered?.identity.title).toBe("Finished Cup");
    expect(db.eventFindFirst).toHaveBeenCalledTimes(2);
  });
});
