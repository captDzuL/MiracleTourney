import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ phaseId: "phase-v3" as string | null, writes: 0, initialized: false, locked: false, requireLock: false }));
const row = () => ({ id: "m", eventId: "event", phaseId: boundary.phaseId, resultVersion: boundary.phaseId ? 1 : 0, homeTeamId: "a", awayTeamId: "b", roundLabel: "Final", round: 1, slot: 1, homeScore: 0, awayScore: 0, status: "Scheduled" });
const write = () => { if (boundary.requireLock && !boundary.locked) throw new Error("Unlocked legacy write"); boundary.writes++; return row(); };
const delegates = () => ({
  competitionPhase: { count: async () => boundary.initialized ? 1 : 0 },
  event: { findUnique: async () => ({ id: "event", format: "Single Elimination" }), updateMany: async () => { boundary.locked = true; return { count: 1 }; } },
  match: { findFirst: async () => row(), upsert: async () => write() },
  matchGame: { deleteMany: async () => write(), createMany: async () => write() },
});
vi.mock("./db", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction" ? async (work: (tx: unknown) => unknown) => { try { return await work(delegates()); } finally { boundary.locked = false; } } : delegates()[key as keyof ReturnType<typeof delegates>] }) }));
import { setMatchResult, setMatchGames } from "./repository";

describe("legacy result isolation", () => {
  beforeEach(() => { boundary.phaseId = "phase-v3"; boundary.writes = 0; boundary.initialized = false; boundary.requireLock = false; boundary.locked = false; });
  it.each(["score", "games"])("gates the event rather than only the individual %s match", async kind => {
    boundary.phaseId = null; boundary.initialized = true;
    const result = kind === "score" ? setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 }) : setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }], 1);
    await expect(result).rejects.toThrow("competition operation"); expect(boundary.writes).toBe(0);
  });
  it("holds the shared event lock through legacy writes to exclude concurrent initialization", async () => {
    boundary.phaseId = null; boundary.requireLock = true;
    await setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 });
    await setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }], 1);
    expect(boundary.writes).toBe(4);
  });
  it.each(["score", "games"])("blocks legacy %s writes for initialized V3 matches regardless of rollout flag", async kind => {
    const result = kind === "score" ? setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 }) : setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }], 1);
    await expect(result).rejects.toThrow("competition operation");
    expect(boundary.writes).toBe(0);
  });
  it("preserves both legacy result paths for a legacy match", async () => {
    boundary.phaseId = null;
    await setMatchResult({ eventId: "event", matchId: "m", homeScore: 3, awayScore: 0 });
    await setMatchGames("m", "event", [{ gameNumber: 1, homeScore: 3, awayScore: 0 }], 1);
    expect(boundary.writes).toBe(4);
  });
});
