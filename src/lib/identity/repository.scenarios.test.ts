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

import { getOrganizerUserById, getOrganizerUsers } from "@/lib/identity/repository";

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});

describe("organizer user lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizer accounts for platform-admin event assignment", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    await expect(getOrganizerUsers()).resolves.toEqual([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "organizer" },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true },
    });
  });

  it("finds only organizer accounts by id", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    await expect(getOrganizerUserById("org-1")).resolves.toEqual({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "org-1", role: "organizer" },
      select: { id: true, email: true, name: true, role: true },
    });
  });
});