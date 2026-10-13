import { beforeEach, describe, expect, it, vi } from "vitest";

// Queries that used to be written inside the server actions (captain payment proof upload).

const { prisma } = vi.hoisted(() => ({
  prisma: {
    teamRegistrationRequest: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn }));

import { findCaptainRegistrationRequestRef } from "@/lib/registration/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findCaptainRegistrationRequestRef", () => {
  it("finds a request only when it belongs to the captain", async () => {
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({ id: "request-1", eventId: "event-1" });

    await expect(findCaptainRegistrationRequestRef("request-1", "captain-1")).resolves.toEqual({ id: "request-1", eventId: "event-1" });

    expect(prisma.teamRegistrationRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "request-1", captainId: "captain-1" },
      select: { id: true, eventId: true },
    });
  });

  it("returns null for a request of another captain", async () => {
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);

    await expect(findCaptainRegistrationRequestRef("request-1", "captain-2")).resolves.toBeNull();
  });

  it("passes on a database error", async () => {
    prisma.teamRegistrationRequest.findFirst.mockRejectedValue(new Error("db down"));

    await expect(findCaptainRegistrationRequestRef("request-1", "captain-1")).rejects.toThrow("db down");
  });
});
