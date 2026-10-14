import { prisma } from "@/lib/platform/db";
import { trustedAsset } from "./studio-repository";

export type EventTeamLogo = { readonly id: string; readonly name: string; readonly logoUrl: string | null };

/** Loads a team only when it belongs to the given event, so a team id from another event is never readable. */
export async function findEventTeamLogo(eventId: string, teamId: string): Promise<EventTeamLogo | null> {
  return prisma.team.findFirst({ where: { id: teamId, eventId }, select: { id: true, name: true, logoUrl: true } });
}

const MAX_DEDUPE_CANDIDATES = 20;

/**
 * Finds an already approved certificate logo with identical bytes so repeated imports reuse it. The query only
 * narrows candidates: each one must also pass the same trust check the studio applies before it is selectable.
 */
export async function findApprovedTeamLogoAssetId(eventId: string, contentSha256: string): Promise<string | null> {
  const rows = await prisma.eventVisualAsset.findMany({
    where: {
      eventId, status: "approved", purpose: "certificate_team_logo", contentSha256,
      storageKey: { startsWith: "certificate-assets/" },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_DEDUPE_CANDIDATES,
    select: { id: true, url: true, mimeType: true, width: true, height: true, byteSize: true, storageProvider: true, storageKey: true, contentSha256: true, purpose: true },
  });
  return rows.find((row) => trustedAsset(row) !== null)?.id ?? null;
}
