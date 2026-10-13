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

import { getEventsByIds } from "@/lib/events/repository";
import { approveEventVisualAsset, countAiVisualAttempts, createEventVisualAsset, listEventVisualAssets, rejectEventVisualAsset, setEventVisualFocalPoint } from "@/lib/events/visual-repository";

const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});


describe("event visual asset lifecycle", () => {
  const assetRow = {
    id: "asset-2",
    eventId: "event-1",
    source: "ai_generated",
    status: "ready_for_review",
    url: "https://assets.example/generated.webp",
    mimeType: "image/webp",
    width: 1200,
    height: 630,
    focalX: 0.5,
    focalY: 0.5,
    provider: "openai",
    model: "gpt-image-1",
    promptVersion: "v1",
    workflowRunId: "run-1",
    sourceUrl: null,
    rightsAttestedAt: null,
    errorCode: null,
    createdByUserId: "org-1",
    approvedAt: null,
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) => run(prisma));
  });

  it("lists revisions newest first for an authorized organizer", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findMany.mockResolvedValue([assetRow]);

    await expect(listEventVisualAssets(organizer, "event-1")).resolves.toMatchObject([
      { id: "asset-2", eventId: "event-1", source: "ai_generated", status: "ready_for_review" },
    ]);
    expect(prisma.eventVisualAsset.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("refuses to list revisions for another organizer's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(listEventVisualAssets(organizer, "event-1")).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.findMany).not.toHaveBeenCalled();
  });

  it("records the creating user on a new revision", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.create.mockResolvedValue(assetRow);

    await createEventVisualAsset(organizer, {
      eventId: "event-1",
      source: "organizer_upload",
      status: "ready_for_review",
      url: "https://assets.example/upload.webp",
    });

    expect(prisma.eventVisualAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event-1", createdByUserId: "org-1" }),
    });
  });

  it("refuses to create a revision on another organizer's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(
      createEventVisualAsset(organizer, { eventId: "event-1", source: "organizer_upload", status: "ready_for_review" }),
    ).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.create).not.toHaveBeenCalled();
  });

  it("approves a reviewable revision and activates it in one transaction", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-2")).resolves.toMatchObject({
      id: "asset-2",
      status: "approved",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.eventVisualAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-2", eventId: "event-1", status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { status: "approved", approvedAt: expect.any(Date) },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2" },
    });
  });

  it("dual-writes the legacy background url in the same transaction during the migration window", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({
      ...assetRow,
      status: "approved",
      url: "https://assets.example/approved.webp",
    });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await approveEventVisualAsset(organizer, "event-1", "asset-2", { dualWriteLegacyImage: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2", gameImageUrl: "https://assets.example/approved.webp" },
    });
  });

  it("activates an older approved revision for rollback", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-1" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, id: "asset-1", status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-1")).resolves.toMatchObject({ id: "asset-1" });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-1" },
    });
  });

  it("refuses to approve a revision that is not reviewable", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue(null);

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-2")).rejects.toThrow(
      "Visual revision is not available for approval",
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("refuses to reject the active revision", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-2" });

    await expect(rejectEventVisualAsset(organizer, "event-1", "asset-2")).rejects.toThrow(
      "Cannot reject the active visual revision",
    );
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
  });

  it("rejects a non-active revision", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "rejected" });

    await expect(rejectEventVisualAsset(organizer, "event-1", "asset-2")).resolves.toMatchObject({
      status: "rejected",
    });
    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { status: "rejected" },
    });
  });

  it("clamps focal point coordinates into the unit square", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, focalX: 1, focalY: 0 });

    await setEventVisualFocalPoint(organizer, "event-1", "asset-2", { x: 4.2, y: -1 });

    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { focalX: 1, focalY: 0 },
    });
  });

  it("counts only AI attempts inside the rate-limit window", async () => {
    const since = new Date("2026-08-22T00:00:00.000Z");
    prisma.eventVisualAsset.count.mockResolvedValue(3);

    await expect(countAiVisualAttempts("event-1", since)).resolves.toBe(3);
    expect(prisma.eventVisualAsset.count).toHaveBeenCalledWith({
      where: { eventId: "event-1", source: "ai_generated", createdAt: { gte: since } },
    });
  });
});

describe("event visual asset mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the active visual revision url, status, focal point, and source", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "event-one",
        name: "Event One",
        description: "Event",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Ongoing",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: null,
        organizerName: null,
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
        activeVisualAssetId: "asset-1",
        activeVisualAsset: {
          id: "asset-1",
          eventId: "event-1",
          source: "organizer_upload",
          status: "approved",
          url: "https://assets.example/event.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 630,
          focalX: 0.5,
          focalY: 0.4,
          provider: null,
          model: null,
          promptVersion: null,
          workflowRunId: null,
          sourceUrl: null,
          rightsAttestedAt: null,
          errorCode: null,
          createdByUserId: null,
          approvedAt: new Date("2026-08-22T00:00:00.000Z"),
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
          updatedAt: new Date("2026-08-22T00:00:00.000Z"),
        },
      },
    ]);

    const result = await getEventsByIds(["event-1"]);

    expect(result[0]).toMatchObject({
      activeVisualAssetId: "asset-1",
      activeVisualAsset: {
        id: "asset-1",
        eventId: "event-1",
        source: "organizer_upload",
        status: "approved",
        url: "https://assets.example/event.webp",
        focalX: 0.5,
        focalY: 0.4,
      },
    });
  });
});