import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import type { CreateOnlyCertificateStorage, DurableGenerationRepository } from "./service";

export class CertificateGenerationInProgressError extends Error {
  constructor() { super("Certificate generation is already in progress"); this.name = "CertificateGenerationInProgressError"; }
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Certificate generation transaction exhausted retries");
}

export function createPrismaGenerationRepository(): DurableGenerationRepository {
  return {
    claim: (input) => serializable(async (tx) => {
      const row = await tx.certificate.findUnique({ where: { id: input.identity.certificateId } });
      if (!row || row.eventId !== input.identity.eventId || row.type !== input.identity.certificateType
        || row.recipientId !== input.identity.recipientId || row.version !== input.identity.version) throw new Error("Certificate generation identity does not match");
      if ((row.status === "ready" || row.status === "published") && row.imageUrl) return { status: row.status, imageUrl: row.publishedUrl ?? row.imageUrl };
      if (row.status === "generating" && row.generationClaimedAt && row.generationClaimedAt >= input.staleBefore) throw new CertificateGenerationInProgressError();
      const attemptId = randomUUID();
      const changed = await tx.certificate.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt, status: { in: ["draft", "failed", "generating"] } },
        data: { status: "generating", generationAttemptId: attemptId, generationClaimedAt: input.now, generationIdempotencyKey: input.idempotencyKey, lastError: null, attemptCount: { increment: 1 } },
      });
      if (changed.count !== 1) throw new CertificateGenerationInProgressError();
      return { status: "claimed", attemptId };
    }),
    recordSuccess: async ({ identity, attemptId, imageUrl, fingerprint }) => {
      const changed = await prisma.certificate.updateMany({
        where: { id: identity.certificateId, eventId: identity.eventId, type: identity.certificateType, recipientId: identity.recipientId, version: identity.version, status: "generating", generationAttemptId: attemptId },
        data: { status: "ready", imageUrl, generatedAt: new Date(), generationFingerprint: fingerprint, generationAttemptId: null, generationClaimedAt: null, lastError: null },
      });
      if (changed.count !== 1) {
        const existing = await prisma.certificate.findUnique({ where: { id: identity.certificateId } });
        if (!existing || !["ready", "published"].includes(existing.status) || existing.imageUrl !== imageUrl) throw new Error("Certificate generation claim was lost");
      }
    },
    recordFailure: async ({ identity, attemptId, message }) => {
      await prisma.certificate.updateMany({
        where: { id: identity.certificateId, eventId: identity.eventId, type: identity.certificateType, recipientId: identity.recipientId, version: identity.version, status: "generating", generationAttemptId: attemptId },
        data: { status: "failed", lastError: message.slice(0, 500), generationAttemptId: null, generationClaimedAt: null },
      });
    },
  };
}

export function createOnlyCertificateStorage(): CreateOnlyCertificateStorage {
  return {
    put: async ({ filename, body }) => {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { put } = await import("@vercel/blob");
        const result = await put(filename, body, { access: "public", contentType: "image/png", addRandomSuffix: false, allowOverwrite: false });
        return result.url;
      }
      const relative = filename.replace(/^certificates\//, "");
      const target = path.join(process.cwd(), "public", "certificates", relative);
      const root = path.resolve(process.cwd(), "public", "certificates");
      if (!path.resolve(target).startsWith(root + path.sep)) throw new Error("Unsafe certificate path");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body, { flag: "wx" });
      return `/certificates/${relative.replaceAll("\\", "/")}`;
    },
  };
}
