import { beforeEach, describe, expect, it, vi } from "vitest";

type Submission = {
  id: string;
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  status: string;
  stats: Record<string, Record<string, number>>;
};

const boundary = vi.hoisted(() => ({
  completionStatus: null as string | null,
  version: 0,
  submissionWrites: 0,
  playerStatWrites: 0,
  locked: false,
  submission: {
    id: "submission-1",
    matchId: "match-1",
    teamId: "team-1",
    eventId: "event-1",
    submittedBy: "captain-1",
    status: "pending",
    stats: { "player-1": { points: 12, assists: 2, rebounds: 3, steals: 1, blocks: 0, flb: 4 } },
  } as Submission,
}));

function delegates() {
  return {
    event: {
      updateMany: async () => {
        boundary.locked = true;
        boundary.version += 1;
        return { count: 1 };
      },
      findUnique: async () => ({ gameId: "game-kuroko" }),
    },
    match: {
      findFirst: async () => ({
        id: "match-1",
        roundLabel: "Final",
        resultSnapshot: null,
        games: [],
        event: { gameId: "game-kuroko", gameModeId: "mode-kuroko-3v3" },
      }),
    },
    team: {
      findFirst: async () => ({ id: "team-1" }),
    },
    tournamentCompletion: {
      findUnique: async () => boundary.completionStatus ? { status: boundary.completionStatus } : null,
    },
    statSubmission: {
      findUnique: async () => boundary.submission,
      upsert: async () => {
        boundary.submissionWrites += 1;
      },
      update: async () => {
        boundary.submissionWrites += 1;
      },
    },
    player: {
      findUnique: async () => ({ displayName: "Player One", nickname: "P1", position: "Guard" }),
      findMany: async () => [{ id: "player-1", nickname: "P1", position: "Guard" }],
    },
    playerStat: {
      upsert: async () => {
        boundary.playerStatWrites += 1;
      },
    },
  };
}

vi.mock("./db", () => ({
  prisma: new Proxy({}, {
    get: (_, key) => key === "$transaction"
      ? async (work: (tx: ReturnType<typeof delegates>) => unknown) => {
          const before = {
            version: boundary.version,
            submissionWrites: boundary.submissionWrites,
            playerStatWrites: boundary.playerStatWrites,
          };
          try {
            return await work(delegates());
          } catch (error) {
            boundary.version = before.version;
            boundary.submissionWrites = before.submissionWrites;
            boundary.playerStatWrites = before.playerStatWrites;
            throw error;
          } finally {
            boundary.locked = false;
          }
        }
      : delegates()[key as keyof ReturnType<typeof delegates>],
  }),
}));

import {
  adminWriteMatchPlayerStats,
  approveStatSubmission,
  rejectStatSubmission,
  upsertStatSubmission,
} from "./repository";

const mutations = {
  submit: () => upsertStatSubmission({
    matchId: "match-1",
    teamId: "team-1",
    eventId: "event-1",
    submittedBy: "captain-1",
    stats: { "player-1": { points: 12, assists: 2, rebounds: 3, steals: 1, blocks: 0, flb: 4 } },
  }),
  approve: () => approveStatSubmission("submission-1", "admin-1"),
  reject: () => rejectStatSubmission("submission-1", "admin-1", "Incorrect total"),
  admin: () => adminWriteMatchPlayerStats({
    matchId: "match-1",
    teamId: "team-1",
    eventId: "event-1",
    adminId: "admin-1",
    stats: { "player-1": { points: 15, assists: 2, rebounds: 3, steals: 1, blocks: 0, flb: 4 } },
  }),
};

describe("completion lock for award-source writes", () => {
  beforeEach(() => {
    boundary.completionStatus = null;
    boundary.version = 0;
    boundary.submissionWrites = 0;
    boundary.playerStatWrites = 0;
    boundary.locked = false;
    boundary.submission.status = "pending";
  });

  it.each(Object.entries(mutations))(
    "rejects and rolls back the %s mutation after tournament completion",
    async (_name, mutate) => {
      boundary.completionStatus = "completed";

      await expect(mutate()).rejects.toThrow("Tournament completion locks award-source writes");

      expect(boundary.version).toBe(0);
      expect(boundary.submissionWrites).toBe(0);
      expect(boundary.playerStatWrites).toBe(0);
    },
  );

  it.each(Object.entries(mutations))(
    "serializes the %s mutation through the event competition version when completion is reopened",
    async (_name, mutate) => {
      boundary.completionStatus = "reopened";

      await mutate();

      expect(boundary.version).toBe(1);
      expect(boundary.locked).toBe(false);
    },
  );
});
