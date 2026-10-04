import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
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
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("narrow public homepage featured read", () => {
  it("shares one active same-slug default transaction but returns independent public views and rereads after settlement", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const gate = deferred<void>();
    boundary.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      await gate.promise;
      return fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } });
    });
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const first = readPublicHomeFeaturedEvent("cup");
    const second = readPublicHomeFeaturedEvent("cup");
    const activeTransactions = boundary.transaction.mock.calls.length;
    gate.resolve();
    const [one, two] = await Promise.all([first, second]);
    expect(activeTransactions).toBe(1);
    expect(one).toMatchObject({ mode: "ongoing", source: "authoritative", identity: { slug: "cup", title: "Miracle Cup" } });
    expect(two).toEqual(one);
    expect(two).not.toBe(one);
    expect(two?.identity).not.toBe(one?.identity);
    if (one?.mode !== "ongoing" || two?.mode !== "ongoing") throw new Error("expected two public ongoing views");
    one.identity.title = "mutated by caller";
    one.liveMatches[0].home = "private mutation";
    expect(two.identity.title).toBe("Miracle Cup");
    expect(two.liveMatches[0].home).toBe("Alpha");
    expect(info.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("stage=transaction_start"))).toHaveLength(1);

    boundary.event.mockResolvedValueOnce({ ...event(), publishedScheduleVersion: 3, name: "New public title" });
    boundary.revision.mockResolvedValueOnce({ version: 3, status: "published", snapshot: { draft: { assignments: [
      { matchId: "match-live", start: "2026-09-21T03:00:00.000Z", end: "2026-09-21T04:00:00.000Z", roomId: "B" },
    ] } } });
    const fresh = await readPublicHomeFeaturedEvent("cup");
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    expect(fresh).toMatchObject({ identity: { title: "New public title" }, liveMatches: [{ start: "2026-09-21T03:00:00.000Z" }] });
    boundary.event.mockResolvedValueOnce({ ...event(), status: "Draft" });
    boundary.full.mockResolvedValueOnce(null);
    await expect(readPublicHomeFeaturedEvent("cup")).resolves.toBeNull();
    expect(boundary.transaction).toHaveBeenCalledTimes(3);
    expect(boundary.full).toHaveBeenCalledTimes(1);
  });

  it("runs fallback independently for each shared null and rechecks private status after settlement", async () => {
    const gate = deferred<void>();
    boundary.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      await gate.promise;
      return fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } });
    });
    boundary.event.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...event(), status: "Draft" });
    boundary.full.mockResolvedValue(null);
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const one = readPublicHomeFeaturedEvent("cup");
    const two = readPublicHomeFeaturedEvent("cup");
    const activeTransactions = boundary.transaction.mock.calls.length;
    gate.resolve();
    expect(await Promise.all([one, two])).toEqual([null, null]);
    expect(activeTransactions).toBe(1);
    expect(boundary.full).toHaveBeenCalledTimes(2);
    expect(await readPublicHomeFeaturedEvent("cup")).toBeNull();
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    expect(boundary.full).toHaveBeenCalledTimes(3);
    expect(boundary.revision).not.toHaveBeenCalled();
  });

  it("propagates the exact shared transaction error and starts fresh after rejection", async () => {
    const gate = deferred<void>();
    const original = Object.assign(new Error("private transaction detail"), { code: "P2028" });
    boundary.transaction.mockImplementationOnce(async () => { await gate.promise; throw original; });
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const one = readPublicHomeFeaturedEvent("cup");
    const two = readPublicHomeFeaturedEvent("cup");
    const activeTransactions = boundary.transaction.mock.calls.length;
    const both = Promise.allSettled([one, two]);
    gate.resolve();
    expect(await both).toEqual([{ status: "rejected", reason: original }, { status: "rejected", reason: original }]);
    expect(activeTransactions).toBe(1);
    expect((await readPublicHomeFeaturedEvent("cup"))?.mode).toBe("ongoing");
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
  });

  it("does not share across slugs, explicit dates, or a flags-off invocation", async () => {
    const gate = deferred<void>();
    boundary.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      await gate.promise;
      return fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } });
    });
    boundary.event.mockImplementation(({ where }: { where: { slug: string } }) => Promise.resolve({ ...event(), slug: where.slug }));
    boundary.full.mockResolvedValue(null);
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const first = readPublicHomeFeaturedEvent("cup-a");
    const different = readPublicHomeFeaturedEvent("cup-b");
    const explicit = readPublicHomeFeaturedEvent("cup-a", now);
    const anotherExplicit = readPublicHomeFeaturedEvent("cup-a", new Date(now.valueOf() + 1_000));
    boundary.enabled = false;
    const disabled = readPublicHomeFeaturedEvent("cup-a");
    expect(boundary.transaction).toHaveBeenCalledTimes(4);
    expect(await disabled).toBeNull();
    expect(boundary.full).toHaveBeenCalledWith("cup-a", null, expect.any(Date));
    boundary.enabled = true;
    gate.resolve();
    const [a, b, c, d] = await Promise.all([first, different, explicit, anotherExplicit]);
    expect(a?.identity.slug).toBe("cup-a");
    expect(b?.identity.slug).toBe("cup-b");
    expect(c?.identity.slug).toBe("cup-a");
    expect(d?.identity.slug).toBe("cup-a");
    expect(boundary.transaction).toHaveBeenCalledTimes(4);
  });

  it("bypasses sharing at 64 active keys and for slugs above 200 characters without rejecting input", async () => {
    const gate = deferred<void>();
    boundary.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      await gate.promise;
      return fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } });
    });
    boundary.event.mockImplementation(({ where }: { where: { slug: string } }) => Promise.resolve({ ...event(), slug: where.slug }));
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const longSlug = "x".repeat(201);
    const longA = readPublicHomeFeaturedEvent(longSlug);
    const longB = readPublicHomeFeaturedEvent(longSlug);
    expect(boundary.transaction).toHaveBeenCalledTimes(2);
    const active = Array.from({ length: 64 }, (_, index) => readPublicHomeFeaturedEvent(`cup-${index}`));
    expect(boundary.transaction).toHaveBeenCalledTimes(66);
    const overflowA = readPublicHomeFeaturedEvent("overflow");
    const overflowB = readPublicHomeFeaturedEvent("overflow");
    expect(boundary.transaction).toHaveBeenCalledTimes(68);
    gate.resolve();
    const views = await Promise.all([longA, longB, ...active, overflowA, overflowB]);
    expect(views).toHaveLength(68);
    expect(views.every((view) => view?.mode === "ongoing")).toBe(true);
    expect(views[0]?.identity.slug).toBe(longSlug);
    expect(boundary.full).not.toHaveBeenCalled();
    const later = await readPublicHomeFeaturedEvent("overflow");
    expect(later?.mode).toBe("ongoing");
    expect(boundary.transaction).toHaveBeenCalledTimes(69);
  });
  it("distinguishes transaction entry rejection from rejection after the callback without changing errors", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const entryError = Object.assign(new Error("private entry detail"), { code: "P2028" });
    boundary.transaction.mockRejectedValueOnce(entryError);
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBe(entryError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=transaction_start class=transaction_error/),
    ]));
    expect(info.mock.calls.flat().join(" ")).not.toContain("private entry detail");

    info.mockClear();
    const finishError = Object.assign(new Error("private finish detail"), { code: "P2028" });
    boundary.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      await fn({ event: { findFirst: boundary.event }, scheduleRevision: { findFirst: boundary.revision } });
      throw finishError;
    });
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBe(finishError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/stage=callback_done/),
      expect.stringMatching(/failure stage=transaction_after_callback class=transaction_error/),
    ]));
  });

  it("attributes query, projection and fallback failures to their own stages", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const queryError = Object.assign(new Error("private query detail"), { code: "P2024" });
    boundary.event.mockRejectedValueOnce(queryError);
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBe(queryError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=event_read_start class=pool_timeout/),
    ]));

    info.mockClear();
    const revisionError = Object.assign(new Error("private revision detail"), { code: "P1001" });
    boundary.revision.mockRejectedValueOnce(revisionError);
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBe(revisionError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=revision_read_start class=connection_error/),
    ]));

    info.mockClear();
    boundary.revision.mockResolvedValueOnce({ version: 2, status: "published", snapshot: { draft: null } });
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBeInstanceOf(TypeError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=projection_start class=projection_error/),
    ]));

    info.mockClear();
    boundary.enabled = false;
    const fallbackError = Object.assign(new Error("private fallback detail"), { code: "P2034" });
    boundary.full.mockRejectedValueOnce(fallbackError);
    await expect(readPublicHomeFeaturedEvent("cup", now)).rejects.toBe(fallbackError);
    expect(info.mock.calls.map(([line]) => String(line))).toEqual(expect.arrayContaining([
      expect.stringMatching(/failure stage=fallback_start class=transaction_conflict/),
    ]));
    expect(info.mock.calls.flat().join(" ")).not.toMatch(/private query detail|private revision detail|private fallback detail/);
  });

  it("keeps simultaneous failure stages request-local", async () => {
    vi.stubEnv("PUBLIC_V3_HOME_DISCOVERY_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { readPublicHomeFeaturedEvent } = await import("./public-home-read");
    const eventError = Object.assign(new Error("secret A"), { code: "P2024" });
    const revisionError = Object.assign(new Error("secret B"), { code: "P2034" });
    boundary.event.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      await Promise.resolve();
      if (where.slug === "cup-a") throw eventError;
      return event();
    });
    boundary.revision.mockRejectedValue(revisionError);
    const results = await Promise.allSettled([readPublicHomeFeaturedEvent("cup-a", now), readPublicHomeFeaturedEvent("cup-b", now)]);
    expect(results).toEqual([{ status: "rejected", reason: eventError }, { status: "rejected", reason: revisionError }]);
    const failures = info.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(" failure "));
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/stage=event_read_start class=pool_timeout/),
      expect.stringMatching(/stage=revision_read_start class=transaction_conflict/),
    ]));
    expect(failures).toHaveLength(2);
    expect(failures.join(" ")).not.toMatch(/secret A|secret B/);
  });
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
