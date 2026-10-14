import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/platform/db";
import type { AppUser } from "@/lib/platform/types";

/** True when the account is the captain of at least one team. */
export async function ownsATeam(userId: string): Promise<boolean> {
  return (await prisma.team.count({ where: { captainId: userId } })) > 0;
}

/**
 * The signed-in person when they may run a team: a captain, or a player whom a solo draw made captain of a team.
 * Null for everybody else, including a player who captains nothing. This only says who the person is; every
 * action still checks that the team it touches is theirs.
 */
export async function getCaptainOrTeamOwner(): Promise<AppUser | null> {
  const captain = await requireRole("captain");
  if (captain) return captain;
  const player = await requireRole("player");
  if (!player) return null;
  return (await ownsATeam(player.id)) ? player : null;
}

/** The signed-in captain. A player is never one: registering teams stays with captain accounts. */
export async function getCaptainOnly(): Promise<AppUser | null> {
  return requireRole("captain");
}

/** A captain or a player, for the few things every account of those two roles does, such as changing a password. */
export async function getCaptainOrPlayer(): Promise<AppUser | null> {
  return (await requireRole("captain")) ?? (await requireRole("player"));
}
