import { randomUUID } from "node:crypto";
import { CertificateArtifactFinalizationError, generateCertificate } from "@/lib/certificate/generate";
import type { MiracleV3GenerationDependencies, MiracleV3CertificateIdentity } from "@/lib/certificate/generate";
import { MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES, type MiracleV3CertificateData, type MiracleV3CertificateType } from "@/lib/certificate/templates/miracle-v3";
import { prisma } from "@/lib/platform/db";
import { getCertificateByEvent } from "@/lib/platform/repository";
import { z } from "zod";

export type CertificateNotReadyReason =
  | "final-not-completed"
  | "winner-missing"
  | "winner-not-in-event";

export interface CertificateFinalMatch {
  id: string;
  winnerTeamId: string | null;
}

export interface CertificateWinnerTeam {
  id: string;
  name: string;
  tag: string | null;
}

export interface CertificateRecord {
  imageUrl: string;
}

export interface CertificateGenerationDependencies {
  findCompletedFinal: (
    eventId: string,
  ) => Promise<CertificateFinalMatch | null>;
  findWinnerTeamForEvent: (
    eventId: string,
    winnerTeamId: string,
  ) => Promise<CertificateWinnerTeam | null>;
  findCertificateForEvent: (
    eventId: string,
  ) => Promise<CertificateRecord | null>;
  generateCertificate: (
    eventId: string,
    winnerTeamId: string,
  ) => Promise<string>;
}

export type CertificateGenerationResult =
  | {
      status: "generated";
      imageUrl: string;
      matchId: string;
      winnerTeamId: string;
    }
  | {
      status: "already-exists";
      imageUrl: string;
      matchId: string;
      winnerTeamId: string;
    }
  | {
      status: "not-ready";
      reason: "final-not-completed";
    }
  | {
      status: "not-ready";
      reason: "winner-missing";
      matchId: string;
    }
  | {
      status: "not-ready";
      reason: "winner-not-in-event";
      matchId: string;
      winnerTeamId: string;
    };

const defaultDependencies: CertificateGenerationDependencies = {
  findCompletedFinal: async (eventId) =>
    prisma.match.findFirst({
      where: {
        eventId,
        roundLabel: "Final",
        status: "Completed",
      },
      orderBy: { round: "desc" },
      select: {
        id: true,
        winnerTeamId: true,
      },
    }),
  findWinnerTeamForEvent: async (eventId, winnerTeamId) =>
    prisma.team.findFirst({
      where: {
        id: winnerTeamId,
        eventId,
      },
    }),
  findCertificateForEvent: getCertificateByEvent,
  generateCertificate: async (eventId, winnerTeamId) =>
    generateCertificate(eventId, winnerTeamId),
};

/**
 * Resolve the completed Final winner on the server and generate its certificate.
 * This is the single entry point used by automatic generation and manual retries.
 */
export async function generateCertificateForEvent(
  eventId: string,
  dependencies: CertificateGenerationDependencies = defaultDependencies,
): Promise<CertificateGenerationResult> {
  const finalMatch = await dependencies.findCompletedFinal(eventId);

  if (!finalMatch) {
    return {
      status: "not-ready",
      reason: "final-not-completed",
    };
  }

  const winnerTeamId = finalMatch.winnerTeamId;
  if (!winnerTeamId) {
    return {
      status: "not-ready",
      reason: "winner-missing",
      matchId: finalMatch.id,
    };
  }

  const winnerTeam = await dependencies.findWinnerTeamForEvent(
    eventId,
    winnerTeamId,
  );
  if (!winnerTeam) {
    return {
      status: "not-ready",
      reason: "winner-not-in-event",
      matchId: finalMatch.id,
      winnerTeamId,
    };
  }

  const existingCertificate =
    await dependencies.findCertificateForEvent(eventId);
  if (existingCertificate) {
    return {
      status: "already-exists",
      imageUrl: existingCertificate.imageUrl,
      matchId: finalMatch.id,
      winnerTeamId,
    };
  }

  const imageUrl = await dependencies.generateCertificate(
    eventId,
    winnerTeam.id,
  );
  return {
    status: "generated",
    imageUrl,
    matchId: finalMatch.id,
    winnerTeamId,
  };
}

/**
 * Automatic trigger guard: only a completed Final with a winner may start the
 * event-level service. Manual retries call generateCertificateForEvent directly.
 */
export async function generateCertificateIfFinal(
  matchId: string,
  eventId: string,
): Promise<CertificateGenerationResult> {
  const triggerMatch = await prisma.match.findFirst({
    where: {
      id: matchId,
      eventId,
      roundLabel: "Final",
      status: "Completed",
      winnerTeamId: { not: null },
    },
    select: { id: true },
  });

  if (!triggerMatch) {
    return {
      status: "not-ready",
      reason: "final-not-completed",
    };
  }

  return generateCertificateForEvent(eventId);
}

export const CERTIFICATE_ASSET_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxDimension: 4096,
  minDimension: 32,
});

export type CertificateAssetKind = "team_logo_hero" | "team_logo_badge" | "character_art";
export interface CertificateAssetPlacement {
  readonly assetKind: CertificateAssetKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface TrustedCertificateAsset {
  readonly url: string;
  readonly detectedMimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly storageOwnershipVerified: boolean;
  readonly storageProvider: "vercel_blob" | "local";
  readonly storageKey: string;
  readonly contentSha256: string;
  readonly purpose: "certificate_team_logo" | "certificate_character_art";
}

function isSafeOwnedAssetUrl(value: string): boolean {
  if (typeof value !== "string" || /[\u0000-\u0020\\]/.test(value)) return false;
  const safeCertificatePath = (pathname: string) => {
    if (!pathname.startsWith("/certificates/") || /[\\%]/.test(pathname)) return false;
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return false; }
    const segments = decoded.split("/");
    return decoded === pathname && segments[0] === "" && segments[1] === "certificates" && segments.length >= 3
      && segments.slice(2).every((segment) => Boolean(segment) && segment !== "." && segment !== ".."
        && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment));
  };
  if (value.startsWith("/")) {
    return !value.startsWith("//") && safeCertificatePath(value);
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && url.hostname.endsWith(".public.blob.vercel-storage.com") && safeCertificatePath(url.pathname);
  } catch { return false; }
}


function hasTrustedStorageProvenance(asset: TrustedCertificateAsset): boolean {
  if (!/^[a-f0-9]{64}$/.test(asset.contentSha256) || /[\\%]/.test(asset.storageKey)) return false;
  let decodedKey: string;
  try { decodedKey = decodeURIComponent(asset.storageKey); }
  catch { return false; }
  const segments = decodedKey.split("/");
  if (decodedKey !== asset.storageKey || segments[0] !== "certificate-assets" || segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) return false;
  if (asset.storageProvider === "local") return asset.url === "/" + asset.storageKey;
  if (asset.storageProvider !== "vercel_blob") return false;
  try {
    const url = new URL(asset.url);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && !asset.url.includes("\\") && url.hostname.endsWith(".public.blob.vercel-storage.com") && url.pathname === "/" + asset.storageKey;
  } catch { return false; }
}

export type AssetPlacementValidationResult = { readonly success: true }
  | { readonly success: false; readonly code: "invalid_placement" | "out_of_zone" | "unsafe_asset" | "unsupported_type" | "asset_too_large" | "invalid_dimensions" };

/** Validate editor coordinates against the same immutable pixel contract used by Task 5. */
export function validateCertificateAssetPlacement(
  placement: CertificateAssetPlacement,
  asset: TrustedCertificateAsset,
): AssetPlacementValidationResult {
  const numbers = [placement.x, placement.y, placement.width, placement.height];
  if (!numbers.every(Number.isFinite) || placement.width <= 0 || placement.height <= 0) return { success: false, code: "invalid_placement" };
  if (!asset.storageOwnershipVerified || !hasTrustedStorageProvenance(asset)) return { success: false, code: "unsafe_asset" };



  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.detectedMimeType)) return { success: false, code: "unsupported_type" };
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > CERTIFICATE_ASSET_LIMITS.maxBytes) return { success: false, code: "asset_too_large" };
  if (![asset.width, asset.height].every((value) => Number.isSafeInteger(value))
    || asset.width < CERTIFICATE_ASSET_LIMITS.minDimension || asset.height < CERTIFICATE_ASSET_LIMITS.minDimension
    || asset.width > CERTIFICATE_ASSET_LIMITS.maxDimension || asset.height > CERTIFICATE_ASSET_LIMITS.maxDimension) {
    return { success: false, code: "invalid_dimensions" };
  }
  const zone = placement.assetKind === "team_logo_badge" ? MIRACLE_V3_SAFE_ZONES.secondaryBadge : MIRACLE_V3_SAFE_ZONES.hero;
  const epsilon = 0.0001;
  const within = placement.x + epsilon >= zone.x && placement.y + epsilon >= zone.y
    && placement.x + placement.width <= zone.x + zone.width + epsilon
    && placement.y + placement.height <= zone.y + zone.height + epsilon;
  return within ? { success: true } : { success: false, code: "out_of_zone" };
}

const idSchema = z.string().trim().min(1).max(200);
const idempotencySchema = z.string().uuid();
const placementSchema = z.object({
  assetKind: z.enum(["team_logo_hero", "team_logo_badge", "character_art"]),
  x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive(),
}).strict();
const requestedAssetSchema = z.object({ assetId: idSchema, placement: placementSchema }).strict();
export const regenerateCertificateInputSchema = z.object({
  eventId: idSchema,
  certificateType: z.enum(MIRACLE_V3_CERTIFICATE_TYPES),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: idempotencySchema,
  assets: z.array(requestedAssetSchema).max(2).optional(),
  assetId: idSchema.optional(),
  placement: placementSchema.optional(),
}).strict().superRefine((input, context) => {
  const hasLegacyAsset = Boolean(input.assetId) || Boolean(input.placement);
  if (Boolean(input.assetId) !== Boolean(input.placement) || (hasLegacyAsset && input.assets)) {
    context.addIssue({ code: "custom", message: "Asset and placement must be supplied together" });
    return;
  }
  const placements = input.assets ?? (input.assetId && input.placement ? [{ assetId: input.assetId, placement: input.placement }] : []);
  if (new Set(placements.map((row) => row.placement.assetKind)).size !== placements.length) {
    context.addIssue({ code: "custom", message: "Each asset placement role must be unique" });
  }
});

export const publishCertificateSetInputSchema = z.object({
  eventId: idSchema,
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  expectedCertificateRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: idempotencySchema,
  selection: z.array(z.object({ certificateType: z.enum(MIRACLE_V3_CERTIFICATE_TYPES), certificateId: idSchema }).strict()).length(7),
}).strict().refine((input) => new Set(input.selection.map((row) => row.certificateType)).size === 7
  && MIRACLE_V3_CERTIFICATE_TYPES.every((type) => input.selection.some((row) => row.certificateType === type)), { message: "Exactly one certificate of every type is required" });

export interface CertificateStudioActor { readonly id: string; readonly role: "organizer" | "platform_admin" | "admin" }
export interface CertificateStudioCompletion {
  readonly id: string; readonly status: "completed" | "reopened" | "editable";
  readonly version: number; readonly certificateRevision: number;
  readonly recipients: Readonly<Record<MiracleV3CertificateType, string>>;
}
export interface CertificateStudioRecord {
  readonly id: string; readonly eventId: string; readonly certificateType: MiracleV3CertificateType; readonly recipientId: string;
  readonly completionId: string | null; readonly completionVersion: number | null; readonly templateVersion: string;
  readonly version: number; readonly status: "draft" | "generating" | "failed" | "ready" | "published" | "superseded";
  readonly imageUrl: string; readonly publishedUrl: string | null; readonly verificationCode: string;
  readonly publishedAt: string | null; readonly supersededByVersion: number | null;
}
export type RegenerateCertificateResult =
  | { readonly status: "generated"; readonly certificateId: string; readonly certificateType: MiracleV3CertificateType; readonly version: number; readonly imageUrl: string }
  | { readonly status: "failed"; readonly code: "generation_failed"; readonly certificateId: string; readonly certificateType: MiracleV3CertificateType; readonly version: number }
  | { readonly status: "generation_in_progress"; readonly certificateId: string; readonly certificateType: MiracleV3CertificateType; readonly version: number }
  | { readonly status: "already_applied"; readonly result: RegenerateCertificateResult }
  | { readonly status: "blocked"; readonly code: "invalid_input" | "unauthorized" | "password_change_required" | "forbidden" | "feature_disabled" | "completion_required" | "invalid_asset" | "required_logo_unavailable" }
  | { readonly status: "conflict"; readonly code: "stale_version" | "idempotency_key_reused"; readonly version: number }
  | { readonly status: "integration_required" };
export type PublishCertificateSetResult =
  | { readonly status: "published"; readonly publicationVersion: number; readonly publishedAt: string }
  | { readonly status: "already_applied"; readonly result: PublishCertificateSetResult }
  | { readonly status: "blocked"; readonly code: "invalid_input" | "unauthorized" | "password_change_required" | "forbidden" | "feature_disabled" | "completion_required" | "set_not_ready" }
  | { readonly status: "conflict"; readonly code: "stale_version" | "stale_certificate_revision" | "idempotency_key_reused"; readonly version: number }
  | { readonly status: "integration_required" };
export type CertificateStudioMutation =
  | { readonly status: "terminal"; readonly fingerprint: string; readonly actorId: string; readonly result: RegenerateCertificateResult | PublishCertificateSetResult }
  | { readonly status: "in_progress"; readonly fingerprint: string; readonly actorId: string; readonly stale: boolean; readonly updatedAt: string; readonly certificateId: string; readonly certificateType: MiracleV3CertificateType; readonly version: number };
export type CertificateMutationFinalization = { readonly status: "finalized" } | { readonly status: "lease_lost"; readonly result?: RegenerateCertificateResult };

export interface CertificateStudioTransaction {
  authorize(): Promise<CertificateStudioActor | null>;
  loadCompletion(): Promise<CertificateStudioCompletion | null>;
  findMutation(idempotencyKey: string): Promise<CertificateStudioMutation | null>;
  resolveAsset?(assetId: string): Promise<TrustedCertificateAsset | null>;
  appendVersion(input: { certificateType: MiracleV3CertificateType; idempotencyKey: string; fingerprint: string; actorId: string; leaseOwnerId: string; assets: readonly { assetId: string; placement: CertificateAssetPlacement; asset: TrustedCertificateAsset }[] }): Promise<{ record: CertificateStudioRecord; data: MiracleV3CertificateData; leaseToken: string }>;
  leaseStaleVersion(idempotencyKey: string, expectedUpdatedAt: string, leaseOwnerId: string): Promise<{ record: CertificateStudioRecord; data: MiracleV3CertificateData; leaseToken: string } | null>;
  finalizeMutation(idempotencyKey: string, leaseToken: string, result: RegenerateCertificateResult): Promise<CertificateMutationFinalization>;
  loadCertificates(ids: readonly string[]): Promise<readonly CertificateStudioRecord[]>;
  commitPublication(input: { selection: readonly { certificateType: MiracleV3CertificateType; certificateId: string }[]; actorId: string; idempotencyKey: string; fingerprint: string; expectedCertificateRevision: number; preserveVerificationHistory: true }): Promise<{ publicationVersion: number; publishedAt: string }>;
}
export interface CertificateStudioDependencies {
  transaction<T>(eventId: string, work: (tx: CertificateStudioTransaction) => Promise<T>): Promise<T>;
  generate(data: MiracleV3CertificateData, context: { readonly idempotencyKey: string }): Promise<string>;
}

function mutationFingerprint(value: object): string { return JSON.stringify(value); }

export async function regenerateCertificate(input: unknown, dependencies: CertificateStudioDependencies): Promise<RegenerateCertificateResult> {
  const parsed = regenerateCertificateInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const value = parsed.data;
  const requestedAssets = value.assets ?? (value.assetId && value.placement ? [{ assetId: value.assetId, placement: value.placement }] : []);
  const fingerprint = mutationFingerprint({ action: "regenerate", certificateType: value.certificateType, expectedVersion: value.expectedVersion, assets: requestedAssets });
  const leaseOwnerId = randomUUID();
  const prepared = await dependencies.transaction(value.eventId, async (tx) => {
    const actor = await tx.authorize();
    if (!actor) return { terminal: { status: "blocked", code: "unauthorized" } as RegenerateCertificateResult };
    const completion = await tx.loadCompletion();
    if (!completion) return { terminal: { status: "integration_required" } as RegenerateCertificateResult };
    const existing = await tx.findMutation(value.idempotencyKey);
    if (existing) {
      if (existing.actorId !== actor.id || existing.fingerprint !== fingerprint) return { terminal: { status: "conflict", code: "idempotency_key_reused", version: completion.version } as RegenerateCertificateResult };
      if (existing.status === "terminal") return { terminal: { status: "already_applied", result: existing.result as RegenerateCertificateResult } as RegenerateCertificateResult };
      if (!existing.stale) return { terminal: { status: "generation_in_progress", certificateId: existing.certificateId, certificateType: existing.certificateType, version: existing.version } as RegenerateCertificateResult };
      const leased = await tx.leaseStaleVersion(value.idempotencyKey, existing.updatedAt, leaseOwnerId);
      return leased ?? { terminal: { status: "generation_in_progress", certificateId: existing.certificateId,
        certificateType: existing.certificateType, version: existing.version } as RegenerateCertificateResult };
    }
    if (completion.version !== value.expectedVersion) return { terminal: { status: "conflict", code: "stale_version", version: completion.version } as RegenerateCertificateResult };
    if (completion.status !== "completed") return { terminal: { status: "blocked", code: "completion_required" } as RegenerateCertificateResult };
    const teamCertificate = ["champion", "runner_up", "third_place"].includes(value.certificateType);
    const allowedKinds: readonly CertificateAssetKind[] = teamCertificate ? ["team_logo_hero"] : ["character_art", "team_logo_badge"];
    const requiredLogoKind: CertificateAssetKind = teamCertificate ? "team_logo_hero" : "team_logo_badge";
    if (requestedAssets.some((row) => !allowedKinds.includes(row.placement.assetKind))) {
      return { terminal: { status: "blocked", code: "invalid_asset" } as RegenerateCertificateResult };
    }
    if (!requestedAssets.some((row) => row.placement.assetKind === requiredLogoKind)) {
      return { terminal: { status: "blocked", code: "required_logo_unavailable" } as RegenerateCertificateResult };
    }
    const assets = await Promise.all(requestedAssets.map(async (requested) => {
      const asset = await tx.resolveAsset?.(requested.assetId);
      const expectedPurpose = requested.placement.assetKind === "character_art" ? "certificate_character_art" : "certificate_team_logo";
      return asset && asset.purpose === expectedPurpose && validateCertificateAssetPlacement(requested.placement, asset).success
        ? { assetId: requested.assetId, placement: requested.placement, asset }
        : null;
    }));
    if (assets.some((asset, index) => !asset && requestedAssets[index].placement.assetKind === requiredLogoKind)) {
      return { terminal: { status: "blocked", code: "required_logo_unavailable" } as RegenerateCertificateResult };
    }
    if (assets.some((asset) => !asset)) return { terminal: { status: "blocked", code: "invalid_asset" } as RegenerateCertificateResult };
    return tx.appendVersion({ certificateType: value.certificateType, idempotencyKey: value.idempotencyKey, fingerprint, actorId: actor.id, leaseOwnerId,
      assets: assets as Array<{ assetId: string; placement: CertificateAssetPlacement; asset: TrustedCertificateAsset }> });
  });
  if ("terminal" in prepared) return prepared.terminal;
  let imageUrl: string;
  try { imageUrl = await dependencies.generate(prepared.data, { idempotencyKey: value.idempotencyKey }); }
  catch (error) {
    if (error instanceof CertificateArtifactFinalizationError) {
      return { status: "generation_in_progress", certificateId: prepared.record.id,
        certificateType: prepared.record.certificateType, version: prepared.record.version };
    }
    const result: RegenerateCertificateResult = { status: "failed", code: "generation_failed", certificateId: prepared.record.id, certificateType: prepared.record.certificateType, version: prepared.record.version };
    try {
      const finalized = await dependencies.transaction(value.eventId, async (tx) => tx.finalizeMutation(value.idempotencyKey, prepared.leaseToken, result));
      if (finalized.status === "finalized") return result;
      if (finalized.result) return { status: "already_applied", result: finalized.result };
      return { status: "generation_in_progress", certificateId: prepared.record.id,
        certificateType: prepared.record.certificateType, version: prepared.record.version };
    }
    catch (persistenceError) {
      console.error("Certificate failure mutation persistence failed", { certificateId: prepared.record.id, leaseToken: prepared.leaseToken, primaryError: error, persistenceError });
      return { status: "generation_in_progress", certificateId: prepared.record.id,
        certificateType: prepared.record.certificateType, version: prepared.record.version };
    }
  }
  const result: RegenerateCertificateResult = { status: "generated", certificateId: prepared.record.id,
    certificateType: prepared.record.certificateType, version: prepared.record.version, imageUrl };
  try {
    const finalized = await dependencies.transaction(value.eventId, async (tx) => tx.finalizeMutation(value.idempotencyKey, prepared.leaseToken, result));
    if (finalized.status === "finalized") return result;
    if (finalized.result) return { status: "already_applied", result: finalized.result };
  } catch (persistenceError) {
    console.error("Certificate success mutation persistence failed", { certificateId: prepared.record.id, leaseToken: prepared.leaseToken, persistenceError });
  }
  return { status: "generation_in_progress", certificateId: prepared.record.id,
    certificateType: prepared.record.certificateType, version: prepared.record.version };
}

export async function publishCertificateSet(input: unknown, dependencies: CertificateStudioDependencies): Promise<PublishCertificateSetResult> {
  const parsed = publishCertificateSetInputSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", code: "invalid_input" };
  const value = parsed.data;
  const selection = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => value.selection.find((row) => row.certificateType === certificateType)!);
  const fingerprint = mutationFingerprint({ action: "publish", expectedVersion: value.expectedVersion, expectedCertificateRevision: value.expectedCertificateRevision, selection });
  return dependencies.transaction(value.eventId, async (tx) => {
    const actor = await tx.authorize();
    if (!actor) return { status: "blocked", code: "unauthorized" };
    const completion = await tx.loadCompletion();
    if (!completion) return { status: "integration_required" };
    const existing = await tx.findMutation(value.idempotencyKey);
    if (existing) {
      if (existing.actorId !== actor.id || existing.fingerprint !== fingerprint) return { status: "conflict", code: "idempotency_key_reused", version: completion.certificateRevision };
      if (existing.status !== "terminal") return { status: "conflict", code: "idempotency_key_reused", version: completion.certificateRevision };
      return { status: "already_applied", result: existing.result as PublishCertificateSetResult };
    }
    if (completion.version !== value.expectedVersion) return { status: "conflict", code: "stale_version", version: completion.version };
    if (completion.certificateRevision !== value.expectedCertificateRevision) return { status: "conflict", code: "stale_certificate_revision", version: completion.certificateRevision };
    if (completion.status !== "completed") return { status: "blocked", code: "completion_required" };
    const records = await tx.loadCertificates(selection.map((row) => row.certificateId));
    const ready = records.length === 7 && selection.every((selected) => {
      const record = records.find((candidate) => candidate.id === selected.certificateId && candidate.certificateType === selected.certificateType);
      return record?.eventId === value.eventId && record.completionId === completion.id
        && record.completionVersion === completion.version
        && record.templateVersion === "miracle-v3"
        && record.recipientId === completion.recipients[selected.certificateType]
        && (record.status === "ready" || record.status === "published")
        && Boolean(record.imageUrl) && isSafeOwnedAssetUrl(record.imageUrl);
    });
    if (!ready) return { status: "blocked", code: "set_not_ready" };
    const committed = await tx.commitPublication({ selection, actorId: actor.id, idempotencyKey: value.idempotencyKey, fingerprint, expectedCertificateRevision: value.expectedCertificateRevision, preserveVerificationHistory: true });
    return { status: "published", ...committed };
  });
}

export interface DurableGenerationRepository {
  claim(input: { identity: MiracleV3CertificateIdentity; idempotencyKey: string; now: Date; staleBefore: Date }): Promise<{ status: "claimed"; attemptId: string } | { status: "ready" | "published"; imageUrl: string }>;
  recordSuccess(input: { identity: MiracleV3CertificateIdentity; attemptId: string; imageUrl: string; fingerprint: string }): Promise<void>;
  recordFailure(input: { identity: MiracleV3CertificateIdentity; attemptId: string; message: string }): Promise<void>;
}
export interface CreateOnlyCertificateStorage { put(input: { filename: string; body: Buffer; contentType: "image/png"; overwrite: false }): Promise<string> }

/** Bridge Task 5's renderer to a durable atomic claim and create-only storage implementation. */
export function createMiracleV3GenerationAdapter(
  repository: DurableGenerationRepository,
  storage: CreateOnlyCertificateStorage,
  options: { readonly idempotencyKey: string; readonly now: Date; readonly staleAfterMs?: number },
): MiracleV3GenerationDependencies {
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;
  return {
    claimGeneration: (identity) => repository.claim({ identity, idempotencyKey: options.idempotencyKey, now: options.now, staleBefore: new Date(options.now.getTime() - staleAfterMs) }),
    storeArtifact: async ({ filename, png, overwrite }) => {
      if (overwrite !== false) throw new Error("Certificate storage must be create-only");
      const url = await storage.put({ filename, body: png, contentType: "image/png", overwrite: false });
      if (!isSafeOwnedAssetUrl(url)) throw new Error("Certificate storage returned an unsafe URL");
      return url;
    },
    recordSuccess: (result) => repository.recordSuccess(result),
    recordFailure: async (result) => {
      try { await repository.recordFailure(result); }
      catch (error) { console.error("Certificate failure persistence failed", { ...result.identity, attemptId: result.attemptId, error }); }
    },
  };
}
