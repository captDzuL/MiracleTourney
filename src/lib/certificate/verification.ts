import {
  MIRACLE_V3_CERTIFICATE_TYPES,
  type MiracleV3CertificateType,
} from "./templates/miracle-v3-contract";

const VERIFICATION_CODE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PUBLIC_CERTIFICATE_STATUSES = new Set(["ready", "published", "superseded"]);

export type PublicCertificateVerification = {
  readonly verificationCode: string;
  readonly eventName: string;
  readonly certificateType: MiracleV3CertificateType;
  readonly certificateVersion: number;
  readonly recipientName: string;
  readonly publishedAt: string;
  readonly state: "current" | "superseded";
  readonly supersededByVersion: number | null;
};

export type CertificateVerificationRow = {
  readonly verificationCode: string;
  readonly type: string;
  readonly version: number;
  readonly recipientName: string;
  readonly status: string;
  readonly publishedAt: Date | null;
  readonly supersededByVersion: number | null;
  readonly event: { readonly name: string };
};

export type CertificateVerificationLookup = (
  verificationCode: string,
) => Promise<CertificateVerificationRow | null>;

export function isValidCertificateVerificationCode(value: string): boolean {
  return VERIFICATION_CODE_PATTERN.test(value);
}

export async function resolvePublicCertificateVerification(
  verificationCode: string,
  lookup: CertificateVerificationLookup,
): Promise<PublicCertificateVerification | null> {
  if (!isValidCertificateVerificationCode(verificationCode)) return null;

  const row = await lookup(verificationCode);
  if (!row || row.verificationCode !== verificationCode) return null;
  if (!PUBLIC_CERTIFICATE_STATUSES.has(row.status) || !(row.publishedAt instanceof Date) || !Number.isFinite(row.publishedAt.getTime())) return null;
  if (!MIRACLE_V3_CERTIFICATE_TYPES.includes(row.type as MiracleV3CertificateType)) return null;
  if (!Number.isSafeInteger(row.version) || row.version < 1) return null;
  if (!row.event.name.trim() || !row.recipientName.trim()) return null;

  const isSuperseded = row.supersededByVersion !== null;
  if (isSuperseded && (!Number.isSafeInteger(row.supersededByVersion) || row.supersededByVersion! <= row.version)) return null;
  if (row.status === "superseded" && !isSuperseded) return null;

  return {
    verificationCode,
    eventName: row.event.name,
    certificateType: row.type as MiracleV3CertificateType,
    certificateVersion: row.version,
    recipientName: row.recipientName,
    publishedAt: row.publishedAt.toISOString(),
    state: isSuperseded ? "superseded" : "current",
    supersededByVersion: row.supersededByVersion,
  };
}
