import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { RegistrationPreviewItem } from "@/lib/imports/registration-intake";
import type { AppUser } from "@/lib/platform/types";

const { prisma, tx, bcryptHash, randomBytesMock, isEventBracketLocked } = vi.hoisted(() => ({
  prisma: {
    event: { findMany: vi.fn(), findFirst: vi.fn() },
    team: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    registrationImportProfile: { create: vi.fn() },
    registrationImportBatch: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    event: { updateMany: vi.fn(), findUnique: vi.fn() },
    competitionPhase: { count: vi.fn() },
    match: { count: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    team: { create: vi.fn() },
  },
  bcryptHash: vi.fn(),
  randomBytesMock: vi.fn(),
  isEventBracketLocked: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("bcryptjs", () => ({ default: { hash: bcryptHash } }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: randomBytesMock };
});
vi.mock("@/lib/bracket/repository", () => ({ isEventBracketLocked }));

import { getCaptainCredentialsForEvent, getImportedTeams, getRegistrationImportBatchForAdmin, saveRegistrationImportPreviewBatch } from "./repository";

const NOW = new Date("2026-03-01T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const admin: AppUser = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" };
const platformAdmin: AppUser = { id: "pa-1", email: "pa@test.com", name: "PA", role: "platform_admin" };
const organizer: AppUser = { id: "org-1", email: "org@test.com", name: "Org", role: "organizer" };

/** Mirrors what the mocked randomBytes produces for the n-th call (1-based). */

function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "team-1",
    eventId: "event-1",
    captainId: "captain-1",
    name: "Alpha Squad",
    logoText: "AL",
    logoUrl: null,
    tag: "ALP",
    captainName: "Budi",
    captainContact: "0812",
    captainIgn: null,
    captainUid: null,
    captainIsPlayer: false,
    source: "csv-import",
    createdAt: NOW,
    ...overrides,
  };
}

let randomCalls = 0;

beforeEach(() => {
  vi.resetAllMocks();
  randomCalls = 0;
  randomBytesMock.mockImplementation(() => {
    randomCalls += 1;
    return Buffer.from(String(randomCalls).padStart(6, "0"));
  });
  bcryptHash.mockImplementation(async (plain: string) => `hash(${plain})`);
  prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  tx.event.updateMany.mockResolvedValue({ count: 1 });
  tx.event.findUnique.mockResolvedValue({ status: "Published" });
  tx.competitionPhase.count.mockResolvedValue(0);
  tx.match.count.mockResolvedValue(0);
  isEventBracketLocked.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getImportedTeams", () => {
  it("returns imported and intake teams for everyone when no user is given", async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await expect(getImportedTeams()).resolves.toEqual([]);

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { not: null },
        source: { in: ["csv-import", "registration-intake"] },
      },
      include: { captain: { select: { id: true, name: true } } },
    });
  });

  it("adds an organizer filter for organizers", async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await getImportedTeams(organizer);

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { not: null },
        source: { in: ["csv-import", "registration-intake"] },
        event: { organizerUserId: "org-1" },
      },
      include: { captain: { select: { id: true, name: true } } },
    });
  });

  it("does not add an organizer filter for platform admins", async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await getImportedTeams(platformAdmin);

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { not: null },
        source: { in: ["csv-import", "registration-intake"] },
      },
      include: { captain: { select: { id: true, name: true } } },
    });
  });

  it("maps rows to teams and omits empty optional fields", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow({ captain: { id: "captain-1", name: "Budi" } }),
      teamRow({
        id: "team-2",
        name: "Beta",
        tag: "BET",
        logoText: "BE",
        captainId: null,
        captainName: null,
        captainContact: null,
        source: "registration-intake",
      }),
    ]);

    const teams = await getImportedTeams();

    expect(teams).toEqual([
      {
        id: "team-1",
        captainId: "captain-1",
        eventId: "event-1",
        name: "Alpha Squad",
        logoText: "AL",
        tag: "ALP",
        captainName: "Budi",
        captainContact: "0812",
        captainIsPlayer: false,
        captain: { id: "captain-1", name: "Budi" },
        source: "csv-import",
      },
      {
        id: "team-2",
        captainId: "",
        eventId: "event-1",
        name: "Beta",
        logoText: "BE",
        tag: "BET",
        captainIsPlayer: false,
        source: "registration-intake",
      },
    ]);
  });

  it("propagates a database error", async () => {
    prisma.team.findMany.mockRejectedValue(new Error("boom"));

    await expect(getImportedTeams()).rejects.toThrow("boom");
  });
});

describe("getCaptainCredentialsForEvent", () => {
  it("returns an empty list and skips the user query when the event has no imported teams", async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await expect(getCaptainCredentialsForEvent("event-1")).resolves.toEqual([]);

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", source: { in: ["csv-import", "registration-intake"] } },
      orderBy: { createdAt: "asc" },
      include: { captain: { select: { id: true, name: true } } },
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("joins teams with their captain accounts in team order", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow({ id: "team-1", name: "Alpha", tag: "ALP", captainId: "captain-1", captainName: "Budi", captainContact: "0811" }),
      teamRow({ id: "team-2", name: "Beta", tag: "BET", captainId: "captain-2", captainName: "Sari", captainContact: "0822" }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: "captain-2", email: "bet@miraclefc.gg", tempPassword: "pw-two" },
      { id: "captain-1", email: "alp@miraclefc.gg", tempPassword: "pw-one" },
    ]);

    const credentials = await getCaptainCredentialsForEvent("event-1");

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["captain-1", "captain-2"] } } });
    expect(credentials).toEqual([
      { teamName: "Alpha", teamTag: "ALP", captainName: "Budi", captainContact: "0811", email: "alp@miraclefc.gg", tempPassword: "pw-one" },
      { teamName: "Beta", teamTag: "BET", captainName: "Sari", captainContact: "0822", email: "bet@miraclefc.gg", tempPassword: "pw-two" },
    ]);
  });

  it("falls back to empty strings for missing captain name, contact, user and password", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow({ id: "team-1", captainId: "captain-1", captainName: null, captainContact: null }),
      teamRow({ id: "team-2", name: "Beta", tag: "BET", captainId: "ghost", captainName: "Sari", captainContact: "0822" }),
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "captain-1", email: "alp@miraclefc.gg", tempPassword: null }]);

    const credentials = await getCaptainCredentialsForEvent("event-1");

    expect(credentials).toEqual([
      { teamName: "Alpha Squad", teamTag: "ALP", captainName: "", captainContact: "", email: "alp@miraclefc.gg", tempPassword: "" },
      { teamName: "Beta", teamTag: "BET", captainName: "Sari", captainContact: "0822", email: "", tempPassword: "" },
    ]);
  });

  it("skips the user query and returns blank credentials when no team has a captain", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow({ captainId: null, captainName: "Budi", captainContact: "0811" })]);

    const credentials = await getCaptainCredentialsForEvent("event-1");

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(credentials).toEqual([
      { teamName: "Alpha Squad", teamTag: "ALP", captainName: "Budi", captainContact: "0811", email: "", tempPassword: "" },
    ]);
  });

  it("only queries accounts for teams that have a captain", async () => {
    prisma.team.findMany.mockResolvedValue([
      teamRow({ id: "team-1", captainId: null }),
      teamRow({ id: "team-2", captainId: "captain-2" }),
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    await getCaptainCredentialsForEvent("event-1");

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["captain-2"] } } });
  });

  it("propagates a user query failure", async () => {
    prisma.team.findMany.mockResolvedValue([teamRow()]);
    prisma.user.findMany.mockRejectedValue(new Error("users unavailable"));

    await expect(getCaptainCredentialsForEvent("event-1")).rejects.toThrow("users unavailable");
  });
});

describe("saveRegistrationImportPreviewBatch", () => {
  const normalized = {
    teamName: "Alpha Squad",
    teamTag: "ALP",
    captainName: "Budi",
    captainContact: "0812",
    captainIgn: "BudiIGN",
    captainUid: "123",
    captainIsPlayer: true,
    players: [{ nickname: "Nick", displayName: "Display", position: "Jungle" }],
  };
  const items: RegistrationPreviewItem[] = [
    {
      sourceRow: 2,
      status: "new",
      selected: true,
      normalized,
    },
    {
      sourceRow: 3,
      status: "changed",
      selected: false,
      normalized,
      existingTeamId: "team-9",
      diff: [{ field: "teamName", before: "Old", after: "Alpha Squad" }],
    },
    {
      sourceRow: 4,
      status: "error",
      selected: false,
      errors: ["Tag kosong"],
    },
  ];
  const baseInput = {
    eventId: "event-1",
    sourceKind: "csv" as const,
    sourceLabel: "peserta.csv",
    worksheetName: "Sheet1",
    headerSignature: "sig-123",
    mapping: { teamName: 0 },
    items,
    summary: { new: 1, changed: 1, error: 1 },
  };

  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    prisma.registrationImportProfile.create.mockResolvedValue({ id: "profile-1" });
    prisma.registrationImportBatch.create.mockImplementation(async (args: unknown) => ({ id: "batch-1", args }));
  });

  it("creates a profile and a draft batch that expires 24 hours later", async () => {
    await saveRegistrationImportPreviewBatch({ user: admin, ...baseInput });

    expect(prisma.registrationImportProfile.create).toHaveBeenCalledWith({
      data: {
        eventId: "event-1",
        createdById: "admin-1",
        sourceKind: "csv",
        sourceLabel: "peserta.csv",
        worksheetName: "Sheet1",
        headerSignature: "sig-123",
        mapping: { teamName: 0 },
      },
    });
    const batchCall = prisma.registrationImportBatch.create.mock.calls[0][0];
    expect(batchCall.data).toMatchObject({
      eventId: "event-1",
      profileId: "profile-1",
      createdById: "admin-1",
      sourceKind: "csv",
      sourceLabel: "peserta.csv",
      worksheetName: "Sheet1",
      status: "draft",
      summary: { new: 1, changed: 1, error: 1 },
    });
    expect(batchCall.data.expiresAt).toEqual(new Date(NOW.getTime() + DAY_MS));
    expect(batchCall.include).toEqual({ items: true });
  });

  it("maps each preview item to a nested item create", async () => {
    await saveRegistrationImportPreviewBatch({ user: admin, ...baseInput });

    const { data } = prisma.registrationImportBatch.create.mock.calls[0][0];
    expect(data.items).toEqual({
      create: [
        {
          sourceRow: 2,
          status: "new",
          selected: true,
          normalizedData: normalized,
          diff: undefined,
          validationErrors: undefined,
          teamId: undefined,
        },
        {
          sourceRow: 3,
          status: "changed",
          selected: false,
          normalizedData: normalized,
          diff: [{ field: "teamName", before: "Old", after: "Alpha Squad" }],
          validationErrors: undefined,
          teamId: "team-9",
        },
        {
          sourceRow: 4,
          status: "error",
          selected: false,
          normalizedData: undefined,
          diff: undefined,
          validationErrors: ["Tag kosong"],
          teamId: undefined,
        },
      ],
    });
  });

  it("returns the created batch", async () => {
    const batch = await saveRegistrationImportPreviewBatch({ user: admin, ...baseInput });

    expect(batch).toMatchObject({ id: "batch-1" });
  });

  it("creates a batch with an empty item list when there are no items", async () => {
    await saveRegistrationImportPreviewBatch({ user: admin, ...baseInput, items: [] });

    expect(prisma.registrationImportBatch.create.mock.calls[0][0].data.items).toEqual({ create: [] });
  });

  it("passes an undefined worksheet name through for non-spreadsheet sources", async () => {
    await saveRegistrationImportPreviewBatch({ user: admin, ...baseInput, worksheetName: undefined });

    expect(prisma.registrationImportProfile.create.mock.calls[0][0].data.worksheetName).toBeUndefined();
    expect(prisma.registrationImportBatch.create.mock.calls[0][0].data.worksheetName).toBeUndefined();
  });

  it("allows an organizer who owns the event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await saveRegistrationImportPreviewBatch({ user: organizer, ...baseInput });

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
    expect(prisma.registrationImportBatch.create).toHaveBeenCalledTimes(1);
    expect(prisma.registrationImportProfile.create.mock.calls[0][0].data.createdById).toBe("org-1");
  });

  it("rejects an organizer who does not own the event before writing anything", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(saveRegistrationImportPreviewBatch({ user: organizer, ...baseInput })).rejects.toThrow("Not authorized");

    expect(prisma.registrationImportProfile.create).not.toHaveBeenCalled();
    expect(prisma.registrationImportBatch.create).not.toHaveBeenCalled();
  });

  it("rejects users with a non-management role", async () => {
    const captain: AppUser = { id: "c-1", email: "c@test.com", name: "C", role: "captain" };

    await expect(saveRegistrationImportPreviewBatch({ user: captain, ...baseInput })).rejects.toThrow("Not authorized");
    expect(prisma.registrationImportProfile.create).not.toHaveBeenCalled();
  });

  it("does not create a batch when the profile cannot be created", async () => {
    prisma.registrationImportProfile.create.mockRejectedValue(new Error("profile failed"));

    await expect(saveRegistrationImportPreviewBatch({ user: admin, ...baseInput })).rejects.toThrow("profile failed");
    expect(prisma.registrationImportBatch.create).not.toHaveBeenCalled();
  });

  it("writes the profile and the batch inside one transaction, so a failed batch leaves no profile behind", async () => {
    prisma.registrationImportBatch.create.mockRejectedValue(new Error("batch failed"));

    await expect(saveRegistrationImportPreviewBatch({ user: admin, ...baseInput })).rejects.toThrow("batch failed");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000, timeout: 60_000 });
    // The transaction rejects with the batch error, which is what rolls the profile back in the database.
    expect(prisma.registrationImportProfile.create).toHaveBeenCalledTimes(1);
  });
});

describe("getRegistrationImportBatchForAdmin", () => {
  it("looks up the batch with its items ordered by source row", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({ id: "batch-1", eventId: "event-1", items: [] });

    await getRegistrationImportBatchForAdmin(admin, "batch-1");

    expect(prisma.registrationImportBatch.findFirst).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      include: { items: { orderBy: { sourceRow: "asc" } } },
    });
  });

  it("returns null without any authorization query when the batch does not exist", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue(null);

    await expect(getRegistrationImportBatchForAdmin(organizer, "missing")).resolves.toBeNull();

    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it("returns the batch for an admin without checking event ownership", async () => {
    const batch = { id: "batch-1", eventId: "event-1", items: [{ id: "item-1", sourceRow: 2 }] };
    prisma.registrationImportBatch.findFirst.mockResolvedValue(batch);

    await expect(getRegistrationImportBatchForAdmin(platformAdmin, "batch-1")).resolves.toBe(batch);

    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it("returns the batch for an organizer who owns the batch's event", async () => {
    const batch = { id: "batch-1", eventId: "event-1", items: [] };
    prisma.registrationImportBatch.findFirst.mockResolvedValue(batch);
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(getRegistrationImportBatchForAdmin(organizer, "batch-1")).resolves.toBe(batch);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
  });

  it("rejects an organizer who does not own the batch's event", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({ id: "batch-1", eventId: "event-9", items: [] });
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(getRegistrationImportBatchForAdmin(organizer, "batch-1")).rejects.toThrow("Not authorized");
  });

  it("rejects users with a non-management role", async () => {
    const captain: AppUser = { id: "c-1", email: "c@test.com", name: "C", role: "captain" };
    prisma.registrationImportBatch.findFirst.mockResolvedValue({ id: "batch-1", eventId: "event-1", items: [] });

    await expect(getRegistrationImportBatchForAdmin(captain, "batch-1")).rejects.toThrow("Not authorized");
  });

  it("propagates a database error", async () => {
    prisma.registrationImportBatch.findFirst.mockRejectedValue(new Error("db down"));

    await expect(getRegistrationImportBatchForAdmin(admin, "batch-1")).rejects.toThrow("db down");
  });
});
