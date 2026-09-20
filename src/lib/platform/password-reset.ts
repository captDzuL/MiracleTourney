import { createHash, randomBytes } from "crypto";

import { prisma } from "./db";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const INVALID_PASSWORD_RESET_TOKEN_MESSAGE = "Token tidak valid atau sudah kadaluarsa";
const PASSWORD_RESET_RESPONSE_MIN_DELAY_MS = 250;

/** Returns the one-way digest persisted for a password reset token. */
export function digestPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Gives known and unknown reset requests the same minimum observable work window. */
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
    update: { token, expiresAt, usedAt: null },
    create: { userId, token, expiresAt },
  });

  return rawToken;
}

export async function verifyPasswordResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: digestPasswordResetToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  return record;
}

export async function consumePasswordResetToken(
  token: string,
  newPasswordHash: string,
  now: Date = new Date(),
): Promise<void> {
  const digest = digestPasswordResetToken(token);

  await prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { token: digest },
      select: { userId: true },
    });
    if (!record) throw new Error(INVALID_PASSWORD_RESET_TOKEN_MESSAGE);

    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        token: digest,
        usedAt: null,
        expiresAt: { gt: now },
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
