// Identity: users, passwords and captain account creation.
// Moved out of platform/repository.ts without changes (refactor PR 2.13).

import { prisma } from "@/lib/platform/db";
import { mapUser } from "@/lib/platform/shared/mappers";
import type { AppUser } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";
import type { Prisma } from "@prisma/client";

/** Looks up a user by ID. Returns null for undefined input or missing records. Used by session resolution. */
export async function getCaptainById(userId: string | undefined): Promise<AppUser | null> {
  if (!userId) return null;
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) return null;
  return mapUser(row);
}

/** Lists organizer accounts that platform admins can assign as event owners. */
export async function getOrganizerUsers(): Promise<AppUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: "organizer" },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });
  return rows.map(mapUser);
}

/** Looks up one organizer account for server-side event ownership assignment. */
export async function getOrganizerUserById(userId: string): Promise<AppUser | null> {
  const row = await prisma.user.findFirst({
    where: { id: userId, role: "organizer" },
    select: { id: true, email: true, name: true, role: true },
  });
  return row ? mapUser(row) : null;
}

/** Looks up a user by email without exposing the password hash. For duplicate-email checks and session resolution. */
export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return mapUser(row);
}

/** Fetches user with passwordHash included. Only used by the sign-in flow for bcrypt comparison. */
export async function getUserWithPasswordByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.passwordHash };
}

/** Fetches only the password hash for the change-password flow. Returns null if user not found. */
export async function getUserPasswordHashById(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return row?.passwordHash ?? null;
}

/** Returns all captain-role users, for admin assignment dropdown. */
/**
 * Which captain accounts a user may see and attach to a team. Platform admins and legacy admins see every captain.
 * An organizer sees only captains who already have a team or a registration request in one of their own events,
 * so one organizer can neither list nor take over the captains of another organizer's events.
 */
function captainsVisibleTo(user: AppUser): Prisma.UserWhereInput {
  if (user.role !== "organizer") return { role: "captain" };
  return {
    role: "captain",
    OR: [
      { captainOf: { some: { event: { organizerUserId: user.id } } } },
      { teamRegistrationRequests: { some: { event: { organizerUserId: user.id } } } },
    ],
  };
}

export async function getCaptainUsersForAdmin(user: AppUser) {
  return prisma.user.findMany({
    where: captainsVisibleTo(user),
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** A captain account the user is allowed to attach to a team, or null when it does not exist or is out of reach. */
export async function findAssignableCaptain(user: AppUser, captainUserId: string): Promise<{ id: string; name: string } | null> {
  return prisma.user.findFirst({
    where: { id: captainUserId, ...captainsVisibleTo(user) },
    select: { id: true, name: true },
  });
}

/** Attaches a captain to a team, or clears the captain when `captain` is null. */
export async function setTeamCaptain(teamId: string, captain: { id: string; name: string } | null): Promise<void> {
  await prisma.team.update({
    where: { id: teamId },
    data: captain ? { captainId: captain.id, captainName: captain.name } : { captainId: null, captainName: null },
  });
}

/** Returns true if the user still has a temporary password set from a CSV import. Used to prompt password change on first login. */
export async function hasTempPassword(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tempPassword: true } });
  return row?.tempPassword != null;
}

/**
 * Sets a new password and ends every session of the account that was opened before it: the session
 * version goes up, and a token carries the version it was made with. The caller re-issues the cookie of
 * the session that made the change, so that one stays signed in. Also clears any first-login lock and
 * temporary secret.
 */
export async function updateUserPassword(userId: string, newHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, tempPassword: null, mustChangePassword: false, sessionVersion: { increment: 1 } } as never,
  });
}

/** Legacy captain alias retained for current captain settings and imports. */
export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {
  await updateUserPassword(userId, newHash);
}

export const EMAIL_ALREADY_REGISTERED_MESSAGE = "Email ini sudah terdaftar. Coba login.";

/** Creates a captain User without requiring an active event or team registration. */
export async function createCaptainAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<{ userId: string }> {
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "captain",
        passwordHash: input.passwordHash,
      },
    });
    return { userId: user.id };
  } catch (error) {
    // The only unique column on User that this write can hit is the email.
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "P2002") throw new UserFacingError(EMAIL_ALREADY_REGISTERED_MESSAGE);
    throw error;
  }
}

/** Creates a player account together with its contact profile, in one statement. */
export async function createPlayerAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
  whatsapp: string;
}): Promise<{ userId: string }> {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: "player",
      passwordHash: input.passwordHash,
      playerProfile: { create: { whatsapp: input.whatsapp } },
    },
  });
  return { userId: user.id };
}

/** Id and role of a user, or null when the user does not exist. */
export async function getUserRoleRef(userId: string): Promise<{ id: string; role: string } | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
}

/** Marks an account as deactivated. A deactivated user cannot log in. */
export async function deactivateUser(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
}
