import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    event: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    player: { updateMany: vi.fn() },
    teamRegistrationRequest: { count: vi.fn() },
  };
  return {
    prisma,
    sendEmail: vi.fn(),
    isEmailDeliveryConfigured: vi.fn(),
    readEventRosterLocked: vi.fn(),
    assertEventRosterMutable: vi.fn(),
    assertUserCanManageEvent: vi.fn(),
  };
});

vi.mock("@/lib/platform/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail, isEmailDeliveryConfigured: mocks.isEmailDeliveryConfigured }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog: vi.fn() }));
vi.mock("@/lib/platform/shared/authz", () => ({ assertUserCanManageEvent: mocks.assertUserCanManageEvent }));
vi.mock("@/lib/platform/shared/tx", () => ({
  readEventRosterLocked: mocks.readEventRosterLocked,
  assertEventRosterMutable: mocks.assertEventRosterMutable,
  runSerializableRegistrationTransaction: (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma),
}));

import { extendCompletionDeadline, getCaptainCompletionNotices, restoreSuspendedTeam, suspendIncompleteTeam, syncTeamCompletion, updateCaptainTeamContact } from "./completion-repository";

const { prisma } = mocks;
const now = new Date("2026-10-16T12:00:00.000Z");
const hour = 3_600_000;
const organizer = { id: "org-1", role: "organizer" } as never;

function team(overrides: Record<string, unknown> = {}) {
  return {
    id: "team-1",
    name: "Alpha",
    captainContact: null,
    completionDeadlineAt: null,
    completionNotifiedAt: null,
    captain: { email: "kapten@example.test" },
    _count: { players: 5 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEmailDeliveryConfigured.mockReturnValue(true);
  mocks.readEventRosterLocked.mockResolvedValue(false);
  prisma.event.findMany.mockResolvedValue([{ id: "event-1", name: "Miracle Open", gameModeId: "mode-flashpeak-5v5" }]);
  prisma.event.findUnique.mockResolvedValue({ gameModeId: "mode-flashpeak-5v5", participantCap: 16 });
  prisma.team.findMany.mockResolvedValue([]);
});

describe("syncTeamCompletion", () => {
  it("looks only at events whose roster is still open", async () => {
    await syncTeamCompletion(now);
    expect(prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ["Published", "Registration Closed"] } },
    }));
  });

  it("keeps going with the next event when one event cannot be checked", async () => {
    prisma.event.findMany.mockResolvedValue([
      { id: "event-bad", name: "Old Event", gameModeId: "mode-that-no-longer-exists" },
      { id: "event-1", name: "Miracle Open", gameModeId: "mode-flashpeak-5v5" },
    ]);
    prisma.team.findMany.mockResolvedValue([team()]);

    const result = await syncTeamCompletion(now);

    expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event-1", suspendedAt: null } }));
    expect(result.flagged).toBe(1);
  });

  it("keeps going when the database fails for one event", async () => {
    prisma.event.findMany.mockResolvedValue([
      { id: "event-a", name: "A", gameModeId: "mode-flashpeak-5v5" },
      { id: "event-b", name: "B", gameModeId: "mode-flashpeak-5v5" },
    ]);
    prisma.team.findMany.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce([team()]);
    const result = await syncTeamCompletion(now);
    expect(result.flagged).toBe(1);
  });

  it("skips an event whose roster is locked", async () => {
    mocks.readEventRosterLocked.mockResolvedValue(true);
    await syncTeamCompletion(now);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it("starts a two-day deadline and emails a team without a contact", async () => {
    prisma.team.findMany.mockResolvedValue([team()]);

    const result = await syncTeamCompletion(now);

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { completionDeadlineAt: new Date(now.getTime() + 48 * hour) },
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "kapten@example.test" }));
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { completionNotifiedAt: now } });
    expect(result).toEqual({ flagged: 1, cleared: 0, emailed: 1, emailFailed: 0, emailSkipped: 0 });
  });

  it("flags a team with too few players", async () => {
    prisma.team.findMany.mockResolvedValue([team({ captainContact: "081234567890", _count: { players: 3 } })]);
    const result = await syncTeamCompletion(now);
    expect(result.flagged).toBe(1);
    expect(mocks.sendEmail.mock.calls[0]![0].html).toContain("Pemain kurang 2 orang.");
  });

  it("does not move the deadline or email again for a team that was already flagged and notified", async () => {
    prisma.team.findMany.mockResolvedValue([
      team({ completionDeadlineAt: new Date(now.getTime() + hour), completionNotifiedAt: new Date(now.getTime() - hour) }),
    ]);
    const result = await syncTeamCompletion(now);
    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ flagged: 0, cleared: 0, emailed: 0, emailFailed: 0, emailSkipped: 0 });
  });

  it("clears the flag of a team that became complete", async () => {
    prisma.team.findMany.mockResolvedValue([
      team({ captainContact: "081234567890", completionDeadlineAt: new Date(now.getTime() + hour), completionNotifiedAt: now }),
    ]);
    const result = await syncTeamCompletion(now);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { completionDeadlineAt: null, completionNotifiedAt: null } });
    expect(result.cleared).toBe(1);
  });

  it("leaves a complete team alone", async () => {
    prisma.team.findMany.mockResolvedValue([team({ captainContact: "081234567890" })]);
    await syncTeamCompletion(now);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("flags but does not email while email delivery is not configured, so a later run still sends it", async () => {
    mocks.isEmailDeliveryConfigured.mockReturnValue(false);
    prisma.team.findMany.mockResolvedValue([team()]);
    const result = await syncTeamCompletion(now);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(prisma.team.update).not.toHaveBeenCalledWith({ where: { id: "team-1" }, data: { completionNotifiedAt: now } });
    expect(result).toMatchObject({ flagged: 1, emailed: 0, emailSkipped: 1 });
  });

  it("does not email the made-up address of an imported captain", async () => {
    prisma.team.findMany.mockResolvedValue([team({ captain: { email: "miracle-open-alp@miraclefc.gg" } })]);
    const result = await syncTeamCompletion(now);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.emailSkipped).toBe(1);
  });

  it("counts a failed email and tries again on the next run", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("Email delivery failed"));
    prisma.team.findMany.mockResolvedValue([team()]);
    const result = await syncTeamCompletion(now);
    expect(result).toMatchObject({ flagged: 1, emailed: 0, emailFailed: 1 });
    expect(prisma.team.update).not.toHaveBeenCalledWith({ where: { id: "team-1" }, data: { completionNotifiedAt: now } });
  });

  it("emails a flagged team whose earlier email never went out", async () => {
    prisma.team.findMany.mockResolvedValue([team({ completionDeadlineAt: new Date(now.getTime() + hour) })]);
    const result = await syncTeamCompletion(now);
    expect(result).toMatchObject({ flagged: 0, emailed: 1 });
  });
});

describe("suspendIncompleteTeam", () => {
  const overdueTeam = { captainContact: null, completionDeadlineAt: new Date(now.getTime() - hour), _count: { players: 5 } };

  it("checks the organizer may manage the event first", async () => {
    mocks.assertUserCanManageEvent.mockRejectedValueOnce(new Error("Not authorized"));
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("Not authorized");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("takes an overdue team out of the event with its players", async () => {
    prisma.team.findFirst.mockResolvedValue(overdueTeam);
    prisma.team.count.mockResolvedValue(0);

    await suspendIncompleteTeam(organizer, "event-1", "team-1", now);

    expect(mocks.assertEventRosterMutable).toHaveBeenCalledWith(prisma, "event-1");
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { eventId: null, suspendedAt: now, suspendedFromEventId: "event-1" },
    });
    expect(prisma.player.updateMany).toHaveBeenCalledWith({ where: { teamId: "team-1" }, data: { eventId: null } });
  });

  it("refuses a team that is part of a drawing, with a message that says what to do", async () => {
    prisma.team.findFirst.mockResolvedValue(overdueTeam);
    prisma.team.count.mockResolvedValue(1);
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("Hapus drawing event ini dulu");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("refuses an event with a game mode the app does not know", async () => {
    prisma.team.findFirst.mockResolvedValue(overdueTeam);
    prisma.event.findUnique.mockResolvedValue({ gameModeId: "gone", participantCap: 16 });
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("Mode game event ini tidak dikenal");
  });

  it("refuses a team that is still inside its deadline", async () => {
    prisma.team.findFirst.mockResolvedValue({ ...overdueTeam, completionDeadlineAt: new Date(now.getTime() + hour) });
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("belum melewati tenggat");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("refuses a team that has no deadline yet", async () => {
    prisma.team.findFirst.mockResolvedValue({ ...overdueTeam, completionDeadlineAt: null });
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("belum melewati tenggat");
  });

  it("refuses a team that completed its data after the deadline", async () => {
    prisma.team.findFirst.mockResolvedValue({ ...overdueTeam, captainContact: "081234567890" });
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("datanya sudah lengkap");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("refuses a team that is not in this event", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-9", now)).rejects.toThrow("Tim tidak ditemukan");
  });

  it("stops when the roster is locked", async () => {
    mocks.assertEventRosterMutable.mockRejectedValueOnce(new Error("Roster tim sudah terkunci"));
    await expect(suspendIncompleteTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("terkunci");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe("restoreSuspendedTeam", () => {
  beforeEach(() => {
    prisma.team.findFirst.mockImplementation(async ({ where }: { where: { suspendedFromEventId?: string; eventId?: string } }) =>
      where.suspendedFromEventId ? { captainId: "captain-1" } : null);
    prisma.team.count.mockResolvedValue(10);
    prisma.teamRegistrationRequest.count.mockResolvedValue(0);
  });

  it("puts the team and its players back with a fresh deadline", async () => {
    await restoreSuspendedTeam(organizer, "event-1", "team-1", now);

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: {
        eventId: "event-1",
        suspendedAt: null,
        suspendedFromEventId: null,
        completionDeadlineAt: new Date(now.getTime() + 48 * hour),
        completionNotifiedAt: null,
      },
    });
    expect(prisma.player.updateMany).toHaveBeenCalledWith({ where: { teamId: "team-1" }, data: { eventId: "event-1" } });
  });

  it("refuses when the slot was taken", async () => {
    prisma.team.count.mockResolvedValue(15);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);
    await expect(restoreSuspendedTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("Slot pendaftaran event ini sudah penuh.");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("refuses when the captain registered another team in the meantime", async () => {
    prisma.team.findFirst.mockImplementation(async () => ({ captainId: "captain-1" }));
    await expect(restoreSuspendedTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("sudah punya tim lain");
  });

  it("refuses a team that is not suspended from this event", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    await expect(restoreSuspendedTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("tidak ditemukan");
  });

  it("turns a name or tag clash into a readable message", async () => {
    prisma.team.update.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(restoreSuspendedTeam(organizer, "event-1", "team-1", now)).rejects.toThrow("sudah dipakai tim lain");
  });
});

describe("extendCompletionDeadline", () => {
  it("adds two days to a deadline that is still running", async () => {
    const deadline = new Date(now.getTime() + hour);
    prisma.team.findFirst.mockResolvedValue({ captainContact: null, completionDeadlineAt: deadline, _count: { players: 5 } });
    await extendCompletionDeadline(organizer, "event-1", "team-1", now);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { completionDeadlineAt: new Date(deadline.getTime() + 48 * hour) },
    });
  });

  it("restarts from now when the deadline has passed", async () => {
    prisma.team.findFirst.mockResolvedValue({ captainContact: null, completionDeadlineAt: new Date(now.getTime() - hour), _count: { players: 5 } });
    await extendCompletionDeadline(organizer, "event-1", "team-1", now);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { completionDeadlineAt: new Date(now.getTime() + 48 * hour) },
    });
  });

  it("refuses a team whose data is complete", async () => {
    prisma.team.findFirst.mockResolvedValue({ captainContact: "081234567890", completionDeadlineAt: null, _count: { players: 5 } });
    await expect(extendCompletionDeadline(organizer, "event-1", "team-1", now)).rejects.toThrow("sudah lengkap");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe("getCaptainCompletionNotices", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "team-1",
    name: "Alpha",
    eventId: "event-1",
    suspendedFromEventId: null,
    suspendedAt: null,
    captainContact: null,
    completionDeadlineAt: new Date(now.getTime() + hour),
    _count: { players: 5 },
    ...overrides,
  });
  const openEvent = { id: "event-1", name: "Miracle Open", status: "Published", gameModeId: "mode-flashpeak-5v5" };

  beforeEach(() => {
    prisma.event.findMany.mockResolvedValue([openEvent]);
  });

  it("asks only for the teams of this captain", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    await getCaptainCompletionNotices("captain-1", now);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ captainId: "captain-1" }) }));
  });

  it("lists what is missing with the deadline", async () => {
    prisma.team.findMany.mockResolvedValue([row({ _count: { players: 4 } })]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([{
      teamId: "team-1",
      teamName: "Alpha",
      eventName: "Miracle Open",
      missingContact: true,
      missingPlayers: 1,
      state: "pending",
      deadlineAt: new Date(now.getTime() + hour).toISOString(),
      suspended: false,
    }]);
  });

  it("skips a team that is complete", async () => {
    prisma.team.findMany.mockResolvedValue([row({ captainContact: "081234567890" })]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([]);
  });

  it("skips teams of an event that already started", async () => {
    prisma.event.findMany.mockResolvedValue([{ ...openEvent, status: "Ongoing" }]);
    prisma.team.findMany.mockResolvedValue([row()]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([]);
  });

  it("reports a missing deadline as incomplete and a passed one as overdue", async () => {
    prisma.team.findMany.mockResolvedValue([
      row({ id: "a", completionDeadlineAt: null }),
      row({ id: "b", completionDeadlineAt: new Date(now.getTime() - hour) }),
    ]);
    const notices = await getCaptainCompletionNotices("captain-1", now);
    expect(notices.map((notice) => [notice.teamId, notice.state])).toEqual([["a", "incomplete"], ["b", "overdue"]]);
  });

  it("lists a suspended team with the event it left", async () => {
    prisma.team.findMany.mockResolvedValue([row({ eventId: null, suspendedFromEventId: "event-1", suspendedAt: new Date(now.getTime() - hour) })]);
    const [notice] = await getCaptainCompletionNotices("captain-1", now);
    expect(notice).toMatchObject({ teamId: "team-1", eventName: "Miracle Open", suspended: true });
  });

  it("skips a team whose event has a game mode the app does not know", async () => {
    prisma.event.findMany.mockResolvedValue([{ ...openEvent, gameModeId: "gone" }]);
    prisma.team.findMany.mockResolvedValue([row()]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([]);
  });

  it("drops the suspended notice once the event is no longer open", async () => {
    prisma.event.findMany.mockResolvedValue([{ ...openEvent, status: "Finished" }]);
    prisma.team.findMany.mockResolvedValue([row({ eventId: null, suspendedFromEventId: "event-1", suspendedAt: new Date(now.getTime() - hour) })]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([]);
  });

  it("does not read events when the captain has no such teams", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    await expect(getCaptainCompletionNotices("captain-1", now)).resolves.toEqual([]);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });
});

describe("updateCaptainTeamContact", () => {
  it("saves the contact only on a team of that captain", async () => {
    prisma.team.updateMany.mockResolvedValue({ count: 1 });
    await updateCaptainTeamContact("captain-1", "team-1", "081234567890");
    expect(prisma.team.updateMany).toHaveBeenCalledWith({
      where: {
        id: "team-1",
        captainId: "captain-1",
        OR: [{ eventId: null }, { event: { status: { in: ["Published", "Registration Closed"] } } }],
      },
      data: { captainContact: "081234567890" },
    });
  });

  it("refuses a team that belongs to someone else", async () => {
    prisma.team.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateCaptainTeamContact("captain-1", "team-9", "081234567890")).rejects.toThrow("Tim tidak ditemukan.");
  });
});
