import { beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = {
  id: string;
  key: string;
  count: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({
  buckets: new Map<string, Bucket>(),
  nextId: 1,
}));

const rateLimitBucket = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma: { rateLimitBucket } }));

import {
  checkRateLimit,
  resetRateLimitForTests,
} from "./rate-limit";

function installAtomicFake() {
  rateLimitBucket.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => {
    const row = state.buckets.get(where.key);
    return row ? { ...row } : null;
  });
  rateLimitBucket.create.mockImplementation(async ({ data }: { data: { key: string; count: number; resetAt: Date } }) => {
    if (state.buckets.has(data.key)) {
      const error = Object.assign(new Error("unique"), { code: "P2002" });
      throw error;
    }
    const now = new Date();
    const row: Bucket = {
      ...data,
      id: `bucket-${state.nextId++}`,
      createdAt: now,
      updatedAt: now,
    };
    state.buckets.set(data.key, row);
    return { ...row };
  });
  rateLimitBucket.updateMany.mockImplementation(async ({ where, data }: {
    where: { key: string; count?: number; resetAt?: Date; }
    data: { count: number | { increment: number }; resetAt?: Date };
  }) => {
    const row = state.buckets.get(where.key);
    if (!row || where.count !== undefined && row.count !== where.count
      || where.resetAt && row.resetAt.getTime() !== where.resetAt.getTime()) return { count: 0 };
    row.count = typeof data.count === "number" ? data.count : row.count + data.count.increment;
    if (data.resetAt) row.resetAt = data.resetAt;
    row.updatedAt = new Date();
    return { count: 1 };
  });
  rateLimitBucket.findMany.mockImplementation(async ({ where, take }: { where: { resetAt: { lt: Date } }; take: number }) => {
    expect(take).toBeLessThanOrEqual(100);
    return [...state.buckets.values()]
      .filter((row) => row.resetAt.getTime() < where.resetAt.lt.getTime())
      .slice(0, take)
      .map((row) => ({ key: row.key }));
  });
  rateLimitBucket.deleteMany.mockImplementation(async ({ where }: { where: { key: { in: string[] }; resetAt: { lt: Date } } }) => {
    let count = 0;
    for (const key of where.key.in) {
      const row = state.buckets.get(key);
      if (row && row.resetAt.getTime() < where.resetAt.lt.getTime()) {
        state.buckets.delete(key);
        count += 1;
      }
    }
    return { count };
  });
}

describe("shared database rate limiter", () => {
  beforeEach(() => {
    state.buckets.clear();
    state.nextId = 1;
    vi.clearAllMocks();
    resetRateLimitForTests();
    installAtomicFake();
  });

  it("allows exactly 20 requests and denies the concurrent 21st", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 21 }, () => checkRateLimit("login:203.0.113.7", 20, 300_000, new Date("2026-09-24T00:00:00.000Z"))),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(20);
    expect(outcomes.filter((allowed) => !allowed)).toHaveLength(1);
    expect([...state.buckets.values()][0]?.count).toBe(20);
  });

  it("stores only a stable digest of the logical key", async () => {
    await expect(checkRateLimit("password-reset:person@example.test", 5, 900_000, new Date("2026-09-24T00:00:00.000Z"))).resolves.toBe(true);

    const storedKey = [...state.buckets.values()][0]?.key ?? "";
    expect(storedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(storedKey).not.toContain("person@example.test");
  });

  it("starts a fresh atomic window after expiry", async () => {
    const start = new Date("2026-09-24T00:00:00.000Z");
    for (let index = 0; index < 20; index += 1) {
      await expect(checkRateLimit("registration:captain-1:event-1", 20, 300_000, start)).resolves.toBe(true);
    }
    await expect(checkRateLimit("registration:captain-1:event-1", 20, 300_000, new Date(start.getTime() + 300_000))).resolves.toBe(true);
    expect([...state.buckets.values()][0]?.count).toBe(1);
  });

  it("fails closed on database errors and remembers the denial locally", async () => {
    rateLimitBucket.findUnique.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(checkRateLimit("login:203.0.113.8", 20, 300_000, new Date("2026-09-24T00:00:00.000Z"))).resolves.toBe(false);
    rateLimitBucket.findUnique.mockClear();
    await expect(checkRateLimit("login:203.0.113.8", 20, 300_000, new Date("2026-09-24T00:00:01.000Z"))).resolves.toBe(false);
    expect(rateLimitBucket.findUnique).not.toHaveBeenCalled();
  });

  it("keeps opportunistic cleanup capped per request", async () => {
    await expect(checkRateLimit("cleanup-key", 20, 300_000, new Date("2026-09-24T00:00:00.000Z"))).resolves.toBe(true);
    expect(rateLimitBucket.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
