import { randomBytes } from "crypto";
import { prisma } from "./db";

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.create({ data: { userId, token, expiresAt } });
  return token;
}

export async function verifyPasswordResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function consumePasswordResetToken(token: string, newPasswordHash: string) {
  const record = await verifyPasswordResetToken(token);
  if (!record) throw new Error("Token tidak valid atau sudah kadaluarsa");
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash, tempPassword: null },
    }),
  ]);
}
