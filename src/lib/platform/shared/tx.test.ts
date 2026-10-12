import { beforeEach, describe, expect, it, vi } from "vitest";

// Refactor PR 1.3: the transaction and registration-state helpers, tested directly where they now live.
// The moved code is identical to the original; these tests pin what every registration flow relies on.

const { prisma, writeServerLog } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: { findUnique: vi.fn(), updateMany: vi.fn() },
    competitionPhase: { count: vi.fn() },
    match: { count: vi.fn() },
    team: { deleteMany: vi.fn() },
    teamRegistrationRequest: { updateMany: vi.fn() },
  },
  writeServerLog: vi.fn(),
}));

vi.mock("../db", () => ({ prisma }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog }));

import { UserFacingError } from "@/lib/security/public-error";
import { ROSTER_LOCKED_MESSAGE } from "./constants";
import {
  assertEventExists,
  assertEventRosterMutable,
  assertNewRegistrationWindowOpen,
  expireStaleRegistrationRequests,
  isNewRegistrationWindowOpen,
  readEventRosterLocked,
  runSerializableRegistrationTransaction,
} from "./tx";

const T0 = new Date("2026-10-10T12:00:00.000Z");
const before = (ms: number) => new Date(T0.getTime() - ms);
const after = (ms: number) => new Date(T0.getTime() + ms);
const window = (overrides: Partial<{ status: string; registrationOpensAt: Date | null; registrationClosesAt: Date | null }> = {}) => ({
  status: "Published",
  registrationOpensAt: null,
  registrationClosesAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("isNewRegistrationWindowOpen", () => {
  it("is open for a Published event with no dates", () => {
    expect(isNewRegistrationWindowOpen(window(), T0)).toBe(true);
  });

  it.each(["Draft", "Registration Closed", "Ongoing", "Finished"])("is closed for a %s event", (status) => {
    expect(isNewRegistrationWindowOpen(window({ status }), T0)).toBe(false);
  });

  it("is closed before the opening time and open from the opening time on", () => {
    expect(isNewRegistrationWindowOpen(window({ registrationOpensAt: after(1) }), T0)).toBe(false);
    expect(isNewRegistrationWindowOpen(window({ registrationOpensAt: T0 }), T0)).toBe(true);
  });

  it("is open until the closing time and closed from the closing time on", () => {
    expect(isNewRegistrationWindowOpen(window({ registrationClosesAt: after(1) }), T0)).toBe(true);
    expect(isNewRegistrationWindowOpen(window({ registrationClosesAt: T0 }), T0)).toBe(false);
  });

  it("uses the current time when none is given", () => {
    const now = Date.now();
    expect(isNewRegistrationWindowOpen(window({ registrationOpensAt: new Date(now - 60_000), registrationClosesAt: new Date(now + 60_000) }))).toBe(true);
    expect(isNewRegistrationWindowOpen(window({ registrationClosesAt: new Date(now - 60_000) }))).toBe(false);
  });
});

describe("assertNewRegistrationWindowOpen", () => {
  it("does nothing when registration is open", () => {
    expect(() => assertNewRegistrationWindowOpen(window(), T0)).not.toThrow();
  });

  it("throws a message the user may read when registration is closed", () => {
    expect(() => assertNewRegistrationWindowOpen(window({ status: "Draft" }), T0)).toThrow(UserFacingError);
    expect(() => assertNewRegistrationWindowOpen(window({ status: "Draft" }), T0)).toThrow(
      "Event tidak valid atau sudah tidak membuka pendaftaran.",
    );
  });
});

describe("runSerializableRegistrationTransaction", () => {
  const conflict = () => Object.assign(new Error("write conflict"), { code: "P2034" });

  it("runs the operation in one Serializable transaction with the registration time limits", async () => {
    prisma.$transaction.mockResolvedValue("done");
    const operation = vi.fn();

    await expect(runSerializableRegistrationTransaction(operation)).resolves.toBe("done");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(operation, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
  });

  it("tries again after a write conflict (P2034)", async () => {
    prisma.$transaction.mockRejectedValueOnce(conflict()).mockResolvedValue("done");

    await expect(runSerializableRegistrationTransaction(vi.fn())).resolves.toBe("done");
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after three conflicts and passes the last error on", async () => {
    prisma.$transaction.mockRejectedValue(conflict());

    await expect(runSerializableRegistrationTransaction(vi.fn())).rejects.toMatchObject({ code: "P2034" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["another database code", Object.assign(new Error("unique"), { code: "P2002" })],
    ["a plain error", new Error("boom")],
    ["a value that is not an error", "boom"],
  ])("does not try again for %s", async (_name, failure) => {
    prisma.$transaction.mockRejectedValue(failure);

    await expect(runSerializableRegistrationTransaction(vi.fn())).rejects.toBe(failure);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("assertEventExists", () => {
  it("accepts an existing event and asks for only its id", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: "event-1" });

    await expect(assertEventExists("event-1")).resolves.toBeUndefined();
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: "event-1" }, select: { id: true } });
  });

  it("rejects a missing event with a plain error (the caller decides what the user sees)", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    const failure = await assertEventExists("missing").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(UserFacingError);
    expect((failure as Error).message).toBe("Event tidak ditemukan.");
  });
});

describe("readEventRosterLocked", () => {
  const reader = { event: prisma.event, competitionPhase: prisma.competitionPhase, match: prisma.match } as never;

  function state(status: string | null, phases: number, matches: number) {
    prisma.event.findUnique.mockResolvedValue(status === null ? null : { status });
    prisma.competitionPhase.count.mockResolvedValue(phases);
    prisma.match.count.mockResolvedValue(matches);
  }

  it("reads the event status, active or completed phases, and live or completed matches", async () => {
    state("Published", 0, 0);

    await readEventRosterLocked(reader, "event-1");

    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: "event-1" }, select: { status: true } });
    expect(prisma.competitionPhase.count).toHaveBeenCalledWith({ where: { eventId: "event-1", status: { in: ["active", "completed"] } } });
    expect(prisma.match.count).toHaveBeenCalledWith({ where: { eventId: "event-1", status: { in: ["Live", "Completed"] } } });
  });

  it.each([
    ["an Ongoing event", "Ongoing", 0, 0, true],
    ["a Finished event", "Finished", 0, 0, true],
    ["a Published event with a published phase", "Published", 1, 0, true],
    ["a Published event with a started match", "Published", 0, 2, true],
    ["a Published event with neither", "Published", 0, 0, false],
    ["a Registration Closed event with neither", "Registration Closed", 0, 0, false],
    ["an event that does not exist", null, 3, 3, false],
  ])("says %s is %s", async (_name, status, phases, matches, locked) => {
    state(status, phases, matches);

    await expect(readEventRosterLocked(reader, "event-1")).resolves.toBe(locked);
  });
});

describe("assertEventRosterMutable", () => {
  const tx = { event: prisma.event, competitionPhase: prisma.competitionPhase, match: prisma.match } as never;

  it("claims the event version once, then checks the lock, and passes when the roster is open", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.event.findUnique.mockResolvedValue({ status: "Published" });
    prisma.competitionPhase.count.mockResolvedValue(0);
    prisma.match.count.mockResolvedValue(0);

    await expect(assertEventRosterMutable(tx, "event-1")).resolves.toBeUndefined();
    expect(prisma.event.updateMany).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { competitionVersion: { increment: 1 } } });
  });

  it("rejects an event that does not exist, before reading the lock", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(assertEventRosterMutable(tx, "missing")).rejects.toThrow(new UserFacingError("Event tidak ditemukan."));
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a locked roster with the message the user may read", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.event.findUnique.mockResolvedValue({ status: "Ongoing" });
    prisma.competitionPhase.count.mockResolvedValue(0);
    prisma.match.count.mockResolvedValue(0);

    const failure = await assertEventRosterMutable(tx, "event-1").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect((failure as Error).message).toBe(ROSTER_LOCKED_MESSAGE);
  });
});

describe("expireStaleRegistrationRequests", () => {
  it("marks stale pending_payment and rejected requests as expired, then removes the leftover team copies", async () => {
    await expireStaleRegistrationRequests();

    expect(prisma.teamRegistrationRequest.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ["pending_payment", "rejected"] }, expiresAt: { lte: expect.any(Date) } },
      data: { status: "expired" },
    });
    expect(prisma.team.deleteMany).toHaveBeenCalledWith({
      where: { eventId: null, source: "registration-intake", registrationRequest: { is: { status: "expired" } } },
    });
    expect(prisma.teamRegistrationRequest.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.team.deleteMany.mock.invocationCallOrder[0] as number,
    );
  });

  it("never touches a request that is waiting for review", async () => {
    await expireStaleRegistrationRequests();

    const where = prisma.teamRegistrationRequest.updateMany.mock.calls[0]?.[0].where;
    expect(where.status.in).not.toContain("pending_review");
    expect(where.status.in).not.toContain("approved");
  });

  it("keeps working when the cleanup fails, and logs only the error code", async () => {
    prisma.team.deleteMany.mockRejectedValue(
      Object.assign(new Error("Invalid prisma.team.deleteMany() invocation: { name: 'secret' }"), { name: "PrismaClientKnownRequestError", code: "P2003" }),
    );

    await expect(expireStaleRegistrationRequests()).resolves.toBeUndefined();

    expect(writeServerLog).toHaveBeenCalledTimes(1);
    const entry = writeServerLog.mock.calls[0]?.[0];
    expect(entry).toMatchObject({ phase: "failed", operation: "expired_request_cleanup", status: 500, errorCode: "P2003" });
    expect(JSON.stringify(entry)).not.toContain("secret");
  });

  it("does not hide a failure of the expiry update itself", async () => {
    prisma.teamRegistrationRequest.updateMany.mockRejectedValue(new Error("database unavailable"));

    await expect(expireStaleRegistrationRequests()).rejects.toThrow("database unavailable");
    expect(prisma.team.deleteMany).not.toHaveBeenCalled();
  });
});
