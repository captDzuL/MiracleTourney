import { createHash, randomBytes } from "crypto";

import { prisma } from "./db";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const INVALID_PASSWORD_RESET_TOKEN_MESSAGE = "Token tidak valid atau sudah kadaluarsa";

/** Returns the one-way digest persisted for a password reset token. */
export function digestPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createPasswordResetToken(userId: string, now: Date = new Date()): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const token = digestPasswordResetToken(rawToken);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.create({ data: { userId, token, expiresAt } });
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
