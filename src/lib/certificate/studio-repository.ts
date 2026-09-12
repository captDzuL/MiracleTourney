import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { generateMiracleV3Certificate } from "./generate";
import {
  createMiracleV3GenerationAdapter,
  type CertificateAssetPlacement,
  type CertificateStudioActor,
  type CertificateStudioCompletion,
  type CertificateStudioDependencies,
  type CertificateStudioMutation,
  type CertificateStudioRecord,
  type CertificateStudioTransaction,
  type RegenerateCertificateResult,
  type TrustedCertificateAsset,
} from "./service";
import {
  MIRACLE_V3_BRANDING,
  MIRACLE_V3_CERTIFICATE_TYPES,
  getMiracleV3CertificateManifest,
  type MiracleV3CertificateType,
} from "./templates/miracle-v3";
import { createOnlyCertificateStorage, createPrismaGenerationRepository } from "./generation-repository";
import { prisma } from "@/lib/platform/db";

type EventIdentity = { readonly id: string; readonly name: string };
type CertificateAssetPurpose = TrustedCertificateAsset["purpose"];
type StoredSelectedAsset = { readonly assetId: string; readonly placement: CertificateAssetPlacement; readonly asset: Omit<TrustedCertificateAsset, "storageOwnershipVerified"> };
const STALE_MUTATION_MS = 5 * 60 * 1000;

const completionVersion = (snapshot: Prisma.JsonValue): number | null => {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const version = (snapshot as Record<string, unknown>).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
};

const mappedStatus = (row: { status: string; publishedAt: Date | null; supersededByVersion: number | null }): CertificateStudioRecord["status"] => {
  if (row.supersededByVersion) return "superseded";
  if (row.publishedAt) return "published";
  return ["draft", "generating", "failed", "ready"].includes(row.status)
    ? row.status as CertificateStudioRecord["status"]
    : "failed";
};

type CertificateRow = {
  id: string; eventId: string; type: string; recipientId: string; version: number; status: string;
  imageUrl: string; publishedUrl: string | null; verificationCode: string; publishedAt: Date | null;
  supersededByVersion: number | null; completionId: string | null; completionVersion: number | null;
  templateVersion: string;
  renderManifest?: Prisma.JsonValue | null;
};

const mapRecord = (row: CertificateRow): CertificateStudioRecord => ({
  id: row.id, eventId: row.eventId, certificateType: row.type as MiracleV3CertificateType,
  recipientId: row.recipientId, completionId: row.completionId, completionVersion: row.completionVersion,
  templateVersion: row.templateVersion, version: row.version, status: mappedStatus(row), imageUrl: row.imageUrl,
  publishedUrl: row.publishedUrl, verificationCode: row.verificationCode,
  publishedAt: row.publishedAt?.toISOString() ?? null, supersededByVersion: row.supersededByVersion,
});

const loadCompletionForGeneration = (tx: Prisma.TransactionClient, eventId: string) => tx.tournamentCompletion.findUnique({
  where: { eventId }, include: { event: true, podiumPlacements: true, awards: { include: { decision: true } } },
});
type CompletionRow = Awaited<ReturnType<typeof loadCompletionForGeneration>>;

function recipient(completion: CompletionRow, type: MiracleV3CertificateType) {
  if (!completion) return null;
  const rank = type === "champion" ? 1 : type === "runner_up" ? 2 : type === "third_place" ? 3 : null;
  if (rank) {
    const podium = completion.podiumPlacements.find((row) => row.rank === rank);
    return podium ? { id: podium.teamId, name: podium.teamName, kind: "team" as const, teamId: podium.teamId, teamName: podium.teamName } : null;
  }
  const decision = completion.awards.find((row) => row.type === type)?.decision;
  return decision ? { id: decision.recipientId, name: decision.recipientName, kind: "player" as const, teamId: decision.teamId, teamName: decision.teamName } : null;
}

function completionContract(completion: CompletionRow): CertificateStudioCompletion | null {
  if (!completion) return null;
  const version = completionVersion(completion.sourceSnapshot);
  if (version === null) return null;
  const entries = MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, recipient(completion, type)?.id] as const);
  if (entries.some(([, recipientId]) => !recipientId)) return null;
  return { id: completion.id, status: completion.status as CertificateStudioCompletion["status"], version,
    certificateRevision: completion.certificateRevision,
    recipients: Object.fromEntries(entries) as Record<MiracleV3CertificateType, string> };
}

function trustedStorage(asset: { url: string | null; storageProvider: string | null; storageKey: string | null; contentSha256: string | null }) {
  if (!asset.url || !asset.storageKey || !asset.contentSha256 || !/^[a-f0-9]{64}$/.test(asset.contentSha256)
    || /[\\%]/.test(asset.storageKey)) return false;
  let decodedKey: string;
  try { decodedKey = decodeURIComponent(asset.storageKey); }
  catch { return false; }
  const segments = decodedKey.split("/");
  if (decodedKey !== asset.storageKey || segments[0] !== "certificate-assets" || segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) return false;
  if (asset.storageProvider === "local") return asset.url === `/${asset.storageKey}`;
  if (asset.storageProvider !== "vercel_blob") return false;
  try {
    const url = new URL(asset.url);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && !asset.url.includes("\\") && url.hostname.endsWith(".public.blob.vercel-storage.com") && url.pathname === `/${asset.storageKey}`;
  } catch { return false; }
}

function trustedAsset(row: {
  url: string | null; mimeType: string | null; width: number | null; height: number | null; byteSize: number | null;
  storageProvider: string | null; storageKey: string | null; contentSha256: string | null; purpose: string | null;
}): TrustedCertificateAsset | null {
  if (!trustedStorage(row) || !row.url || !row.storageKey || !row.contentSha256
    || (row.storageProvider !== "local" && row.storageProvider !== "vercel_blob")
    || !row.mimeType || !row.width || !row.height || !row.byteSize
    || !["certificate_team_logo", "certificate_character_art"].includes(row.purpose ?? "")) return null;
  return { url: row.url, detectedMimeType: row.mimeType, bytes: row.byteSize, width: row.width, height: row.height,
    storageOwnershipVerified: true, storageProvider: row.storageProvider, storageKey: row.storageKey,
    contentSha256: row.contentSha256, purpose: row.purpose as CertificateAssetPurpose };
}

export async function materializeOwnedCertificateAssetUrl(
  asset: TrustedCertificateAsset,
  readOwnedAsset: (absolutePath: string) => Promise<Buffer> = readFile,
): Promise<string> {
  if (!asset.storageOwnershipVerified || !trustedStorage(asset)) {
    throw new Error("Certificate asset storage provenance is invalid");
  }
  if (asset.storageProvider === "vercel_blob") return asset.url;
  const mime = asset.detectedMimeType;
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("Certificate local asset type is unsupported");
  }
  const root = path.resolve(process.cwd(), "public", "certificate-assets");
  const absolutePath = path.resolve(process.cwd(), "public", ...asset.storageKey.split("/"));
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new Error("Certificate local asset path is unsafe");
  }
  const bytes = await readOwnedAsset(absolutePath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== asset.bytes || hash !== asset.contentSha256) {
    throw new Error("Certificate local asset content changed");
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export async function loadCertificateStudioState(event: EventIdentity, locale: "id" | "en" = "en") {
  const [completion, visualAssets] = await Promise.all([
    prisma.tournamentCompletion.findUnique({
      where: { eventId: event.id }, include: { podiumPlacements: true, awards: { include: { decision: true } },
        event: { include: { certificates: { orderBy: [{ type: "asc" }, { version: "asc" }] },
          certificatePublications: { orderBy: { version: "desc" }, take: 1 } } } },
    }),
    prisma.eventVisualAsset.findMany({ where: { eventId: event.id, status: "approved" }, orderBy: { createdAt: "desc" } }),
  ]);
  const approvedAssets = visualAssets.flatMap((row) => {
    const asset = trustedAsset(row);
    return asset ? [{ id: row.id, label: row.storageKey?.split("/").at(-1) ?? row.id, purpose: asset.purpose }] : [];
  });
  const version = completion ? completionVersion(completion.sourceSnapshot) : null;
  const pendingRecords = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, recipient: null, selectedCertificateId: null, versions: null }));
  if (!completion || version === null) {
    return { status: "integration_required" as const, event, completionVersion: null, certificateRevision: null, records: pendingRecords, publication: null, approvedAssets };
  }
  const availability = certificateStudioAvailability({ status: completion.status, version });
  if (availability === "integration_required") {
    return { status: "integration_required" as const, event, completionVersion: null, certificateRevision: null, records: pendingRecords, publication: null, approvedAssets };
  }
  if (availability === "completion_required") {
    return {
      status: "completion_required" as const,
      event,
      completionVersion: version,
      certificateRevision: completion.certificateRevision,
      completionHref: `/${locale}/organizer/events/${event.id}/completion`,
      records: pendingRecords,
      publication: null,
      approvedAssets,
    };
  }
  const records = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => {
    const winner = recipient(completion, certificateType);
    const versions = completion.event.certificates
      .filter((row) => row.type === certificateType && row.templateVersion === "miracle-v3"
        && row.completionId === completion.id && row.completionVersion === version && row.recipientId === winner?.id)
      .map((row) => ({ ...mapRecord(row), lastError: row.lastError }));
    const selected = versions.at(-1) ?? null;
    return { certificateType, recipient: winner ? { id: winner.id, name: winner.name, kind: winner.kind } : null,
      selectedCertificateId: selected?.id ?? null, versions };
  });
  if (records.some((record) => !record.recipient)) {
    return { status: "integration_required" as const, event, completionVersion: null, certificateRevision: null, records: pendingRecords, publication: null, approvedAssets };
  }
  const publication = completion.event.certificatePublications[0];
  return { status: "available" as const, event, completionVersion: version, certificateRevision: completion.certificateRevision,
    records, publication: publication ? { version: publication.version, publishedAt: publication.publishedAt.toISOString() } : null,
    approvedAssets };
}

export function certificateStudioAvailability(
  completion: { readonly status: string; readonly version: number | null } | null,
): "integration_required" | "completion_required" | "available" {
  if (!completion || completion.version === null) return "integration_required";
  if (completion.status === "completed") return "available";
  if (completion.status === "reopened" || completion.status === "editable") return "completion_required";
  return "integration_required";
}

type StoredManifest = { assets?: StoredSelectedAsset[] };
type CanonicalRenderData = ReturnType<typeof getMiracleV3CertificateManifest>;
type StoredRenderManifest = {
  readonly schemaVersion: 1;
  readonly data: CanonicalRenderData;
  readonly assets: readonly StoredSelectedAsset[];
};
function selectedAssets(value: Prisma.JsonValue): StoredSelectedAsset[] {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  const assets = (value as StoredManifest).assets;
  if (!Array.isArray(assets)) return [];
  return assets;
}

function storedRenderManifest(value: Prisma.JsonValue | null | undefined): StoredRenderManifest {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Certificate render manifest is unavailable");
  }
  const candidate = value as unknown as StoredRenderManifest;
  if (candidate.schemaVersion !== 1 || !candidate.data || !Array.isArray(candidate.assets)) {
    throw new Error("Certificate render manifest is invalid");
  }
  const normalized = getMiracleV3CertificateManifest(candidate.data);
  if (JSON.stringify(normalized) !== JSON.stringify(candidate.data)) {
    throw new Error("Certificate render manifest is not canonical");
  }
  return candidate;
}

async function generationPayload(tx: Prisma.TransactionClient, eventId: string, completion: NonNullable<CompletionRow>, certificate: CertificateRow & { assetManifest: Prisma.JsonValue; teamId: string; recipientKind: string; recipientName: string }) {
  const version = completionVersion(completion.sourceSnapshot);
  const type = certificate.type as MiracleV3CertificateType;
  const winner = recipient(completion, type);
  if (completion.status !== "completed" || version === null || !winner || certificate.completionId !== completion.id
    || certificate.completionVersion !== version || certificate.templateVersion !== "miracle-v3" || certificate.recipientId !== winner.id) {
    throw new Error("Certificate is not bound to the authoritative completion snapshot");
  }
  const team = await tx.team.findFirst({ where: { id: winner.teamId, eventId } });
  if (!team) throw new Error("Certificate team is unavailable");
  const renderManifest = storedRenderManifest(certificate.renderManifest);
  const assets = selectedAssets(certificate.assetManifest);
  if (JSON.stringify(assets) !== JSON.stringify(renderManifest.assets)) {
    throw new Error("Certificate asset and render manifests disagree");
  }
  await Promise.all(renderManifest.assets.map(async (stored) => {
    const row = await tx.eventVisualAsset.findFirst({ where: { id: stored.assetId, eventId, status: "approved" } });
    const current = row ? trustedAsset(row) : null;
    const fields = ["url", "detectedMimeType", "bytes", "width", "height", "storageProvider", "storageKey", "contentSha256", "purpose"] as const;
    if (!current || fields.some((field) => current[field] !== stored.asset[field])) {
      throw new Error("Certificate asset provenance changed");
    }
    return current;
  }));
  const data = renderManifest.data;
  if (data.eventId !== eventId || data.certificateId !== certificate.id || data.certificateType !== type
    || data.version !== certificate.version || data.recipientId !== winner.id || data.recipientKind !== winner.kind
    || data.teamId !== winner.teamId || data.teamName !== winner.teamName
    || data.verificationCode !== certificate.verificationCode || data.templateVersion !== "miracle-v3") {
    throw new Error("Certificate render manifest identity does not match");
  }
  return { record: mapRecord(certificate), data };
}

function terminalGenerationResult(value: Prisma.JsonValue | null): RegenerateCertificateResult | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const result = value as unknown as RegenerateCertificateResult;
  return ["generated", "failed"].includes(result.status) ? result : null;
}
function retryablePublicationConflict() {
  const error = new Error("Certificate publication revision changed") as Error & { code: string };
  error.code = "P2034";
  return error;
}


export function createCertificateStudioTransaction(
  tx: Prisma.TransactionClient,
  eventId: string,
  actor: CertificateStudioActor,
  options: {
    readonly now?: () => Date;
    readonly materializeAssetUrl?: (asset: TrustedCertificateAsset) => Promise<string>;
  } = {},
): CertificateStudioTransaction {
  const now = options.now ?? (() => new Date());
  const materializeAssetUrl = options.materializeAssetUrl ?? materializeOwnedCertificateAssetUrl;
  return {
    authorize: async () => {
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { organizerUserId: true } });
      if (!event || (actor.role === "organizer" && event.organizerUserId !== actor.id)) return null;
      return actor;
    },
    loadCompletion: async () => completionContract(await loadCompletionForGeneration(tx, eventId)),
    findMutation: async (key): Promise<CertificateStudioMutation | null> => {
      const mutation = await tx.certificateGenerationMutation.findUnique({ where: { eventId_idempotencyKey: { eventId, idempotencyKey: key } }, include: { certificate: true } });
      if (mutation) {
        if (mutation.status === "succeeded" || mutation.status === "failed") {
          const result = terminalGenerationResult(mutation.result);
          if (!result) throw new Error("Certificate mutation terminal result is corrupt");
          return { status: "terminal", fingerprint: mutation.fingerprint, actorId: mutation.actorUserId, result };
        }
        return { status: "in_progress", fingerprint: mutation.fingerprint, actorId: mutation.actorUserId,
          stale: !mutation.leaseExpiresAt || mutation.leaseExpiresAt.getTime() <= Date.now(), updatedAt: mutation.updatedAt.toISOString(),
          certificateId: mutation.certificateId,
          certificateType: mutation.type as MiracleV3CertificateType, version: mutation.certificate.version };
      }
      const publication = await tx.certificatePublication.findUnique({ where: { eventId_idempotencyKey: { eventId, idempotencyKey: key } } });
      return publication ? { status: "terminal", fingerprint: publication.fingerprint, actorId: publication.actorUserId,
        result: { status: "published", publicationVersion: publication.version, publishedAt: publication.publishedAt.toISOString() } } : null;
    },
    resolveAsset: async (assetId) => {
      const row = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId, status: "approved" } });
      return row ? trustedAsset(row) : null;
    },
    appendVersion: async ({ certificateType, idempotencyKey, fingerprint, actorId, leaseOwnerId, assets }) => {
      const completion = await loadCompletionForGeneration(tx, eventId);
      const contract = completionContract(completion);
      const winner = recipient(completion, certificateType);
      if (!completion || !contract || contract.status !== "completed" || !winner) throw new Error("Completion snapshot recipient is unavailable");
      const latest = await tx.certificate.findFirst({ where: { eventId, type: certificateType }, orderBy: { version: "desc" } });
      const storedAssets = assets.map((row) => ({ assetId: row.assetId, placement: row.placement, asset: { ...row.asset, storageOwnershipVerified: undefined } }));
      const assetManifest = JSON.parse(JSON.stringify({ assets: storedAssets })) as Prisma.InputJsonValue;
      const created = await tx.certificate.create({ data: { eventId, teamId: winner.teamId, type: certificateType,
        recipientKind: winner.kind, recipientId: winner.id, recipientName: winner.name, version: (latest?.version ?? 0) + 1,
        templateVersion: "miracle-v3", completionId: completion.id, completionVersion: contract.version, assetManifest,
        imageUrl: "", status: "draft", attemptCount: 0, generationIdempotencyKey: idempotencyKey,
        generationFingerprint: fingerprint, generationActorUserId: actorId } });
      const team = await tx.team.findFirst({ where: { id: winner.teamId, eventId } });
      if (!team) throw new Error("Certificate team is unavailable");
      const logoKind = winner.kind === "team" ? "team_logo_hero" : "team_logo_badge";
      const logoAsset = assets.find((row) => row.placement.assetKind === logoKind)?.asset;
      if (!logoAsset) throw new Error("Required team logo asset is unavailable");
      const characterAsset = assets.find((row) => row.placement.assetKind === "character_art")?.asset;
      const [teamLogoUrl, characterArtUrl] = await Promise.all([
        materializeAssetUrl(logoAsset),
        characterAsset ? materializeAssetUrl(characterAsset) : Promise.resolve(null),
      ]);
      const issuedAt = now();
      const origin = (() => { try { const url = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun"); return url.protocol === "https:" ? url.origin : "https://miracle-league.fun"; } catch { return "https://miracle-league.fun"; } })();
      const renderData = getMiracleV3CertificateManifest({
        eventId, eventName: completion.event.name, gameId: completion.event.gameId, gameName: completion.event.gameId,
        certificateId: created.id, certificateType, version: created.version, templateVersion: "miracle-v3",
        recipientId: winner.id, recipientName: winner.name, recipientKind: winner.kind, teamId: winner.teamId, teamName: winner.teamName,
        teamLogoUrl, characterArtUrl, issueDate: issuedAt.toISOString().slice(0, 10),
        verificationCode: created.verificationCode, verificationBaseUrl: origin, branding: { ...MIRACLE_V3_BRANDING },
        assetPlacements: assets.map((row) => row.placement),
      });
      const storedRender = JSON.parse(JSON.stringify({
        schemaVersion: 1,
        data: renderData,
        assets: storedAssets,
      })) as Prisma.JsonValue;
      await tx.certificate.update({ where: { id: created.id }, data: { renderManifest: storedRender as Prisma.InputJsonValue } });
      const createdWithManifest = { ...created, renderManifest: storedRender };
      const leaseToken = randomUUID();
      await tx.certificateGenerationMutation.create({ data: { eventId, type: certificateType, idempotencyKey, fingerprint,
        actorUserId: actorId, certificateId: created.id, status: "in_progress", leaseToken, leaseOwnerId,
        leaseExpiresAt: new Date(issuedAt.getTime() + STALE_MUTATION_MS), updatedAt: issuedAt } });
      return { ...(await generationPayload(tx, eventId, completion, createdWithManifest)), leaseToken };
    },
    leaseStaleVersion: async (idempotencyKey, expectedUpdatedAt, leaseOwnerId) => {
      const expected = new Date(expectedUpdatedAt);
      if (!Number.isFinite(expected.getTime())) return null;
      const leaseNow = now();
      const leaseToken = randomUUID();
      const leased = await tx.certificateGenerationMutation.updateMany({
        where: { eventId, idempotencyKey, status: "in_progress", updatedAt: expected,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: leaseNow } }] },
        data: { leaseToken, leaseOwnerId, leaseExpiresAt: new Date(leaseNow.getTime() + STALE_MUTATION_MS), updatedAt: leaseNow },
      });
      if (leased.count !== 1) return null;
      const mutation = await tx.certificateGenerationMutation.findUnique({ where: { eventId_idempotencyKey: { eventId, idempotencyKey } }, include: { certificate: true } });
      const completion = await loadCompletionForGeneration(tx, eventId);
      if (!mutation || mutation.status !== "in_progress" || mutation.leaseToken !== leaseToken || !completion) {
        throw new Error("Certificate mutation lease was lost after acquisition");
      }
      return { ...(await generationPayload(tx, eventId, completion, mutation.certificate)), leaseToken };
    },
    finalizeMutation: async (idempotencyKey, leaseToken, result) => {
      const terminalStatus = result.status === "generated" ? "succeeded" : "failed";
      const updated = await tx.certificateGenerationMutation.updateMany({ where: { eventId, idempotencyKey, status: "in_progress", leaseToken },
        data: { status: terminalStatus, result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          errorMessage: result.status === "failed" ? result.code : null, leaseToken: null, leaseOwnerId: null, leaseExpiresAt: null } });
      if (updated.count === 1) return { status: "finalized" } as const;
      const existing = await tx.certificateGenerationMutation.findUnique({ where: { eventId_idempotencyKey: { eventId, idempotencyKey } } });
      const terminal = existing && ["succeeded", "failed"].includes(existing.status) ? terminalGenerationResult(existing.result) : null;
      return terminal ? { status: "lease_lost", result: terminal } as const : { status: "lease_lost" } as const;
    },
    loadCertificates: async (ids) => (await tx.certificate.findMany({ where: { id: { in: [...ids] }, eventId } })).map(mapRecord),
    commitPublication: async ({ selection, actorId, idempotencyKey, fingerprint, expectedCertificateRevision }) => {
      const completion = await loadCompletionForGeneration(tx, eventId);
      const contract = completionContract(completion);
      if (!completion || !contract || contract.status !== "completed" || contract.certificateRevision !== expectedCertificateRevision) throw retryablePublicationConflict();
      const chosen = await tx.certificate.findMany({ where: { id: { in: selection.map((row) => row.certificateId) }, eventId } });
      const valid = chosen.length === MIRACLE_V3_CERTIFICATE_TYPES.length && selection.every((selected) => {
        const certificate = chosen.find((row) => row.id === selected.certificateId && row.type === selected.certificateType);
        return certificate?.completionId === contract.id && certificate.completionVersion === contract.version
          && certificate.templateVersion === "miracle-v3" && certificate.recipientId === contract.recipients[selected.certificateType]
          && (certificate.status === "ready" || certificate.publishedAt !== null) && Boolean(certificate.imageUrl);
      });
      if (!valid) throw new Error("Certificate publication set is no longer authoritative");
      const optimistic = await tx.tournamentCompletion.updateMany({ where: { id: completion.id, certificateRevision: expectedCertificateRevision }, data: { certificateRevision: { increment: 1 } } });
      if (optimistic.count !== 1) throw retryablePublicationConflict();
      const now = new Date();
      for (const selected of chosen) {
        await tx.certificate.updateMany({ where: { eventId, type: selected.type, publishedAt: { not: null }, id: { not: selected.id }, supersededByVersion: null }, data: { status: "superseded", supersededByVersion: selected.version } });
        await tx.certificate.update({ where: { id: selected.id }, data: { status: "ready", publishedUrl: selected.publishedUrl ?? selected.imageUrl, publishedAt: selected.publishedAt ?? now } });
      }
      const publication = await tx.certificatePublication.create({ data: { eventId, completionId: completion.id,
        version: expectedCertificateRevision + 1, completionVersion: contract.version,
        certificateIds: selection.map((row) => row.certificateId), idempotencyKey, fingerprint, actorUserId: actorId, publishedAt: now } });
      return { publicationVersion: publication.version, publishedAt: publication.publishedAt.toISOString() };
    },
  };
}

export function createPrismaCertificateStudioDependencies(actor: CertificateStudioActor): CertificateStudioDependencies {
  const generationRepository = createPrismaGenerationRepository();
  const storage = createOnlyCertificateStorage();
  return { transaction: async (eventId, work) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await prisma.$transaction((tx) => work(createCertificateStudioTransaction(tx, eventId, actor)), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (!["P2034", "P2002"].includes(code ?? "") || attempt === 2) throw error;
      }
    }
    throw new Error("Certificate Studio transaction exhausted retries");
  }, generate: (data, context) => generateMiracleV3Certificate({ data }, createMiracleV3GenerationAdapter(generationRepository, storage, { idempotencyKey: context.idempotencyKey, now: new Date() })) };
}
