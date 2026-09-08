import { prisma } from "@/lib/platform/db";
import type { AppUser } from "@/lib/platform/types";

function mapUser(row: { id: string; email: string; name: string; role: string; deactivatedAt?: Date | null }): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as AppUser["role"],
    ...(row.deactivatedAt ? { deactivatedAt: row.deactivatedAt } : {}),
  };
}

export async function getUserById(userId: string | undefined): Promise<AppUser | null> {
  if (!userId) return null;
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) return null;
  return mapUser(row);
}

// Legacy naming compatibility; this lookup has always resolved by user id.
export async function getCaptainById(userId: string | undefined): Promise<AppUser | null> {
  return getUserById(userId);
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return mapUser(row);
}

export async function getUserWithPasswordByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.passwordHash };
}

export async function getUserPasswordHashById(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return row?.passwordHash ?? null;
}

export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, tempPassword: null },
  });
}
