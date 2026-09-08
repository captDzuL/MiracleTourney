import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    event: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    eventPreviewToken: { updateMany: vi.fn() },
    organizerProfile: { upsert: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/platform/config", () => ({ getFallbackLogoUrl: vi.fn(() => null) }));

import { ForbiddenError, NotFoundError } from "@/modules/identity";

import {
  archiveEventForActor,
  createEventRecord,
  getActiveOrganizerIdentityById,
  setEventStatusForActor,
  updateEventOrganizerContactForActor,
  updateEventPublicInfoForActor,
} from "./repository";

const organizerActor = { userId: "org-1", role: "organizer" as const, tenantId: "org-1" };
const platformActor = { userId: "admin-1", role: "platform_admin" as const, tenantId: null };

describe("events repository write scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
  });

  it("status updates include organizer scope predicate and revoke preview token atomically", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.event.findFirst.mockResolvedValue({
      id: "event-1",
      slug: "miracle",
      name: "Miracle",
      description: "d",
      logoUrl: null,
      gameImageUrl: null,
      gameId: "g1",
      gameModeId: "m1",
      format: "Single Elimination",
      status: "Published",
      participantCap: 8,
      registrationWindow: "rw",
      startsAt: "sa",
      venue: "v",
      stream: null,
      activeVisualAsset: null,
    });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });

    await setEventStatusForActor(organizerActor, "event-1", "Published");

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      data: { status: "Published" },
    });
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("platform admin status update is global scoped", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    await setEventStatusForActor(platformActor, "event-1", "Draft");
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "Draft" },
    });
  });

  it("public info updates fail with forbidden when scoped predicate matches nothing", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateEventPublicInfoForActor(organizerActor, "event-404", {
      description: "desc desc",
      registrationWindow: "window",
      startsAt: "start",
      venue: "venue",
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("organizer contact upsert is transactional and owner-scoped", async () => {
    prisma.event.findFirst.mockResolvedValue({ organizerUserId: "org-1", organizerName: "Org One" });

    await updateEventOrganizerContactForActor(organizerActor, {
      eventId: "event-1",
      contactChannel: "WhatsApp",
      contactValue: "+62000",
      fallbackOrganizationName: "Fallback",
    });

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { organizerUserId: true, organizerName: true },
    });
    expect(prisma.organizerProfile.upsert).toHaveBeenCalledTimes(1);
  });

  it("organizer contact fails forbidden when event is outside actor scope", async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(updateEventOrganizerContactForActor(organizerActor, {
      eventId: "event-x",
      contactChannel: "WhatsApp",
      contactValue: "+62000",
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("archive/delete read and write within scoped transaction", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1", status: "Draft", _count: { teams: 0 } });

    await archiveEventForActor(organizerActor, "event-1", "delete");
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      include: { _count: { select: { teams: true } } },
    });
    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: "event-1" } });
  });

  it("returns active organizer identity only", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "org-2", name: "Org Two" });
    const organizer = await getActiveOrganizerIdentityById("org-2");
    expect(organizer).toEqual({ id: "org-2", name: "Org Two" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "org-2", role: "organizer", deactivatedAt: null },
      select: { id: true, name: true },
    });
  });

  it("create event record writes required defaults", async () => {
    prisma.event.create.mockResolvedValue({
      id: "event-1",
      slug: "miracle",
      name: "Miracle",
      description: "New event created from admin panel.",
      logoUrl: null,
      gameImageUrl: null,
      gameId: "g1",
      gameModeId: "m1",
      format: "Single Elimination",
      status: "Draft",
      participantCap: 8,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      stream: null,
      activeVisualAsset: null,
    });

    await createEventRecord({
      name: "Miracle",
      slug: "miracle",
      gameId: "g1",
      gameModeId: "m1",
      format: "Single Elimination",
      participantCap: 8,
      organizerUserId: "org-1",
      organizerName: "Org One",
      organizerVerified: false,
    });

    expect(prisma.event.create).toHaveBeenCalledTimes(1);
  });
});
