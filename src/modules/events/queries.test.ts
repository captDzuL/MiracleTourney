import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    teamRegistrationRequest: {
      findMany: vi.fn(),
    },
    match: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/platform/demo-store", () => ({
  getEvents: vi.fn(() => []),
  getEventBySlug: vi.fn(() => null),
  getPublicEvents: vi.fn(() => []),
  getPublicEventBySlug: vi.fn(() => null),
}));

import { getManageableEventDraft, getManageableEventsForActor } from "./queries";

describe("event query ownership filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findMany.mockResolvedValue([]);
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.event.findUnique.mockResolvedValue(null);
  });

  it("uses organizer ownership filter for manageable list", async () => {
    await getManageableEventsForActor({ userId: "org-user", role: "organizer", tenantId: "org-tenant" });

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizerUserId: "org-tenant" },
      }),
    );
  });

  it("does not apply organizer filter for platform admins", async () => {
    await getManageableEventsForActor({ userId: "admin", role: "platform_admin", tenantId: null });

    const [firstCall] = prisma.event.findMany.mock.calls;
    expect(firstCall).toBeDefined();
    expect(firstCall[0]).toEqual(expect.not.objectContaining({ where: expect.anything() }));
  });

  it("returns no manageable data for captains without touching prisma", async () => {
    const events = await getManageableEventsForActor({ userId: "cap", role: "captain", tenantId: null });
    const draft = await getManageableEventDraft({ userId: "cap", role: "captain", tenantId: null }, "event-1");

    expect(events).toEqual([]);
    expect(draft).toBeNull();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it("keeps queries.ts free of direct prisma/platform-db imports", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/modules/events/queries.ts"), "utf8");

    expect(source).not.toContain("@/lib/platform/db");
    expect(source).not.toContain("prisma.");
  });

  it("routes open-registration reads through repository collaborators", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/modules/events/queries.ts"), "utf8");

    expect(source).toContain("listCaptainTeamEventIds");
    expect(source).toContain("listCaptainRegistrationRequestEventIds");
    expect(source).toContain("listTeamCountsByEventIds");
    expect(source).toContain("listLockedSingleEliminationEventIds");
  });

  it("keeps events module barrel from re-exporting repository internals", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/modules/events/index.ts"), "utf8");

    expect(source).not.toContain("./repository");
  });
});
