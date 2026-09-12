import { describe, expect, it, vi } from "vitest";
import { createCertificateStudioTransaction } from "./studio-repository";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "./templates/miracle-v3-contract";

const recipients = Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `recipient-${type}`]));
const completion = {
  id: "completion-1", eventId: "event-1", status: "completed", format: "single_elimination",
  sourceSnapshot: { version: 4 }, completedByUserId: "organizer-1", completedAt: new Date("2026-09-12T00:00:00Z"),
  reopenedByUserId: null, reopenedAt: null, reopenReason: null, certificateRevision: 2,
  createdAt: new Date("2026-09-12T00:00:00Z"), updatedAt: new Date("2026-09-12T00:00:00Z"),
  event: { id: "event-1", name: "Miracle Open", gameId: "game-1" },
  podiumPlacements: [1, 2, 3].map((rank) => ({ rank, teamId: `recipient-${MIRACLE_V3_CERTIFICATE_TYPES[rank - 1]}`, teamName: `Team ${rank}` })),
  awards: MIRACLE_V3_CERTIFICATE_TYPES.slice(3).map((type) => ({ type, decision: { recipientId: recipients[type], recipientName: `Player ${type}`, teamId: "team-awards", teamName: "Awards Team" } })),
};
const certificates = MIRACLE_V3_CERTIFICATE_TYPES.map((type, index) => ({
  id: `cert-${type}`, eventId: "event-1", teamId: index < 3 ? recipients[type] : "team-awards", type,
  recipientKind: index < 3 ? "team" : "player", recipientId: recipients[type], recipientName: `Recipient ${type}`,
  version: 2, templateVersion: "miracle-v3", assetManifest: {}, imageUrl: `/certificates/${type}.png`, status: "ready",
  verificationCode: `verify-${type}`, publishedUrl: null, generatedAt: new Date(), publishedAt: null,
  supersededByVersion: null, lastError: null, attemptCount: 1, generationAttemptId: null, generationClaimedAt: null,
  generationIdempotencyKey: null, generationFingerprint: null, generationActorUserId: null,
  completionId: "completion-1", completionVersion: 4, createdAt: new Date(), updatedAt: new Date(),
}));

function repository(overrides: Record<string, unknown> = {}) {
  const certificateUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const certificateUpdate = vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => certificates.find((row) => row.id === where.id));
  const tx = {
    event: { findUnique: vi.fn().mockResolvedValue({ organizerUserId: "organizer-1" }) },
    tournamentCompletion: { findUnique: vi.fn().mockResolvedValue(completion), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    certificate: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue(certificates), create: vi.fn(), updateMany: certificateUpdateMany, update: certificateUpdate },
    certificateGenerationMutation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), updateMany: vi.fn() },
    certificatePublication: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ version: 3, publishedAt: new Date("2026-09-12T02:00:00Z") }) },
    eventVisualAsset: { findFirst: vi.fn() }, team: { findFirst: vi.fn().mockResolvedValue({ id: "team-awards" }) },
    ...overrides,
  };
  return { tx, repository: createCertificateStudioTransaction(tx as never, "event-1", { id: "organizer-1", role: "organizer" }) };
}

describe("Certificate Studio Prisma transaction boundary", () => {
  it("returns immutable terminal mutation JSON instead of reconstructing from mutable certificate state", async () => {
    const result = { status: "failed", code: "generation_failed", certificateId: "cert-champion", certificateType: "champion", version: 2 } as const;
    const { repository: repo } = repository({ certificateGenerationMutation: { findUnique: vi.fn().mockResolvedValue({
      status: "failed", fingerprint: "fingerprint", actorUserId: "organizer-1", result,
      certificateId: "cert-champion", type: "champion", updatedAt: new Date(), certificate: { ...certificates[0], status: "ready" },
    }) } });
    await expect(repo.findMutation("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({ status: "terminal", result });
  });

  it("exposes active attempts as in-progress and stale attempts as resumable exact records", async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: "in_progress", fingerprint: "fingerprint", actorUserId: "organizer-1", result: null,
      certificateId: "cert-champion", type: "champion", updatedAt: new Date(0), certificate: certificates[0] });
    const { repository: repo } = repository({ certificateGenerationMutation: { findUnique, create: vi.fn(), updateMany: vi.fn() } });
    await expect(repo.findMutation("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({ status: "in_progress", stale: true, certificateId: "cert-champion", version: 2 });
  });
  it("creates an in-progress mutation with exact completion, recipient, and template binding", async () => {
    const createCertificate = vi.fn().mockResolvedValue({ ...certificates[0], imageUrl: "", status: "draft" });
    const createMutation = vi.fn().mockResolvedValue({});
    const { repository: repo } = repository({ certificate: { findFirst: vi.fn().mockResolvedValue(certificates[0]), findMany: vi.fn(), create: createCertificate, updateMany: vi.fn(), update: vi.fn() },
      certificateGenerationMutation: { findUnique: vi.fn(), create: createMutation, updateMany: vi.fn() } });
    await repo.appendVersion({ certificateType: "champion", idempotencyKey: "same-key", fingerprint: "fp", actorId: "organizer-1", assets: [] });
    expect(createCertificate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      completionId: "completion-1", completionVersion: 4, templateVersion: "miracle-v3", recipientId: "recipient-champion",
    }) }));
    expect(createMutation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "in_progress", certificateId: "cert-champion", idempotencyKey: "same-key", fingerprint: "fp",
    }) }));

  });
  it("aborts before supersession writes when optimistic publication revision loses", async () => {
    const updateManyRevision = vi.fn().mockResolvedValue({ count: 0 });
    const { tx, repository: repo } = repository({ tournamentCompletion: { findUnique: vi.fn().mockResolvedValue(completion), updateMany: updateManyRevision } });
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}` }));
    await expect(repo.commitPublication({ selection, actorId: "organizer-1", idempotencyKey: "key", fingerprint: "fp", expectedCertificateRevision: 2, preserveVerificationHistory: true })).rejects.toThrow("revision changed");
    expect(tx.certificate.updateMany).not.toHaveBeenCalled();
    expect(tx.certificate.update).not.toHaveBeenCalled();
    expect(tx.certificatePublication.create).not.toHaveBeenCalled();
  });

  it("revalidates snapshot recipients and preserves prior URL/code fields while superseding", async () => {
    const { tx, repository: repo } = repository();
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}` }));
    await expect(repo.commitPublication({ selection, actorId: "organizer-1", idempotencyKey: "key", fingerprint: "fp", expectedCertificateRevision: 2, preserveVerificationHistory: true })).resolves.toEqual({ publicationVersion: 3, publishedAt: "2026-09-12T02:00:00.000Z" });
    const supersession = tx.certificate.updateMany.mock.calls[0][0].data;
    expect(supersession).toEqual({ status: "superseded", supersededByVersion: 2 });
    expect(supersession).not.toHaveProperty("publishedUrl");
    expect(supersession).not.toHaveProperty("verificationCode");
    expect(tx.certificatePublication.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completionId: "completion-1", completionVersion: 4, certificateIds: selection.map((row) => row.certificateId) }) }));
  });

  it("returns an existing publication as the immutable concurrent same-key result", async () => {
    const publishedAt = new Date("2026-09-12T02:00:00Z");
    const { repository: repo } = repository({ certificatePublication: { findUnique: vi.fn().mockResolvedValue({ fingerprint: "fp", actorUserId: "organizer-1", version: 3, publishedAt }), create: vi.fn() } });
    await expect(repo.findMutation("same-key")).resolves.toEqual({ status: "terminal", fingerprint: "fp", actorId: "organizer-1", result: { status: "published", publicationVersion: 3, publishedAt: publishedAt.toISOString() } });
  });
});
