import { describe, expect, it, vi } from "vitest";

import {
  CERTIFICATE_ASSET_LIMITS,
  createMiracleV3GenerationAdapter,
  generateCertificateForEvent,
  publishCertificateSet,
  regenerateCertificate,
  validateCertificateAssetPlacement,
  type CertificateGenerationDependencies,
  type CertificateStudioDependencies,
  type CertificateStudioTransaction,
} from "@/lib/certificate/service";
import { MIRACLE_V3_CERTIFICATE_TYPES, type MiracleV3CertificateData } from "@/lib/certificate/templates/miracle-v3";
import { generateMiracleV3Certificate } from "@/lib/certificate/generate";

function createDependencies(
  overrides: Partial<CertificateGenerationDependencies> = {},
): CertificateGenerationDependencies {
  return {
    findCompletedFinal: vi.fn().mockResolvedValue({
      id: "match-final",
      winnerTeamId: "team-winner",
    }),
    findWinnerTeamForEvent: vi.fn().mockResolvedValue({
      id: "team-winner",
      name: "The Brothers Invictus",
      tag: "TBI",
    }),
    findCertificateForEvent: vi.fn().mockResolvedValue(null),
    generateCertificate: vi.fn().mockResolvedValue("/uploads/certificates/mfl-s2.png"),
    ...overrides,
  };
}

describe("generateCertificateForEvent", () => {
  it("returns not-ready when there is no completed Final", async () => {
    const dependencies = createDependencies({
      findCompletedFinal: vi.fn().mockResolvedValue(null),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "final-not-completed",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("returns not-ready when the completed Final has no winner", async () => {
    const dependencies = createDependencies({
      findCompletedFinal: vi.fn().mockResolvedValue({
        id: "match-final",
        winnerTeamId: null,
      }),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "winner-missing",
      matchId: "match-final",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("rejects a winner that is not a participant of the event", async () => {
    const findWinnerTeamForEvent = vi.fn().mockResolvedValue(null);
    const dependencies = createDependencies({ findWinnerTeamForEvent });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "not-ready",
      reason: "winner-not-in-event",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(findWinnerTeamForEvent).toHaveBeenCalledWith(
      "event-mfl-s2",
      "team-winner",
    );
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("does not overwrite a certificate that already exists", async () => {
    const dependencies = createDependencies({
      findCertificateForEvent: vi.fn().mockResolvedValue({
        imageUrl: "/uploads/certificates/existing.png",
      }),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "already-exists",
      imageUrl: "/uploads/certificates/existing.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("generates a certificate for the server-derived Final winner", async () => {
    const generateCertificate = vi.fn().mockResolvedValue("/uploads/certificates/generated.png");
    const dependencies = createDependencies({ generateCertificate });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "generated",
      imageUrl: "/uploads/certificates/generated.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(generateCertificate).toHaveBeenCalledWith("event-mfl-s2", "team-winner");
  });
});

const data = (type: (typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], version = 1): MiracleV3CertificateData => ({
  eventId: "event-1", eventName: "Miracle Open", gameId: "game-1", gameName: "FC Mobile",
  certificateId: `cert-${type}-${version}`, certificateType: type, version, templateVersion: "miracle-v3",
  recipientId: `recipient-${type}`, recipientName: `Recipient ${type}`,
  recipientKind: ["champion", "runner_up", "third_place"].includes(type) ? "team" : "player",
  teamId: "team-1", teamName: "Garuda Nova", teamLogoUrl: "/team-logos/garuda.png",
  characterArtUrl: type === "mvp" ? "/character-art/mvp.png" : null,
  issueDate: "12 September 2026", verificationCode: `verify-${type}-${version}`,
  verificationBaseUrl: "https://miracle-league.fun", branding: { cyan: "#49d1ec", violet: "#aa8bff", cream: "#f6dfb1" },
});

describe("certificate asset placement validation", () => {
  const asset = { url: "/uploads/certificates/asset.png", detectedMimeType: "image/png" as const, bytes: 1024, width: 512, height: 512, storageOwnershipVerified: true };

  it("accepts a finite placement fully inside the immutable hero zone", () => {
    expect(validateCertificateAssetPlacement({ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, asset)).toEqual({ success: true });
  });

  it.each([
    [{ assetKind: "character_art", x: 0, y: 700, width: 300, height: 500 }, asset, "out_of_zone"],
    [{ assetKind: "character_art", x: Number.NaN, y: 700, width: 300, height: 500 }, asset, "invalid_placement"],
    [{ assetKind: "character_art", x: Infinity, y: 700, width: 300, height: 500 }, asset, "invalid_placement"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, url: "javascript:alert(1)" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, detectedMimeType: "image/svg+xml" }, "unsupported_type"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, bytes: CERTIFICATE_ASSET_LIMITS.maxBytes + 1 }, "asset_too_large"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageOwnershipVerified: false }, "unsafe_asset"],
  ] as const)("rejects invalid placement or asset metadata", (placement, candidate, code) => {
    expect(validateCertificateAssetPlacement(placement, candidate)).toEqual({ success: false, code });
  });
});

describe("durable v3 generation adapter", () => {
  it("passes a create-only path, returns idempotent ready records, and recovers stale claims through the repository", async () => {
    const claim = vi.fn()
      .mockResolvedValueOnce({ status: "claimed", attemptId: "attempt-1" })
      .mockResolvedValueOnce({ status: "ready", imageUrl: "https://blob.example/ready.png" });
    const put = vi.fn().mockResolvedValue("https://blob.example/new.png");
    const repo = { claim, recordSuccess: vi.fn(), recordFailure: vi.fn() };
    const adapter = createMiracleV3GenerationAdapter(repo, { put }, { idempotencyKey: "11111111-1111-4111-8111-111111111111", now: new Date("2026-09-12T00:00:00Z") });

    expect(await adapter.claimGeneration(data("champion"))).toEqual({ status: "claimed", attemptId: "attempt-1" });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ staleBefore: new Date("2026-09-11T23:55:00.000Z") }));
    expect(await adapter.storeArtifact({ filename: "certificates/event-1/champion/v1/a.png", png: Buffer.from("png"), overwrite: false })).toBe("https://blob.example/new.png");
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ overwrite: false }));
    expect(await adapter.claimGeneration(data("champion"))).toEqual({ status: "ready", imageUrl: "https://blob.example/ready.png" });
  });

  it("preserves the primary generation error when failure persistence also fails", async () => {
    const primary = new Error("renderer failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createMiracleV3GenerationAdapter({
      claim: vi.fn().mockResolvedValue({ status: "claimed", attemptId: "attempt-1" }),
      recordSuccess: vi.fn(), recordFailure: vi.fn().mockRejectedValue(new Error("database unavailable")),
    }, { put: vi.fn() }, { idempotencyKey: "11111111-1111-4111-8111-111111111111", now: new Date() });
    await expect(generateMiracleV3Certificate({ data: data("mvp") }, { ...adapter, render: vi.fn().mockRejectedValue(primary) })).rejects.toBe(primary);
    expect(log).toHaveBeenCalled();
  });
});

function studioDependencies(overrides: Partial<CertificateStudioDependencies> = {}) {
  const history = MIRACLE_V3_CERTIFICATE_TYPES.map((type) => ({
    id: `cert-${type}-1`, eventId: "event-1", certificateType: type, recipientId: `recipient-${type}`,
    version: 1, status: "ready" as const, imageUrl: `https://blob.example/${type}/v1.png`, publishedUrl: null,
    verificationCode: `verify-${type}-1`, publishedAt: null, supersededByVersion: null,
  }));
  const tx: CertificateStudioTransaction = {
    authorize: vi.fn().mockResolvedValue({ id: "organizer-1", role: "organizer" }),
    loadCompletion: vi.fn().mockResolvedValue({ status: "completed", version: 4, certificateRevision: 2 }),
    findMutation: vi.fn().mockResolvedValue(null),
    appendVersion: vi.fn().mockImplementation(async ({ certificateType }) => ({ record: { ...history.find((row) => row.certificateType === certificateType)!, id: `cert-${certificateType}-2`, version: 2, status: "generating" }, data: data(certificateType, 2) })),
    loadCertificates: vi.fn().mockResolvedValue(history),
    commitPublication: vi.fn().mockResolvedValue({ publicationVersion: 3, publishedAt: "2026-09-12T04:00:00.000Z" }),
  };
  return { tx, deps: { transaction: vi.fn(async (_eventId, work) => work(tx)), generate: vi.fn().mockResolvedValue("https://blob.example/generated.png"), ...overrides } as CertificateStudioDependencies };
}

describe("certificate regeneration and atomic publication", () => {
  it("appends a version without mutating published history and retries idempotently", async () => {
    const { tx, deps } = studioDependencies();
    const input = { eventId: "event-1", certificateType: "champion" as const, expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" };
    await expect(regenerateCertificate(input, deps)).resolves.toMatchObject({ status: "generated", version: 2 });
    expect(tx.appendVersion).toHaveBeenCalledWith(expect.objectContaining({ certificateType: "champion" }));
    expect(deps.generate).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }), expect.anything());

    vi.mocked(tx.findMutation).mockResolvedValue({ fingerprint: JSON.stringify({ action: "regenerate", certificateType: "champion", expectedVersion: 4, placement: null, assetId: null }), actorId: "organizer-1", result: { status: "generated", certificateId: "cert-champion-2", certificateType: "champion", version: 2, imageUrl: "https://blob.example/generated.png" } });
    // A stored same-key result is returned by the service and no third version is appended.
    const second = await regenerateCertificate(input, deps);
    expect(second.status).toBe("already_applied");
    expect(tx.appendVersion).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed member retryable without rolling back successful or published records", async () => {
    const { deps } = studioDependencies({ generate: vi.fn().mockRejectedValue(new Error("render failed")) });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType: "mvp", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" }, deps)).resolves.toMatchObject({ status: "failed", code: "generation_failed" });
  });
  it("rejects an asset role that does not belong to the selected certificate kind", async () => {
    const { tx, deps } = studioDependencies();
    tx.resolveAsset = vi.fn().mockResolvedValue({ url: "/character-art/hero.png", detectedMimeType: "image/png", bytes: 100, width: 100, height: 100, storageOwnershipVerified: true });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType: "mvp", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111", assetId: "asset-1", placement: { assetKind: "team_logo_hero", x: 320, y: 700, width: 100, height: 100 } }, deps)).resolves.toEqual({ status: "blocked", code: "invalid_asset" });
    expect(tx.appendVersion).not.toHaveBeenCalled();
  });

  it("requires exactly one ready version of all seven types and publishes atomically", async () => {
    const { tx, deps } = studioDependencies();
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}-1` }));
    await expect(publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "22222222-2222-4222-8222-222222222222", selection }, deps)).resolves.toMatchObject({ status: "published", publicationVersion: 3 });
    expect(tx.commitPublication).toHaveBeenCalledTimes(1);

    vi.mocked(tx.loadCertificates).mockResolvedValue(vi.mocked(tx.loadCertificates).mock.results[0]?.value ? (await vi.mocked(tx.loadCertificates).mock.results[0].value).slice(0, 6) : []);
    await expect(publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "33333333-3333-4333-8333-333333333333", selection }, deps)).resolves.toEqual({ status: "blocked", code: "set_not_ready" });
  });

  it.each([
    [{ authorize: vi.fn().mockResolvedValue(null) }, { status: "blocked", code: "unauthorized" }],
    [{ loadCompletion: vi.fn().mockResolvedValue(null) }, { status: "integration_required" }],
    [{ loadCompletion: vi.fn().mockResolvedValue({ status: "completed", version: 5, certificateRevision: 2 }) }, { status: "conflict", code: "stale_version", version: 5 }],
    [{ loadCompletion: vi.fn().mockResolvedValue({ status: "completed", version: 4, certificateRevision: 3 }) }, { status: "conflict", code: "stale_certificate_revision", version: 3 }],
  ] as const)("blocks unauthorized, integration-pending, and optimistic conflicts", async (txOverride, expected) => {
    const { tx, deps } = studioDependencies();
    Object.assign(tx, txOverride);
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}-1` }));
    await expect(publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "22222222-2222-4222-8222-222222222222", selection }, deps)).resolves.toEqual(expected);
  });

  it("preserves old URL and QR history while superseding prior versions", async () => {
    const { tx, deps } = studioDependencies();
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}-1` }));
    await publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "22222222-2222-4222-8222-222222222222", selection }, deps);
    expect(tx.commitPublication).toHaveBeenCalledWith(expect.objectContaining({ preserveVerificationHistory: true }));
  });

  it("rejects malformed IDs, duplicate types, and keys before opening a transaction", async () => {
    const { deps } = studioDependencies();
    await expect(publishCertificateSet({ eventId: "", expectedVersion: -1, expectedCertificateRevision: 0, idempotencyKey: "bad", selection: [] }, deps)).resolves.toEqual({ status: "blocked", code: "invalid_input" });
    expect(deps.transaction).not.toHaveBeenCalled();
  });
});
