import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { createCaptainAccount } from "./repository";

const input = { email: "a@test.com", name: "A", passwordHash: "hash" };

function uniqueViolation(target: unknown) {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target } });
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.create.mockResolvedValue({ id: "user-1" });
});

describe("createCaptainAccount", () => {
  it("creates a captain user without opening a transaction", async () => {
    await expect(createCaptainAccount(input)).resolves.toEqual({ userId: "user-1" });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "a@test.com", name: "A", role: "captain", passwordHash: "hash" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("turns a duplicate email into a clear message", async () => {
    prisma.user.create.mockRejectedValueOnce(uniqueViolation(["email"]));

    await expect(createCaptainAccount(input)).rejects.toThrow("Email ini sudah terdaftar. Coba login.");
  });

  it("rethrows other database errors unchanged", async () => {
    const failure = Object.assign(new Error("connection lost"), { code: "P1001" });
    prisma.user.create.mockRejectedValueOnce(failure);

    await expect(createCaptainAccount(input)).rejects.toBe(failure);
  });
});
