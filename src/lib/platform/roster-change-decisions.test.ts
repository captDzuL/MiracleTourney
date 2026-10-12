import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, readRosterChangeState, runSerializableRegistrationTransaction, assertUserCanManageEvent } = vi.hoisted(() => ({
  prisma: {
    rosterChangeRequest: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    team: { findFirst: vi.fn() },
    event: { findUnique: vi.fn(), update: vi.fn() },
    match: { count: vi.fn() },
    player: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    competitionAuditLog: { create: vi.fn() },
  },
  readRosterChangeState: vi.fn(),
  runSerializableRegistrationTransaction: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
}));
vi.mock("./db", () => ({ prisma }));
vi.mock("./repository", () => ({ readRosterChangeState, runSerializableRegistrationTransaction, assertUserCanManageEvent }));

import { decideRosterChange, setRosterChangeLimit } from "./roster-change-decisions";
import { RosterChangeError, type RosterChangeErrorCode } from "./roster-change-rules";

const organizer = { id: "organizer-1", role: "organizer", email: "o@test.com", name: "Organizer" } as never;
const before = new Date("2026-10-01T00:00:00Z");
const player = (id: string, displayName: string, nickname: string, removedAt: Date | null = null, rosterGaps: unknown = []) =>
  ({ id, displayName, nickname, position: "Forward", removedAt, rosterGaps, createdAt: before });
// mode-flashpeak-5v5: 5 on court, at most 8, positions Forward/Midfielder/Defender/Goalkeeper
const roster = ["a", "b", "c", "d", "e"].map((x) => player(`p-${x}`, `UID-${x}`, `Nick-${x}`));
const joining = { displayName: "UID-new", nickname: "NewGuy", position: "Defender" };

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1", eventId: "event-1", teamId: "team-1", requestedById: "captain-1", kind: "swap", status: "pending",
    outPlayerId: "p-b", returnPlayerId: null, inPlayerId: null,
    outgoing: { displayName: "UID-b", nickname: "Nick-b", position: "Forward" }, incoming: { ...joining, activeElsewhere: [] },
    ...overrides,
  };
}

function arrange(overrides: { request?: object | null; players?: ReturnType<typeof player>[]; window?: string; limit?: number; approved?: number; live?: number; graph?: unknown; team?: object } = {}) {
  prisma.rosterChangeRequest.findUnique.mockResolvedValue(overrides.request === undefined ? pendingRequest() : overrides.request);
  prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: overrides.limit ?? 2, gameModeId: "mode-flashpeak-5v5" });
  readRosterChangeState.mockResolvedValue({ window: overrides.window ?? "limited", graph: overrides.graph ?? null });
  prisma.team.findFirst.mockResolvedValue({ id: "team-1", captainUid: "UID-a", captainIgn: "Nick-a", captainIsPlayer: true, ...overrides.team });
  prisma.match.count.mockResolvedValue(overrides.live ?? 0);
  prisma.rosterChangeRequest.count.mockResolvedValue(overrides.approved ?? 0);
  prisma.player.findMany.mockResolvedValue(overrides.players ?? roster);
  prisma.rosterChangeRequest.updateMany.mockResolvedValue({ count: 1 });
  prisma.player.updateMany.mockResolvedValue({ count: 1 });
  prisma.player.update.mockResolvedValue({});
  prisma.player.create.mockResolvedValue({ id: "p-created" });
  prisma.competitionAuditLog.create.mockResolvedValue({ id: "audit-1" });
}

async function codeOf(promise: Promise<unknown>): Promise<RosterChangeErrorCode | "no-error"> {
  try {
    await promise;
    return "no-error";
  } catch (error) {
    if (error instanceof RosterChangeError) return error.code;
    throw error;
  }
}

const approve = (note?: string) => decideRosterChange({ actor: organizer, requestId: "request-1", decision: "approve", note });
const reject = (note?: string) => decideRosterChange({ actor: organizer, requestId: "request-1", decision: "reject", note });

beforeEach(() => {
  vi.resetAllMocks();
  runSerializableRegistrationTransaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
  assertUserCanManageEvent.mockResolvedValue(undefined);
  prisma.rosterChangeRequest.findUnique.mockResolvedValue(pendingRequest());
});

describe("decideRosterChange: authorization", () => {
  it("lets only someone who manages the request's event decide", async () => {
    arrange();
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
    await expect(approve()).rejects.toThrow("Not authorized");
    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(prisma.player.updateMany).not.toHaveBeenCalled();
    expect(prisma.rosterChangeRequest.updateMany).not.toHaveBeenCalled();
  });
  it("reports a request that does not exist", async () => {
    arrange({ request: null });
    expect(await codeOf(approve())).toBe("request_not_found");
    expect(assertUserCanManageEvent).not.toHaveBeenCalled();
  });
});

describe("decideRosterChange: reject", () => {
  it("rejects with a reason and writes an audit entry, without touching the roster", async () => {
    arrange();
    await expect(reject("Belum terdaftar")).resolves.toEqual({ eventId: "event-1" });
    expect(prisma.rosterChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "pending" },
      data: expect.objectContaining({ status: "rejected", decidedById: "organizer-1", decisionNote: "Belum terdaftar" }),
    });
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventId: "event-1", actorUserId: "organizer-1", action: "roster_change_reject", reason: "Belum terdaftar", idempotencyKey: "request-1",
    }) });
    expect(prisma.player.updateMany).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });
  it("can reject even after the window closed or the allowance ran out", async () => {
    arrange({ window: "locked", approved: 2 });
    expect(await codeOf(reject())).toBe("no-error");
  });
  it("does not decide a request twice", async () => {
    arrange({ request: pendingRequest({ status: "approved" }) });
    expect(await codeOf(reject())).toBe("request_not_pending");
    expect(prisma.rosterChangeRequest.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite a cancel that lands between the read and the write", async () => {
    arrange();
    prisma.rosterChangeRequest.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(reject())).toBe("request_not_pending");
    expect(prisma.competitionAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("decideRosterChange: approve a swap", () => {
  it("marks the leaving player as removed and creates the joining player in the event", async () => {
    arrange();
    await expect(approve("Silakan")).resolves.toEqual({ eventId: "event-1" });
    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: "p-b", teamId: "team-1", removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    expect(prisma.player.create).toHaveBeenCalledWith({ data: {
      teamId: "team-1", eventId: "event-1", displayName: "UID-new", nickname: "NewGuy", position: "Defender",
    } });
    expect(prisma.rosterChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "pending" },
      data: expect.objectContaining({ status: "approved", decidedById: "organizer-1", decisionNote: "Silakan", inPlayerId: "p-created" }),
    });
  });
  it("never deletes a player, so statistics survive", async () => {
    arrange();
    await approve();
    expect(Object.keys(prisma.player)).not.toContain("delete");
    expect(Object.keys(prisma.player)).not.toContain("deleteMany");
  });
  it("writes an audit entry keyed by the request, and does not bump the competition version", async () => {
    arrange();
    await approve();
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventId: "event-1", actorUserId: "organizer-1", action: "roster_change_approve", idempotencyKey: "request-1",
      payload: expect.objectContaining({ requestId: "request-1", teamId: "team-1", kind: "swap", outPlayerId: "p-b", inPlayerId: "p-created", returned: false }),
    }) });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe("decideRosterChange: approve add and remove", () => {
  it("adds a substitute without removing anyone", async () => {
    arrange({ request: pendingRequest({ kind: "add", outPlayerId: null, outgoing: null }) });
    await approve();
    expect(prisma.player.updateMany).not.toHaveBeenCalled();
    expect(prisma.player.create).toHaveBeenCalled();
  });
  it("removes a player without adding anyone", async () => {
    arrange({
      request: pendingRequest({ kind: "remove", incoming: null }),
      players: [...roster, player("p-six", "UID-six", "Six")],
    });
    await approve();
    expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "p-b" }) }));
    expect(prisma.player.create).not.toHaveBeenCalled();
    expect(prisma.rosterChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "pending" },
      data: expect.objectContaining({ status: "approved", inPlayerId: null }),
    });
  });
});

describe("decideRosterChange: a former player comes back", () => {
  const leftOn = new Date("2026-10-05T00:00:00Z");
  const former = player("p-old", "UID-old", "OldAce", leftOn, [{ from: "2026-10-02T00:00:00.000Z", to: "2026-10-03T00:00:00.000Z" }]);
  const comeBack = { displayName: "uid-old", nickname: "OldAce", position: "Midfielder" };

  it("reuses the old row, records the absence and keeps earlier gaps", async () => {
    arrange({ request: pendingRequest({ returnPlayerId: "p-old", incoming: { ...comeBack, activeElsewhere: [] } }), players: [...roster, former] });
    await approve();
    expect(prisma.player.create).not.toHaveBeenCalled();
    const update = prisma.player.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "p-old" });
    expect(update.data.removedAt).toBeNull();
    expect(update.data.nickname).toBe("OldAce");
    expect(update.data.position).toBe("Midfielder");
    expect(update.data.rosterGaps).toHaveLength(2);
    expect(update.data.rosterGaps[0]).toEqual({ from: "2026-10-02T00:00:00.000Z", to: "2026-10-03T00:00:00.000Z" });
    expect(update.data.rosterGaps[1].from).toBe(leftOn.toISOString());
    expect(new Date(update.data.rosterGaps[1].to).getTime()).toBeGreaterThan(leftOn.getTime());
    expect(prisma.rosterChangeRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inPlayerId: "p-old" }) }));
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: expect.objectContaining({ returned: true }) }) });
  });
  it("finds a former player even if the request was filed before the player left", async () => {
    // returnPlayerId was empty at request time; the UID matches a former row now.
    arrange({ request: pendingRequest({ returnPlayerId: null, incoming: { ...comeBack, activeElsewhere: [] } }), players: [...roster, former] });
    await approve();
    expect(prisma.player.create).not.toHaveBeenCalled();
    expect(prisma.player.update).toHaveBeenCalled();
  });
});

describe("decideRosterChange: everything is checked again at approval", () => {
  it("refuses once the window closed", async () => {
    arrange({ window: "locked" });
    expect(await codeOf(approve())).toBe("window_closed");
    expect(prisma.player.updateMany).not.toHaveBeenCalled();
  });
  it("refuses a team that was disqualified after the request", async () => {
    arrange({ graph: { disqualifications: [{ teamId: "team-1" }] } });
    expect(await codeOf(approve())).toBe("team_disqualified");
  });
  it("refuses while the team is playing a live match", async () => {
    arrange({ live: 1 });
    expect(await codeOf(approve())).toBe("match_live");
  });
  it("refuses when the allowance is already used up, for example after the organizer lowered the limit", async () => {
    arrange({ limit: 1, approved: 1 });
    expect(await codeOf(approve())).toBe("no_allowance");
    arrange({ limit: 0, approved: 0 });
    expect(await codeOf(approve())).toBe("no_allowance");
  });
  it("refuses when the leaving player already left", async () => {
    arrange({ players: roster.map((p) => (p.id === "p-b" ? { ...p, removedAt: new Date("2026-10-06T00:00:00Z") } : p)) });
    expect(await codeOf(approve())).toBe("player_not_found");
  });
  it("refuses to remove the captain who also plays", async () => {
    arrange({ request: pendingRequest({ outPlayerId: "p-a" }) });
    expect(await codeOf(approve())).toBe("captain_player");
  });
  it("refuses when the joining UID joined the roster in the meantime", async () => {
    arrange({ players: [...roster.slice(0, 4), player("p-x", "UID-new", "Other")] });
    expect(await codeOf(approve())).toBe("already_on_roster");
  });
  it("refuses a position the game mode does not offer, even if the stored request says so", async () => {
    arrange({ request: pendingRequest({ incoming: { ...joining, position: "God Mode", activeElsewhere: [] } }) });
    expect(await codeOf(approve())).toBe("invalid_change");
  });
  it("refuses a stored request whose joining data is malformed", async () => {
    arrange({ request: pendingRequest({ incoming: "oops" }) });
    expect(await codeOf(approve())).toBe("invalid_change");
  });
  it("keeps the roster inside the game mode's limits", async () => {
    arrange({ request: pendingRequest({ kind: "remove", incoming: null }) });
    expect(await codeOf(approve())).toBe("roster_size");
  });
  it("does not approve when a cancel lands between the read and the write", async () => {
    arrange();
    prisma.rosterChangeRequest.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(approve())).toBe("request_not_pending");
  });
  it("turns a unique-constraint race on the IGN into a clear error", async () => {
    arrange();
    prisma.player.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["teamId", "nickname"] } }));
    expect(await codeOf(approve())).toBe("nickname_taken");
  });
  it("does not blame the IGN for some other unique constraint", async () => {
    arrange();
    prisma.player.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["somethingElse"] } }));
    await expect(approve()).rejects.toThrow("unique");
  });
});

describe("decideRosterChange: allowance counting and gaps", () => {
  it("approves the last allowed change: the request being approved is not counted against itself", async () => {
    arrange({ limit: 2, approved: 1 });
    expect(await codeOf(approve())).toBe("no-error");
    expect(prisma.rosterChangeRequest.count).toHaveBeenCalledWith({ where: { teamId: "team-1", status: "approved" } });
  });
  it("records no absence when the player left at the same moment (zero-length gap)", async () => {
    const future = new Date(Date.now() + 60_000);
    const former = player("p-old", "UID-old", "OldAce", future, []);
    arrange({ request: pendingRequest({ incoming: { displayName: "UID-old", nickname: "OldAce", position: "Midfielder", activeElsewhere: [] } }), players: [...roster, former] });
    await approve();
    expect(prisma.player.update.mock.calls[0][0].data.rosterGaps).toEqual([]);
  });
});

describe("setRosterChangeLimit", () => {
  function arrangeLimit(overrides: { status?: string; formatKind?: string | null; usage?: number[] } = {}) {
    prisma.event.findUnique.mockResolvedValue({
      status: overrides.status ?? "Published",
      formatConfig: overrides.formatKind === null ? null : { kind: overrides.formatKind ?? "group_playoffs" },
      rosterChangeLimit: 0,
    });
    prisma.rosterChangeRequest.groupBy.mockResolvedValue((overrides.usage ?? []).map((count, index) => ({ teamId: `t${index}`, _count: { _all: count } })));
    prisma.event.update.mockResolvedValue({});
    prisma.competitionAuditLog.create.mockResolvedValue({});
  }
  const set = (limit: number) => setRosterChangeLimit({ actor: organizer, eventId: "event-1", limit });

  it("saves the limit for a group + playoffs event and records who changed it", async () => {
    arrangeLimit();
    await set(2);
    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { rosterChangeLimit: 2 } });
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventId: "event-1", actorUserId: "organizer-1", action: "roster_change_limit_set", payload: { from: 0, to: 2 },
    }) });
  });
  it.each([-1, 6, 1.5, Number.NaN])("rejects %s", async (limit) => {
    arrangeLimit();
    expect(await codeOf(set(limit))).toBe("invalid_limit");
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
  it("refuses a limit for formats without a group stage", async () => {
    arrangeLimit({ formatKind: "single_elimination" });
    expect(await codeOf(set(2))).toBe("format_not_supported");
    arrangeLimit({ formatKind: null });
    expect(await codeOf(set(2))).toBe("format_not_supported");
  });
  it("writes nothing when the limit does not change", async () => {
    arrangeLimit();
    prisma.event.findUnique.mockResolvedValue({ status: "Published", formatConfig: { kind: "group_playoffs" }, rosterChangeLimit: 2 });
    await set(2);
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.competitionAuditLog.create).not.toHaveBeenCalled();
  });
  it("always allows turning the feature off", async () => {
    arrangeLimit({ formatKind: "single_elimination" });
    expect(await codeOf(set(0))).toBe("no-error");
  });
  it("refuses to go below what a team already used or has waiting", async () => {
    arrangeLimit({ usage: [1, 2] });
    expect(await codeOf(set(1))).toBe("limit_below_used");
    expect(await codeOf(set(2))).toBe("no-error");
  });
  it("refuses to change a finished event", async () => {
    arrangeLimit({ status: "Finished" });
    expect(await codeOf(set(2))).toBe("locked");
  });
  it("needs permission on the event", async () => {
    arrangeLimit();
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
    await expect(set(2)).rejects.toThrow("Not authorized");
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});
