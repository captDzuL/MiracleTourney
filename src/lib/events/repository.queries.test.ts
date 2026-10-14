import { beforeEach, describe, expect, it, vi } from "vitest";

// Queries that used to be written inside the server actions (archive, delete and captain login for an event).

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: { findUnique: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn }));

import { deleteEvent, getEventArchiveInfo, isEventOpenForCaptainLogin, markEventFinished } from "@/lib/events/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getEventArchiveInfo", () => {
  it("returns the status and the number of teams", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Draft", _count: { teams: 3 } });

    await expect(getEventArchiveInfo("event-1")).resolves.toEqual({ status: "Draft", teamCount: 3 });

    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: "event-1" }, include: { _count: { select: { teams: true } } } });
  });

  it("returns null when the event does not exist", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(getEventArchiveInfo("missing")).resolves.toBeNull();
  });

  it("passes on a database error", async () => {
    prisma.event.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getEventArchiveInfo("event-1")).rejects.toThrow("db down");
  });
});

describe("deleteEvent and markEventFinished", () => {
  it("deletes exactly the event with the given id", async () => {
    await deleteEvent("event-1");

    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: "event-1" } });
  });

  it("archives an event by setting its status to Finished and touching nothing else", async () => {
    await markEventFinished("event-1");

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { status: "Finished" } });
  });
});

describe("isEventOpenForCaptainLogin", () => {
  it("is true for a Published or Registration Closed event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(isEventOpenForCaptainLogin("event-1")).resolves.toBe(true);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", status: { in: ["Published", "Registration Closed"] } },
      select: { id: true },
    });
  });

  it("is false when no event matches, for example a Draft or Finished one", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(isEventOpenForCaptainLogin("event-1")).resolves.toBe(false);
  });

  it("passes on a database error so the caller can report it", async () => {
    prisma.event.findFirst.mockRejectedValue(new Error("db down"));

    await expect(isEventOpenForCaptainLogin("event-1")).rejects.toThrow("db down");
  });
});
