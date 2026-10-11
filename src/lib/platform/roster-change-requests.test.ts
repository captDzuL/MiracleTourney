import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, readRosterChangeState, runSerializableRegistrationTransaction } = vi.hoisted(() => ({
  prisma: {
    team: { findFirst: vi.fn() },
    event: { findUnique: vi.fn() },
    match: { count: vi.fn() },
    player: { findMany: vi.fn() },
    rosterChangeRequest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
  readRosterChangeState: vi.fn(),
  runSerializableRegistrationTransaction: vi.fn(),
}));
vi.mock("./db", () => ({ prisma }));
vi.mock("./repository", () => ({ readRosterChangeState, runSerializableRegistrationTransaction }));

import {
  cancelRosterChangeRequest,
  getRosterChangeOverview,
  requestRosterChange,
  RosterChangeError,
  type RosterChangeErrorCode,
} from "./roster-change-requests";

const longAgo = new Date("2026-10-01T00:00:00Z");
const player = (id: string, displayName: string, nickname: string, removedAt: Date | null = null) => ({
  id, displayName, nickname, position: "Forward", createdAt: longAgo, removedAt,
});
// mode-flashpeak-5v5: 5 on court, at most 8 on the roster.
const fivePlayers = ["a", "b", "c", "d", "e"].map((x) => player(`p-${x}`, `UID-${x}`, `Nick-${x}`));
const incoming = { displayName: "UID-new", nickname: "NewGuy", position: "Defender" };

function arrange(overrides: { players?: ReturnType<typeof player>[]; window?: string; limit?: number; requests?: { status: string }[]; live?: number; graph?: unknown; team?: object; elsewhere?: unknown[] } = {}) {
  prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1", name: "Redclover", captainUid: "UID-a", captainIsPlayer: true, ...overrides.team });
  prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: overrides.limit ?? 2, gameModeId: "mode-flashpeak-5v5" });
  readRosterChangeState.mockResolvedValue({ window: overrides.window ?? "limited", graph: overrides.graph ?? null });
  prisma.match.count.mockResolvedValue(overrides.live ?? 0);
  prisma.rosterChangeRequest.findMany.mockResolvedValue(overrides.requests ?? []);
  // First call: the team's players. Second call: same UID on other teams.
  prisma.player.findMany
    .mockResolvedValueOnce(overrides.players ?? fivePlayers)
    .mockResolvedValueOnce(overrides.elsewhere ?? []);
  prisma.rosterChangeRequest.create.mockResolvedValue({ id: "request-1" });
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

const swap = (overrides: Partial<{ outPlayerId: string; incoming: typeof incoming }> = {}) => ({
  captainId: "captain-1", teamId: "team-1",
  change: { kind: "swap" as const, outPlayerId: "p-b", incoming, ...overrides },
});

beforeEach(() => {
  vi.resetAllMocks();
  runSerializableRegistrationTransaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
});

describe("requestRosterChange", () => {
  it("records a swap with a snapshot of who leaves and who joins", async () => {
    arrange();
    await expect(requestRosterChange(swap())).resolves.toEqual({ requestId: "request-1", remaining: 1 });
    expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventId: "event-1", teamId: "team-1", requestedById: "captain-1", kind: "swap", outPlayerId: "p-b",
      outgoing: { displayName: "UID-b", nickname: "Nick-b", position: "Forward" },
      incoming: { ...incoming, activeElsewhere: [] },
    }) });
  });

  describe("when the window is not limited", () => {
    it("tells the captain to edit directly while the roster is still free", async () => {
      arrange({ window: "free" });
      expect(await codeOf(requestRosterChange(swap()))).toBe("not_open");
    });
    it("refuses once the roster is locked", async () => {
      arrange({ window: "locked" });
      expect(await codeOf(requestRosterChange(swap()))).toBe("locked");
    });
  });

  describe("team and allowance checks", () => {
    it("rejects a team that is not the captain's", async () => {
      arrange();
      prisma.team.findFirst.mockResolvedValue(null);
      expect(await codeOf(requestRosterChange(swap()))).toBe("team_not_found");
      expect(prisma.team.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "team-1", captainId: "captain-1" } }));
    });
    it("rejects a draft team that has no event yet", async () => {
      arrange({ team: { eventId: null } });
      expect(await codeOf(requestRosterChange(swap()))).toBe("team_not_found");
    });
    it("rejects a disqualified team", async () => {
      arrange({ graph: { disqualifications: [{ teamId: "team-1" }] } });
      expect(await codeOf(requestRosterChange(swap()))).toBe("team_disqualified");
    });
    it("rejects while the team has a live match", async () => {
      arrange({ live: 1 });
      expect(await codeOf(requestRosterChange(swap()))).toBe("match_live");
    });
    it("rejects a second request while one is waiting for the organizer", async () => {
      arrange({ requests: [{ status: "pending" }] });
      expect(await codeOf(requestRosterChange(swap()))).toBe("pending_exists");
    });
    it("rejects when approved changes already used the allowance", async () => {
      arrange({ requests: [{ status: "approved" }, { status: "approved" }] });
      expect(await codeOf(requestRosterChange(swap()))).toBe("no_allowance");
    });
    it("rejects when the organizer lowered the limit to zero after the window opened", async () => {
      arrange({ limit: 0 });
      expect(await codeOf(requestRosterChange(swap()))).toBe("no_allowance");
    });
    it("rejects when the only allowance is already used by an approved change", async () => {
      arrange({ limit: 1, requests: [{ status: "approved" }] });
      expect(await codeOf(requestRosterChange(swap()))).toBe("no_allowance");
    });
    it("lets a team use its last change when nothing counted against it", async () => {
      arrange({ limit: 1, requests: [] });
      expect(await codeOf(requestRosterChange(swap()))).toBe("no-error");
    });
  });

  describe("who can leave and join", () => {
    it("rejects a leaving player who is not on the active roster", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ outPlayerId: "ghost" })))).toBe("player_not_found");
    });
    it("rejects a leaving player who already left", async () => {
      arrange({ players: [...fivePlayers, player("p-old", "UID-old", "Old", new Date("2026-10-05T00:00:00Z"))] });
      expect(await codeOf(requestRosterChange(swap({ outPlayerId: "p-old" })))).toBe("player_not_found");
    });
    it("keeps the captain who also plays on the roster, matched by UID", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ outPlayerId: "p-a" })))).toBe("captain_player");
    });
    it("keeps the captain matched by IGN when the team has no captain UID on file", async () => {
      arrange({ team: { captainUid: null, captainIgn: "nick-a" } });
      expect(await codeOf(requestRosterChange(swap({ outPlayerId: "p-a" })))).toBe("captain_player");
    });
    it("lets a team whose captain does not play replace anyone", async () => {
      arrange({ team: { captainIsPlayer: false } });
      expect(await codeOf(requestRosterChange(swap({ outPlayerId: "p-a" })))).toBe("no-error");
    });
    it("rejects a joining player whose UID is already on the roster, ignoring case and spaces", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, displayName: " uid-c " } })))).toBe("already_on_roster");
    });
    it("rejects a joining player whose IGN is already on the roster, ignoring case", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, nickname: "NICK-C" } })))).toBe("already_on_roster");
    });
    it("rejects swapping a player for themselves", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, displayName: "UID-b", nickname: "Nick-b2" } })))).toBe("invalid_change");
    });
    it("rejects an IGN that the leaving player holds, when the joining player has a different UID", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, nickname: "Nick-b" } })))).toBe("nickname_taken");
    });
    it("rejects an IGN that a former player of this team still holds under another UID", async () => {
      arrange({ players: [...fivePlayers, player("p-old", "UID-old", "NewGuy", new Date("2026-10-05T00:00:00Z"))] });
      expect(await codeOf(requestRosterChange(swap()))).toBe("nickname_taken");
    });
  });

  describe("position", () => {
    it("accepts a position the game mode offers, ignoring case", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, position: "defender" } })))).toBe("no-error");
    });
    it("accepts no position at all", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, position: "" } })))).toBe("no-error");
    });
    it("rejects a made-up position so stat screens cannot be polluted", async () => {
      arrange();
      expect(await codeOf(requestRosterChange(swap({ incoming: { ...incoming, position: "God Mode" } })))).toBe("invalid_change");
    });
  });

  describe("bringing a former player back", () => {
    const former = player("p-old", "UID-old", "OldAce", new Date("2026-10-05T00:00:00Z"));

    it("recognises the same UID and keeps the old row so statistics continue", async () => {
      arrange({ players: [...fivePlayers, former] });
      await requestRosterChange(swap({ incoming: { displayName: "uid-old", nickname: "OldAce", position: "Forward" } }));
      expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ returnPlayerId: "p-old" }) });
    });
    it("allows the same IGN and UID again: neither is unique across the team's history", async () => {
      arrange({ players: [...fivePlayers, former] });
      expect(await codeOf(requestRosterChange(swap({ incoming: { displayName: "UID-old", nickname: "OldAce", position: "" } })))).toBe("no-error");
    });
    it("reuses the most recent former row when one UID left more than once", async () => {
      const older = player("p-older", "UID-old", "OldAce1", new Date("2026-10-03T00:00:00Z"));
      const newer = player("p-newer", "UID-old", "OldAce2", new Date("2026-10-08T00:00:00Z"));
      arrange({ players: [...fivePlayers, older, newer] });
      await requestRosterChange(swap({ incoming: { displayName: "UID-old", nickname: "OldAce2", position: "" } }));
      expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ returnPlayerId: "p-newer" }) });
    });
    it("allows a returning player to come back under a new IGN", async () => {
      arrange({ players: [...fivePlayers, former] });
      expect(await codeOf(requestRosterChange(swap({ incoming: { displayName: "UID-old", nickname: "OldAce2", position: "" } })))).toBe("no-error");
    });
  });

  describe("the same UID on another team", () => {
    it("is not blocked, but is flagged for the organizer", async () => {
      arrange({ elsewhere: [{ teamId: "team-2", team: { name: "Blue Fox" } }] });
      await requestRosterChange(swap());
      expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        incoming: { ...incoming, activeElsewhere: [{ teamId: "team-2", teamName: "Blue Fox" }] },
      }) });
      expect(prisma.player.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { eventId: "event-1", teamId: { not: "team-1" }, removedAt: null, displayName: { equals: "UID-new", mode: "insensitive" } },
      }));
    });
  });

  describe("add and remove", () => {
    it("adds a substitute while the roster is below the maximum", async () => {
      arrange();
      await requestRosterChange({ captainId: "captain-1", teamId: "team-1", change: { kind: "add", incoming } });
      expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "add", outPlayerId: null }) });
    });
    it("refuses an add that would exceed the maximum roster", async () => {
      arrange({ players: [...fivePlayers, ...["x", "y", "z"].map((x) => player(`p-${x}`, `UID-${x}`, `Nick-${x}`))] });
      expect(await codeOf(requestRosterChange({ captainId: "captain-1", teamId: "team-1", change: { kind: "add", incoming } }))).toBe("roster_size");
    });
    it("removes a player while the roster stays at or above the team size", async () => {
      arrange({ players: [...fivePlayers, player("p-six", "UID-six", "Six")] });
      await requestRosterChange({ captainId: "captain-1", teamId: "team-1", change: { kind: "remove", outPlayerId: "p-six" } });
      expect(prisma.rosterChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "remove", outPlayerId: "p-six" }) });
    });
    it("never removes the captain who also plays", async () => {
      arrange({ players: [...fivePlayers, player("p-six", "UID-six", "Six")] });
      expect(await codeOf(requestRosterChange({ captainId: "captain-1", teamId: "team-1", change: { kind: "remove", outPlayerId: "p-a" } }))).toBe("captain_player");
    });
    it("still lets a team that is already over the maximum swap a player", async () => {
      const crowded = [...fivePlayers, ...["x", "y", "z", "w"].map((x) => player(`p-${x}`, `UID-${x}`, `Nick-${x}`))];
      arrange({ players: crowded });
      expect(await codeOf(requestRosterChange(swap()))).toBe("no-error");
    });
    it("refuses a removal that would leave too few players", async () => {
      arrange();
      expect(await codeOf(requestRosterChange({ captainId: "captain-1", teamId: "team-1", change: { kind: "remove", outPlayerId: "p-b" } }))).toBe("roster_size");
    });
  });

  it("fails closed when the event's game mode is unknown", async () => {
    arrange();
    prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: 2, gameModeId: "mode-unknown" });
    expect(await codeOf(requestRosterChange(swap()))).toBe("invalid_change");
  });
});

describe("cancelRosterChangeRequest", () => {
  it("cancels the captain's own pending request and gives the allowance back", async () => {
    prisma.rosterChangeRequest.findFirst.mockResolvedValue({ id: "request-1", status: "pending" });
    prisma.rosterChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    await cancelRosterChangeRequest({ captainId: "captain-1", requestId: "request-1" });
    expect(prisma.rosterChangeRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request-1", team: { captainId: "captain-1" } } }));
    expect(prisma.rosterChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "pending" },
      data: expect.objectContaining({ status: "cancelled", decidedById: "captain-1" }),
    });
  });
  it("hides requests that belong to someone else", async () => {
    prisma.rosterChangeRequest.findFirst.mockResolvedValue(null);
    expect(await codeOf(cancelRosterChangeRequest({ captainId: "captain-1", requestId: "request-9" }))).toBe("request_not_found");
  });
  it("does not cancel a request the organizer already decided", async () => {
    prisma.rosterChangeRequest.findFirst.mockResolvedValue({ id: "request-1", status: "approved" });
    expect(await codeOf(cancelRosterChangeRequest({ captainId: "captain-1", requestId: "request-1" }))).toBe("request_not_pending");
    expect(prisma.rosterChangeRequest.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite a decision that lands between the read and the write", async () => {
    prisma.rosterChangeRequest.findFirst.mockResolvedValue({ id: "request-1", status: "pending" });
    prisma.rosterChangeRequest.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(cancelRosterChangeRequest({ captainId: "captain-1", requestId: "request-1" }))).toBe("request_not_pending");
  });
});

describe("getRosterChangeOverview", () => {
  const decided = (status: string) => ({ id: `r-${status}`, kind: "swap", status, createdAt: new Date("2026-10-11T00:00:00Z"), outgoing: { nickname: "Nick-b" }, incoming: { nickname: "NewGuy" }, decisionNote: null });

  function arrangeOverview(window: string, requests: object[] = []) {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: 2, gameModeId: "mode-flashpeak-5v5" });
    readRosterChangeState.mockResolvedValue({ window, graph: null });
    prisma.rosterChangeRequest.findMany.mockResolvedValue(requests);
    prisma.rosterChangeRequest.count.mockImplementation(async ({ where }: { where: { status: string } }) =>
      requests.filter((request) => (request as { status: string }).status === where.status).length);
    prisma.player.findMany.mockResolvedValue(fivePlayers);
  }

  it("reports the allowance, the waiting request and the roster limits", async () => {
    arrangeOverview("limited", [decided("pending"), decided("approved")]);
    const overview = await getRosterChangeOverview("captain-1", "team-1");
    expect(overview).toMatchObject({
      window: "limited", limit: 2, used: 1, remaining: 0, rosterMin: 5, rosterMax: 8,
      pending: expect.objectContaining({ id: "r-pending" }),
    });
    expect(overview?.history.map((item) => item.status)).toEqual(["pending", "approved"]);
  });
  it("counts approved and waiting requests in the database, not in the newest 20 rows", async () => {
    // Only a cancelled row is listed, but two changes were approved long ago.
    arrangeOverview("limited", [decided("cancelled")]);
    prisma.rosterChangeRequest.count.mockImplementation(async ({ where }: { where: { status: string } }) => (where.status === "approved" ? 2 : 0));
    const overview = await getRosterChangeOverview("captain-1", "team-1");
    expect(overview).toMatchObject({ used: 2, remaining: 0 });
  });
  it("hands the page only names and status: never other teams or raw JSON", async () => {
    arrangeOverview("limited", [{
      ...decided("approved"),
      incoming: { nickname: "NewGuy", displayName: "UID-new", activeElsewhere: [{ teamId: "team-2", teamName: "Blue Fox" }] },
    }]);
    const overview = await getRosterChangeOverview("captain-1", "team-1");
    expect(overview?.history[0]).toEqual({
      id: "r-approved", kind: "swap", status: "approved", createdAt: new Date("2026-10-11T00:00:00Z"),
      outgoingName: "Nick-b", incomingName: "NewGuy", decisionNote: null,
    });
    expect(JSON.stringify(overview)).not.toContain("Blue Fox");
    expect(prisma.rosterChangeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ outgoing: true, incoming: true }),
    }));
  });
  it("survives history rows whose JSON has an unexpected shape", async () => {
    arrangeOverview("limited", [{ ...decided("approved"), outgoing: null, incoming: "oops" }]);
    const overview = await getRosterChangeOverview("captain-1", "team-1");
    expect(overview?.history[0]).toMatchObject({ outgoingName: null, incomingName: null });
  });
  it("returns null for a team the captain does not own", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    expect(await getRosterChangeOverview("captain-1", "team-9")).toBeNull();
  });
  it("shows no allowance when the roster is free or locked", async () => {
    arrangeOverview("free");
    expect((await getRosterChangeOverview("captain-1", "team-1"))?.window).toBe("free");
    arrangeOverview("locked");
    expect((await getRosterChangeOverview("captain-1", "team-1"))?.window).toBe("locked");
  });
});
