import { createHash } from "node:crypto";

import { prisma } from "@/lib/platform/db";

import {
  checkLocalRateLimit,
  markLocalRateLimitDenied,
  resetLocalRateLimitForTests,
} from "./rate-limit-local";

const MAX_CAS_ATTEMPTS = 32;
const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
let nextCleanupAt = 0;

/** Stable, non-reversible storage key; raw IP/email/token input never reaches the database. */
export function digestRateLimitKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function cleanupExpiredBuckets(nowMs: number) {
  if (nowMs < nextCleanupAt) return;
  // Reserve the next cleanup slot before I/O so a slow request cannot create
  // an unbounded cleanup fan-out on a busy instance.
  nextCleanupAt = nowMs + CLEANUP_INTERVAL_MS;
  const cutoff = new Date(nowMs - CLEANUP_RETENTION_MS);

  try {
    const stale = await prisma.rateLimitBucket.findMany({
      where: { resetAt: { lt: cutoff } },
      select: { key: true },
      take: CLEANUP_BATCH_SIZE,
    });
    if (stale.length === 0) return;

    await prisma.rateLimitBucket.deleteMany({
      where: {
        key: { in: stale.map((row) => row.key) },
        // Re-check the retention predicate so a concurrent window reset is
        // never deleted by cleanup.
        resetAt: { lt: cutoff },
      },
    });
  } catch {
    // Cleanup is best effort and never changes the allow/deny decision.
  }
}

async function incrementSharedBucket(
  hashedKey: string,
  limit: number,
  windowMs: number,
  now: Date,
): Promise<boolean> {
  const nextResetAt = new Date(now.getTime() + windowMs);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await prisma.rateLimitBucket.findUnique({ where: { key: hashedKey } });

    if (!current) {
      try {
        await prisma.rateLimitBucket.create({
          data: { key: hashedKey, count: 1, resetAt: nextResetAt },
        });
        return true;
      } catch (error) {
        // Another instance won the unique-key insert. Re-read and retry the
        // CAS; all other database errors fail closed in the caller.
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    if (current.resetAt.getTime() <= now.getTime()) {
      const reset = await prisma.rateLimitBucket.updateMany({
        where: { key: hashedKey, count: current.count, resetAt: current.resetAt },
        data: { count: 1, resetAt: nextResetAt },
      });
      if (reset.count === 1) return true;
      continue;
    }

    if (current.count >= limit) return false;

    const incremented = await prisma.rateLimitBucket.updateMany({
      where: { key: hashedKey, count: current.count, resetAt: current.resetAt },
      data: { count: { increment: 1 } },
    });
    if (incremented.count === 1) return true;
  }

  // Contention that does not settle within the bounded retry budget is a
  // denial, never an implicit allow.
  return false;
}

/**
 * Authoritative, production-wide rate-limit check.
 *
 * The local tracker can only provide an early denial. Every local allow is
 * resolved through the shared Prisma bucket using compare-and-swap predicates.
 * Database errors and exhausted contention retries fail closed.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isFinite(windowMs) || windowMs <= 0 || Number.isNaN(now.getTime())) {
    return false;
  }

  const localKey = digestRateLimitKey(key);
  if (!checkLocalRateLimit(localKey, limit, windowMs, now.getTime())) return false;

  try {
    const allowed = await incrementSharedBucket(digestRateLimitKey(key), limit, windowMs, now);
    if (!allowed) {
      markLocalRateLimitDenied(localKey, windowMs, now.getTime());
      return false;
    }
    await cleanupExpiredBuckets(now.getTime());
    return true;
  } catch {
    // Rate limiting protects expensive/authentication operations. A database
    // failure must not turn into an allow, and callers retain generic errors.
    markLocalRateLimitDenied(localKey, windowMs, now.getTime());
    return false;
  }
}

/** Test-only reset hook for the in-memory cleanup scheduler and fallback. */
export function resetRateLimitForTests() {
  nextCleanupAt = 0;
  resetLocalRateLimitForTests();
}
