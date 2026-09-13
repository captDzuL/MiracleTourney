import { prisma } from "@/lib/platform/db";

import {
  isValidCertificateVerificationCode,
  resolvePublicCertificateVerification,
  type PublicCertificateVerification,
} from "./verification";

export async function loadPublishedCertificateVerification(
  verificationCode: string,
): Promise<PublicCertificateVerification | null> {
  if (!isValidCertificateVerificationCode(verificationCode)) return null;

  return resolvePublicCertificateVerification(verificationCode, async (exactCode) => prisma.certificate.findUnique({
    where: { verificationCode: exactCode },
    select: {
      verificationCode: true,
      type: true,
      version: true,
      recipientName: true,
      status: true,
      publishedAt: true,
      supersededByVersion: true,
      event: { select: { name: true } },
    },
  }));
}
