import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterization tests (refactor PR 0.3): pin the current behavior of the self sign-up writes
// that straddle identity, teams and registration, before repository.ts is split by domain.

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { create: vi.fn() },
    team: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    teamRegistrationRequest: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    event: { findUnique: vi.fn(), updateMany: vi.fn() },
    competitionPhase: { count: vi.fn() },
    match: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { createCaptainAccount, createCaptainWithPendingPayment, createCaptainWithTeam } from "./repository";

const DAY_MS = 24 * 60 * 60 * 1000;

const signUp = {
  email: "captain@test.com",
  name: "Captain",
  passwordHash: "hash",
  eventId: "event-open",
  teamName: "Session United",
  teamTag: "ses",
};

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-open",
    slug: "open-cup",
    status: "Published",
    participantCap: 8,
    format: "Single Elimination",
    registrationFeeRequired: false,
    registrationOpensAt: null,
    registrationClosesAt: null,
    ...overrides,
  };
}

// The roster-lock read selects only { status }; the registration read selects the full row. Dispatching on the
// select shape keeps these tests independent of the order in which the repository issues the two lookups.
function mockEvent(row: Record<string, unknown> | null) {
  prisma.event.findUnique.mockImplementation(async (args?: { select?: Record<string, boolean> }) =>
    args?.select && !("participantCap" in args.select) ? { status: (row as { status?: string } | null)?.status ?? "Published" } : row,
  );
}

function p2034() {
  return Object.assign(new Error("write conflict"), { code: "P2034" });
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  mockEvent(eventRow());
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.team.count.mockResolvedValue(0);
  prisma.team.findFirst.mockResolvedValue(null);
  prisma.teamRegistrationRequest.count.mockResolvedValue(0);
  prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
  prisma.user.create.mockResolvedValue({ id: "user-1" });
  prisma.team.create.mockResolvedValue({ id: "team-1" });
  prisma.teamRegistrationRequest.create.mockResolvedValue({ id: "request-1" });
});

// KNOWN QUIRK: a duplicate-email P2002 from user.create is rethrown raw by every sign-up write below; only
// registerTeam and createTeamRegistrationRequest translate it into a friendly message.
describe("createCaptainAccount", () => {
  it("creates a captain user without opening a transaction or touching an event", async () => {
    await expect(createCaptainAccount({ email: "a@test.com", name: "A", passwordHash: "hash" })).resolves.toEqual({
      userId: "user-1",
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "a@test.com", name: "A", role: "captain", passwordHash: "hash" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });
});

describe("createCaptainWithTeam", () => {
  // KNOWN QUIRK: logoText is the full tag here, while registerTeam and createTeamRegistrationRequest use tag.slice(0, 2).
  it("creates the captain and an uppercased registration team inside one Serializable transaction", async () => {
    await expect(createCaptainWithTeam(signUp)).resolves.toEqual({ userId: "user-1", teamId: "team-1" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-open" },
      data: { competitionVersion: { increment: 1 } },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "captain@test.com", name: "Captain", role: "captain", passwordHash: "hash" },
    });
    expect(prisma.team.create).toHaveBeenCalledWith({
      data: {
        eventId: "event-open",
        captainId: "user-1",
        name: "Session United",
        tag: "SES",
        logoText: "SES",
        source: "registration",
      },
    });
  });

  it("rejects when the roster is locked and creates nothing", async () => {
    prisma.competitionPhase.count.mockResolvedValue(1);

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Roster tim sudah terkunci");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("treats a completed match as a locked roster, so the sign-up never reaches the completed-match check", async () => {
    prisma.match.count.mockResolvedValue(1);

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Roster tim sudah terkunci");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects when the event no longer exists", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Event tidak ditemukan.");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects when registration is not open", async () => {
    mockEvent(eventRow({ status: "Draft" }));

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Event tidak valid atau sudah tidak membuka pendaftaran.");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects before the structured opening time and after the closing time", async () => {
    mockEvent(eventRow({ registrationOpensAt: new Date(Date.now() + 60_000) }));
    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("sudah tidak membuka pendaftaran");

    mockEvent(eventRow({ registrationClosesAt: new Date(Date.now() - 60_000) }));
    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("sudah tidak membuka pendaftaran");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("sends paid events through the payment flow instead of creating an active team", async () => {
    mockEvent(eventRow({ registrationFeeRequired: true }));

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("membutuhkan verifikasi pembayaran");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("counts registered teams plus pending-review requests against the participant cap", async () => {
    prisma.team.count.mockResolvedValue(6);
    prisma.teamRegistrationRequest.count.mockResolvedValue(2);

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Slot pendaftaran event ini sudah penuh.");
    expect(prisma.teamRegistrationRequest.count).toHaveBeenCalledWith({
      where: { eventId: "event-open", status: "pending_review" },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a team name or tag that is already used in the event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-existing" });

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { eventId: "event-open", OR: [{ name: "Session United" }, { tag: "SES" }] },
      select: { id: true },
    });
  });

  // Defensive branch: assertEventRosterMutable already treats Live/Completed matches as a locked roster, so the
  // completed-match check can only be reached if the two counts disagree. Pinned so a move keeps both checks.
  it("keeps the defensive completed-match check after the roster lock", async () => {
    prisma.match.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    await expect(createCaptainWithTeam(signUp)).rejects.toThrow('Event "open-cup" sudah memiliki hasil match');
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("does not look for completed matches in other formats", async () => {
    mockEvent(eventRow({ format: "Round Robin" }));

    await expect(createCaptainWithTeam(signUp)).resolves.toEqual({ userId: "user-1", teamId: "team-1" });
    // Only the roster-lock read counts matches; the Single Elimination completed-match count is skipped.
    expect(prisma.match.count).toHaveBeenCalledTimes(1);
  });

  it("retries a write conflict (P2034) and succeeds on the next attempt", async () => {
    prisma.$transaction
      .mockRejectedValueOnce(p2034())
      .mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

    await expect(createCaptainWithTeam(signUp)).resolves.toEqual({ userId: "user-1", teamId: "team-1" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after three P2034 conflicts and rethrows the error", async () => {
    prisma.$transaction.mockRejectedValue(p2034());

    await expect(createCaptainWithTeam(signUp)).rejects.toMatchObject({ code: "P2034" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry other database errors", async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(createCaptainWithTeam(signUp)).rejects.toMatchObject({ code: "P2002" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("createCaptainWithPendingPayment", () => {
  beforeEach(() => {
    mockEvent(eventRow({ registrationFeeRequired: true }));
  });

  it("creates the captain and a pending_payment request that expires in 24 hours, with no team row", async () => {
    const before = Date.now();

    await expect(createCaptainWithPendingPayment(signUp)).resolves.toEqual({ userId: "user-1", requestId: "request-1" });

    const data = prisma.teamRegistrationRequest.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      eventId: "event-open",
      captainId: "user-1",
      teamName: "Session United",
      teamTag: "SES",
      status: "pending_payment",
    });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DAY_MS);
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.$transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "Serializable" });
  });

  // KNOWN QUIRK: paid sign-ups skip assertEventRosterMutable, so they take no competitionVersion claim and no
  // roster-lock check and can race a drawing publish. Pinned as-is; any fix is a separate behavior change.
  it("does not claim the roster lock, unlike the free-event flow", async () => {
    await createCaptainWithPendingPayment(signUp);

    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });

  it("rejects events that do not require payment", async () => {
    mockEvent(eventRow({ registrationFeeRequired: false }));

    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Event ini tidak membutuhkan verifikasi pembayaran.");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects when the event is missing or registration is closed", async () => {
    mockEvent(null);
    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Event tidak valid atau sudah tidak membuka pendaftaran.");

    mockEvent(eventRow({ registrationFeeRequired: true, status: "Ongoing" }));
    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Event tidak valid atau sudah tidak membuka pendaftaran.");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects when slots are full", async () => {
    prisma.team.count.mockResolvedValue(8);

    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Slot pendaftaran event ini sudah penuh.");
  });

  it("rejects a name or tag held by a team or by a reserved pending request", async () => {
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({ id: "request-existing" });

    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
    expect(prisma.teamRegistrationRequest.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: "event-open",
        status: { in: ["pending_payment", "pending_review"] },
        OR: [{ teamName: "Session United" }, { teamTag: "SES" }],
      },
      select: { id: true },
    });

    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
    prisma.team.findFirst.mockResolvedValue({ id: "team-existing" });
    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("closes new registrations once a Single Elimination match is completed", async () => {
    prisma.match.count.mockResolvedValue(1);

    await expect(createCaptainWithPendingPayment(signUp)).rejects.toThrow('Event "open-cup" sudah memiliki hasil match');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
