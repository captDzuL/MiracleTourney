import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ phaseId: "phase-v3" as string | null, writes: 0, version: 0, initialized: false, completionStatus: null as string | null, locked: false, requireLock: false, roundBestOf: 3 as number | null, matchWhere: null as unknown, matchUpdate: null as unknown, games: [] as unknown[] }));
const row = () => ({ id: "m", eventId: "event", phaseId: boundary.phaseId, resultVersion: boundary.phaseId ? 1 : 0, homeTeamId: "a", awayTeamId: "b", roundLabel: "Final", round: 1, slot: 1, homeScore: 0, awayScore: 0, status: "Scheduled" });
const write = (value: unknown = row()) => { if (boundary.requireLock && !boundary.locked) throw new Error("Unlocked legacy write"); boundary.writes++; return value; };
const delegates = () => ({
  competitionPhase: { count: async () => boundary.initialized ? 1 : 0 },
  tournamentCompletion: { findUnique: async () => boundary.completionStatus ? { status: boundary.completionStatus } : null },
  event: { findUnique: async () => ({ id: "event", format: "Single Elimination" }), updateMany: async () => { boundary.locked = true; boundary.version++; return { count: 1 }; } },
  eventRoundConfig: {
    findUnique: async () => boundary.roundBestOf == null ? null : ({ eventId: "event", roundLabel: "Final", bestOf: boundary.roundBestOf }),
    upsert: async () => write(),
  },
  match: { findFirst: async ({ where }: { where: unknown }) => { boundary.matchWhere = where; return row(); }, upsert: async ({ update }: { update: unknown }) => { boundary.matchUpdate = update; return write(); } },
  matchGame: { deleteMany: async () => write(), createMany: async ({ data }: { data: unknown[] }) => { boundary.games = data; return write(); } },
});
vi.mock("./db", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction" ? async (work: (tx: unknown) => unknown) => {
  const before = { version: boundary.version, writes: boundary.writes, matchUpdate: boundary.matchUpdate, games: [...boundary.games] };
  try { return await work(delegates()); } catch (error) {
    boundary.version = before.version; boundary.writes = before.writes; boundary.matchUpdate = before.matchUpdate; boundary.games = before.games;
    throw error;
  } finally { boundary.locked = false; }
} : delegates()[key as keyof ReturnType<typeof delegates>] }) }));
import { setMatchResult, setMatchGames, upsertRoundConfig } from "./repository";

describe("legacy result isolation", () => {
  beforeEach(() => { boundary.phaseId = "phase-v3"; boundary.writes = 0; boundary.version = 0; boundary.initialized = false; boundary.completionStatus = null; boundary.requireLock = false; boundary.locked = false; boundary.roundBestOf = 3; boundary.matchWhere = null; boundary.matchUpdate = null; boundary.games = []; });
  it.each(["score", "games", "round"])("rolls back and blocks legacy %s writes while completion is locked", async kind => {
    boundary.phaseId = null; boundary.completionStatus = "completed";
    const result = kind === "score"
      ? setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 })
      : kind === "games"
        ? setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }])
        : upsertRoundConfig("event", "Final", 3);
    await expect(result).rejects.toThrow("Tournament completion locks competitive writes");
    expect(boundary.version).toBe(0);
    expect(boundary.writes).toBe(0);
  });
  it.each(["score", "games"])("gates the event rather than only the individual %s match", async kind => {
    boundary.phaseId = null; boundary.initialized = true;
    const result = kind === "score" ? setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 }) : setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }]);
    await expect(result).rejects.toThrow("competition operation"); expect(boundary.writes).toBe(0);
  });
  it("holds the shared event lock through legacy writes to exclude concurrent initialization", async () => {
    boundary.phaseId = null; boundary.requireLock = true;
    await setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 });
    await setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }]);
    expect(boundary.writes).toBe(4);
  });
  it("uses that same event lock for round-rule writes so result semantics cannot race", async () => {
    boundary.phaseId = null; boundary.requireLock = true;
    await upsertRoundConfig("event", "Final", 3);
    expect(boundary.writes).toBe(1);
    expect(boundary.version).toBe(1);
  });
  it("blocks round-rule writes once V3 initialization wins the shared event lock", async () => {
    boundary.phaseId = null; boundary.initialized = true;
    await expect(upsertRoundConfig("event", "Final", 3)).rejects.toThrow("competition operation");
    expect(boundary.writes).toBe(0);
    expect(boundary.version).toBe(0);
  });
  it.each(["score", "games"])("blocks legacy %s writes for initialized V3 matches regardless of rollout flag", async kind => {
    const result = kind === "score" ? setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 }) : setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }]);
    await expect(result).rejects.toThrow("competition operation");
    expect(boundary.writes).toBe(0);
  });
  it("preserves both legacy result paths for a legacy match", async () => {
    boundary.phaseId = null;
    await setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 });
    await setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }]);
    expect(boundary.writes).toBe(4);
  });
  it("derives the series threshold from the event-scoped match round rule", async () => {
    boundary.phaseId = null; boundary.roundBestOf = 3;
    await setMatchGames("m", "event", [
      { gameNumber: 1, homeScore: 21, awayScore: 10 },
      { gameNumber: 2, homeScore: 10, awayScore: 21 },
      { gameNumber: 3, homeScore: 21, awayScore: 18 },
    ]);
    expect(boundary.matchWhere).toEqual({ id: "m", eventId: "event" });
    expect(boundary.matchUpdate).toMatchObject({ homeScore: 2, awayScore: 1, status: "Completed", winnerTeamId: "a" });
    expect(boundary.games).toHaveLength(3);
  });
  it("defaults safely to BO1 only when the match round has no configured rule", async () => {
    boundary.phaseId = null; boundary.roundBestOf = null;
    await setMatchGames("m", "event", [
      { gameNumber: 1, homeScore: 21, awayScore: 10 },
      { gameNumber: 2, homeScore: 10, awayScore: 21 },
    ]);
    expect(boundary.matchUpdate).toMatchObject({ homeScore: 1, awayScore: 0, status: "Completed", winnerTeamId: "a" });
    expect(boundary.games).toHaveLength(1);
  });
  it("never lets extra submitted rows extend play beyond the server-side series rule", async () => {
    boundary.phaseId = null; boundary.roundBestOf = null;
    await setMatchGames("m", "event", [
      { gameNumber: 1, homeScore: 10, awayScore: 10 },
      { gameNumber: 2, homeScore: 21, awayScore: 10 },
    ]);
    expect(boundary.matchUpdate).toMatchObject({ homeScore: 0, awayScore: 0, status: "Scheduled", winnerTeamId: null });
    expect(boundary.games).toHaveLength(1);
  });
  it.each([0, 2, -1])("rejects corrupt server-side best-of %s and rolls back before match writes", async bestOf => {
    boundary.phaseId = null; boundary.roundBestOf = bestOf;
    await expect(setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 21, awayScore: 10 }])).rejects.toThrow("round configuration");
    expect(boundary.writes).toBe(0);
    expect(boundary.version).toBe(0);
    expect(boundary.locked).toBe(false);
  });
});
