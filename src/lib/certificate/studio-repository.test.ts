import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { certificateStudioAvailability, createCertificateStudioTransaction, materializeOwnedCertificateAssetUrl } from "./studio-repository";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "./templates/miracle-v3-contract";
import { getMiracleV3CertificateFingerprint } from "./templates/miracle-v3";

const recipients = Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `recipient-${type}`]));

function reverseJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseJsonObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse()
    .map(([key, nested]) => [key, reverseJsonObjectKeys(nested)]));
}

describe("owned local certificate asset materialization", () => {
  it("embeds only the verified certificate-assets bytes as a CSP-safe raster data URL", async () => {
    const bytes = Buffer.from("trusted-png-bytes");
    const readOwnedAsset = vi.fn().mockResolvedValue(bytes);
    const url = await materializeOwnedCertificateAssetUrl({
      url: "/certificate-assets/team.png",
      detectedMimeType: "image/png",
      bytes: bytes.length,
      width: 512,
      height: 512,
      storageOwnershipVerified: true,
      storageProvider: "local",
      storageKey: "certificate-assets/team.png",
      contentSha256: createHash("sha256").update(bytes).digest("hex"),
      purpose: "certificate_team_logo",
    }, readOwnedAsset);

    expect(url).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
    expect(readOwnedAsset).toHaveBeenCalledWith(expect.stringMatching(/[\\/]public[\\/]certificate-assets[\\/]team\.png$/));
  });

  it("rejects changed local bytes instead of rendering unverified content", async () => {
    const bytes = Buffer.from("changed");
    await expect(materializeOwnedCertificateAssetUrl({
      url: "/certificate-assets/team.png",
      detectedMimeType: "image/png",
      bytes: 7,
      width: 512,
      height: 512,
      storageOwnershipVerified: true,
      storageProvider: "local",
      storageKey: "certificate-assets/team.png",
      contentSha256: "a".repeat(64),
      purpose: "certificate_team_logo",
    }, async () => bytes)).rejects.toThrow("content changed");
  });
});

describe("Certificate Studio completion availability", () => {
  it("distinguishes a known reopened snapshot from a missing authoritative integration", () => {
    expect(certificateStudioAvailability(null)).toBe("integration_required");
    expect(certificateStudioAvailability({ status: "reopened", version: 5 })).toBe("completion_required");
    expect(certificateStudioAvailability({ status: "corrupt", version: 5 })).toBe("integration_required");
    expect(certificateStudioAvailability({ status: "completed", version: 5 })).toBe("available");
  });
});
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
  return {
    tx,
    repository: createCertificateStudioTransaction(
      tx as never,
      "event-1",
      { id: "organizer-1", role: "organizer" },
      { materializeAssetUrl: async (asset) => asset.url },
    ),
  };
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
    const logo = {
      id: "asset-logo", url: "/certificate-assets/logo.png", mimeType: "image/png", width: 512, height: 512, byteSize: 1024,
      storageProvider: "local" as const, storageKey: "certificate-assets/logo.png", contentSha256: "a".repeat(64), purpose: "certificate_team_logo" as const,
    };
    const placement = { assetKind: "team_logo_hero" as const, x: 360, y: 748, width: 560, height: 540 };
    const trustedLogo = { url: logo.url, detectedMimeType: logo.mimeType, bytes: logo.byteSize, width: logo.width, height: logo.height,
      storageOwnershipVerified: true as const, storageProvider: logo.storageProvider, storageKey: logo.storageKey,
      contentSha256: logo.contentSha256, purpose: logo.purpose };
    const createCertificate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...certificates[0], ...data, imageUrl: "", status: "draft" }));
    const createMutation = vi.fn().mockResolvedValue({});
    const { repository: repo } = repository({ certificate: { findFirst: vi.fn().mockResolvedValue(certificates[0]), findMany: vi.fn(), create: createCertificate, updateMany: vi.fn(), update: vi.fn() },
      certificateGenerationMutation: { findUnique: vi.fn(), create: createMutation, updateMany: vi.fn() },
      eventVisualAsset: { findFirst: vi.fn().mockResolvedValue(logo) } });
    await repo.appendVersion({ certificateType: "champion", idempotencyKey: "same-key", fingerprint: "fp", actorId: "organizer-1", leaseOwnerId: "request-1",
      assets: [{ assetId: logo.id, placement, asset: trustedLogo }] });
    expect(createCertificate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      completionId: "completion-1", completionVersion: 4, templateVersion: "miracle-v3", recipientId: "recipient-champion",
    }) }));
    expect(createMutation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "in_progress", certificateId: "cert-champion", idempotencyKey: "same-key", fingerprint: "fp",
    }) }));

  });
  it("persists one canonical render manifest and reuses it after event text and clock changes", async () => {
    const mutableCompletion = {
      ...completion,
      event: { ...completion.event },
      podiumPlacements: completion.podiumPlacements.map((row) => ({ ...row })),
      awards: completion.awards.map((row) => ({ ...row, decision: row.decision ? { ...row.decision } : null })),
    };
    const key = "certificate-assets/logo.png";
    const logo = {
      id: "asset-logo",
      url: `/${key}`,
      mimeType: "image/png",
      width: 512,
      height: 512,
      byteSize: 1024,
      storageProvider: "local",
      storageKey: key,
      contentSha256: "a".repeat(64),
      purpose: "certificate_team_logo",
    };
    const trustedLogo = {
      url: logo.url,
      detectedMimeType: logo.mimeType,
      bytes: logo.byteSize,
      width: logo.width,
      height: logo.height,
      storageOwnershipVerified: true,
      storageProvider: "local" as const,
      storageKey: logo.storageKey,
      contentSha256: logo.contentSha256,
      purpose: "certificate_team_logo" as const,
    };
    const placement = { assetKind: "team_logo_hero" as const, x: 360, y: 748, width: 560, height: 540 };
    let persisted = { ...certificates[0], id: "cert-champion-v3", version: 3, assetManifest: {}, renderManifest: null };
    const certificateCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      persisted = { ...persisted, ...data };
      return persisted;
    });
    const certificateUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      persisted = { ...persisted, ...data };
      return persisted;
    });
    const mutation = {
      status: "in_progress",
      fingerprint: "request-fingerprint",
      actorUserId: "organizer-1",
      result: null,
      certificateId: persisted.id,
      type: "champion",
      leaseToken: null,
      leaseExpiresAt: new Date(0),
      updatedAt: new Date(0),
      certificate: persisted,
    };
    const tx = {
      event: { findUnique: vi.fn().mockResolvedValue({ organizerUserId: "organizer-1" }) },
      tournamentCompletion: { findUnique: vi.fn().mockImplementation(async () => mutableCompletion), updateMany: vi.fn() },
      certificate: {
        findFirst: vi.fn().mockResolvedValue(certificates[0]),
        findMany: vi.fn(),
        create: certificateCreate,
        update: certificateUpdate,
        updateMany: vi.fn(),
      },
      certificateGenerationMutation: {
        create: vi.fn(),
        updateMany: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(mutation, data);
          return { count: 1 };
        }),
        findUnique: vi.fn().mockImplementation(async () => ({ ...mutation, certificate: persisted })),
      },
      certificatePublication: { findUnique: vi.fn(), create: vi.fn() },
      eventVisualAsset: { findFirst: vi.fn().mockResolvedValue(logo) },
      team: { findFirst: vi.fn().mockResolvedValue({ id: "recipient-champion" }) },
    };
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-09-12T23:55:00.000Z"))
      .mockReturnValue(new Date("2026-09-14T01:00:00.000Z"));
    const embeddedLogo = `data:image/png;base64,${"A".repeat(2_000_000)}`;
    const materializeAssetUrl = vi.fn().mockResolvedValue(embeddedLogo);
    const repo = createCertificateStudioTransaction(tx as never, "event-1", { id: "organizer-1", role: "organizer" }, { now, materializeAssetUrl });

    const appended = await repo.appendVersion({
      certificateType: "champion",
      idempotencyKey: "same-key",
      fingerprint: "request-fingerprint",
      actorId: "organizer-1",
      leaseOwnerId: "request-1",
      assets: [{ assetId: logo.id, placement, asset: trustedLogo }],
    });
    const firstData = structuredClone(appended.data);
    const firstFingerprint = getMiracleV3CertificateFingerprint(firstData);
    expect(certificateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cert-champion-v3" },
      data: {
        renderManifest: expect.objectContaining({
          schemaVersion: 1,
          data: expect.objectContaining({
            eventName: "Miracle Open",
            issueDate: "2026-09-12",
            recipientName: "Team 1",
            teamLogoUrl: "https://miracle-league.fun/certificate-assets/logo.png",
          }),
          assets: [expect.objectContaining({
            assetId: "asset-logo",
            asset: expect.objectContaining({ storageKey: key, contentSha256: "a".repeat(64) }),
          })],
        }),
      },
    }));
    expect(JSON.stringify(certificateUpdate.mock.calls[0][0].data.renderManifest).length).toBeLessThan(10_000);

    persisted = {
      ...persisted,
      renderManifest: reverseJsonObjectKeys(JSON.parse(JSON.stringify(persisted.renderManifest))) as never,
    };
    mutableCompletion.event.name = "Renamed after append";
    mutableCompletion.event.gameId = "game-changed";
    const resumed = await repo.leaseStaleVersion("same-key", new Date(0).toISOString(), "request-2");
    expect(resumed?.data).toEqual(firstData);
    expect(getMiracleV3CertificateFingerprint(resumed!.data)).toBe(firstFingerprint);
    expect(materializeAssetUrl).toHaveBeenCalledTimes(2);

    const validRenderManifest = persisted.renderManifest as unknown as { schemaVersion: number; data: Record<string, unknown>; assets: Array<Record<string, unknown>> };
    const validAssetManifest = persisted.assetManifest;
    const assetsWithExtraField = validRenderManifest.assets.map((asset, index) => index === 0 ? { ...asset, unexpected: true } : asset);
    persisted = {
      ...persisted,
      assetManifest: { assets: assetsWithExtraField },
      renderManifest: { ...validRenderManifest, assets: assetsWithExtraField } as never,
    };
    await expect(repo.leaseStaleVersion("same-key", new Date(0).toISOString(), "request-invalid-schema"))
      .rejects.toThrow("canonical");
    persisted = { ...persisted, assetManifest: validAssetManifest, renderManifest: validRenderManifest as never };

    materializeAssetUrl.mockRejectedValueOnce(new Error("Certificate local asset content changed"));
    await expect(repo.leaseStaleVersion("same-key", new Date(0).toISOString(), "request-3"))
      .rejects.toThrow("content changed");
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

  it("leases one concurrent stale resume and prevents the losing token from recording failure", async () => {
    const staleAt = new Date("2026-09-12T00:00:00.000Z");
    const logo = {
      id: "asset-logo", url: "https://store.public.blob.vercel-storage.com/certificate-assets/logo.png", mimeType: "image/png", width: 512, height: 512, byteSize: 1024,
      storageProvider: "vercel_blob", storageKey: "certificate-assets/logo.png", contentSha256: "a".repeat(64), purpose: "certificate_team_logo",
    };
    const placement = { assetKind: "team_logo_hero", x: 360, y: 748, width: 560, height: 540 };
    const storedAssets = [{ assetId: logo.id, placement, asset: {
      url: logo.url, detectedMimeType: logo.mimeType, bytes: logo.byteSize, width: logo.width, height: logo.height,
      storageProvider: logo.storageProvider, storageKey: logo.storageKey, contentSha256: logo.contentSha256, purpose: logo.purpose,
    } }];
    const certificate = {
      ...certificates[0],
      assetManifest: { assets: storedAssets },
      renderManifest: {
        schemaVersion: 1,
        data: {
          eventId: "event-1", eventName: "Miracle Open", gameId: "game-1", gameName: "game-1",
          certificateId: "cert-champion", certificateType: "champion", version: 2, templateVersion: "miracle-v3",
          recipientId: "recipient-champion", recipientName: "Team 1", recipientKind: "team",
          teamId: "recipient-champion", teamName: "Team 1", teamLogoUrl: logo.url, characterArtUrl: null,
          issueDate: "2026-09-12", verificationCode: "verify-champion", verificationBaseUrl: "https://miracle-league.fun",
          branding: { cyan: "#49d1ec", violet: "#aa8bff", cream: "#f6dfb1" },
          assetPlacement: placement, assetPlacements: [placement],
        },
        assets: storedAssets,
      },
    };
    const mutation: Record<string, unknown> = {
      id: "mutation-1", eventId: "event-1", status: "in_progress", fingerprint: "fp", actorUserId: "organizer-1", result: null,
      certificateId: certificate.id, type: "champion", leaseToken: "expired-token", leaseOwnerId: "old-owner",
      leaseExpiresAt: new Date("2026-09-11T23:59:00.000Z"), updatedAt: staleAt, certificate,
    };
    const findUnique = vi.fn(async () => ({ ...mutation }));
    const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const expectedUpdatedAt = where.updatedAt as Date | undefined;
      const leaseMatches = where.status === "in_progress" && expectedUpdatedAt instanceof Date
        && (mutation.updatedAt as Date).getTime() === expectedUpdatedAt.getTime()
        && (mutation.leaseExpiresAt as Date).getTime() <= Date.now();
      const tokenMatches = where.status === "in_progress" && typeof where.leaseToken === "string" && mutation.leaseToken === where.leaseToken;
      if (!leaseMatches && !tokenMatches) return { count: 0 };
      Object.assign(mutation, data);
      return { count: 1 };
    });
    const mutationRepository = { findUnique, create: vi.fn(), updateMany };
    const { repository: first } = repository({ certificateGenerationMutation: mutationRepository, eventVisualAsset: { findFirst: vi.fn().mockResolvedValue(logo) } });
    const { repository: second } = repository({ certificateGenerationMutation: mutationRepository, eventVisualAsset: { findFirst: vi.fn().mockResolvedValue(logo) } });
    const [leaseA, leaseB] = await Promise.all([
      first.leaseStaleVersion("same-key", staleAt.toISOString(), "request-a"),
      second.leaseStaleVersion("same-key", staleAt.toISOString(), "request-b"),
    ]);
    const leases = [leaseA, leaseB].filter((lease): lease is NonNullable<typeof leaseA> => Boolean(lease));
    expect(leases).toHaveLength(1);
    expect(leases[0].leaseToken).not.toBe("expired-token");
    expect(["request-a", "request-b"]).toContain(mutation.leaseOwnerId);

    const failed = { status: "failed", code: "generation_failed", certificateId: certificate.id, certificateType: "champion", version: 2 } as const;
    await expect(first.finalizeMutation("same-key", "expired-token", failed)).resolves.toEqual({ status: "lease_lost" });
    expect(mutation.status).toBe("in_progress");

    const generated = { status: "generated", certificateId: certificate.id, certificateType: "champion", version: 2, imageUrl: "/certificates/champion.png" } as const;
    await expect(first.finalizeMutation("same-key", leases[0].leaseToken, generated)).resolves.toEqual({ status: "finalized" });
    await expect(second.finalizeMutation("same-key", "expired-token", failed)).resolves.toEqual({ status: "lease_lost", result: generated });
    expect(mutation).toMatchObject({ status: "succeeded", result: generated });
  });
});
