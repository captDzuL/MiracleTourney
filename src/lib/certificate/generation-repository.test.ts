import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: null as null | Record<string, unknown>, updateMany: vi.fn() }));
const db = vi.hoisted(() => ({
  certificate: {
    findUnique: vi.fn(async () => state.row),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = state.row!;
      if (where.updatedAt && row.updatedAt !== where.updatedAt) return { count: 0 };
      if (where.status && typeof where.status === "string" && row.status !== where.status) return { count: 0 };
      if (where.generationAttemptId && row.generationAttemptId !== where.generationAttemptId) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date((row.updatedAt as Date).getTime() + 1) });
      return { count: 1 };
    }),
  },
  $transaction: vi.fn(async (work: (tx: unknown) => unknown) => work(db)),
}));
vi.mock("@/lib/platform/db", () => ({ prisma: db }));
import { CertificateGenerationInProgressError, createPrismaGenerationRepository } from "./generation-repository";

const identity = { certificateId: "cert-1", eventId: "event-1", certificateType: "champion" as const, recipientId: "team-1", version: 1 };
function draft() {
  state.row = { id: "cert-1", eventId: "event-1", type: "champion", recipientId: "team-1", version: 1, status: "draft", imageUrl: "", publishedUrl: null, updatedAt: new Date("2026-09-12T00:00:00Z"), generationClaimedAt: null, generationAttemptId: null };
}
describe("Prisma certificate generation repository", () => {
  beforeEach(() => { vi.clearAllMocks(); draft(); });
  it("allows exactly one concurrent atomic claim", async () => {
    const repository = createPrismaGenerationRepository();
    const input = { identity, idempotencyKey: "key-1", now: new Date("2026-09-12T01:00:00Z"), staleBefore: new Date("2026-09-12T00:55:00Z") };
    const results = await Promise.allSettled([repository.claim(input), repository.claim(input)]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect((results.find((row) => row.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(CertificateGenerationInProgressError);
  });
  it("recovers a stale generating claim and never downgrades a ready row on failure", async () => {
    Object.assign(state.row!, { status: "generating", generationClaimedAt: new Date("2026-09-11T23:00:00Z"), generationAttemptId: "old" });
    const repository = createPrismaGenerationRepository();
    const claim = await repository.claim({ identity, idempotencyKey: "key-2", now: new Date("2026-09-12T01:00:00Z"), staleBefore: new Date("2026-09-12T00:55:00Z") });
    expect(claim.status).toBe("claimed");
    Object.assign(state.row!, { status: "ready", imageUrl: "/certificates/ready.png" });
    await repository.recordFailure({ identity, attemptId: claim.status === "claimed" ? claim.attemptId : "", message: "late failure" });
    expect(state.row!.status).toBe("ready");
    expect(state.row!.imageUrl).toBe("/certificates/ready.png");
  });
});
