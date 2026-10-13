// Moved out of platform/repository.test.ts without changes (refactor Phase 4).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    competitionPhase: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    matchResultRevision: { findMany: vi.fn() },
    eventRoundConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    matchGame: {
      findMany: vi.fn(),
    },
    team: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    teamRegistrationRequest: {
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organizerProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    eventPreviewToken: {
      updateMany: vi.fn(),
    },
    eventEditRevision: {
      updateMany: vi.fn(),
    },
    eventSlugRedirect: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    eventVisualAsset: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registrationImportBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    eventPaymentSettings: {
      findUnique: vi.fn(),
    },
    registrationImportItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    statSubmission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    certificate: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tournamentCompletion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    competitionAuditLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $connect: vi.fn(),
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { getCertificateByEvent, getCertificatesForEvents, recordCertificateSuccess, recordCertificateFailure } from "@/lib/certificate/repository";

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});

const championCertificateRow = {
  id: "certificate-champion-v2",
  eventId: "event-1",
  teamId: "team-champion",
  type: "champion",
  recipientKind: "team",
  recipientId: "team-champion",
  recipientName: "Miracle Champions",
  version: 2,
  imageUrl: "/certificates/champion-v2.png",
  publishedUrl: "/certificates/champion-v2.png",
  publishedAt: new Date("2026-09-12T00:00:00.000Z"),
  status: "ready",
  lastError: null,
  attemptCount: 1,
  createdAt: new Date("2026-09-12T00:00:00.000Z"),
  updatedAt: new Date("2026-09-12T00:00:00.000Z"),
};

describe("legacy Champion certificate repository compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.tournamentCompletion.findFirst.mockResolvedValue(null);
  });

  it("returns the latest Champion team certificate for the event-level lookup", async () => {
    prisma.certificate.findFirst.mockResolvedValue(championCertificateRow);

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        type: "champion",
        recipientKind: "team",
        status: "ready",
        publishedUrl: { not: null },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  });

  it("keeps a newer unpublished Champion from hiding the latest published event certificate", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findFirst.mockImplementation(async (query: { where: Record<string, unknown> }) => {
      const publishedUrl = query.where.publishedUrl as { not?: unknown } | undefined;
      return query.where.status === "ready" && publishedUrl?.not === null
        ? championCertificateRow
        : unpublishedChampion;
    });

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
  });

  it("does not label an unpublished Champion as ready if persistence returns one", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findFirst.mockImplementation(async (query: { where: Record<string, unknown> }) => (
      query.where.status === "ready" ? null : unpublishedChampion
    ));

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v3",
      imageUrl: "",
      status: "failed",
    });
  });

  it("keeps one latest Champion per event in the batch API", async () => {
    prisma.certificate.findMany.mockResolvedValue([
      championCertificateRow,
      {
        ...championCertificateRow,
        id: "certificate-champion-v1",
        imageUrl: "/certificates/champion-v1.png",
      },
    ]);

    const certificates = await getCertificatesForEvents(["event-1"]);

    expect(certificates.get("event-1")).toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
    });
    expect(prisma.certificate.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["event-1"] },
        type: "champion",
        recipientKind: "team",
        status: "ready",
        publishedUrl: { not: null },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  });

  it("keeps newer unpublished Champions from hiding published certificates in batch reads", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findMany.mockImplementation(async (query: { where: Record<string, unknown> }) => {
      const publishedUrl = query.where.publishedUrl as { not?: unknown } | undefined;
      return query.where.status === "ready" && publishedUrl?.not === null
        ? [championCertificateRow]
        : [unpublishedChampion, championCertificateRow];
    });

    const certificates = await getCertificatesForEvents(["event-1"]);

    expect(certificates.get("event-1")).toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
  });

  it("falls back per event to the latest non-published Champion when batch reads have no published version", async () => {
    const failedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-event-2-v1",
      eventId: "event-2",
      teamId: "team-runner-up",
      recipientId: "team-runner-up",
      recipientName: "Runner Up",
      version: 1,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "failed",
      lastError: "renderer unavailable",
    };
    prisma.certificate.findMany.mockImplementation(async (query: { where: Record<string, unknown> }) => (
      query.where.status === "ready" ? [championCertificateRow] : [failedChampion]
    ));

    const certificates = await getCertificatesForEvents(["event-1", "event-2"]);

    expect(certificates.get("event-1")).toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(certificates.get("event-2")).toMatchObject({
      id: "certificate-champion-event-2-v1",
      status: "failed",
      lastError: "renderer unavailable",
    });
  });

  it("persists legacy generation as a published Champion team certificate", async () => {
    prisma.certificate.findFirst.mockResolvedValue(null);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.create.mockResolvedValue(championCertificateRow);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({
      eventId: "event-1",
      teamId: "team-champion",
      imageUrl: "/certificates/champion-v2.png",
    });
    expect(prisma.certificate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        teamId: "team-champion",
        type: "champion",
        recipientKind: "team",
        recipientId: "team-champion",
        recipientName: "Miracle Champions",
        imageUrl: "/certificates/champion-v2.png",
        publishedUrl: "/certificates/champion-v2.png",
        status: "ready",
      }),
    });
  });

  it.each([
    ["success", () => recordCertificateSuccess("event-1", "team-champion", "/certificates/legacy-new.png")],
    ["failure", () => recordCertificateFailure("event-1", "team-champion", "legacy renderer failed")],
  ])("refuses a legacy %s write once Completion V3 owns the event", async (_label, write) => {
    prisma.tournamentCompletion.findFirst.mockResolvedValue({ id: "completion-1" });
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.findFirst.mockResolvedValue({
      ...championCertificateRow,
      templateVersion: "miracle-v3",
      completionId: "completion-1",
    });

    await expect(write()).rejects.toThrow("Certificate Studio");
    expect(prisma.tournamentCompletion.findFirst).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      select: { id: true },
    });
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it("appends a version and supersedes the published Champion instead of overwriting it", async () => {
    const publishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v1",
      version: 1,
      publishedUrl: "/certificates/champion-v1.png",
    };
    const nextChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v2",
      version: 2,
    };
    prisma.certificate.findFirst.mockResolvedValue(publishedChampion);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.update.mockResolvedValue({ ...publishedChampion, supersededByVersion: 2 });
    prisma.certificate.create.mockResolvedValue(nextChampion);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", imageUrl: "/certificates/champion-v2.png" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.certificate.update).toHaveBeenCalledWith({
      where: { id: "certificate-champion-v1" },
      data: { supersededByVersion: 2 },
    });
    expect(prisma.certificate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        version: 2,
        imageUrl: "/certificates/champion-v2.png",
      }),
    });
  });

  it("does not downgrade a published Champion when a concurrent generation reports failure", async () => {
    const publishedChampion = {
      ...championCertificateRow,
      version: 1,
      publishedUrl: "/certificates/champion-v1.png",
    };
    prisma.certificate.findFirst.mockResolvedValue(publishedChampion);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });

    await expect(
      recordCertificateFailure("event-1", "team-champion", "late renderer failure"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it("retries P2034 and P2002 write conflicts before publishing the certificate", async () => {
    let attempts = 0;
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      if (attempts === 2) throw Object.assign(new Error("version conflict"), { code: "P2002" });
      return callback(prisma);
    });
    prisma.certificate.findFirst.mockResolvedValue(null);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.create.mockResolvedValue(championCertificateRow);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(attempts).toBe(3);
  });

  it("stops after three certificate write conflicts and rethrows the terminal database error", async () => {
    let attempts = 0;
    const terminalConflict = Object.assign(new Error("serialization conflict"), { code: "P2034" });
    prisma.$transaction.mockImplementation(async () => {
      attempts += 1;
      throw terminalConflict;
    });
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).rejects.toBe(terminalConflict);
    expect(attempts).toBe(3);
  });
});