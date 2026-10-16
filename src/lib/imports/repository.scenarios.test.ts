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

import { commitRegistrationImportBatch, getRegistrationRecordsForEvent, getRegistrationImportBatchesForEvent, getRegistrationImportHistoryForEvent, getRegistrationImportEventContext, getRegistrationImportUsersByEmails } from "@/lib/imports/repository";
import { RegistrationMutationConflictError } from "@/lib/registration/repository";
import { approveTeamRegistrationRequest, getPaymentReviewForEvent, getEventPaymentSettingsForManager, rejectTeamRegistrationRequest } from "@/lib/registration/review-repository";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
const admin = { id: "admin-2", role: "admin" as const, email: "admin2@test.com", name: "Admin Two" };
const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});


describe("registration intake commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", slug: "redclover-cup", format: "Single Elimination" });
    prisma.match.count.mockResolvedValue(0);
    prisma.team.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.count.mockResolvedValue(0);
    prisma.registrationImportBatch.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") return callback(prisma);
      return callback;
    });
  });

  it("creates teams, players, and only exports credentials for newly created captain accounts", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-new",
          status: "new",
          normalizedData: {
            teamName: "Gamma",
            teamTag: "GAM",
            captainName: "Gina",
            captainContact: "081",
            captainEmail: "gina@example.com",
            players: [{ nickname: "Gina", displayName: "Gina", position: "Unassigned" }],
          },
        },
        {
          id: "item-existing",
          status: "changed",
          teamId: "team-alpha",
          normalizedData: {
            teamName: "Alpha",
            teamTag: "ALP",
            captainName: "Alya",
            captainContact: "082",
            captainEmail: "alya@example.com",
            players: [{ nickname: "Alya", displayName: "Alya", position: "Guard" }],
          },
        },
      ],
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "captain-existing", email: "alya@example.com", role: "captain", name: "Alya" });
    prisma.user.create.mockResolvedValue({ id: "captain-new", email: "gina@example.com", role: "captain", name: "Gina" });
    prisma.team.create.mockResolvedValue({ id: "team-gamma" });
    prisma.team.update.mockResolvedValue({ id: "team-alpha" });

    const result = await commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new", "item-existing"]);

    expect(result.importedCount).toBe(2);
    expect(result.credentials).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 60_000,
      },
    );
    expect(result.credentials[0]).toMatchObject({
      teamName: "Gamma",
      teamTag: "GAM",
      captainName: "Gina",
      email: "gina@example.com",
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.team.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ captainId: "captain-new", source: "registration-intake" }),
    }));
    expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "team-alpha" },
      data: expect.objectContaining({ captainId: "captain-existing" }),
    }));
    expect(prisma.player.deleteMany).toHaveBeenCalledWith({ where: { teamId: "team-alpha" } });
    expect(prisma.player.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.registrationImportItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: "item-new" },
      data: expect.objectContaining({ selected: true, status: "imported", teamId: "team-gamma" }),
    });
    expect(prisma.registrationImportItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: "item-existing" },
      data: expect.objectContaining({ selected: true, status: "imported", teamId: "team-alpha" }),
    });
    expect(prisma.registrationImportBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ status: "committed" }),
    });
  });

  it("returns the idempotent result when another transaction already claimed the batch", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      status: "validated",
      committedAt: null,
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination", participantCap: 8 },
      items: [{
        id: "item-new",
        status: "new",
        normalizedData: {
          teamName: "Gamma",
          teamTag: "GAM",
          captainName: "Gina",
          captainContact: "081",
          captainEmail: "gina@example.com",
          players: [],
        },
      }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "captain-existing", role: "captain" });
    prisma.registrationImportBatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new"]))
      .resolves.toEqual({ importedCount: 0, credentials: [] });
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.registrationImportBatch.update).not.toHaveBeenCalled();
  });

  it("rejects a selected row when the captain email belongs to a non-captain user", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-staff",
          status: "new",
          normalizedData: {
            teamName: "Staff",
            teamTag: "STF",
            captainName: "Staff",
            captainContact: "081",
            captainEmail: "staff@example.com",
            players: [{ nickname: "Staff", displayName: "Staff", position: "Unassigned" }],
          },
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "organizer-1", email: "staff@example.com", role: "organizer", name: "Staff" });

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-staff"]))
      .rejects.toThrow("Email kapten sudah dipakai akun non-captain.");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("blocks commits after the drawing or tournament becomes authoritative", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [],
    });
    prisma.match.count.mockResolvedValue(1);

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", []))
      .rejects.toThrow("Roster tim sudah terkunci");
  });

  it("counts pending-review reservations before importing new teams", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination", participantCap: 8 },
      items: [{
        id: "item-new",
        status: "new",
        normalizedData: {
          teamName: "Gamma",
          teamTag: "GAM",
          captainName: "Gina",
          captainContact: "081",
          captainEmail: "gina@example.com",
          players: [],
        },
      }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "captain-existing", email: "gina@example.com", role: "captain", name: "Gina" });
    prisma.team.count.mockResolvedValue(7);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new"]))
      .rejects.toThrow("Slot pendaftaran event ini tidak cukup");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });
});

describe("event-local registration workspace repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Published", gameModeId: "mode-flashpeak-5v5" });
  });

  it("maps queue records to the requested event and preserves import source provenance", async () => {
    prisma.team.findMany.mockResolvedValue([{
      id: "team-import",
      eventId: "event-1",
      name: "Imported Team",
      tag: "IMP",
      source: "registration-intake",
      captainId: "captain-1",
      captainName: "Captain",
      captainContact: "081",
      captainIgn: "CaptainIGN",
      captainUid: "uid-1",
      captainIsPlayer: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      players: [{ id: "player-1" }],
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }]);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([{ teamId: "team-import", batch: { sourceKind: "csv" } }]);

    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toEqual([
      expect.objectContaining({
        id: "team-import",
        eventId: "event-1",
        source: "import_csv",
        status: "accepted",
        rosterCount: 1,
      }),
    ]);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ eventId: "event-1" }, { suspendedFromEventId: "event-1" }] },
    }));
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventId: "event-1" }) }));
  });

  describe("team completion in the registration records", () => {
    const now = Date.now();
    const baseTeam = {
      eventId: "event-1",
      source: "registration",
      captainId: "captain-1",
      captainName: "Captain",
      captainContact: "081",
      captainIgn: null,
      captainUid: null,
      captainIsPlayer: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      completionDeadlineAt: null,
      suspendedAt: null,
      players: Array.from({ length: 5 }, (_, index) => ({ id: `player-${index}` })),
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    };

    beforeEach(() => {
      prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
      prisma.registrationImportItem.findMany.mockResolvedValue([]);
    });

    it("leaves a complete team without a completion flag", async () => {
      prisma.team.findMany.mockResolvedValue([{ ...baseTeam, id: "team-ok", name: "Complete", tag: "CMP" }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record).not.toHaveProperty("completion");
    });

    it("flags a team without a contact and with too few players, with its deadline", async () => {
      const deadline = new Date(now + 3_600_000);
      prisma.team.findMany.mockResolvedValue([{
        ...baseTeam, id: "team-gap", name: "Gap", tag: "GAP", captainContact: null, completionDeadlineAt: deadline, players: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record?.completion).toEqual({ missingContact: true, missingPlayers: 2, state: "pending", deadlineAt: deadline.toISOString() });
    });

    it("marks a team past its deadline as overdue", async () => {
      prisma.team.findMany.mockResolvedValue([{
        ...baseTeam, id: "team-late", name: "Late", tag: "LTE", captainContact: "", completionDeadlineAt: new Date(now - 1000),
      }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record?.completion?.state).toBe("overdue");
    });

    it("reports a suspended team with the suspended status", async () => {
      prisma.team.findMany.mockResolvedValue([{
        ...baseTeam, id: "team-out", name: "Out", tag: "OUT", eventId: null, captainContact: null, suspendedAt: new Date(now - 1000), completionDeadlineAt: new Date(now - 5000),
      }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record).toMatchObject({ id: "team-out", eventId: "event-1", status: "suspended" });
    });

    it("does not flag teams, and does not fail, for an event with a game mode the app does not know", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Published", gameModeId: "gone" });
      prisma.team.findMany.mockResolvedValue([{ ...baseTeam, id: "team-gap", name: "Gap", tag: "GAP", captainContact: null }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record).not.toHaveProperty("completion");
    });

    it.each([
      ["registration has closed", { status: "Registration Closed" }],
      ["the closing time has passed", { registrationClosesAt: new Date(Date.now() - 3_600_000) }],
    ])("does not flag teams once %s", async (_label, eventOverride) => {
      prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Published", gameModeId: "mode-flashpeak-5v5", ...eventOverride });
      prisma.team.findMany.mockResolvedValue([{ ...baseTeam, id: "team-gap", name: "Gap", tag: "GAP", captainContact: null }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record).not.toHaveProperty("completion");
    });

    it("does not flag teams once the event is running", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Ongoing", gameModeId: "mode-flashpeak-5v5" });
      prisma.team.findMany.mockResolvedValue([{ ...baseTeam, id: "team-gap", name: "Gap", tag: "GAP", captainContact: null }]);
      const [record] = await getRegistrationRecordsForEvent(organizer, "event-1");
      expect(record).not.toHaveProperty("completion");
    });
  });

  it("returns import history without exposing unrelated batches", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: { new: 2 },
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: new Date("2026-09-10T00:00:00.000Z"),
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      _count: { items: 1 },
    }]);

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1")).resolves.toEqual([
      expect.objectContaining({ id: "batch-1", eventId: "event-1", itemCount: 1 }),
    ]);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1" },
      select: expect.objectContaining({ _count: { select: { items: true } } }),
    }));
  });

  it("rejects import-batch item overflow above the accepted 512-row import cap", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      items: Array.from({ length: 513 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 512 });
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ items: expect.objectContaining({ take: 513 }) }),
    }));
  });

  it("supports exactly 512 stored import-batch items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      items: Array.from({ length: 512 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(1);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ items: expect.objectContaining({ take: 513 }) }),
    }));
  });

  it("returns the latest eight import batches when a ninth historical batch exists", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      items: [],
    })));

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "batch-1" }),
        expect.objectContaining({ id: "batch-8" }),
      ]));
    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(8);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 9,
      include: expect.objectContaining({ items: expect.objectContaining({ take: 513 }) }),
    }));
  });

  it("supports exactly the import-batch outer cap independently of nested items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      items: [],
    })));

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(8);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 9 }));
  });

  it("returns the latest 100 import-history batches when older history exists", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      _count: { items: 0 },
    })));
    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(100);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 101,
      select: expect.objectContaining({ _count: { select: { items: true } } }),
    }));
  });

  it("supports exactly 100 import-history batches independently of nested items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      _count: { items: 0 },
    })));

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(100);
  });

  it("uses the stored item count without loading nested import-history items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      _count: { items: 512 },
    }]);

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .resolves.toEqual([expect.objectContaining({ itemCount: 512, items: [] })]);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ _count: { select: { items: true } } }),
    }));
  });

  it("rejects import-context team and nested player overflow independently", async () => {
    const team = (index: number, players: number) => ({
      id: `team-${index}`,
      name: `Team ${index}`,
      tag: `T${index}`,
      captainName: "Captain",
      captainContact: "081",
      players: Array.from({ length: players }, (_, playerIndex) => ({ nickname: `p-${playerIndex}`, displayName: `Player ${playerIndex}`, position: "Forward" })),
    });
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 500, format: "Single Elimination",
      teams: Array.from({ length: 501 }, (_, index) => team(index + 1, 0)),
    });
    await expect(getRegistrationImportEventContext(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(prisma.event.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ teams: expect.objectContaining({ take: 501, select: expect.objectContaining({ players: expect.objectContaining({ take: 501 }) }) }) }),
    }));

    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 1, format: "Single Elimination",
      teams: [team(1, 501)],
    });
    await expect(getRegistrationImportEventContext(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
  });

  it("supports exactly 500 import-context teams independently of nested players", async () => {
    const team = (index: number) => ({
      id: `team-${index}`,
      name: `Team ${index}`,
      tag: `T${index}`,
      captainName: "Captain",
      captainContact: "081",
      players: [],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 500, format: "Single Elimination",
      teams: Array.from({ length: 500 }, (_, index) => team(index + 1)),
    });

    const result = await getRegistrationImportEventContext(platformAdmin, "event-1");
    expect(result?.teams).toHaveLength(500);
  });

  it("supports exactly 500 import-context players independently of outer teams", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 1, format: "Single Elimination",
      teams: [{
        id: "team-1",
        name: "Team 1",
        tag: "T1",
        captainName: "Captain",
        captainContact: "081",
        players: Array.from({ length: 500 }, (_, index) => ({ nickname: `p-${index}`, displayName: `Player ${index}`, position: "Forward" })),
      }],
    });

    const result = await getRegistrationImportEventContext(platformAdmin, "event-1");
    expect(result?.teams).toHaveLength(1);
    expect(result?.teams[0]?.players).toHaveLength(500);
  });

  it("reads payment proofs only for the event and requested review status", async () => {
    prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([{
      id: "request-1",
      eventId: "event-1",
      captainId: "captain-1",
      teamId: null,
      teamName: "Proof Team",
      teamTag: "PRF",
      status: "pending_review",
      proofImageUrl: "/proofs/request-1.png",
      rejectReason: null,
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }]);

    await expect(getPaymentReviewForEvent(organizer, "event-1", "pending_review")).resolves.toEqual([
      expect.objectContaining({ id: "request-1", eventId: "event-1", proofImageUrl: "/proofs/request-1.png" }),
    ]);
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", status: "pending_review" },
    }));
  });

  it("rejects registration-reader overflow even when the delegate ignores take", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", status: "Published", gameModeId: "mode-flashpeak-5v5" });
    const teams = Array.from({ length: 501 }, (_, index) => ({
      id: `team-${index + 1}`,
      eventId: "event-1",
      name: `Team ${index + 1}`,
      tag: `T${index + 1}`,
      source: "registration-intake",
      captainId: "captain-1",
      captainName: "Captain",
      captainContact: "081",
      captainIgn: null,
      captainUid: null,
      captainIsPlayer: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      players: [],
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }));
    prisma.team.findMany.mockResolvedValue(teams);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([]);

    await expect(getRegistrationRecordsForEvent(organizer, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 501,
      include: expect.objectContaining({ players: expect.objectContaining({ take: 501 }) }),
    }));

    prisma.team.findMany.mockResolvedValue(teams.slice(0, 500));
    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toHaveLength(500);
  });

  it("detects payment-review overflow instead of silently truncating the capped list", async () => {
    prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.teamRegistrationRequest.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({
      id: `request-${index + 1}`,
      eventId: "event-1",
      captainId: "captain-1",
      teamId: null,
      teamName: `Proof Team ${index + 1}`,
      teamTag: `PR${index + 1}`,
      status: "pending_review",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      createdAt: new Date(2026, 0, index + 1),
      updatedAt: new Date(2026, 0, index + 1),
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    })));

    await expect(getPaymentReviewForEvent(organizer, "event-1", "pending_review"))
      .rejects.toThrow(/payment review.*more than|overflow/i);
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: expect.any(Number),
    }));
  });

  it("returns event QRIS draft state without falling back to global settings", async () => {
    prisma.eventPaymentSettings.findUnique.mockResolvedValue({
      id: "event-payment-1",
      eventId: "event-1",
      qrisImageUrl: "/payment-qris/event-1.png",
      instructions: "Scan QRIS",
      status: "draft",
      version: 4,
      publishedAt: null,
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await expect(getEventPaymentSettingsForManager(platformAdmin, "event-1")).resolves.toMatchObject({
      eventId: "event-1", source: "event", status: "draft", version: 4,
      qrisImageUrl: "/payment-qris/event-1.png",
    });
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("does not expose sensitive event reads through an unauthenticated string-only call", async () => {
    await expect((getRegistrationRecordsForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportHistoryForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getPaymentReviewForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportEventContext as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getEventPaymentSettingsForManager as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportUsersByEmails as unknown as (emails: string[]) => Promise<unknown>)(["captain@example.com"]))
      .rejects.toThrow("Not authorized");
  });

  it("allows the event owner and platform roles through the secured repository boundary", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([]);
    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toEqual([]);
    await expect(getRegistrationRecordsForEvent(admin, "event-1")).resolves.toEqual([]);
    await expect(getRegistrationRecordsForEvent(platformAdmin, "event-1")).resolves.toEqual([]);
    expect(prisma.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizerUserId: "org-1" }) }));
  });

  it("rejects stale approval before creating a team", async () => {
    const updatedAt = new Date("2026-09-14T10:00:00.000Z");
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({
      eventId: "event-1", status: "pending_review", updatedAt,
    });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1", {
      expectedStatus: "pending_review",
      expectedUpdatedAt: new Date("2026-09-14T09:00:00.000Z"),
    })).rejects.toBeInstanceOf(RegistrationMutationConflictError);
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("rejects stale payment rejection without a partial write", async () => {
    const updatedAt = new Date("2026-09-14T10:00:00.000Z");
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({
      id: "request-1", eventId: "event-1", status: "pending_review", updatedAt,
    });

    await expect(rejectTeamRegistrationRequest(platformAdmin, "request-1", "Tidak sesuai", {
      expectedStatus: "pending_review",
      expectedUpdatedAt: new Date("2026-09-14T09:00:00.000Z"),
    })).rejects.toBeInstanceOf(RegistrationMutationConflictError);
    expect(prisma.teamRegistrationRequest.updateMany).not.toHaveBeenCalled();
  });
});