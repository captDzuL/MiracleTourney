import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, readRosterChangeState, assertUserCanManageEvent } = vi.hoisted(() => ({
  prisma: {
    rosterChangeRequest: { findMany: vi.fn(), groupBy: vi.fn() },
    event: { findUnique: vi.fn() },
    player: { findMany: vi.fn() },
  },
  readRosterChangeState: vi.fn(),
  assertUserCanManageEvent: vi.fn(),
}));
vi.mock("./db", () => ({ prisma }));
vi.mock("@/lib/platform/shared/authz", () => ({
  assertUserCanManageEvent,
}));
vi.mock("@/lib/registration/repository", () => ({
  readRosterChangeState,
}));

import { getRosterChangeSettings } from "./roster-change-settings";

const organizer = { id: "organizer-1", role: "organizer" } as never;
const joining = { displayName: "UID-new", nickname: "NewGuy", position: "Defender" };

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "request-1", teamId: "team-1", kind: "swap", status: "pending", createdAt: new Date("2026-10-11T00:00:00Z"),
  note: null, decisionNote: null, returnPlayerId: null,
  outgoing: { displayName: "UID-b", nickname: "Nick-b", position: "Forward" },
  incoming: { ...joining, activeElsewhere: [{ teamId: "stale", teamName: "Old snapshot" }] },
  team: { name: "Redclover" },
  ...overrides,
});

/** The panel asks for waiting requests and for decided ones separately; answer each from its own list. */
function arrange(pending: object[], decided: object[] = []) {
  prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: 2, formatConfig: { kind: "group_playoffs" }, status: "Registration Closed" });
  readRosterChangeState.mockResolvedValue({ window: "limited", graph: null });
  prisma.rosterChangeRequest.findMany.mockImplementation(async ({ where }: { where: { status: unknown } }) =>
    where.status === "pending" ? pending : decided);
  prisma.rosterChangeRequest.groupBy.mockResolvedValue([{ teamId: "team-1", _count: { _all: 1 } }]);
  prisma.player.findMany.mockResolvedValue([
    { teamId: "team-9", displayName: "uid-new", team: { name: "Blue Fox" } },
    { teamId: "team-1", displayName: "UID-new", team: { name: "Redclover" } },
    { teamId: "team-8", displayName: "UID-other", team: { name: "Not Related" } },
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
  assertUserCanManageEvent.mockResolvedValue(undefined);
});

describe("getRosterChangeSettings", () => {
  it("lists waiting requests with who leaves, who joins, and the team's usage", async () => {
    arrange([row()]);
    const settings = await getRosterChangeSettings(organizer, "event-1");
    expect(assertUserCanManageEvent).toHaveBeenCalledWith(organizer, "event-1");
    expect(settings).toMatchObject({ limit: 2, formatSupported: true, window: "limited" });
    expect(settings.pending[0]).toMatchObject({
      id: "request-1", teamName: "Redclover", kind: "swap", teamUsed: 1,
      outgoing: { nickname: "Nick-b" }, incoming: { nickname: "NewGuy", displayName: "UID-new" }, returning: false,
    });
  });

  it("asks for waiting requests on their own so none can be pushed out by decided ones", async () => {
    arrange([row()]);
    await getRosterChangeSettings(organizer, "event-1");
    const calls = prisma.rosterChangeRequest.findMany.mock.calls.map(([args]) => args);
    const pendingCall = calls.find((args) => args.where.status === "pending");
    const decidedCall = calls.find((args) => args.where.status !== "pending");
    expect(pendingCall).toMatchObject({ where: { eventId: "event-1", status: "pending" }, orderBy: { createdAt: "asc" } });
    expect(pendingCall.take).toBeGreaterThanOrEqual(100);
    expect(decidedCall).toMatchObject({ where: { eventId: "event-1", status: { not: "pending" } }, orderBy: { decidedAt: "desc" }, take: 10 });
  });

  it("shows every waiting request even when many decided ones exist", async () => {
    const pending = Array.from({ length: 70 }, (_, index) => row({ id: `pending-${index}` }));
    arrange(pending);
    expect((await getRosterChangeSettings(organizer, "event-1")).pending).toHaveLength(70);
  });

  it("lists the most recently decided requests, not the most recently filed", async () => {
    arrange([], [row({ id: "request-0", status: "approved", decisionNote: "Oke" })]);
    const settings = await getRosterChangeSettings(organizer, "event-1");
    expect(settings.recent.map((item) => [item.id, item.status])).toEqual([["request-0", "approved"]]);
  });

  it("finds the other teams that field the joining UID with one query, ignoring case and the requesting team", async () => {
    arrange([row(), row({ id: "request-2", teamId: "team-9" })]);
    const settings = await getRosterChangeSettings(organizer, "event-1");
    expect(prisma.player.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event-1", removedAt: null } }));
    expect(settings.pending[0].activeElsewhere).toEqual(["Blue Fox"]);
    expect(settings.pending[1].activeElsewhere).toEqual(["Redclover"]);
    expect(JSON.stringify(settings)).not.toContain("Old snapshot");
    expect(JSON.stringify(settings)).not.toContain("Not Related");
  });

  it("skips the player lookup when nothing waits", async () => {
    arrange([]);
    await getRosterChangeSettings(organizer, "event-1");
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("survives stored JSON with an unexpected shape", async () => {
    arrange([row({ outgoing: "oops", incoming: { nickname: 7 } })]);
    const settings = await getRosterChangeSettings(organizer, "event-1");
    expect(settings.pending[0]).toMatchObject({ outgoing: null, incoming: null, activeElsewhere: [] });
  });

  it("marks formats without a group stage as unsupported", async () => {
    arrange([]);
    prisma.event.findUnique.mockResolvedValue({ rosterChangeLimit: 0, formatConfig: { kind: "round_robin" }, status: "Published" });
    expect((await getRosterChangeSettings(organizer, "event-1")).formatSupported).toBe(false);
  });

  it("needs permission on the event", async () => {
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));
    await expect(getRosterChangeSettings(organizer, "event-1")).rejects.toThrow("Not authorized");
    expect(prisma.rosterChangeRequest.findMany).not.toHaveBeenCalled();
  });
});
