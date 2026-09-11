import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: { event: { updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/platform/db", () => ({ prisma }));

import { eventDraftSchema, saveEventDraft } from "./event-draft";

const mutationId = "11111111-1111-4111-8111-111111111111";

describe("event draft validation", () => {
  it("keeps an incomplete patch sparse and normalizes an explicitly supplied timezone", () => {
    expect(eventDraftSchema.parse({ name: "  Miracle Open  " })).toEqual({ name: "Miracle Open" });
    expect(eventDraftSchema.parse({ timezone: " Asia/Jakarta " })).toEqual({ timezone: "Asia/Jakarta" });
  });

  it("preserves a zero registration fee and permits an omitted venue address", () => {
    expect(eventDraftSchema.parse({ registrationFeeRequired: true, registrationFeeAmount: 0 })).toEqual({
      registrationFeeRequired: true,
      registrationFeeAmount: 0,
    });
  });

  it("rejects a blank submitted slug while allowing it to be omitted", () => {
    expect(eventDraftSchema.parse({ description: "Still incomplete" })).toEqual({ description: "Still incomplete" });
    expect(() => eventDraftSchema.parse({ slug: "   " })).toThrow();
  });

  it("accepts a versioned V3 format config and rejects unsupported persisted input", () => {
    const formatConfig = {
      version: 1 as const,
      kind: "single_elimination" as const,
      bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
      thirdPlace: "required" as const,
    };
    expect(eventDraftSchema.parse({ format: "Single Elimination", formatConfig })).toEqual({
      format: "Single Elimination",
      formatConfig,
    });
    expect(() => eventDraftSchema.parse({ formatConfig: { version: 1, kind: "swiss" } })).toThrow();
    expect(() => eventDraftSchema.parse({ format: "League", formatConfig })).toThrow();
  });
});

describe("saveEventDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("atomically saves only submitted fields and records the client mutation", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 4, mutationId, draft: { name: "  Miracle Open  ", venueAddress: "" },
    })).resolves.toEqual({
      status: "saved", revision: 5,
      fields: { name: { state: "saved" }, venueAddress: { state: "saved" } },
    });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "organizer-1", status: "Draft", draftRevision: 4 },
      data: { name: "Miracle Open", venueAddress: null, lastDraftMutationId: mutationId, draftRevision: { increment: 1 } },
    });
  });

  it("returns a conflict without overwriting when a stale revision has a different mutation", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: "22222222-2222-4222-8222-222222222222",
      status: "Draft", name: "Newer title",
    });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { name: "Older title" },
    })).resolves.toEqual({
      status: "conflict", revision: 6, fields: { name: { state: "conflict" } },
    });
  });

  it("treats the recorded client mutation as a lost-response retry", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: mutationId, status: "Draft", name: "Miracle Open",
    });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { name: "Miracle Open" },
    })).resolves.toMatchObject({ status: "saved", revision: 6, retry: true });
  });

  it("recognizes a retry when the stored JSON format config is structurally equal", async () => {
    const formatConfig = {
      version: 1 as const,
      kind: "round_robin" as const,
      legs: 1 as const,
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: ["head_to_head", "score_difference"] as const,
    };
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: mutationId, status: "Draft",
      format: "League", formatConfig: JSON.parse(JSON.stringify(formatConfig)),
    });

    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { formatConfig },
    })).resolves.toMatchObject({ status: "saved", revision: 6, retry: true });
  });

  it("persists the derived legacy format with a V3 format config", async () => {
    const formatConfig = {
      version: 1 as const,
      kind: "double_elimination" as const,
      bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
      thirdPlace: "lower_final_loser" as const,
    };
    prisma.event.updateMany.mockResolvedValue({ count: 1 });

    await saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 2, mutationId, draft: { formatConfig },
    });

    expect(prisma.event.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ format: "Single Elimination", formatConfig }),
    }));
  });

  it("clears V3 configuration when a legacy-only format edit is saved", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });

    await saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 2, mutationId, draft: { format: "League" },
    });

    expect(prisma.event.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ format: "League", formatConfig: Prisma.DbNull }),
    }));
  });

  it("rejects reuse of the same mutation ID with a different normalized payload", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: mutationId, status: "Draft", name: "Miracle Open",
    });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { name: "Different title" },
    })).resolves.toMatchObject({ status: "conflict", revision: 6 });
  });

  it("recognizes a proven lost-response retry after the event was published", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: mutationId, status: "Published", name: "Miracle Open",
    });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { name: "  Miracle Open  " },
    })).resolves.toMatchObject({ status: "saved", revision: 6, retry: true });
  });
  it("does not infer a retry when another mutation advanced matching field values", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({
      draftRevision: 6, lastDraftMutationId: "22222222-2222-4222-8222-222222222222",
      status: "Draft", name: "Miracle Open",
    });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { name: "Miracle Open" },
    })).resolves.toMatchObject({ status: "conflict", revision: 6 });
  });

  it("refuses autosave after the event leaves Draft", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    prisma.event.findFirst.mockResolvedValue({ draftRevision: 5, lastDraftMutationId: null, status: "Published" });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 5, mutationId, draft: { description: "Changed after publication" },
    })).resolves.toEqual({
      status: "not_editable", revision: 5, fields: { description: { state: "conflict" } },
    });
  });

  it("uses the stored owner in an admin atomic save", async () => {
    prisma.event.findUnique.mockResolvedValue({ organizerUserId: "organizer-1" });
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "admin-1", role: "admin" },
      expectedRevision: 2, mutationId, draft: { description: "Admin correction" },
    })).resolves.toMatchObject({ status: "saved", revision: 3 });
    expect(prisma.event.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-1", organizerUserId: "organizer-1", status: "Draft", draftRevision: 2 },
    }));
  });

  it("does not hide database write failures behind demo data", async () => {
    prisma.event.updateMany.mockRejectedValue(new Error("database unavailable"));
    await expect(saveEventDraft({
      eventId: "event-1", actor: { id: "organizer-1", role: "organizer" },
      expectedRevision: 0, mutationId, draft: { description: "Draft copy" },
    })).rejects.toThrow("database unavailable");
  });
});

