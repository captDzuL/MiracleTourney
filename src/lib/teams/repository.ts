// Teams and players: reads, logos, roster edits and the display captain.
// Moved out of platform/repository.ts without changes (refactor PR 2.4).

import { prisma } from "@/lib/platform/db";
import { assertUserCanManageTeam } from "@/lib/platform/shared/authz";
import { CACHE_TAGS } from "@/lib/platform/shared/constants";
import { mapPlayer, mapTeam } from "@/lib/platform/shared/mappers";
import { assertEventRosterMutable, runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import type { AppUser, Player, Team } from "@/lib/platform/types";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/**
 * Cached (30s, tag "teams") team list for an event, ordered by registration time.
 * Cache is busted by `revalidateTag("teams")` after any team mutation.
 * Also memoised per-request via React cache to prevent duplicate DB hits within a render.
 */
export const getTeamsForEvent = cache(
  unstable_cache(
    async (eventId: string): Promise<Team[]> => {
      const rows = await prisma.team.findMany({ where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { captain: { select: { id: true, name: true } } } });
      return rows.map(mapTeam);
    },
    ["teams-for-event"],
    { revalidate: 30, tags: [CACHE_TAGS.teams] },
  ),
);

/** Batch-fetches teams for multiple events in one query. */
export async function getTeamsForEvents(eventIds: string[]): Promise<Map<string, Team[]>> {
  const teamsByEvent = new Map(eventIds.map((eventId) => [eventId, [] as Team[]]));
  if (!eventIds.length) return teamsByEvent;

  const rows = await prisma.team.findMany({
    where: { eventId: { in: eventIds } },
    orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: { captain: { select: { id: true, name: true } } },
  });
  for (const team of rows.map(mapTeam)) {
    if (team.eventId) teamsByEvent.get(team.eventId)?.push(team);
  }

  return teamsByEvent;
}

/** Batch-counts teams for event summary UI without transferring every team row. */
export async function getTeamCountsForEvents(eventIds: string[]): Promise<Map<string, number>> {
  const counts = new Map(eventIds.map((eventId) => [eventId, 0]));
  if (!eventIds.length) return counts;

  const rows = await prisma.team.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (row.eventId) counts.set(row.eventId, row._count._all);
  }

  return counts;
}

/** Returns all teams registered by a specific captain across all events. Returns empty array for undefined userId. */
export async function getCaptainTeams(userId: string | undefined): Promise<Team[]> {
  if (!userId) return [];
  const rows = await prisma.team.findMany({
    where: { captainId: userId },
    include: { captain: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(mapTeam);
}

export async function updateTeamLogo(user: AppUser, teamId: string, logoUrl: string): Promise<Team> {
  await assertUserCanManageTeam(user, teamId);
  const row = await prisma.team.update({
    where: { id: teamId },
    data: { logoUrl },
  });
  return mapTeam(row);
}

export async function updateCaptainTeamLogo(captainId: string, teamId: string, logoUrl: string): Promise<Team> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, captainId },
    select: { id: true },
  });
  if (!team) throw new Error("Not authorized");

  const row = await prisma.team.update({
    where: { id: teamId },
    data: { logoUrl },
  });
  return mapTeam(row);
}

/** Returns all players for a single team, ordered by registration time. */
export async function getPlayersForTeam(teamId: string): Promise<Player[]> {
  const rows = await prisma.player.findMany({ where: { teamId, removedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.map(mapPlayer);
}

/** Batch-fetches players for multiple teams in a single query, ordered by team then jersey number. */
export async function getPlayersForTeams(teamIds: string[]): Promise<Player[]> {
  if (!teamIds.length) return [];
  const rows = await prisma.player.findMany({
    where: { teamId: { in: teamIds }, removedAt: null },
    orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
  });
  return rows.map(mapPlayer);
}

/** Returns all players across all teams registered in a given event. */
export async function getPlayersForEvent(eventId: string): Promise<Player[]> {
  const rows = await prisma.player.findMany({ where: { eventId, removedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.map(mapPlayer);
}

/** Adds a new player to a team. UID and IGN are required; position and jersey number remain optional. */
export async function addPlayer(input: {
  teamId: string;
  eventId?: string;
  captainId?: string;
  displayName: string;
  nickname: string;
  position?: string;
  jerseyNumber?: number;
}): Promise<Player> {
  try {
    return await runSerializableRegistrationTransaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: input.teamId, ...(input.captainId ? { captainId: input.captainId } : {}) },
        select: { eventId: true },
      });
      if (!team) throw new Error("Tim tidak ditemukan untuk akun ini.");
      if (input.eventId && team.eventId && input.eventId !== team.eventId) {
        throw new Error("Data event pemain tidak cocok dengan tim.");
      }
      const eventId = input.eventId ?? team.eventId ?? undefined;
      if (eventId) await assertEventRosterMutable(tx, eventId);
      const row = await tx.player.create({ data: {
        teamId: input.teamId,
        ...(eventId ? { eventId } : {}),
        displayName: input.displayName.trim(),
        nickname: input.nickname.trim(),
        position: input.position?.trim() ?? "",
        ...(input.jerseyNumber != null ? { jerseyNumber: input.jerseyNumber } : {}),
      } });
      return mapPlayer(row);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Pemain dengan IGN ini sudah ada di tim.");
    }
    throw e;
  }
}

/**
 * Updates a player's profile. Throws "Not authorized" if the player's team does not
 * belong to `captainUserId`. Ownership is enforced at the DB layer, not the action layer.
 * Also throws if the team's event roster is locked (event Ongoing/Finished).
 */
export async function updatePlayer(
  id: string,
  captainUserId: string,
  data: { displayName?: string; nickname?: string; position?: string; jerseyNumber?: number | null },
): Promise<Player> {
  return runSerializableRegistrationTransaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to edit this player.");
    }
    if (player.team.eventId) await assertEventRosterMutable(tx, player.team.eventId);
    return mapPlayer(await tx.player.update({ where: { id }, data }));
  });
}

/**
 * Deletes a player. Throws "Not authorized" if the player's team does not belong to `captainUserId`.
 * Ownership check mirrors `updatePlayer`. Also throws if the team's event roster is locked
 * (event Ongoing/Finished).
 */
export async function deletePlayer(id: string, captainUserId: string): Promise<void> {
  await runSerializableRegistrationTransaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to delete this player.");
    }
    if (player.team.eventId) await assertEventRosterMutable(tx, player.team.eventId);
    await tx.player.delete({ where: { id } });
  });
}

export async function setTeamCaptainDisplay(teamId: string, captainUserId: string, playerId: string): Promise<void> {
  const player = await prisma.player.findFirst({
    where: { id: playerId, teamId, removedAt: null, team: { captainId: captainUserId } },
    select: { displayName: true },
  });
  if (!player) {
    throw new Error("Not authorized to update this team.");
  }
  await prisma.team.update({ where: { id: teamId }, data: { captainName: player.displayName } });
}
