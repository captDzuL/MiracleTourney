import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    eventPreviewToken: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/platform/db", () => ({ prisma }));

import { evaluatePublishReadiness, publishEvent } from "./publish-readiness";

const completeEvent = {
  slug: "miracle-open", name: "Miracle Open", description: "Open community tournament",
  gameId: "game-mobile-legends", gameModeId: "mode-mlbb-5v5", format: "Single Elimination", participantCap: 32,
  registrationOpensAt: new Date("2026-09-10T02:00:00.000Z"),
  registrationClosesAt: new Date("2026-09-15T02:00:00.000Z"),
  eventStartsAt: new Date("2026-09-20T02:00:00.000Z"), timezone: "Asia/Jakarta", venue: "Online",
  registrationFeeRequired: true, registrationFeeAmount: 0,
  organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+628123456789" } },
};

describe("evaluatePublishReadiness", () => {
  it("returns the exact incomplete items that block publication", () => {
    expect(evaluatePublishReadiness({
      ...completeEvent, description: "", registrationClosesAt: new Date("2026-09-09T02:00:00.000Z"),
      organizer: { organizerProfile: null },
    })).toEqual({
      ready: false,
      incomplete: [
        { code: "description", field: "description", section: "identity" },
        { code: "registration_date_order", field: "registrationClosesAt", section: "schedule" },
        { code: "organizer_contact", field: "organizerContact", section: "organizer" },
      ],
      notices: [],
    });
  });

  it.each([{ slug: "" }, { slug: undefined }])("blocks publication when the public slug is blank or missing", (override) => {
    expect(evaluatePublishReadiness({ ...completeEvent, ...override })).toMatchObject({
      ready: false,
      incomplete: [{ code: "slug", field: "slug", section: "identity" }],
    });
  });

  it("reports cross-field blockers even when an unrelated required field is missing", () => {
    expect(evaluatePublishReadiness({
      ...completeEvent,
      name: undefined,
      registrationClosesAt: new Date("2026-09-09T02:00:00.000Z"),
      registrationFeeAmount: null,
    })).toMatchObject({
      ready: false,
      incomplete: [
        { code: "name", field: "name", section: "identity" },
        { code: "registration_date_order", field: "registrationClosesAt", section: "schedule" },
        { code: "registration_fee_amount", field: "registrationFeeAmount", section: "registration" },
      ],
    });
  });

  it("accepts zero-value fees and an absent venue address", () => {
    expect(evaluatePublishReadiness({ ...completeEvent, venueAddress: null })).toEqual({ ready: true, incomplete: [], notices: [] });
  });

  it("reports overlapping events as information without blocking publication", () => {
    expect(evaluatePublishReadiness(completeEvent, { hasScheduleOverlap: true })).toEqual({
      ready: true, incomplete: [], notices: [{ code: "schedule_overlap", severity: "info" }],
    });
  });

  it("keeps legacy events publishable while rejecting a malformed present V3 format config", () => {
    expect(evaluatePublishReadiness(completeEvent)).toMatchObject({ ready: true });
    expect(evaluatePublishReadiness({
      ...completeEvent,
      formatConfig: { version: 1, kind: "swiss" },
    })).toMatchObject({
      ready: false,
      incomplete: [{ code: "format_config", field: "formatConfig", section: "schedule" }],
    });
  });

  it("blocks contradictory legacy/V3 formats and impossible group allocation", () => {
    expect(evaluatePublishReadiness({
      ...completeEvent,
      format: "League",
      formatConfig: {
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
        thirdPlace: "required",
      },
    })).toMatchObject({
      ready: false,
      incomplete: [{ code: "format_config_mismatch", field: "formatConfig", section: "schedule" }],
    });

    expect(evaluatePublishReadiness({
      ...completeEvent,
      format: "League",
      participantCap: 8,
      formatConfig: {
        version: 1,
        kind: "group_playoffs",
        groupCount: 4,
        qualifiersPerGroup: 2,
        groupStage: {
          legs: 1,
          points: { win: 3, draw: 1, loss: 0 },
          tiebreakers: ["head_to_head", "score_difference"],
        },
        playoffs: {
          version: 1,
          kind: "single_elimination",
          bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
          thirdPlace: "required",
          avoidImmediateGroupRematches: true,
        },
      },
    })).toMatchObject({
      ready: false,
      incomplete: [{ code: "group_allocation", field: "formatConfig", section: "schedule" }],
    });
  });
});

describe("publishEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
    prisma.event.findFirst.mockResolvedValue(null);
  });

  it("blocks publication and leaves status unchanged until readiness is complete", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", status: "Draft", organizerUserId: "organizer-1", draftRevision: 7, ...completeEvent, name: "",
    });
    await expect(publishEvent("event-1", { id: "organizer-1", role: "organizer" })).resolves.toMatchObject({
      status: "blocked", readiness: { ready: false, incomplete: [{ code: "name", field: "name", section: "identity" }] },
    });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });

  it("publishes only the actor-owned Draft revision checked for readiness and revokes preview tokens", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", status: "Draft", organizerUserId: "organizer-1", draftRevision: 7, ...completeEvent,
    });
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 2 });
    await expect(publishEvent("event-1", { id: "organizer-1", role: "organizer" })).resolves.toMatchObject({
      status: "published", slug: "miracle-open",
    });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "organizer-1", status: "Draft", draftRevision: 7 },
      data: { status: "Published", publishedAt: expect.any(Date) },
    });
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", revokedAt: null }, data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns conflict when the checked revision changes before publication", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", status: "Draft", organizerUserId: "organizer-1", draftRevision: 7, ...completeEvent,
    });
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    await expect(publishEvent("event-1", { id: "organizer-1", role: "organizer" }))
      .resolves.toEqual({ status: "conflict" });
    expect(prisma.eventPreviewToken.updateMany).not.toHaveBeenCalled();
  });

  it("prevents duplicate publication and does not revoke tokens twice", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", status: "Published", organizerUserId: "organizer-1", draftRevision: 7, ...completeEvent,
    });
    await expect(publishEvent("event-1", { id: "organizer-1", role: "organizer" }))
      .resolves.toEqual({ status: "already_published", slug: "miracle-open" });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(prisma.eventPreviewToken.updateMany).not.toHaveBeenCalled();
  });

  it("adds a notice when another event starts on the same WIB calendar day", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", status: "Draft", organizerUserId: "organizer-1", draftRevision: 7, ...completeEvent,
    });
    prisma.event.findFirst.mockResolvedValue({ id: "event-2" });
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(publishEvent("event-1", { id: "admin-1", role: "platform_admin" })).resolves.toMatchObject({
      status: "published", readiness: { ready: true, notices: [{ code: "schedule_overlap", severity: "info" }] },
    });
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        id: { not: "event-1" },
        eventStartsAt: { gte: new Date("2026-09-19T17:00:00.000Z"), lt: new Date("2026-09-20T17:00:00.000Z") },
      },
      select: { id: true },
    });
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", status: "Draft", draftRevision: 7 },
      data: { status: "Published", publishedAt: expect.any(Date) },
    });
  });
});
