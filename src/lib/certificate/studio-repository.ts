import { Prisma } from "@prisma/client";
import { generateMiracleV3Certificate } from "./generate";
import { createMiracleV3GenerationAdapter, type CertificateStudioActor, type CertificateStudioDependencies, type CertificateStudioRecord, type CertificateStudioTransaction } from "./service";
import { MIRACLE_V3_BRANDING, MIRACLE_V3_CERTIFICATE_TYPES, type MiracleV3CertificateData, type MiracleV3CertificateType } from "./templates/miracle-v3";
import { createOnlyCertificateStorage, createPrismaGenerationRepository } from "./generation-repository";
import { prisma } from "@/lib/platform/db";

type EventIdentity = { readonly id: string; readonly name: string };
const completionVersion = (snapshot: Prisma.JsonValue): number | null => {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const version = (snapshot as Record<string, unknown>).version;
  return Number.isSafeInteger(version) && Number(version) >= 0 ? Number(version) : null;
};
const mappedStatus = (row: { status: string; publishedAt: Date | null; supersededByVersion: number | null }): CertificateStudioRecord["status"] => {
  if (row.supersededByVersion) return "superseded";
  if (row.publishedAt) return "published";
  return ["draft", "generating", "failed", "ready"].includes(row.status) ? row.status as CertificateStudioRecord["status"] : "failed";
};
const mapRecord = (row: { id: string; eventId: string; type: string; recipientId: string; version: number; status: string; imageUrl: string; publishedUrl: string | null; verificationCode: string; publishedAt: Date | null; supersededByVersion: number | null }) => ({
  id: row.id, eventId: row.eventId, certificateType: row.type as MiracleV3CertificateType, recipientId: row.recipientId,
  version: row.version, status: mappedStatus(row), imageUrl: row.imageUrl, publishedUrl: row.publishedUrl,
  verificationCode: row.verificationCode, publishedAt: row.publishedAt?.toISOString() ?? null, supersededByVersion: row.supersededByVersion,
});

export async function loadCertificateStudioState(event: EventIdentity) {
  const completion = await prisma.tournamentCompletion.findUnique({
    where: { eventId: event.id },
    include: {
      podiumPlacements: true,
      awards: { include: { decision: true } },
      event: { include: { certificates: { orderBy: [{ type: "asc" }, { version: "asc" }] }, certificatePublications: { orderBy: { version: "desc" }, take: 1 } } },
    },
  });
  const version = completion ? completionVersion(completion.sourceSnapshot) : null;
  const pendingRecords = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, recipient: null, selectedCertificateId: null, versions: null }));
  if (!completion || completion.status !== "completed" || version === null) {
    return { status: "integration_required" as const, event, completionVersion: null, certificateRevision: null, records: pendingRecords, publication: null };
  }
  const recipientFor = (type: MiracleV3CertificateType) => {
    const podiumRank = { champion: 1, runner_up: 2, third_place: 3 }[type as "champion"] as number | undefined;
    if (podiumRank) {
      const row = completion.podiumPlacements.find((candidate) => candidate.rank === podiumRank);
      return row ? { id: row.teamId, name: row.teamName, kind: "team" as const } : null;
    }
    const award = completion.awards.find((candidate) => candidate.type === type)?.decision;
    return award ? { id: award.recipientId, name: award.recipientName, kind: "player" as const } : null;
  };
  const records = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => {
    const versions = completion.event.certificates.filter((row) => row.type === certificateType).map((row) => ({ ...mapRecord(row), lastError: row.lastError }));
    const selected = [...versions].reverse().find((row) => row.status === "ready" || row.status === "published") ?? versions.at(-1) ?? null;
    return { certificateType, recipient: recipientFor(certificateType), selectedCertificateId: selected?.id ?? null, versions };
  });
  if (records.some((record) => !record.recipient)) {
    return { status: "integration_required" as const, event, completionVersion: null, certificateRevision: null, records: pendingRecords, publication: null };
  }
  const publication = completion.event.certificatePublications[0];
  return {
    status: "available" as const, event, completionVersion: version, certificateRevision: completion.certificateRevision, records,
    publication: publication ? { version: publication.version, publishedAt: publication.publishedAt.toISOString() } : null,
  };
}

function recipient(completion: Awaited<ReturnType<typeof loadCompletionForGeneration>>, type: MiracleV3CertificateType) {
  if (!completion) return null;
  const rank = type === "champion" ? 1 : type === "runner_up" ? 2 : type === "third_place" ? 3 : null;
  if (rank) {
    const podium = completion.podiumPlacements.find((row) => row.rank === rank);
    return podium ? { id: podium.teamId, name: podium.teamName, kind: "team" as const, teamId: podium.teamId, teamName: podium.teamName } : null;
  }
  const decision = completion.awards.find((row) => row.type === type)?.decision;
  return decision ? { id: decision.recipientId, name: decision.recipientName, kind: "player" as const, teamId: decision.teamId, teamName: decision.teamName } : null;
}
const loadCompletionForGeneration = (tx: Prisma.TransactionClient, eventId: string) => tx.tournamentCompletion.findUnique({
  where: { eventId },
  include: { event: true, podiumPlacements: true, awards: { include: { decision: true } } },
});

function transactionObject(tx: Prisma.TransactionClient, eventId: string, actor: CertificateStudioActor): CertificateStudioTransaction {
  return {
    authorize: async () => {
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { organizerUserId: true } });
      if (!event || (actor.role === "organizer" && event.organizerUserId !== actor.id)) return null;
      return actor;
    },
    loadCompletion: async () => {
      const row = await tx.tournamentCompletion.findUnique({ where: { eventId } });
      if (!row) return null;
      const version = completionVersion(row.sourceSnapshot);
      return version === null ? null : { status: row.status as "completed" | "reopened" | "editable", version, certificateRevision: row.certificateRevision };
    },
    findMutation: async (key) => {
      const certificate = await tx.certificate.findFirst({ where: { eventId, generationIdempotencyKey: key } });
      if (certificate?.generationFingerprint && certificate.generationActorUserId) {
        const result = certificate.status === "ready" || certificate.status === "published"
          ? { status: "generated" as const, certificateId: certificate.id, certificateType: certificate.type as MiracleV3CertificateType, version: certificate.version, imageUrl: certificate.imageUrl }
          : { status: "failed" as const, code: "generation_failed" as const, certificateId: certificate.id, certificateType: certificate.type as MiracleV3CertificateType, version: certificate.version };
        return { fingerprint: certificate.generationFingerprint, actorId: certificate.generationActorUserId, result };
      }
      const publication = await tx.certificatePublication.findUnique({ where: { eventId_idempotencyKey: { eventId, idempotencyKey: key } } });
      return publication ? { fingerprint: publication.fingerprint, actorId: publication.actorUserId, result: { status: "published", publicationVersion: publication.version, publishedAt: publication.publishedAt.toISOString() } } : null;
    },
    resolveAsset: async (assetId) => {
      const asset = await tx.eventVisualAsset.findFirst({ where: { id: assetId, eventId, status: "approved" } });
      if (!asset?.url || !asset.mimeType || !asset.width || !asset.height || !asset.byteSize) return null;
      return { url: asset.url, detectedMimeType: asset.mimeType, bytes: asset.byteSize, width: asset.width, height: asset.height, storageOwnershipVerified: true };
    },
    appendVersion: async ({ certificateType, idempotencyKey, fingerprint, actorId, placement, asset }) => {
      const completion = await loadCompletionForGeneration(tx, eventId);
      const winner = recipient(completion, certificateType);
      if (!completion || completion.status !== "completed" || !winner) throw new Error("Completion snapshot recipient is unavailable");
      const latest = await tx.certificate.findFirst({ where: { eventId, type: certificateType }, orderBy: { version: "desc" } });
      const team = await tx.team.findFirst({ where: { id: winner.teamId, eventId } });
      if (!team) throw new Error("Certificate team is unavailable");
      const assetManifest = JSON.parse(JSON.stringify(placement && asset ? { placement, asset: { url: asset.url, mimeType: asset.detectedMimeType, width: asset.width, height: asset.height, bytes: asset.bytes } } : {})) as Prisma.InputJsonValue;
      const created = await tx.certificate.create({ data: {
        eventId, teamId: winner.teamId, type: certificateType, recipientKind: winner.kind, recipientId: winner.id, recipientName: winner.name,
        version: (latest?.version ?? 0) + 1, templateVersion: "miracle-v3", assetManifest, imageUrl: "", status: "draft", attemptCount: 0,
        generationIdempotencyKey: idempotencyKey, generationFingerprint: fingerprint, generationActorUserId: actorId,
      } });
      const assetUrl = asset?.url ?? null;
      const verificationOrigin = (() => { try { const url = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun"); return url.protocol === "https:" ? url.origin : "https://miracle-league.fun"; } catch { return "https://miracle-league.fun"; } })();
      const data: MiracleV3CertificateData = {
        eventId, eventName: completion.event.name, gameId: completion.event.gameId, gameName: completion.event.gameId,
        certificateId: created.id, certificateType, version: created.version, templateVersion: "miracle-v3",
        recipientId: winner.id, recipientName: winner.name, recipientKind: winner.kind, teamId: winner.teamId, teamName: winner.teamName,
        teamLogoUrl: placement?.assetKind.startsWith("team_logo") ? assetUrl : team.logoUrl,
        characterArtUrl: placement?.assetKind === "character_art" ? assetUrl : completion.event.characterArtUrl,
        issueDate: new Date().toISOString().slice(0, 10), verificationCode: created.verificationCode, verificationBaseUrl: verificationOrigin,
        branding: { ...MIRACLE_V3_BRANDING }, assetPlacement: placement,
      };
      return { record: mapRecord(created), data };
    },
    loadCertificates: async (ids) => (await tx.certificate.findMany({ where: { id: { in: [...ids] }, eventId } })).map(mapRecord),
    commitPublication: async ({ selection, actorId, idempotencyKey, fingerprint, expectedCertificateRevision }) => {
      const completion = await tx.tournamentCompletion.findUnique({ where: { eventId } });
      if (!completion || completion.certificateRevision !== expectedCertificateRevision) throw new Error("Certificate publication revision changed");
      const chosen = await tx.certificate.findMany({ where: { id: { in: selection.map((row) => row.certificateId) }, eventId } });
      const now = new Date();
      for (const selected of chosen) {
        await tx.certificate.updateMany({ where: { eventId, type: selected.type, publishedAt: { not: null }, id: { not: selected.id }, supersededByVersion: null }, data: { status: "superseded", supersededByVersion: selected.version } });
        // Keep the legacy persistence status while publishedAt/publishedUrl are
        // the source of truth for V3 publication.
        await tx.certificate.update({ where: { id: selected.id }, data: { status: "ready", publishedUrl: selected.publishedUrl ?? selected.imageUrl, publishedAt: selected.publishedAt ?? now } });
      }
      const updated = await tx.tournamentCompletion.updateMany({ where: { id: completion.id, certificateRevision: expectedCertificateRevision }, data: { certificateRevision: { increment: 1 } } });
      if (updated.count !== 1) throw new Error("Certificate publication revision changed");
      const version = expectedCertificateRevision + 1;
      const publication = await tx.certificatePublication.create({ data: { eventId, completionId: completion.id, version, completionVersion: completionVersion(completion.sourceSnapshot) ?? 0, certificateIds: selection.map((row) => row.certificateId), idempotencyKey, fingerprint, actorUserId: actorId, publishedAt: now } });
      return { publicationVersion: version, publishedAt: publication.publishedAt.toISOString() };
    },
  };
}

export function createPrismaCertificateStudioDependencies(actor: CertificateStudioActor): CertificateStudioDependencies {
  const generationRepository = createPrismaGenerationRepository();
  const storage = createOnlyCertificateStorage();
  return {
    transaction: async (eventId, work) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await prisma.$transaction((tx) => work(transactionObject(tx, eventId, actor)), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
          const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
          if (!["P2034", "P2002"].includes(code ?? "") || attempt === 2) throw error;
        }
      }
      throw new Error("Certificate Studio transaction exhausted retries");
    },
    generate: (data, context) => generateMiracleV3Certificate({ data }, createMiracleV3GenerationAdapter(generationRepository, storage, { idempotencyKey: context.idempotencyKey, now: new Date() })),
  };
}
