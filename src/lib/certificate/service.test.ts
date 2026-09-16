import { describe, expect, it, vi } from "vitest";

const { matchFindFirst } = vi.hoisted(() => ({ matchFindFirst: vi.fn() }));

vi.mock("@/lib/platform/db", () => ({ prisma: { match: { findFirst: matchFindFirst } } }));

import {
  CERTIFICATE_ASSET_LIMITS,
  createMiracleV3GenerationAdapter,
  generateCertificateForEvent,
  generateCertificateIfFinal,
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
    findV3Completion: vi.fn().mockResolvedValue(false),
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
  it("preserves dependency-only legacy generation for non-V3 events", async () => {
    const dependencies = createDependencies();

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "generated",
      imageUrl: "/uploads/certificates/mfl-s2.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
  });

  it("rejects dependency-only V3 handoff when the route locale is missing", async () => {
    const dependencies = createDependencies({
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", dependencies),
    ).rejects.toThrow("Route locale is required to build the Certificate Studio URL");
  });

  it("returns not-ready when there is no completed Final", async () => {
    const dependencies = createDependencies({
      findCompletedFinal: vi.fn().mockResolvedValue(null),
    });

    await expect(
      generateCertificateForEvent("event-mfl-s2", "en", dependencies),
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
      generateCertificateForEvent("event-mfl-s2", "en", dependencies),
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
      generateCertificateForEvent("event-mfl-s2", "en", dependencies),
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
      generateCertificateForEvent("event-mfl-s2", "en", dependencies),
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
      generateCertificateForEvent("event-mfl-s2", "en", dependencies),
    ).resolves.toEqual({
      status: "generated",
      imageUrl: "/uploads/certificates/generated.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
    expect(generateCertificate).toHaveBeenCalledWith("event-mfl-s2", "team-winner");
  });

  it("routes a completed Completion V3 event to Certificate Studio without invoking the legacy generator", async () => {
    const dependencies = Object.assign(createDependencies(), {
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(generateCertificateForEvent("event-mfl-s2", "en", dependencies)).resolves.toEqual({
      status: "studio-required",
      studioHref: "/en/organizer/events/event-mfl-s2/certificates",
    });
    expect(dependencies.generateCertificate).not.toHaveBeenCalled();
  });

  it("keeps the legacy adapter link locale-aware when it hands off to Certificate Studio", async () => {
    const dependencies = Object.assign(createDependencies(), {
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(generateCertificateForEvent("event-mfl-s2", dependencies, "id")).resolves.toEqual({
      status: "studio-required",
      studioHref: "/id/organizer/events/event-mfl-s2/certificates",
    });
  });

  it("uses the explicitly supplied route locale for the preferred API", async () => {
    const dependencies = Object.assign(createDependencies(), {
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(generateCertificateForEvent("event-mfl-s2", "id", dependencies)).resolves.toEqual({
      status: "studio-required",
      studioHref: "/id/organizer/events/event-mfl-s2/certificates",
    });
  });

  it("passes the explicit Indonesian locale from the final trigger to Certificate Studio", async () => {
    matchFindFirst.mockResolvedValue({ id: "match-final" });
    const dependencies = Object.assign(createDependencies(), {
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(
      generateCertificateIfFinal("match-final", "event-mfl-s2", "id", dependencies),
    ).resolves.toEqual({
      status: "studio-required",
      studioHref: "/id/organizer/events/event-mfl-s2/certificates",
    });
  });

  it("preserves dependency-injected two-arg legacy final triggers for non-V3 events", async () => {
    matchFindFirst.mockResolvedValue({ id: "match-final" });
    const dependencies = createDependencies();

    await expect(
      generateCertificateIfFinal("match-final", "event-mfl-s2", dependencies),
    ).resolves.toEqual({
      status: "generated",
      imageUrl: "/uploads/certificates/mfl-s2.png",
      matchId: "match-final",
      winnerTeamId: "team-winner",
    });
  });

  it("rejects a V3 final trigger when the route locale is omitted", async () => {
    matchFindFirst.mockResolvedValue({ id: "match-final" });
    const dependencies = createDependencies({
      findV3Completion: vi.fn().mockResolvedValue(true),
    });

    await expect(
      generateCertificateIfFinal("match-final", "event-mfl-s2", undefined, dependencies),
    ).rejects.toThrow("Route locale is required to build the Certificate Studio URL");
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
  const asset = {
    url: "/certificate-assets/asset.png", detectedMimeType: "image/png" as const, bytes: 1024,
    width: 512, height: 512, storageOwnershipVerified: true, storageProvider: "local" as const,
    storageKey: "certificate-assets/asset.png", contentSha256: "a".repeat(64), purpose: "certificate_character_art" as const,
  };

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
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageKey: "certificate-assets/../asset.png", url: "/certificate-assets/../asset.png" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageKey: "certificate-assets//asset.png", url: "/certificate-assets//asset.png" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageKey: "certificate-assets/./asset.png", url: "/certificate-assets/./asset.png" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageProvider: "vercel_blob", url: "https://user:secret@store.public.blob.vercel-storage.com/certificate-assets/asset.png" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageProvider: "vercel_blob", url: "https://store.public.blob.vercel-storage.com/certificate-assets/asset.png?download=1" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageProvider: "vercel_blob", url: "https://store.public.blob.vercel-storage.com/certificate-assets/asset.png#fragment" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageKey: "certificate-assets/%2e%2e/asset.png", url: "/certificate-assets/%2e%2e/asset.png" }, "unsafe_asset"],
    [{ assetKind: "character_art", x: 320, y: 700, width: 300, height: 500 }, { ...asset, storageKey: "certificate-assets\\asset.png", url: "/certificate-assets\\asset.png" }, "unsafe_asset"],
  ] as const)("rejects invalid placement or asset metadata", (placement, candidate, code) => {
    expect(validateCertificateAssetPlacement(placement, candidate)).toEqual({ success: false, code });
  });
});

describe("durable v3 generation adapter", () => {
  it("passes a create-only path, returns idempotent ready records, and recovers stale claims through the repository", async () => {
    const claim = vi.fn()
      .mockResolvedValueOnce({ status: "claimed", attemptId: "attempt-1" })
      .mockResolvedValueOnce({ status: "ready", imageUrl: "https://store.public.blob.vercel-storage.com/certificates/ready.png" });
    const put = vi.fn().mockResolvedValue("https://store.public.blob.vercel-storage.com/certificates/event-1/champion/v1/new.png");
    const repo = { claim, recordSuccess: vi.fn(), recordFailure: vi.fn() };
    const adapter = createMiracleV3GenerationAdapter(repo, { put }, { idempotencyKey: "11111111-1111-4111-8111-111111111111", now: new Date("2026-09-12T00:00:00Z") });

    expect(await adapter.claimGeneration(data("champion"))).toEqual({ status: "claimed", attemptId: "attempt-1" });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ staleBefore: new Date("2026-09-11T23:55:00.000Z") }));
    expect(await adapter.storeArtifact({ filename: "certificates/event-1/champion/v1/a.png", png: Buffer.from("png"), overwrite: false })).toBe("https://store.public.blob.vercel-storage.com/certificates/event-1/champion/v1/new.png");
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ overwrite: false }));
    expect(await adapter.claimGeneration(data("champion"))).toEqual({ status: "ready", imageUrl: "https://store.public.blob.vercel-storage.com/certificates/ready.png" });
  });
  it.each([
    "https://assets.example/certificates/event-1/champion/v1/a.png",
    "https://store.public.blob.vercel-storage.com/certificates/event-1/champion/v1/a.png?token=secret",
    "https://store.public.blob.vercel-storage.com:444/certificates/event-1/champion/v1/a.png",
    "https://store.public.blob.vercel-storage.com/certificates/event-1/champion/v1/a.png#download",
  ])("rejects generated artifacts outside strict owned storage provenance: %s", async (unsafeUrl) => {
    const adapter = createMiracleV3GenerationAdapter({
      claim: vi.fn(), recordSuccess: vi.fn(), recordFailure: vi.fn(),
    }, { put: vi.fn().mockResolvedValue(unsafeUrl) }, { idempotencyKey: crypto.randomUUID(), now: new Date() });
    await expect(adapter.storeArtifact({ filename: "certificates/event-1/champion/v1/a.png", png: Buffer.from("png"), overwrite: false }))
      .rejects.toThrow("unsafe URL");
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

  it("does not rewrite a stored artifact as failed when success persistence is transiently unavailable", async () => {
    const persistenceError = new Error("database unavailable");
    const recordFailure = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createMiracleV3GenerationAdapter({
      claim: vi.fn().mockResolvedValue({ status: "claimed", attemptId: "attempt-1" }),
      recordSuccess: vi.fn().mockRejectedValue(persistenceError), recordFailure,
    }, { put: vi.fn().mockResolvedValue("/certificates/generated.png") }, { idempotencyKey: crypto.randomUUID(), now: new Date() });
    await expect(generateMiracleV3Certificate({ data: data("mvp") }, { ...adapter, render: vi.fn().mockResolvedValue(Buffer.from("png")) })).rejects.toMatchObject({ name: "CertificateArtifactFinalizationError", imageUrl: "/certificates/generated.png" });
    expect(recordFailure).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Certificate success persistence failed", expect.any(Object));
  });
});

function studioDependencies(overrides: Partial<CertificateStudioDependencies> = {}) {
  const history = MIRACLE_V3_CERTIFICATE_TYPES.map((type) => ({
    id: `cert-${type}-1`, eventId: "event-1", certificateType: type, recipientId: `recipient-${type}`,
    completionId: "completion-1", completionVersion: 4, templateVersion: "miracle-v3",
    version: 1, status: "ready" as const, imageUrl: `https://store.public.blob.vercel-storage.com/certificates/${type}/v1.png`, publishedUrl: null,
    verificationCode: `verify-${type}-1`, publishedAt: null, supersededByVersion: null,
  }));
  const tx: CertificateStudioTransaction = {
    authorize: vi.fn().mockResolvedValue({ id: "organizer-1", role: "organizer" }),
    loadCompletion: vi.fn().mockResolvedValue({ id: "completion-1", status: "completed", version: 4, certificateRevision: 2, recipients: Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `recipient-${type}`])) }),
    findMutation: vi.fn().mockResolvedValue(null),
    resolveAsset: vi.fn().mockResolvedValue({ url: "/certificate-assets/team.png", detectedMimeType: "image/png", bytes: 1024, width: 512, height: 512, storageOwnershipVerified: true, storageProvider: "local", storageKey: "certificate-assets/team.png", contentSha256: "a".repeat(64), purpose: "certificate_team_logo" }),
    appendVersion: vi.fn().mockImplementation(async ({ certificateType }) => ({ record: { ...history.find((row) => row.certificateType === certificateType)!, id: `cert-${certificateType}-2`, version: 2, status: "generating" }, data: data(certificateType, 2), leaseToken: "lease-new" })),
    leaseStaleVersion: vi.fn(),
    finalizeMutation: vi.fn().mockResolvedValue({ status: "finalized" }),
    loadCertificates: vi.fn().mockResolvedValue(history),
    commitPublication: vi.fn().mockResolvedValue({ publicationVersion: 3, publishedAt: "2026-09-12T04:00:00.000Z" }),
  };
  return { tx, deps: { transaction: vi.fn(async (_eventId, work) => work(tx)), generate: vi.fn().mockResolvedValue("https://store.public.blob.vercel-storage.com/certificates/generated.png"), ...overrides } as CertificateStudioDependencies };
}

describe("certificate regeneration and atomic publication", () => {

const teamLogoRequest = { assetId: "team-logo", placement: { assetKind: "team_logo_hero" as const, x: 360, y: 748, width: 560, height: 540 } };
const awardBadgeRequest = { assetId: "team-badge", placement: { assetKind: "team_logo_badge" as const, x: 80, y: 1052, width: 160, height: 160 } };

const generationInput = (certificateType: "champion" | "mvp", idempotencyKey: string) => ({ eventId: "event-1", certificateType, expectedVersion: 4,
  idempotencyKey, assets: [certificateType === "champion" ? teamLogoRequest : awardBadgeRequest] });

  it("appends a version without mutating published history and retries idempotently", async () => {
    const { tx, deps } = studioDependencies();
    const input = generationInput("champion", "11111111-1111-4111-8111-111111111111");
    await expect(regenerateCertificate(input, deps)).resolves.toMatchObject({ status: "generated", version: 2 });
    expect(tx.appendVersion).toHaveBeenCalledWith(expect.objectContaining({ certificateType: "champion" }));
    expect(deps.generate).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }), expect.anything());

    vi.mocked(tx.findMutation).mockResolvedValue({ status: "terminal", fingerprint: JSON.stringify({ action: "regenerate", certificateType: "champion", expectedVersion: 4, assets: [teamLogoRequest] }), actorId: "organizer-1", result: { status: "generated", certificateId: "cert-champion-2", certificateType: "champion", version: 2, imageUrl: "https://store.public.blob.vercel-storage.com/certificates/generated.png" } });
    // A stored same-key result is returned by the service and no third version is appended.
    const second = await regenerateCertificate(input, deps);
    expect(second.status).toBe("already_applied");
    expect(tx.appendVersion).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed member retryable without rolling back successful or published records", async () => {
    const { deps } = studioDependencies({ generate: vi.fn().mockRejectedValue(new Error("render failed")) });
    await expect(regenerateCertificate(generationInput("mvp", "11111111-1111-4111-8111-111111111111"), deps)).resolves.toMatchObject({ status: "failed", code: "generation_failed" });
  });
  it.each([
    ["champion", []],
    ["mvp", [{ assetId: "hero", placement: { assetKind: "character_art", x: 360, y: 748, width: 300, height: 500 } }]],
  ] as const)("requires a trusted team logo for %s certificate generation", async (certificateType, assets) => {
    const { tx, deps } = studioDependencies();
    if (assets.length) vi.mocked(tx.resolveAsset!).mockResolvedValue({ url: "/certificate-assets/hero.png", detectedMimeType: "image/png", bytes: 1024, width: 512, height: 512, storageOwnershipVerified: true, storageProvider: "local", storageKey: "certificate-assets/hero.png", contentSha256: "b".repeat(64), purpose: "certificate_character_art" });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType, expectedVersion: 4, idempotencyKey: crypto.randomUUID(), assets: [...assets] }, deps)).resolves.toEqual({ status: "blocked", code: "required_logo_unavailable" });
    expect(tx.appendVersion).not.toHaveBeenCalled();
  });

  it("leaves a successful artifact resumable when terminal success persistence is transiently unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tx, deps } = studioDependencies();
    vi.mocked(tx.finalizeMutation).mockRejectedValue(new Error("database unavailable"));
    await expect(regenerateCertificate(generationInput("champion", crypto.randomUUID()), deps)).resolves.toMatchObject({ status: "generation_in_progress", certificateType: "champion", version: 2 });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(tx.finalizeMutation).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Certificate success mutation persistence failed", expect.any(Object));
  });

  it("preserves a primary generation failure when terminal failure persistence also fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tx, deps } = studioDependencies({ generate: vi.fn().mockRejectedValue(new Error("renderer failed")) });

    vi.mocked(tx.finalizeMutation).mockRejectedValue(new Error("database unavailable"));
    await expect(regenerateCertificate(generationInput("mvp", crypto.randomUUID()), deps)).resolves.toMatchObject({ status: "generation_in_progress", certificateType: "mvp", version: 2 });
    expect(log).toHaveBeenCalledWith("Certificate failure mutation persistence failed", expect.any(Object));
  });
  it("does not report a stale worker failure after its mutation lease is lost", async () => {
    const { tx, deps } = studioDependencies({ generate: vi.fn().mockRejectedValue(new Error("stale renderer failed")) });
    vi.mocked(tx.finalizeMutation).mockResolvedValue({ status: "lease_lost" });
    await expect(regenerateCertificate(generationInput("champion", crypto.randomUUID()), deps)).resolves.toMatchObject({
      status: "generation_in_progress", certificateType: "champion", version: 2,
    });
  });

  it("returns the immutable winner when a stale worker loses its lease to a terminal generation", async () => {
    const { tx, deps } = studioDependencies({ generate: vi.fn().mockRejectedValue(new Error("stale renderer failed")) });
    const winner = { status: "generated", certificateId: "cert-champion-2", certificateType: "champion", version: 2, imageUrl: "/certificates/winner.png" } as const;
    vi.mocked(tx.finalizeMutation).mockResolvedValue({ status: "lease_lost", result: winner });
    await expect(regenerateCertificate(generationInput("champion", crypto.randomUUID()), deps)).resolves.toEqual({
      status: "already_applied", result: winner,
    });
  });

  it("rejects an asset role that does not belong to the selected certificate kind", async () => {
    const { tx, deps } = studioDependencies();
    tx.resolveAsset = vi.fn().mockResolvedValue({ url: "/certificate-assets/hero.png", detectedMimeType: "image/png", bytes: 100, width: 100, height: 100, storageOwnershipVerified: true, storageProvider: "local", storageKey: "certificate-assets/hero.png", contentSha256: "a".repeat(64), purpose: "certificate_character_art" });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType: "mvp", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111", assetId: "asset-1", placement: { assetKind: "team_logo_hero", x: 320, y: 700, width: 100, height: 100 } }, deps)).resolves.toEqual({ status: "blocked", code: "invalid_asset" });
    expect(tx.appendVersion).not.toHaveBeenCalled();
  });

  it("canonicalizes reverse-ordered hero and team-badge assets for payload and fingerprint", async () => {
    const { tx, deps } = studioDependencies();
    const character = { url: "/certificate-assets/hero.png", detectedMimeType: "image/png", bytes: 100, width: 512, height: 512, storageOwnershipVerified: true, storageProvider: "local" as const, storageKey: "certificate-assets/hero.png", contentSha256: "a".repeat(64), purpose: "certificate_character_art" as const };
    const badge = { ...character, url: "/certificate-assets/badge.png", storageKey: "certificate-assets/badge.png", contentSha256: "b".repeat(64), purpose: "certificate_team_logo" as const };
    tx.resolveAsset = vi.fn().mockImplementation(async (id) => id === "hero" ? character : badge);
    const heroRequest = { assetId: "hero", placement: { assetKind: "character_art" as const, x: 320, y: 700, width: 300, height: 500 } };
    const badgeRequest = { assetId: "badge", placement: { assetKind: "team_logo_badge" as const, x: 70, y: 1050, width: 150, height: 150 } };
    const assets = [badgeRequest, heroRequest];
    await regenerateCertificate({ eventId: "event-1", certificateType: "mvp", expectedVersion: 4, idempotencyKey: "55555555-5555-4555-8555-555555555555", assets }, deps);
    expect(tx.appendVersion).toHaveBeenCalledWith(expect.objectContaining({ assets: [
      expect.objectContaining({ placement: expect.objectContaining({ assetKind: "character_art" }), asset: character }),
      expect.objectContaining({ placement: expect.objectContaining({ assetKind: "team_logo_badge" }), asset: badge }),
    ], fingerprint: JSON.stringify({ action: "regenerate", certificateType: "mvp", expectedVersion: 4, assets: [heroRequest, badgeRequest] }) }));
  });
  it.each([
    "https://assets.example/certificates/champion.png",
    "https://store.public.blob.vercel-storage.com/certificates/champion.png?token=secret",
    "https://store.public.blob.vercel-storage.com/certificates/champion.png#download",
  ])("blocks publication when a selected artifact URL lacks owned-storage provenance: %s", async (unsafeUrl) => {
    const { tx, deps } = studioDependencies();
    const rows = await tx.loadCertificates([]);
    vi.mocked(tx.loadCertificates).mockResolvedValue(rows.map((row) => row.certificateType === "champion"
      ? { ...row, imageUrl: unsafeUrl } : row));
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}-1` }));
    await expect(publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2,
      idempotencyKey: crypto.randomUUID(), selection }, deps)).resolves.toEqual({ status: "blocked", code: "set_not_ready" });
    expect(tx.commitPublication).not.toHaveBeenCalled();
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
    [{ loadCompletion: vi.fn().mockResolvedValue({ id: "completion-1", status: "completed", version: 5, certificateRevision: 2, recipients: {} }) }, { status: "conflict", code: "stale_version", version: 5 }],
    [{ loadCompletion: vi.fn().mockResolvedValue({ id: "completion-1", status: "completed", version: 4, certificateRevision: 3, recipients: {} }) }, { status: "conflict", code: "stale_certificate_revision", version: 3 }],
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

  it.each([
    ["legacy template", { templateVersion: "legacy-v1" }],
    ["another completion snapshot", { completionId: "completion-old" }],
    ["another completion version", { completionVersion: 3 }],
    ["another recipient", { recipientId: "recipient-tampered" }],
  ])("rejects %s even when all seven rows otherwise look ready", async (_label, mutation) => {
    const { tx, deps } = studioDependencies();
    const rows = await tx.loadCertificates([]);
    vi.mocked(tx.loadCertificates).mockResolvedValue(rows.map((row) => row.certificateType === "champion" ? { ...row, ...mutation } : row));
    const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, certificateId: `cert-${certificateType}-1` }));
    await expect(publishCertificateSet({ eventId: "event-1", expectedVersion: 4, expectedCertificateRevision: 2, idempotencyKey: "44444444-4444-4444-8444-444444444444", selection }, deps)).resolves.toEqual({ status: "blocked", code: "set_not_ready" });
    expect(tx.commitPublication).not.toHaveBeenCalled();
  });

  it("resumes the exact stale same-key generation record instead of appending a new version", async () => {
    const { tx, deps } = studioDependencies();
    vi.mocked(tx.findMutation).mockResolvedValue({ status: "in_progress", fingerprint: JSON.stringify({ action: "regenerate", certificateType: "champion", expectedVersion: 4, assets: [] }), actorId: "organizer-1", stale: true, updatedAt: "2026-09-11T23:00:00.000Z", certificateId: "cert-champion-2", certificateType: "champion", version: 2 });
    tx.leaseStaleVersion = vi.fn().mockResolvedValue({ record: { ...(await tx.loadCertificates([]))[0], version: 2 }, data: data("champion", 2), leaseToken: "lease-resumed" });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType: "champion", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" }, deps)).resolves.toMatchObject({ status: "generated", version: 2 });
    expect(tx.leaseStaleVersion).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "2026-09-11T23:00:00.000Z", expect.any(String));
    expect(tx.appendVersion).not.toHaveBeenCalled();
  });

  it("reports a live same-key attempt as in progress without false success", async () => {
    const { tx, deps } = studioDependencies();
    vi.mocked(tx.findMutation).mockResolvedValue({ status: "in_progress", fingerprint: JSON.stringify({ action: "regenerate", certificateType: "champion", expectedVersion: 4, assets: [] }), actorId: "organizer-1", stale: false, updatedAt: "2026-09-12T00:00:00.000Z", certificateId: "cert-champion-2", certificateType: "champion", version: 2 });
    await expect(regenerateCertificate({ eventId: "event-1", certificateType: "champion", expectedVersion: 4, idempotencyKey: "11111111-1111-4111-8111-111111111111" }, deps)).resolves.toEqual({ status: "generation_in_progress", certificateId: "cert-champion-2", certificateType: "champion", version: 2 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs, duplicate types, and keys before opening a transaction", async () => {
    const { deps } = studioDependencies();
    await expect(publishCertificateSet({ eventId: "", expectedVersion: -1, expectedCertificateRevision: 0, idempotencyKey: "bad", selection: [] }, deps)).resolves.toEqual({ status: "blocked", code: "invalid_input" });
    expect(deps.transaction).not.toHaveBeenCalled();
  });
});
