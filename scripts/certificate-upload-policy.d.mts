export type LegacyUploadCertificate = {
  id: string;
  eventId: string;
  teamId: string;
  type: string;
  recipientKind: string;
  recipientId: string;
  recipientName: string;
  version: number;
  templateVersion: string;
  completionId: string | null;
};

export function buildLegacyUploadAppend(
  certificate: LegacyUploadCertificate,
  completedV3: { id: string } | null,
  imageUrl: string,
  publishedAt: Date,
): Record<string, unknown>;
