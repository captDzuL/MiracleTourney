import { beforeEach, describe, expect, it, vi } from "vitest";

// Queries that used to be written inside the server actions (deactivating an account).

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));

import { deactivateUser, getUserRoleRef } from "@/lib/identity/repository";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getUserRoleRef", () => {
  it("returns only the id and the role", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", role: "captain" });

    await expect(getUserRoleRef("user-1")).resolves.toEqual({ id: "user-1", role: "captain" });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" }, select: { id: true, role: true } });
  });

  it("returns null when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getUserRoleRef("missing")).resolves.toBeNull();
  });
});

describe("deactivateUser", () => {
  it("stamps the account as deactivated now and changes nothing else", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T08:00:00.000Z"));
    try {
      await deactivateUser("user-1");
    } finally {
      vi.useRealTimers();
    }

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { deactivatedAt: new Date("2026-10-13T08:00:00.000Z") } });
  });

  it("passes on a database error", async () => {
    prisma.user.update.mockRejectedValue(new Error("db down"));

    await expect(deactivateUser("user-1")).rejects.toThrow("db down");
  });
});
