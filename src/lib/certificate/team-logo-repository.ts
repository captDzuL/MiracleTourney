import { prisma } from "@/lib/platform/db";
import { findApprovedCertificateAssetId } from "./approved-asset-repository";

export type EventTeamLogo = { readonly id: string; readonly name: string; readonly logoUrl: string | null };

/** Loads a team only when it belongs to the given event, so a team id from another event is never readable. */
export async function findEventTeamLogo(eventId: string, teamId: string): Promise<EventTeamLogo | null> {
  return prisma.team.findFirst({ where: { id: teamId, eventId }, select: { id: true, name: true, logoUrl: true } });
}

/** Finds an already approved certificate team logo with identical bytes, so repeated imports reuse it. */
export const findApprovedTeamLogoAssetId = (eventId: string, contentSha256: string) =>
  findApprovedCertificateAssetId(eventId, "certificate_team_logo", contentSha256);
