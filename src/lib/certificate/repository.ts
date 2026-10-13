// Certificate records: success and failure records, lookups and counts.
// Moved out of platform/repository.ts without changes (refactor PR 2.12).

import { prisma } from "@/lib/platform/db";
import type { Certificate } from "@/lib/platform/types";
import { Prisma } from "@prisma/client";

/** Longest error message we persist on a failed certificate row. */
export const MAX_CERTIFICATE_ERROR_LENGTH = 500;

export async function runSerializableCertificateTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if ((code !== "P2034" && code !== "P2002") || attempt === 2) throw error;
    }
  }
  throw new Error("Certificate version changed concurrently. Please retry.");
}

export type CertificateRow = {
  id: string;
  eventId: string;
  teamId: string;
  imageUrl: string;
  status: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    imageUrl: row.imageUrl,
    status: row.status === "ready" || row.status === "published" ? "ready" : "failed",
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const LEGACY_CHAMPION_CERTIFICATE_FILTER = {
  type: "champion",
  recipientKind: "team",
} as const;

export const LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  templateVersion: "legacy-v1",
} as const;

export const LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  status: "ready",
  publishedUrl: { not: null },
} as const;

export async function getCertificateRecipientName(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return team?.name ?? teamId;
}

export async function assertLegacyCertificateWriteAllowed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const completion = await tx.tournamentCompletion.findFirst({
    where: { eventId },
    select: { id: true },
  });
  if (completion) {
    throw new Error("Completion V3 certificates must be generated in Certificate Studio");
  }
}

/** Marks an event's Champion certificate as successfully generated, clearing any previous failure. */
export async function recordCertificateSuccess(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {
  const recipientName = await getCertificateRecipientName(teamId);
  const now = new Date();
  const createData = {
    eventId,
    teamId,
    ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
    recipientId: teamId,
    recipientName,
    imageUrl,
    publishedUrl: imageUrl,
    status: "ready",
    generatedAt: now,
    publishedAt: now,
    lastError: null,
    attemptCount: 1,
  } as const;
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const isPublished = Boolean(existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl));

    if (isPublished && existing) {
      const nextVersion = existing.version + 1;
      await tx.certificate.update({
        where: { id: existing.id },
        data: { supersededByVersion: nextVersion },
      });
      return tx.certificate.create({ data: { ...createData, version: nextVersion } });
    }
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          imageUrl,
          publishedUrl: imageUrl,
          status: "ready",
          generatedAt: now,
          publishedAt: now,
          lastError: null,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({ data: createData });
  });
  return toCertificate(row);
}

/**
 * Records a failed generation attempt so the admin panel can surface the reason and offer a retry.
 * Keeps the Champion row so the failure is visible instead of looking like "no certificate yet".
 */
export async function recordCertificateFailure(eventId: string, teamId: string, message: string): Promise<Certificate> {
  const lastError = message.slice(0, MAX_CERTIFICATE_ERROR_LENGTH);
  const recipientName = await getCertificateRecipientName(teamId);
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    if (existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl)) return existing;
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          status: "failed",
          lastError,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({
      data: {
        eventId,
        teamId,
        ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        recipientId: teamId,
        recipientName,
        imageUrl: "",
        status: "failed",
        lastError,
        attemptCount: 1,
      },
    });
  });
  return toCertificate(row);
}

/** Returns the latest Champion team certificate for an event, preserving the legacy API. */
export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {
  const publishedRow = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (publishedRow) return toCertificate(publishedRow);

  const row = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (!row) return null;
  return toCertificate(row);
}

/** Batch-fetches generated certificates for multiple events. */
export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {
  const certificates = new Map(eventIds.map((eventId) => [eventId, null as Certificate | null]));
  if (!eventIds.length) return certificates;

  try {
    const rows = await prisma.certificate.findMany({
      where: { eventId: { in: eventIds }, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    for (const row of rows) {
      if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
    }
    const eventIdsWithoutPublishedCertificate = eventIds.filter((eventId) => !certificates.get(eventId));
    if (eventIdsWithoutPublishedCertificate.length) {
      const fallbackRows = await prisma.certificate.findMany({
        where: {
          eventId: { in: eventIdsWithoutPublishedCertificate },
          ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      });
      for (const row of fallbackRows) {
        if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
      }
    }
  } catch {
    await Promise.all(
      eventIds.map(async (eventId) => {
        certificates.set(eventId, await getCertificateByEvent(eventId));
      }),
    );
  }

  return certificates;
}

/**
 * Counts successfully generated certificates for a given game prefix (e.g. "game-flashpeak")
 * to generate sequential IDs. Failed attempts are excluded so the sequence has no gaps.
 */
export async function countCertificatesForGame(gameId: string): Promise<number> {
  return prisma.certificate.count({
    where: { status: "ready", ...LEGACY_CHAMPION_CERTIFICATE_FILTER, event: { gameId } },
  });
}
