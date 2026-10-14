export type MiracleV3CertificateType = "champion" | "runner_up" | "third_place" | "mvp" | "top_scorer" | "top_defender" | "top_assist";
export interface MiracleV3CertificateData {
  eventId: string; eventName: string; gameId: string; gameName: string;
  certificateId: string; certificateType: MiracleV3CertificateType; version: number; templateVersion: string;
  recipientId: string; recipientName: string; recipientKind: "team" | "player";
  teamId: string; teamName: string; teamLogoUrl: string | null; characterArtUrl: string | null;
  issueDate: string; verificationCode: string; verificationBaseUrl: string;
  branding: { cyan: string; violet: string; cream: string };
  assetPlacement?: { assetKind: "team_logo_hero" | "team_logo_badge" | "character_art"; x: number; y: number; width: number; height: number } | null;
  assetPlacements?: readonly { assetKind: "team_logo_hero" | "team_logo_badge" | "character_art"; x: number; y: number; width: number; height: number }[] | null;
}
export const MIRACLE_V3_CERTIFICATE_TYPES = Object.freeze(["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"] as const);
/** Certificate type for a podium rank. Any rank past 2 is third place. */
export const podiumCertificateType = (rank: number): "champion" | "runner_up" | "third_place" =>
  rank === 1 ? "champion" : rank === 2 ? "runner_up" : "third_place";
/**
 * A podium with only a champion and a runner-up (no third-place match) has no third-place certificate.
 * Any other podium, including an unknown one, needs the full set of seven.
 */
export function requiredCertificateTypes(podiumRanks: readonly number[]): readonly MiracleV3CertificateType[] {
  const twoPlaces = podiumRanks.includes(1) && podiumRanks.includes(2) && !podiumRanks.includes(3);
  return twoPlaces ? MIRACLE_V3_CERTIFICATE_TYPES.filter((type) => type !== "third_place") : MIRACLE_V3_CERTIFICATE_TYPES;
}
export const MIRACLE_V3_BRANDING = Object.freeze({ cyan: "#49d1ec", violet: "#aa8bff", cream: "#f6dfb1" });
const rect = (x: number, y: number, width: number, height: number) => Object.freeze({ x, y, width, height });
export const MIRACLE_V3_SAFE_ZONES = Object.freeze({
  identity: rect(64, 56, 952, 248), award: rect(64, 380, 952, 260),
  hero: rect(304, 688, 712, 660), secondaryBadge: rect(64, 1040, 208, 264),
  recipient: rect(64, 1412, 952, 208), issueDate: rect(64, 1680, 608, 72),
  certificateId: rect(64, 1780, 608, 84), qrVerification: rect(768, 1660, 248, 232),
});
