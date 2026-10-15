import { prisma } from "@/lib/platform/db";
import { trustedAsset } from "./studio-repository";

const MAX_DEDUPE_CANDIDATES = 20;

export type CertificateAssetPurposeName = "certificate_team_logo" | "certificate_character_art";

/**
 * Finds an already approved certificate asset with identical bytes so repeated imports reuse it. The query only
 * narrows candidates: each one must also pass the same trust check the studio applies before it is selectable.
 */
export async function findApprovedCertificateAssetId(eventId: string, purpose: CertificateAssetPurposeName, contentSha256: string): Promise<string | null> {
  const rows = await prisma.eventVisualAsset.findMany({
    where: {
      eventId, status: "approved", purpose, contentSha256,
      storageKey: { startsWith: "certificate-assets/" },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_DEDUPE_CANDIDATES,
    select: { id: true, url: true, mimeType: true, width: true, height: true, byteSize: true, storageProvider: true, storageKey: true, contentSha256: true, purpose: true },
  });
  return rows.find((row) => trustedAsset(row) !== null)?.id ?? null;
}

export const findApprovedCharacterArtAssetId = (eventId: string, contentSha256: string) =>
  findApprovedCertificateAssetId(eventId, "certificate_character_art", contentSha256);
