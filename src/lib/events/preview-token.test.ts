import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: { updateMany: vi.fn() },
    eventPreviewToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/platform/repository", () => ({
  eventPublicInclude: { stream: true, activeVisualAsset: true },
  mapEvent: (event: unknown) => event,
}));

import {
  createEventPreviewToken,
  hashEventPreviewToken,
  resolveEventPreviewToken,
  revokeEventPreviewTokens,
} from "./preview-token";

const organizer = { id: "organizer-1", role: "organizer" } as const;
const admin = { id: "admin-1", role: "admin" } as const;

describe("event preview tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
  });

  it("hashes raw tokens deterministically without storing the raw value", () => {
    const rawToken = "a".repeat(64);
    expect(hashEventPreviewToken(rawToken)).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(hashEventPreviewToken(rawToken)).not.toBe(rawToken);
  });

  it("atomically replaces active links for an owned Draft event", async () => {
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "preview-2",
      expiresAt: data.expiresAt,
      tokenHash: data.tokenHash,
    }));

    const now = new Date("2026-09-06T10:00:00.000Z");
    const result = await createEventPreviewToken({ eventId: "event-1", actor: organizer, now });

    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("Expected a created preview token");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.expiresAt).toEqual(new Date("2026-09-07T10:00:00.000Z"));
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "organizer-1", status: "Draft" },
      data: { previewRevision: { increment: 1 } },
    });
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", revokedAt: null },
      data: { revokedAt: now },
    });
    expect(prisma.eventPreviewToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        createdByUserId: "organizer-1",
        tokenHash: hashEventPreviewToken(result.token),
        expiresAt: new Date("2026-09-07T10:00:00.000Z"),
      }),
      select: { id: true, expiresAt: true },
    });
    expect(prisma.eventPreviewToken.create.mock.calls[0]?.[0]?.data).not.toContain(result.token);
    expect(prisma.event.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.eventPreviewToken.create.mock.invocationCallOrder[0]);
  });

  it("does not create a link when the event is not an owned Draft", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(createEventPreviewToken({ eventId: "event-1", actor: organizer }))
      .resolves.toEqual({ status: "not_found_or_not_draft" });
    expect(prisma.eventPreviewToken.create).not.toHaveBeenCalled();
  });

  it("resolves only active unexpired links whose event remains Draft", async () => {
    const now = new Date("2026-09-06T10:00:00.000Z");
    prisma.eventPreviewToken.findUnique.mockResolvedValue({
      id: "preview-1",
      eventId: "event-1",
      expiresAt: new Date("2026-09-06T11:00:00.000Z"),
      revokedAt: null,
      event: { id: "event-1", status: "Draft", name: "Miracle Open" },
    });

    await expect(resolveEventPreviewToken("b".repeat(64), now)).resolves.toMatchObject({
      id: "preview-1",
      event: { id: "event-1", status: "Draft" },
    });
    expect(prisma.eventPreviewToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashEventPreviewToken("b".repeat(64)) },
      include: { event: { include: { stream: true, activeVisualAsset: true } } },
    });
  });

  it.each([
    ["expired", { expiresAt: new Date("2026-09-06T09:59:59.000Z"), revokedAt: null, event: { status: "Draft" } }],
    ["revoked", { expiresAt: new Date("2026-09-06T11:00:00.000Z"), revokedAt: new Date(), event: { status: "Draft" } }],
    ["published", { expiresAt: new Date("2026-09-06T11:00:00.000Z"), revokedAt: null, event: { status: "Published" } }],
  ])("rejects a %s preview link", async (_label, record) => {
    prisma.eventPreviewToken.findUnique.mockResolvedValue({ id: "preview-1", eventId: "event-1", ...record });
    await expect(resolveEventPreviewToken("c".repeat(64), new Date("2026-09-06T10:00:00.000Z"))).resolves.toBeNull();
  });

  it("rejects malformed tokens before querying storage", async () => {
    await expect(resolveEventPreviewToken("not-a-token")).resolves.toBeNull();
    expect(prisma.eventPreviewToken.findUnique).not.toHaveBeenCalled();
  });

  it("lets platform admins revoke active links without assuming event ownership", async () => {
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-09-06T10:00:00.000Z");

    await expect(revokeEventPreviewTokens({ eventId: "event-1", actor: admin, now }))
      .resolves.toEqual({ status: "revoked", count: 2 });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", status: "Draft" },
      data: { previewRevision: { increment: 1 } },
    });
  });
});