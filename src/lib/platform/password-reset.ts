import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { prisma } from "./db";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_LEGACY_RAW_READ_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_DIGEST_TOKEN_FORMAT = "sha256";
export const PASSWORD_RESET_LEGACY_TOKEN_FORMAT = "legacy_raw";
export const INVALID_PASSWORD_RESET_TOKEN_MESSAGE = "Token tidak valid atau sudah kadaluarsa";
const PASSWORD_RESET_RESPONSE_MIN_DELAY_MS = 250;

/** Returns the one-way digest persisted for a password reset token. */
export function digestPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function isUsablePasswordResetRecord(
  record: {
    token: string;
    tokenFormat?: string | null;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
  },
  suppliedToken: string,
  now: Date,
): boolean {
  if (record.usedAt || record.expiresAt <= now) return false;

  const tokenFormat = record.tokenFormat ?? PASSWORD_RESET_LEGACY_TOKEN_FORMAT;
  if (tokenFormat === PASSWORD_RESET_DIGEST_TOKEN_FORMAT) {
    // A digest row is never interpreted as a legacy raw row.
    return constantTimeEqual(record.token, digestPasswordResetToken(suppliedToken));
  }

  if (tokenFormat !== PASSWORD_RESET_LEGACY_TOKEN_FORMAT) return false;

  // Legacy writers historically used a longer expiry. Clamp those rows to
  // the exact 30-minute contract; the seven-day bound is only the maximum
  // deployment-format compatibility window and never extends token validity.
  const exactExpiry = Math.min(
    record.expiresAt.getTime(),
    record.createdAt.getTime() + PASSWORD_RESET_TOKEN_TTL_MS,
  );
  const rolloutExpiry = record.createdAt.getTime() + PASSWORD_RESET_LEGACY_RAW_READ_WINDOW_MS;
  if (now.getTime() >= exactExpiry || now.getTime() >= rolloutExpiry) return false;
  return constantTimeEqual(record.token, suppliedToken);
}

/** Gives deferred known and unknown reset work the same minimum processing window. */
export async function equalizePasswordResetResponse<T>(operation: () => Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    operation(),
    new Promise<void>((resolve) => setTimeout(resolve, PASSWORD_RESET_RESPONSE_MIN_DELAY_MS)),
  ]);
  return result;
}

export async function createPasswordResetToken(userId: string, now: Date = new Date()): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const token = digestPasswordResetToken(rawToken);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.passwordResetToken.upsert({
    where: { userId },
    update: {
      token,
      tokenFormat: PASSWORD_RESET_DIGEST_TOKEN_FORMAT,
      expiresAt,
      usedAt: null,
    },
    create: {
      userId,
      token,
      tokenFormat: PASSWORD_RESET_DIGEST_TOKEN_FORMAT,
      expiresAt,
    },
  });

  return rawToken;
}

export async function verifyPasswordResetToken(token: string, now: Date = new Date()) {
  const digest = digestPasswordResetToken(token);
  const digestRecord = await prisma.passwordResetToken.findUnique({
    where: { token: digest },
    include: { user: { select: { id: true, email: true } } },
  });
  const record = digestRecord ?? await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!record || !isUsablePasswordResetRecord(record, token, now)) return null;
  return record;
}

export async function consumePasswordResetToken(
  token: string,
  newPasswordHash: string,
  now: Date = new Date(),
): Promise<void> {
  const digest = digestPasswordResetToken(token);

  await prisma.$transaction(async (tx) => {
    const digestRecord = await tx.passwordResetToken.findUnique({
      where: { token: digest },
      select: { userId: true, token: true, tokenFormat: true, createdAt: true, expiresAt: true, usedAt: true },
    });
    const record = digestRecord ?? await tx.passwordResetToken.findUnique({
      where: { token },
      select: { userId: true, token: true, tokenFormat: true, createdAt: true, expiresAt: true, usedAt: true },
    });

    if (!record || !isUsablePasswordResetRecord(record, token, now)) {
      throw new Error(INVALID_PASSWORD_RESET_TOKEN_MESSAGE);
    }

    const tokenFormat = record.tokenFormat ?? PASSWORD_RESET_LEGACY_TOKEN_FORMAT;
    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        token: record.token,
        usedAt: null,
        expiresAt: { gt: now },
        ...(tokenFormat === PASSWORD_RESET_LEGACY_TOKEN_FORMAT
          ? { createdAt: { gt: new Date(now.getTime() - PASSWORD_RESET_TOKEN_TTL_MS) } }
          : {}),
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new Error(INVALID_PASSWORD_RESET_TOKEN_MESSAGE);

    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: newPasswordHash,
        tempPassword: null,
        sessionVersion: { increment: 1 },
      },
    });
  });
}
