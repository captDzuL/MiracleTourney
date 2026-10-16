// Moved out of platform/repository.test.ts without changes (refactor Phase 4).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    competitionPhase: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    matchResultRevision: { findMany: vi.fn() },
    eventRoundConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    matchGame: {
      findMany: vi.fn(),
    },
    team: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    teamRegistrationRequest: {
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organizerProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    eventPreviewToken: {
      updateMany: vi.fn(),
    },
    eventEditRevision: {
      updateMany: vi.fn(),
    },
    eventSlugRedirect: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    eventVisualAsset: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registrationImportBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    eventPaymentSettings: {
      findUnique: vi.fn(),
    },
    registrationImportItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    statSubmission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    certificate: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tournamentCompletion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    competitionAuditLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $connect: vi.fn(),
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { adminWriteMatchPlayerStats, readEventMatchStatistics, approveStatSubmission, rejectStatSubmission, upsertStatSubmission } from "@/lib/player-stats/write-repository";

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});


describe("authoritative player-stat write boundary", () => {
  const canonicalStats = {
    "player-1": { scores: [7.6], goal: 3, assist: 4, passing: 28, defense: 12 },
  };

  function prepareBoundary() {
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.tournamentCompletion.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", mustChangePassword: false });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", competitionVersion: 7, organizerUserId: "owner-1" });
    prisma.competitionAuditLog.findFirst.mockResolvedValue(null);
    prisma.competitionAuditLog.create.mockResolvedValue({ id: "audit-1" });
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1",
      eventId: "event-1",
      status: "Completed",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      roundLabel: "Final",
      resultSnapshot: { bestOf: 1, games: [{ gameNumber: 1 }] },
      resultVersion: 2,
      games: [{ gameNumber: 1 }],
      event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    });
    prisma.team.findFirst.mockResolvedValue({ id: "team-1" });
    prisma.player.findMany.mockResolvedValue([{ id: "player-1", nickname: "Nyx", position: "Forward", createdAt: new Date("2026-10-01T00:00:00Z"), removedAt: null }]);
    prisma.playerStat.findMany.mockResolvedValue([]);
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 1 });
    prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prepareBoundary();
  });

  const guard = { eventId: "event-1", matchId: "match-1", expectedVersion: 7, expectedResultVersion: 2, operationId: "operation-1", submittedAt: "2026-09-16T00:00:00.000Z" };
  const pending = () => ({ id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1", submittedBy: "captain-1", status: "pending", submittedAt: new Date(guard.submittedAt), stats: canonicalStats });

  it("reads only the authorized match with ordered games, roster, submissions and revisions", async () => {
    prisma.match.findFirst.mockResolvedValue({id:"match-1",eventId:"event-1",resultVersion:2,status:"Completed",homeTeamId:"team-1",awayTeamId:"team-2",roundLabel:"Final",resultSnapshot:{bestOf:3},games:[{gameNumber:2,homeScore:2,awayScore:1},{gameNumber:1,homeScore:2,awayScore:0}],event:{gameId:"game-flashpeak",gameModeId:"mode-flashpeak-5v5"}});
    prisma.team.findMany.mockResolvedValue([{id:"team-1",name:"Home"},{id:"team-2",name:"Away"}]);
    prisma.player.findMany.mockResolvedValue([{id:"player-1",teamId:"team-1",nickname:"Nyx",position:"Forward",createdAt:new Date("2026-10-01T00:00:00Z"),removedAt:null}]);
    prisma.playerStat.findMany.mockResolvedValue([{playerId:"player-1",stats:canonicalStats["player-1"]}]);
    prisma.statSubmission.findMany.mockResolvedValue([{...pending(),reviewedAt:null,reviewedBy:null,rejectionNote:null}]);
    prisma.matchResultRevision.findMany.mockResolvedValue([]);
    const result=await readEventMatchStatistics("event-1","match-1","admin-1");
    expect(result.games.map(game=>game.gameNumber)).toEqual([1,2]);
    expect(result.scoreGameNumbers).toEqual([1,2]);
    expect(result.submissions[0]).toMatchObject({status:"pending",submittedAt:guard.submittedAt});
    expect(result.teams[0].players[0].nickname).toBe("Nyx");
    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{eventId:"event-1",matchId:"match-1"}}));
  });
  it("rejects foreign event readers before fetching sensitive statistics",async()=>{
    prisma.user.findUnique.mockResolvedValue({id:"stranger",role:"organizer"});
    await expect(readEventMatchStatistics("event-1","match-b","stranger")).rejects.toThrow("authorized");
    expect(prisma.match.findFirst).not.toHaveBeenCalled();
    expect(prisma.statSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns a generic missing result for a manipulated match ID before nested reads", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", mustChangePassword: false });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", organizerUserId: "owner-1", competitionVersion: 7 });
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(readEventMatchStatistics("event-1", "match-b", "admin-1")).rejects.toThrow("Match not found");
    expect(prisma.statSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(prisma.matchResultRevision.findMany).not.toHaveBeenCalled();
  });

  it("rejects a captain calling the organizer repository directly", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "captain-1", role: "captain" });
    await expect(adminWriteMatchPlayerStats({ matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "captain-1", stats: canonicalStats })).rejects.toThrow("authorized");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-owner organizer inside the write transaction", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "other", role: "organizer", mustChangePassword: false });
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(approveStatSubmission("submission-1", "other", guard)).rejects.toThrow("authorized");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { expectedVersion: 6 }, { expectedResultVersion: 1 },
    { submittedAt: "2026-09-15T00:00:00.000Z" }, { eventId: "foreign-event" }, { matchId: "foreign-match" },
  ])("rejects stale or foreign review %j without writes", async change => {
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(approveStatSubmission("submission-1", "admin-1", { ...guard, ...change })).rejects.toThrow();
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("returns a generic missing denial for a manipulated submission ID before any write", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue(null);

    await expect(approveStatSubmission("submission-b", "admin-1", guard)).rejects.toThrow("Submission not found");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.competitionAuditLog.create).not.toHaveBeenCalled();
  });

  it("requires a nonblank rejection reason at the shared boundary", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(rejectStatSubmission("submission-1", "admin-1", "  ", guard)).rejects.toThrow("reason");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("writes an organizer overwrite audit and replays uncertain success without a second write", async () => {
    const input = { matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: canonicalStats, guard };
    await adminWriteMatchPlayerStats(input);
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "event-1", matchId: "match-1", actorUserId: "admin-1", action: "player_stats_save", idempotencyKey: "operation-1" }) }));
    const receipt = prisma.competitionAuditLog.create.mock.calls[0][0].data;
    prisma.competitionAuditLog.findFirst.mockResolvedValue(receipt);
    prisma.playerStat.upsert.mockClear();
    prisma.event.updateMany.mockClear();
    await adminWriteMatchPlayerStats(input);
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    await expect(adminWriteMatchPlayerStats({ ...input, stats: { "player-1": { ...canonicalStats["player-1"], goal: 4 } } })).rejects.toThrow("conflict");
  });

  it("allows the guarded player-stat transaction to finish under CI database load", async () => {
    await adminWriteMatchPlayerStats({ matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: canonicalStats, guard });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 20_000,
    });
  });

  it("rejects a captain payload containing a player from another team", async () => {
    await expect(upsertStatSubmission({
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      stats: { "foreign-player": canonicalStats["player-1"] },
    })).rejects.toThrow("does not belong");
    expect(prisma.statSubmission.upsert).not.toHaveBeenCalled();
  });
  it("resets prior review metadata when captain resubmits and leaves published player stats untouched",async()=>{
    await upsertStatSubmission({matchId:"match-1",teamId:"team-1",eventId:"event-1",submittedBy:"captain-1",stats:canonicalStats});
    expect(prisma.statSubmission.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({status:"pending",reviewedAt:null,reviewedBy:null,rejectionNote:null})}));
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a forged stored captain payload again during approval", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      status: "pending",
      stats: { "foreign-player": canonicalStats["player-1"] },
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("does not belong");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.update).not.toHaveBeenCalled();
  });

  it("rejects an organizer direct save when match, team, and event do not agree", async () => {
    prisma.match.findFirst.mockResolvedValue(null);
    await expect(adminWriteMatchPlayerStats({
      matchId: "match-other-event",
      teamId: "team-1",
      eventId: "event-1",
      adminId: "admin-1",
      stats: canonicalStats,
    })).rejects.toThrow("relationship is invalid");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a captain submission whose score array became stale before approval", async () => {
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1",
      eventId: "event-1",
      status: "Completed",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      roundLabel: "Final",
      resultSnapshot: { bestOf: 3, games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] },
      resultVersion: 2,
      games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }],
      event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    });
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 3 });
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      status: "pending",
      stats: canonicalStats,
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("score array length");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("rejects stale approval when the submission is already %s", async (status) => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status, stats: canonicalStats,
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("no longer pending");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("rejects stale rejection when the submission is already %s", async (status) => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status, stats: canonicalStats,
    });
    await expect(rejectStatSubmission("submission-1", "admin-1", "Stale tab")).rejects.toThrow("no longer pending");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("fails the approval when a competing reviewer wins the pending transition", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status: "pending", stats: canonicalStats,
    });
    prisma.statSubmission.updateMany.mockResolvedValue({ count: 0 });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("no longer pending");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "submission-1", status: "pending" },
    }));
  });
});

describe("player-stat roster follows the roster the team had at match time", () => {
  const stats = { scores: [7.6], goal: 3, assist: 4, passing: 28, defense: 12 };
  const started = new Date("2026-10-12T10:00:00Z");
  const before = new Date("2026-10-01T00:00:00Z");
  const after = new Date("2026-10-14T00:00:00Z");
  const roster = {
    steady: { id: "steady", teamId: "team-1", nickname: "Steady", position: "Forward", createdAt: before, removedAt: null },
    left: { id: "left", teamId: "team-1", nickname: "Left", position: "Guard", createdAt: before, removedAt: after },
    joined: { id: "joined", teamId: "team-1", nickname: "Joined", position: "Guard", createdAt: after, removedAt: null },
  };

  function arrange(matchClock: { actualStartedAt: Date | null }, savedStatPlayerIds: string[] = []) {
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", mustChangePassword: false });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", competitionVersion: 7, organizerUserId: "owner-1" });
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1", eventId: "event-1", status: "Completed", homeTeamId: "team-1", awayTeamId: "team-2", roundLabel: "Final",
      resultSnapshot: { bestOf: 1, games: [{ gameNumber: 1 }] }, resultVersion: 2, games: [{ gameNumber: 1 }],
      actualEndedAt: null, resultConfirmedAt: null, ...matchClock,
      event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    });
    prisma.team.findFirst.mockResolvedValue({ id: "team-1" });
    prisma.team.findMany.mockResolvedValue([{ id: "team-1", name: "Home" }, { id: "team-2", name: "Away" }]);
    prisma.player.findMany.mockResolvedValue(Object.values(roster));
    prisma.playerStat.findMany.mockResolvedValue(savedStatPlayerIds.map((playerId) => ({ playerId, teamId: "team-1", stats })));
    prisma.statSubmission.findMany.mockResolvedValue([]);
    prisma.matchResultRevision.findMany.mockResolvedValue([]);
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 1 });
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.tournamentCompletion.findUnique.mockResolvedValue(null);
    prisma.competitionAuditLog.findFirst.mockResolvedValue(null);
    prisma.competitionAuditLog.create.mockResolvedValue({ id: "audit-1" });
    prisma.playerStat.upsert.mockResolvedValue({});
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the organizer editor lists the players who were on the roster when the match started", async () => {
    arrange({ actualStartedAt: started });
    const result = await readEventMatchStatistics("event-1", "match-1", "admin-1");
    expect(result.teams[0].players.map((player) => player.id)).toEqual(["steady", "left"]);
    expect(Object.keys(result.teams[0].players[0]).sort()).toEqual(["id", "nickname", "position", "teamId"]);
  });

  it("the organizer editor lists only active players for a match that has not started", async () => {
    arrange({ actualStartedAt: null });
    const result = await readEventMatchStatistics("event-1", "match-1", "admin-1");
    expect(result.teams[0].players.map((player) => player.id)).toEqual(["steady", "joined"]);
  });

  it("accepts a correction for a player who left after the match", async () => {
    arrange({ actualStartedAt: started });
    await adminWriteMatchPlayerStats({
      matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: { left: stats },
      guard: { eventId: "event-1", matchId: "match-1", expectedVersion: 7, expectedResultVersion: 2, operationId: "op-left", submittedAt: "2026-10-12T12:00:00.000Z" },
    });
    expect(prisma.playerStat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ matchId_playerId: expect.objectContaining({ playerId: "left" }) }),
    }));
  });

  it("refuses to credit a player who joined after the match started", async () => {
    arrange({ actualStartedAt: started });
    await expect(adminWriteMatchPlayerStats({
      matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: { joined: stats },
      guard: { eventId: "event-1", matchId: "match-1", expectedVersion: 7, expectedResultVersion: 2, operationId: "op-joined", submittedAt: "2026-10-12T12:00:00.000Z" },
    })).rejects.toThrow("Player does not belong");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });
});