import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: { findFirst: vi.fn(), updateMany: vi.fn() },
    eventEditRevision: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    eventPreviewToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    eventStream: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/platform/db", () => ({ prisma }));

import {
  applyEventEditRevision,
  createEventRevisionPreviewToken,
  eventRevisionPatchSchema,
  getActiveEventEditRevisionIds,
  getEventRevisionFieldLocks,
  hashEventRevisionPreviewToken,
  saveEventEditRevision,
  startEventEditRevision,
} from "./event-revision";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

const organizer = { id: "organizer-1", role: "organizer" } as const;
const admin = { id: "admin-1", role: "platform_admin" } as const;
const mutationId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-08T10:00:00.000Z");

const persistedPayload = {
  name: "Miracle Open",
  description: "Main tournament",
  logoUrl: null,
  gameImageUrl: null,
  gameModeId: "mode-mlbb-5v5",
  format: "Single Elimination" as const,
  formatConfig: null,
  participantCap: 16 as const,
  registrationOpensAt: "2026-09-01T00:00:00.000Z",
  registrationClosesAt: "2026-09-10T00:00:00.000Z",
  eventStartsAt: "2026-09-12T00:00:00.000Z",
  timezone: "Asia/Jakarta" as const,
  venue: "Online",
  venueAddress: null,
  prizePoolLabel: "Rp 5 juta",
  registrationFeeRequired: false,
  registrationFeeAmount: null,
  registrationFeeLabel: null,
  registrationUrl: null,
  characterArtUrl: null,
  accentColor: null,
  activeVisualAssetId: null,
  stream: null,
};

const eventRow = {
  id: "event-1",
  slug: "miracle-open",
  status: "Published",
  organizerUserId: "organizer-1",
  publishedRevision: 3,
  ...persistedPayload,
  _count: { matches: 0 },
};

const revisionRow = {
  id: "revision-1",
  eventId: "event-1",
  createdByUserId: "organizer-1",
  status: "Draft",
  basePublishedRevision: 3,
  revision: 2,
  lastMutationId: null,
  lastMutationPayload: null,
  payload: persistedPayload,
  event: eventRow,
};

describe("event revision payload and policy", () => {
  it("normalizes a sparse public patch and excludes slug", () => {
    expect(eventRevisionPatchSchema.parse({ description: "  Updated  ", venueAddress: "" }))
      .toEqual({ description: "Updated", venueAddress: null });
    expect(() => eventRevisionPatchSchema.parse({ slug: "new-slug" })).toThrow();
  });

  it("locks every field after an event becomes ongoing", () => {
    const locks = getEventRevisionFieldLocks({
      status: "Ongoing",
      registrationClosesAt: "2026-09-10T00:00:00.000Z",
      matchCount: 0,
      now,
    });
    expect(locks.description).toBe("event_started");
    expect(locks.registrationFeeAmount).toBe("event_started");
    expect(locks.name).toBe("event_started");
  });

  it("locks registration fields after registration closes and structure after matches exist", () => {
    const locks = getEventRevisionFieldLocks({
      status: "Registration Closed",
      registrationClosesAt: new Date("2026-09-07T00:00:00.000Z"),
      matchCount: 1,
      now,
    });
    expect(locks.registrationClosesAt).toBe("registration_closed");
    expect(locks.registrationFeeRequired).toBe("registration_closed");
    expect(locks.name).toBe("matches_exist");
    expect(locks.timezone).toBe("matches_exist");
    expect(locks.formatConfig).toBe("matches_exist");
    expect(locks.description).toBeUndefined();
    expect(locks.venue).toBeUndefined();
  });
});

describe("published event revision persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  });

  it("starts one private revision from the current published payload", async () => {
    prisma.event.findFirst.mockResolvedValue(eventRow);
    prisma.eventEditRevision.findFirst.mockResolvedValue(null);
    prisma.eventEditRevision.create.mockResolvedValue({ ...revisionRow, revision: 0 });

    await expect(startEventEditRevision({ eventId: "event-1", actor: organizer, now }))
      .resolves.toMatchObject({ status: "created", revision: { id: "revision-1", revision: 0 } });
    expect(prisma.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-1", organizerUserId: "organizer-1" },
    }));
    expect(prisma.eventEditRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        createdByUserId: "organizer-1",
        status: "Draft",
        basePublishedRevision: 3,
        revision: 0,
        payload: persistedPayload,
      }),
    });
  });

  it("reuses an existing active revision and refuses ongoing events", async () => {
    prisma.event.findFirst.mockResolvedValueOnce(eventRow);
    prisma.eventEditRevision.findFirst.mockResolvedValueOnce(revisionRow);
    await expect(startEventEditRevision({ eventId: "event-1", actor: organizer, now }))
      .resolves.toMatchObject({ status: "active", revision: { id: "revision-1" } });
    expect(prisma.eventEditRevision.create).not.toHaveBeenCalled();

    prisma.event.findFirst.mockResolvedValueOnce({ ...eventRow, status: "Ongoing" });
    prisma.eventEditRevision.findFirst.mockResolvedValueOnce(null);
    await expect(startEventEditRevision({ eventId: "event-1", actor: organizer, now }))
      .resolves.toEqual({ status: "not_editable", eventStatus: "Ongoing" });
  });

  it("autosaves with optimistic revision and mutation id", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue(revisionRow);
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });

    await expect(saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: { description: "  Updated description  " }, now,
    })).resolves.toEqual({
      status: "saved", revision: 3,
      fields: { description: { state: "saved" } },
    });
    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "revision-1", status: "Draft", revision: 2 }),
      data: expect.objectContaining({
        payload: { ...persistedPayload, description: "Updated description" },
        lastMutationId: mutationId,
        lastMutationPayload: { description: "Updated description" },
        revision: { increment: 1 },
      }),
    });
  });

  it("keeps legacy format and game ID in sync when format or mode changes", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue(revisionRow);
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });

    await saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: {
        gameModeId: "mode-hok-5v5",
        formatConfig: TOURNAMENT_FORMAT_PRESETS.roundRobin,
      },
      now,
    });

    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          format: "League",
          formatConfig: TOURNAMENT_FORMAT_PRESETS.roundRobin,
          gameModeId: "mode-hok-5v5",
        }),
      }),
    }));
  });

  it("returns field reasons without writing when a submitted field is locked", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue({
      ...revisionRow,
      event: { ...eventRow, status: "Registration Closed", _count: { matches: 1 } },
    });

    await expect(saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: { name: "Locked name", description: "Allowed by itself" }, now,
    })).resolves.toEqual({
      status: "locked", revision: 2,
      fields: {
        name: { state: "locked", reason: "matches_exist" },
        description: { state: "conflict" },
      },
    });
    expect(prisma.eventEditRevision.updateMany).not.toHaveBeenCalled();
  });

  it("recognizes a lost-response retry and otherwise reports a stale tab conflict", async () => {
    prisma.eventEditRevision.findFirst
      .mockResolvedValueOnce({
        ...revisionRow, revision: 3, lastMutationId: mutationId,
        lastMutationPayload: { description: "Updated" },
        payload: { ...persistedPayload, description: "Updated" },
      })
      .mockResolvedValueOnce({
        ...revisionRow, revision: 4,
        lastMutationId: "22222222-2222-4222-8222-222222222222",
      });
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 0 });

    await expect(saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: { description: "Updated" }, now,
    })).resolves.toMatchObject({ status: "saved", revision: 3, retry: true });
    await expect(saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: { description: "Updated" }, now,
    })).resolves.toMatchObject({ status: "conflict", revision: 4 });
  });

  it("discards an active revision and revokes its preview when the event has started", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue({
      ...revisionRow,
      event: { ...eventRow, status: "Ongoing" },
    });
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(saveEventEditRevision({
      revisionId: "revision-1", actor: organizer, expectedRevision: 2, mutationId,
      patch: { description: "Too late" }, now,
    })).resolves.toMatchObject({ status: "not_editable", revision: 2, eventStatus: "Ongoing" });
    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith({
      where: { id: "revision-1", status: "Draft" },
      data: { status: "Discarded", discardedAt: now, discardReason: "event_started" },
    });
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { revisionId: "revision-1", revokedAt: null },
      data: { revokedAt: now },
    });
  });

  it("applies the full validated payload and increments the public revision atomically", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue({
      ...revisionRow,
      payload: { ...persistedPayload, description: "Applied", venue: "Arena" },
    });
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventStream.deleteMany.mockResolvedValue({ count: 0 });

    await expect(applyEventEditRevision({ revisionId: "revision-1", actor: organizer, now }))
      .resolves.toEqual({ status: "applied", eventId: "event-1", slug: "miracle-open", publishedRevision: 4 });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: {
        id: "event-1", organizerUserId: "organizer-1",
        status: { in: ["Published", "Registration Closed"] }, publishedRevision: 3,
      },
      data: expect.objectContaining({ description: "Applied", venue: "Arena", gameId: "game-mobile-legends", publishedRevision: { increment: 1 } }),
    });
    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith({
      where: { id: "revision-1", status: "Draft", basePublishedRevision: 3 },
      data: { status: "Applied", appliedAt: now },
    });
  });

  it("does not apply a revision based on an older public revision", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue({
      ...revisionRow,
      event: { ...eventRow, publishedRevision: 4 },
    });
    await expect(applyEventEditRevision({ revisionId: "revision-1", actor: organizer, now }))
      .resolves.toEqual({ status: "conflict", publishedRevision: 4 });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });

  it("lists active revision IDs using organizer ownership while admins can query all", async () => {
    prisma.eventEditRevision.findMany.mockResolvedValue([{ id: "revision-1", eventId: "event-1", revision: 2 }]);
    await expect(getActiveEventEditRevisionIds({ eventIds: ["event-1", "event-2"], actor: organizer }))
      .resolves.toEqual({ "event-1": { id: "revision-1", revision: 2 } });
    expect(prisma.eventEditRevision.findMany).toHaveBeenLastCalledWith({
      where: {
        eventId: { in: ["event-1", "event-2"] }, status: "Draft",
        event: { organizerUserId: "organizer-1", status: { in: ["Published", "Registration Closed"] } },
      },
      select: { id: true, eventId: true, revision: true },
    });

    await getActiveEventEditRevisionIds({ eventIds: ["event-1"], actor: admin });
    expect(prisma.eventEditRevision.findMany).toHaveBeenLastCalledWith({
      where: {
        eventId: { in: ["event-1"] }, status: "Draft",
        event: { status: { in: ["Published", "Registration Closed"] } },
      },
      select: { id: true, eventId: true, revision: true },
    });
  });

  it("creates a revision-bound private preview token", async () => {
    prisma.eventEditRevision.findFirst.mockResolvedValue(revisionRow);
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "preview-1", expiresAt: data.expiresAt,
    }));

    const result = await createEventRevisionPreviewToken({ revisionId: "revision-1", actor: organizer, now });
    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("expected token");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.eventPreviewToken.create).toHaveBeenCalledWith({
      data: {
        eventId: "event-1", revisionId: "revision-1", createdByUserId: "organizer-1",
        tokenHash: hashEventRevisionPreviewToken(result.token),
        expiresAt: new Date("2026-09-09T10:00:00.000Z"),
      },
      select: { id: true, expiresAt: true },
    });
  });
});
