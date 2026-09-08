import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    eventVisualAsset: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/identity";

import {
  approveVisualAssetForActor,
  assertActorCanManageVisualEvent,
  countAiVisualAttempts,
  createVisualAssetForActor,
  listVisualAssetsForActor,
  rejectVisualAssetForActor,
  setVisualAssetFocalPointForActor,
} from "./repository";

const organizerA = { userId: "org-a", role: "organizer" as const, tenantId: "org-a" };
const organizerB = { userId: "org-b", role: "organizer" as const, tenantId: "org-b" };
const platformAdmin = { userId: "admin-1", role: "platform_admin" as const, tenantId: null };

const assetRow = {
  id: "asset-2",
  eventId: "event-1",
  source: "organizer_upload",
  status: "ready_for_review",
  url: "https://assets.example/pending.webp",
  mimeType: "image/webp",
  width: 1200,
  height: 630,
  focalX: 0.5,
  focalY: 0.5,
  provider: null,
  model: null,
  promptVersion: null,
  workflowRunId: null,
  sourceUrl: null,
  rightsAttestedAt: null,
  errorCode: null,
  createdByUserId: "org-a",
  approvedAt: null,
  createdAt: new Date("2026-09-07T00:00:00.000Z"),
  updatedAt: new Date("2026-09-07T00:00:00.000Z"),
};

describe("visual-assets repository ownership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
  });

  it("allows an organizer to manage their own event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    await expect(assertActorCanManageVisualEvent(organizerA, "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-a" },
      select: { id: true },
    });
  });

  it("rejects an organizer managing another organizer's event without touching prisma writes", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(assertActorCanManageVisualEvent(organizerB, "event-1")).rejects.toThrow("Not authorized");
    await expect(assertActorCanManageVisualEvent(organizerB, "event-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows platform admin to bypass ownership scoping entirely", async () => {
    await expect(assertActorCanManageVisualEvent(platformAdmin, "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to list revisions for another organizer's event and never queries revisions", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(listVisualAssetsForActor(organizerB, "event-1")).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.findMany).not.toHaveBeenCalled();
  });

  it("refuses to create a revision on another organizer's event and never writes", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(
      createVisualAssetForActor(organizerB, { eventId: "event-1", source: "organizer_upload", status: "ready_for_review" }),
    ).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.create).not.toHaveBeenCalled();
  });

  it("checks ownership inside the same database transaction as the create write", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.create.mockResolvedValue(assetRow);

    await createVisualAssetForActor(organizerA, {
      eventId: "event-1",
      source: "organizer_upload",
      status: "ready_for_review",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionCallOrder = prisma.$transaction.mock.invocationCallOrder[0];
    const ownershipCheckCallOrder = prisma.event.findFirst.mock.invocationCallOrder[0];
    expect(ownershipCheckCallOrder).toBeGreaterThan(transactionCallOrder);
  });

  it("records the creating actor on a new revision", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.create.mockResolvedValue(assetRow);

    await createVisualAssetForActor(organizerA, {
      eventId: "event-1",
      source: "organizer_upload",
      status: "ready_for_review",
      url: "https://assets.example/upload.webp",
    });

    expect(prisma.eventVisualAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event-1", createdByUserId: "org-a" }),
    });
  });

  it("refuses to approve a revision on another organizer's event and never writes", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(approveVisualAssetForActor(organizerB, "event-1", "asset-2")).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("approves a reviewable revision and activates it in one transaction", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await expect(approveVisualAssetForActor(organizerA, "event-1", "asset-2")).resolves.toMatchObject({
      id: "asset-2",
      status: "approved",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.eventVisualAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-2", eventId: "event-1", status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2" },
    });
  });

  it("dual-writes the legacy background url in the same transaction", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "approved", url: "https://assets.example/approved.webp" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await approveVisualAssetForActor(organizerA, "event-1", "asset-2", { dualWriteLegacyImage: true });

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2", gameImageUrl: "https://assets.example/approved.webp" },
    });
  });

  it("refuses to approve a revision that is not reviewable and leaves state untouched", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue(null);

    await expect(approveVisualAssetForActor(organizerA, "event-1", "asset-2")).rejects.toThrow(
      "Visual revision is not available for approval",
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("constrains approval to a revision that actually belongs to the supplied event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue(null);

    await expect(approveVisualAssetForActor(organizerA, "event-1", "asset-from-other-event")).rejects.toThrow(
      "Visual revision is not available for approval",
    );
    expect(prisma.eventVisualAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-from-other-event", eventId: "event-1", status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
  });

  it("checks ownership inside the same database transaction as the approval write", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await approveVisualAssetForActor(organizerA, "event-1", "asset-2");

    const transactionCallOrder = prisma.$transaction.mock.invocationCallOrder[0];
    const ownershipCheckCallOrder = prisma.event.findFirst.mock.invocationCallOrder[0];
    expect(ownershipCheckCallOrder).toBeGreaterThan(transactionCallOrder);
  });

  it("refuses to reject the active revision and leaves its status untouched", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-2" });

    await expect(rejectVisualAssetForActor(organizerA, "event-1", "asset-2")).rejects.toThrow(
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

    await expect(rejectVisualAssetForActor(organizerA, "event-1", "asset-2")).resolves.toMatchObject({
      status: "rejected",
    });
  });

  it("refuses to reject a revision on another organizer's event and never writes", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(rejectVisualAssetForActor(organizerB, "event-1", "asset-2")).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
  });

  it("checks ownership inside the same database transaction as the reject write", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "rejected" });

    await rejectVisualAssetForActor(organizerA, "event-1", "asset-2");

    const transactionCallOrder = prisma.$transaction.mock.invocationCallOrder[0];
    const ownershipCheckCallOrder = prisma.event.findFirst.mock.invocationCallOrder[0];
    expect(ownershipCheckCallOrder).toBeGreaterThan(transactionCallOrder);
  });

  it("refuses to set a focal point on another organizer's event and never writes", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(
      setVisualAssetFocalPointForActor(organizerB, "event-1", "asset-2", { x: 0.2, y: 0.4 }),
    ).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
  });

  it("clamps focal point coordinates into the unit square", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, focalX: 1, focalY: 0 });

    await setVisualAssetFocalPointForActor(organizerA, "event-1", "asset-2", { x: 4.2, y: -1 });

    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { focalX: 1, focalY: 0 },
    });
  });

  it("throws not-found when the asset id does not belong to the supplied event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue(null);

    await expect(
      setVisualAssetFocalPointForActor(organizerA, "event-1", "asset-from-other-event", { x: 0.5, y: 0.5 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
  });

  it("checks ownership inside the same database transaction as the focal point write", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, focalX: 1, focalY: 0 });

    await setVisualAssetFocalPointForActor(organizerA, "event-1", "asset-2", { x: 4.2, y: -1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionCallOrder = prisma.$transaction.mock.invocationCallOrder[0];
    const ownershipCheckCallOrder = prisma.event.findFirst.mock.invocationCallOrder[0];
    expect(ownershipCheckCallOrder).toBeGreaterThan(transactionCallOrder);
  });

  it("counts only AI attempts inside the rate-limit window with no ownership check required", async () => {
    const since = new Date("2026-09-01T00:00:00.000Z");
    prisma.eventVisualAsset.count.mockResolvedValue(2);

    await expect(countAiVisualAttempts("event-1", since)).resolves.toBe(2);
    expect(prisma.eventVisualAsset.count).toHaveBeenCalledWith({
      where: { eventId: "event-1", source: "ai_generated", createdAt: { gte: since } },
    });
  });

  it("surfaces typed conflict errors that remain instanceof ConflictError", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-2" });

    await expect(rejectVisualAssetForActor(organizerA, "event-1", "asset-2")).rejects.toBeInstanceOf(ConflictError);
  });
});
