import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    team: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    event: { findUnique: vi.fn() },
    player: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import {
  addPlayer,
  assertCaptainCanManageTeam,
  deletePlayer,
  getCaptainTeams,
  getPlayersForEvent,
  getPlayersForTeam,
  getPlayersForTeams,
  setTeamCaptainDisplay,
  updateCaptainTeamLogo,
  updatePlayer,
} from "./repository";

function teamRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "team-1",
    eventId: "event-1",
    captainId: "captain-1",
    name: "Alpha",
    logoText: "AL",
    logoUrl: null,
    tag: "ALP",
    captainName: null,
    captainContact: null,
    source: "registered",
    ...overrides,
  };
}

function playerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "player-1",
    teamId: "team-1",
    eventId: "event-1",
    displayName: "Stored Name",
    nickname: "StoredIGN",
    position: "",
    jerseyNumber: null,
    ...overrides,
  };
}

function transactionClient() {
  return {
    team: { findFirst: vi.fn(), update: vi.fn() },
    event: { findUnique: vi.fn() },
    player: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("captain team and roster repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
  });

  it("preserves captain and player read ordering", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow()]);
    prisma.player.findMany.mockResolvedValue([playerRow()]);

    await expect(getCaptainTeams("captain-1")).resolves.toHaveLength(1);
    await getPlayersForTeam("team-1");
    await getPlayersForTeams(["team-1", "team-2"]);
    await getPlayersForEvent("event-1");

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { captainId: "captain-1" },
      include: { captain: { select: { id: true, name: true } } },
    });
    expect(prisma.player.findMany).toHaveBeenNthCalledWith(1, {
      where: { teamId: "team-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(prisma.player.findMany).toHaveBeenNthCalledWith(2, {
      where: { teamId: { in: ["team-1", "team-2"] } },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    });
    expect(prisma.player.findMany).toHaveBeenNthCalledWith(3, {
      where: { eventId: "event-1" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("preserves demo-store fallbacks when Prisma reads are unavailable", async () => {
    prisma.team.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.player.findMany.mockRejectedValue(new Error("database unavailable"));

    await expect(getCaptainTeams("captain-1")).resolves.toEqual(expect.any(Array));
    await expect(getPlayersForTeam("team-seirin")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ teamId: "team-seirin" })]),
    );
  });

  it("preserves the captain-logo demo fallback for database failures", async () => {
    prisma.$transaction.mockRejectedValue(new Error("database unavailable"));

    await expect(updateCaptainTeamLogo("captain-seirin", "team-seirin", "/logo.png")).resolves.toBeDefined();
  });

  it("preserves demo-store ownership preflight before a captain logo upload", async () => {
    prisma.team.findFirst.mockRejectedValue(new Error("database unavailable"));

    await expect(assertCaptainCanManageTeam("captain-seirin", "team-seirin")).resolves.toEqual({
      eventId: "event-kuroko-summer",
    });
    await expect(assertCaptainCanManageTeam("captain-seirin", "team-foreign")).rejects.toThrow("Not authorized");
  });

  it("denies a forged team for logo and add without writing", async () => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(updateCaptainTeamLogo("captain-1", "team-b", "/logo.png")).rejects.toThrow("Not authorized");
    await expect(addPlayer("captain-1", {
      teamId: "team-b",
      displayName: " Player ",
      nickname: " IGN ",
    })).rejects.toThrow("Tim tidak ditemukan untuk akun ini.");

    expect(tx.team.update).not.toHaveBeenCalled();
    expect(tx.player.create).not.toHaveBeenCalled();
    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it("uses one transaction client for ownership, stored event, roster status, and add write", async () => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    tx.event.findUnique.mockResolvedValue({ status: "Published" });
    tx.player.create.mockResolvedValue(playerRow({ displayName: "Player", nickname: "IGN", position: "Sub" }));
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(addPlayer("captain-1", {
      teamId: "team-1",
      eventId: "event-1",
      displayName: " Player ",
      nickname: " IGN ",
      position: " Sub ",
    })).resolves.toMatchObject({ displayName: "Player", nickname: "IGN", position: "Sub" });

    expect(tx.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1", captainId: "captain-1" },
      select: { eventId: true },
    });
    expect(tx.event.findUnique).toHaveBeenCalledWith({ where: { id: "event-1" }, select: { status: true } });
    expect(tx.player.create).toHaveBeenCalledWith({
      data: { teamId: "team-1", eventId: "event-1", displayName: "Player", nickname: "IGN", position: "Sub" },
    });
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it("rejects a client event mismatch before creating a player", async () => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue({ eventId: "stored-event" });
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(addPlayer("captain-1", {
      teamId: "team-1",
      eventId: "forged-event",
      displayName: "Player",
      nickname: "IGN",
    })).rejects.toThrow("Data event pemain tidak cocok dengan tim.");

    expect(tx.event.findUnique).not.toHaveBeenCalled();
    expect(tx.player.create).not.toHaveBeenCalled();
  });

  it.each(["Ongoing", "Finished"])("rejects add, update, and delete when the stored event is %s", async (status) => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    tx.player.findUnique.mockResolvedValue({ ...playerRow(), team: { captainId: "captain-1", eventId: "event-1" } });
    tx.event.findUnique.mockResolvedValue({ status });
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(addPlayer("captain-1", { teamId: "team-1", displayName: "Player", nickname: "IGN" }))
      .rejects.toThrow("Roster tim sudah terkunci karena turnamen sudah berjalan atau selesai.");
    await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" }))
      .rejects.toThrow("Roster tim sudah terkunci karena turnamen sudah berjalan atau selesai.");
    await expect(deletePlayer("player-1", "captain-1"))
      .rejects.toThrow("Roster tim sudah terkunci karena turnamen sudah berjalan atau selesai.");

    expect(tx.player.create).not.toHaveBeenCalled();
    expect(tx.player.update).not.toHaveBeenCalled();
    expect(tx.player.delete).not.toHaveBeenCalled();
  });

  it.each(["Published", "Registration Closed"])("allows add, update, and delete when the stored event is %s", async (status) => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    tx.player.findUnique.mockResolvedValue({ ...playerRow(), team: { captainId: "captain-1", eventId: "event-1" } });
    tx.event.findUnique.mockResolvedValue({ status });
    tx.player.create.mockResolvedValue(playerRow());
    tx.player.update.mockResolvedValue(playerRow({ displayName: "Updated" }));
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(addPlayer("captain-1", { teamId: "team-1", displayName: "Player", nickname: "IGN" })).resolves.toBeDefined();
    await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" })).resolves.toBeDefined();
    await expect(deletePlayer("player-1", "captain-1")).resolves.toBeUndefined();

    expect(tx.player.create).toHaveBeenCalledOnce();
    expect(tx.player.update).toHaveBeenCalledOnce();
    expect(tx.player.delete).toHaveBeenCalledOnce();
  });

  it("denies forged player IDs for update and delete on the transaction client", async () => {
    const tx = transactionClient();
    tx.player.findUnique.mockResolvedValue({ ...playerRow(), team: { captainId: "captain-b", eventId: "event-1" } });
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(updatePlayer("player-1", "captain-a", { displayName: "Updated" })).rejects.toThrow("Not authorized to edit this player.");
    await expect(deletePlayer("player-1", "captain-a")).rejects.toThrow("Not authorized to delete this player.");

    expect(tx.player.update).not.toHaveBeenCalled();
    expect(tx.player.delete).not.toHaveBeenCalled();
  });

  it("derives display captain from the stored player and denies forged team/player pairing", async () => {
    const tx = transactionClient();
    tx.player.findFirst
      .mockResolvedValueOnce({ displayName: "Stored Name" })
      .mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await setTeamCaptainDisplay("team-1", "captain-1", "player-1");
    expect(tx.team.update).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { captainName: "Stored Name" } });

    await expect(setTeamCaptainDisplay("team-1", "captain-1", "player-b")).rejects.toThrow("Not authorized to update this team.");
    expect(tx.team.update).toHaveBeenCalledTimes(1);
  });

  it("maps duplicate IGN to the established Indonesian message", async () => {
    const tx = transactionClient();
    tx.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    tx.event.findUnique.mockResolvedValue({ status: "Published" });
    tx.player.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.0.0",
    }));
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(addPlayer("captain-1", { teamId: "team-1", displayName: "Player", nickname: "IGN" }))
      .rejects.toThrow("Pemain dengan IGN ini sudah ada di tim.");
  });
});