import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    team: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import { ForbiddenError } from "@/modules/identity";

import {
  assertActorCanManageTeam,
  assignCaptainForActor,
  deleteTeamForActor,
  getTeamCountsForEvents,
  getTeamsForEvents,
  listTeamsForEvent,
  updateTeamLogoForActor,
} from "./repository";

const organizerA = { userId: "org-a", role: "organizer" as const, tenantId: "org-a" };
const organizerB = { userId: "org-b", role: "organizer" as const, tenantId: "org-b" };
const platformAdmin = { userId: "admin-1", role: "platform_admin" as const, tenantId: null };
const captainActor = { userId: "captain-1", role: "captain" as const, tenantId: null };

function teamRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "team-1",
    eventId: "event-1",
    captainId: null,
    name: "Alpha",
    logoText: "AL",
    logoUrl: null,
    tag: "ALP",
    captainName: null,
    captainContact: null,
    source: "demo",
    ...overrides,
  };
}

describe("teams repository ownership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));
  });

  describe("assertActorCanManageTeam", () => {
    it("allows an organizer to manage a team in their own event", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

      await expect(assertActorCanManageTeam(organizerA, "team-1")).resolves.toEqual({ eventId: "event-1" });
      expect(prisma.team.findFirst).toHaveBeenCalledWith({
        where: { id: "team-1" },
        select: { id: true, eventId: true },
      });
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: "event-1", organizerUserId: "org-a" },
        select: { id: true },
      });
    });

    it("rejects a forged team id belonging to another organizer's event without touching prisma writes", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(assertActorCanManageTeam(organizerB, "team-1")).rejects.toBeInstanceOf(ForbiddenError);
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it("allows platform admin to bypass ownership scoping entirely", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });

      await expect(assertActorCanManageTeam(platformAdmin, "team-1")).resolves.toEqual({ eventId: "event-1" });
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a captain actor outright without checking event ownership", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });

      await expect(assertActorCanManageTeam(captainActor, "team-1")).rejects.toBeInstanceOf(ForbiddenError);
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it("rejects when the team does not exist", async () => {
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(assertActorCanManageTeam(organizerA, "team-missing")).rejects.toBeInstanceOf(ForbiddenError);
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("updateTeamLogoForActor", () => {
    it("updates the logo only after ownership is verified", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
      prisma.team.update.mockResolvedValue(teamRow({ logoUrl: "/team-logos/team-1.png" }));

      await expect(updateTeamLogoForActor(organizerA, "team-1", "/team-logos/team-1.png")).resolves.toMatchObject({
        id: "team-1",
        logoUrl: "/team-logos/team-1.png",
      });
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: { logoUrl: "/team-logos/team-1.png" },
      });
    });

    it("denies a forged team id from another organizer's event and never writes", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(updateTeamLogoForActor(organizerB, "team-1", "/team-logos/team-1.png")).rejects.toThrow("Not authorized");
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it("allows platform admin to update a team logo across tenants", async () => {
      prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.team.update.mockResolvedValue(teamRow({ logoUrl: "/team-logos/team-1.png" }));

      await expect(updateTeamLogoForActor(platformAdmin, "team-1", "/team-logos/team-1.png")).resolves.toMatchObject({
        logoUrl: "/team-logos/team-1.png",
      });
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it("performs the ownership check and the logo write on the same transaction client, never the top-level client", async () => {
      const tx = {
        team: { findFirst: vi.fn(), update: vi.fn() },
        event: { findFirst: vi.fn() },
      };
      tx.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      tx.event.findFirst.mockResolvedValue({ id: "event-1" });
      tx.team.update.mockResolvedValue(teamRow({ logoUrl: "/team-logos/team-1.png" }));
      prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

      await expect(updateTeamLogoForActor(organizerA, "team-1", "/team-logos/team-1.png")).resolves.toMatchObject({
        logoUrl: "/team-logos/team-1.png",
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.team.findFirst).toHaveBeenCalledWith({ where: { id: "team-1" }, select: { id: true, eventId: true } });
      expect(tx.event.findFirst).toHaveBeenCalledWith({ where: { id: "event-1", organizerUserId: "org-a" }, select: { id: true } });
      expect(tx.team.update).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { logoUrl: "/team-logos/team-1.png" } });
      expect(prisma.team.findFirst).not.toHaveBeenCalled();
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it("denies a forged team id inside the same transaction and never writes on any client", async () => {
      const tx = {
        team: { findFirst: vi.fn(), update: vi.fn() },
        event: { findFirst: vi.fn() },
      };
      tx.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      tx.event.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));

      await expect(updateTeamLogoForActor(organizerB, "team-1", "/team-logos/team-1.png")).rejects.toThrow("Not authorized");

      expect(tx.team.update).not.toHaveBeenCalled();
      expect(prisma.team.update).not.toHaveBeenCalled();
    });
  });

  describe("assignCaptainForActor", () => {
    it("assigns a captain after validating the role and ownership", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
      prisma.user.findUnique.mockResolvedValue({ id: "captain-2", name: "Captain Two" });
      prisma.team.update.mockResolvedValue(teamRow({ captainId: "captain-2", captainName: "Captain Two" }));

      await expect(assignCaptainForActor(organizerA, "team-1", "captain-2")).resolves.toMatchObject({
        captainId: "captain-2",
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "captain-2", role: "captain" },
        select: { id: true, name: true },
      });
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: { captainId: "captain-2", captainName: "Captain Two" },
      });
    });

    it("clears the captain when no captain id is supplied", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
      prisma.team.update.mockResolvedValue(teamRow());

      await assignCaptainForActor(organizerA, "team-1", null);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: { captainId: null, captainName: null },
      });
    });

    it("rejects a supplied user that does not exist with role captain", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(assignCaptainForActor(organizerA, "team-1", "captain-missing")).rejects.toThrow("Kapten tidak ditemukan.");
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it("denies a forged team id from another organizer's event and never writes", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(assignCaptainForActor(organizerB, "team-1", "captain-2")).rejects.toBeInstanceOf(ForbiddenError);
      expect(prisma.team.update).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("allows platform admin to assign a captain across tenants", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1" });
      prisma.user.findUnique.mockResolvedValue({ id: "captain-2", name: "Captain Two" });
      prisma.team.update.mockResolvedValue(teamRow({ captainId: "captain-2" }));

      await assignCaptainForActor(platformAdmin, "team-1", "captain-2");

      expect(prisma.event.findFirst).not.toHaveBeenCalled();
      expect(prisma.team.update).toHaveBeenCalled();
    });

    it("reports a missing team distinctly from an ownership denial", async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(assignCaptainForActor(organizerA, "team-missing", "captain-2")).rejects.toThrow("Tim tidak ditemukan.");
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("deleteTeamForActor", () => {
    it("deletes a team only when its event is Draft and owned by the actor", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1", event: { id: "event-1", status: "Draft" } });
      prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

      await expect(deleteTeamForActor(organizerA, "team-1")).resolves.toBeUndefined();
      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: "team-1" } });
    });

    it("rejects deletion when the event has left Draft status", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1", event: { id: "event-1", status: "Ongoing" } });

      await expect(deleteTeamForActor(organizerA, "team-1")).rejects.toThrow("Tim hanya dapat dihapus dari event Draft.");
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it("rejects deletion for a missing team", async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(deleteTeamForActor(organizerA, "team-missing")).rejects.toThrow("Tim tidak ditemukan.");
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it("denies a forged team id from another organizer's Draft event and never deletes", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1", event: { id: "event-1", status: "Draft" } });
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(deleteTeamForActor(organizerB, "team-1")).rejects.toBeInstanceOf(ForbiddenError);
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it("allows platform admin to delete a Draft team across tenants", async () => {
      prisma.team.findUnique.mockResolvedValue({ id: "team-1", eventId: "event-1", event: { id: "event-1", status: "Draft" } });

      await deleteTeamForActor(platformAdmin, "team-1");

      expect(prisma.event.findFirst).not.toHaveBeenCalled();
      expect(prisma.team.delete).toHaveBeenCalled();
    });
  });

  describe("public team reads", () => {
    it("orders teams by registration time then id and includes captain display fields", async () => {
      prisma.team.findMany.mockResolvedValue([teamRow(), teamRow({ id: "team-2" })]);

      await expect(listTeamsForEvent("event-1")).resolves.toHaveLength(2);
      expect(prisma.team.findMany).toHaveBeenCalledWith({
        where: { eventId: "event-1" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { captain: { select: { id: true, name: true } } },
      });
    });

    it("falls back to the demo store when Prisma is unavailable", async () => {
      prisma.team.findMany.mockRejectedValue(new Error("database unavailable"));

      await expect(listTeamsForEvent("event-kuroko-summer")).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "team-seirin" })]),
      );
    });

    it("batch-fetches teams grouped by event with default empty arrays", async () => {
      prisma.team.findMany.mockResolvedValue([teamRow({ eventId: "event-1" })]);

      const result = await getTeamsForEvents(["event-1", "event-2"]);

      expect(result.get("event-1")).toHaveLength(1);
      expect(result.get("event-2")).toEqual([]);
      expect(prisma.team.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ["event-1", "event-2"] } },
        orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: { captain: { select: { id: true, name: true } } },
      });
    });

    it("batch-counts teams without fetching every row, defaulting missing events to zero", async () => {
      prisma.team.groupBy.mockResolvedValue([{ eventId: "event-1", _count: { _all: 4 } }]);

      const result = await getTeamCountsForEvents(["event-1", "event-2"]);

      expect(result.get("event-1")).toBe(4);
      expect(result.get("event-2")).toBe(0);
    });
  });
});
