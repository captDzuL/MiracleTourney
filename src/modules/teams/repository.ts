import { prisma } from "@/lib/platform/db";
import * as demoStore from "@/lib/platform/demo-store";
import type { AppUser, Player, Team } from "@/lib/platform/types";
import type { ActorContext } from "@/modules/identity";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/identity";
import { resolveEventAccessScope } from "@/modules/events";
import { Prisma } from "@prisma/client";

type TeamRow = {
  id: string; eventId: string | null; captainId: string | null;
  name: string; logoText: string; logoUrl?: string | null; tag: string;
  captainName: string | null; captainContact: string | null; source: string;
  captain?: { id: string; name: string } | null;
};

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id, captainId: row.captainId ?? "",
    ...(row.eventId ? { eventId: row.eventId } : {}),
    name: row.name, logoText: row.logoText, tag: row.tag,
    ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
    ...(row.captainName ? { captainName: row.captainName } : {}),
    ...(row.captainContact ? { captainContact: row.captainContact } : {}),
    ...(row.captain != null ? { captain: row.captain } : {}),
    source: row.source as Team["source"],
  };
}

type PlayerRow = {
  id: string; teamId: string; eventId: string | null;
  displayName: string; nickname: string; position: string; jerseyNumber: number | null;
};

function mapPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    teamId: row.teamId,
    ...(row.eventId ? { eventId: row.eventId } : {}),
    displayName: row.displayName,
    nickname: row.nickname,
    position: row.position,
    ...(row.jerseyNumber != null ? { jerseyNumber: row.jerseyNumber } : {}),
  };
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Organizer access is scoped to the actor's tenant; only `platform_admin` has
 * global event access. Reuses the events module's access-scope resolver so
 * ownership semantics never drift between modules. Never exported: every
 * team mutation below resolves ownership through the team's own row via
 * `assertActorCanManageTeam`, not a client-supplied eventId directly.
 */
async function assertActorCanManageEvent(
  actor: ActorContext | null,
  eventId: string,
  client: typeof prisma | TransactionClient = prisma,
): Promise<void> {
  const scope = resolveEventAccessScope(actor);

  if (scope.kind === "platform_admin") return;

  if (scope.kind !== "organizer") {
    throw new ForbiddenError("Not authorized");
  }

  const row = await client.event.findFirst({
    where: { id: eventId, organizerUserId: scope.organizerUserId },
    select: { id: true },
  });

  if (!row) {
    throw new ForbiddenError("Not authorized");
  }
}

/**
 * Organizer access to a team is always derived from the team's own event
 * row, never a client-supplied eventId. Accepts an optional transaction
 * client so mutations can re-verify ownership *inside* the same database
 * transaction as their write, closing the gap a separate preflight-only
 * check would leave open if ownership changed between the check and the
 * write.
 */
export async function assertActorCanManageTeam(
  actor: ActorContext | null,
  teamId: string,
  client: typeof prisma | TransactionClient = prisma,
): Promise<{ eventId: string }> {
  const team = await client.team.findFirst({
    where: { id: teamId },
    select: { id: true, eventId: true },
  });

  if (!team?.eventId) {
    throw new ForbiddenError("Not authorized");
  }

  await assertActorCanManageEvent(actor, team.eventId, client);
  return { eventId: team.eventId };
}

/**
 * Team list for an event, ordered by registration time. Public read, no
 * actor required. Wrapped with the 30s/"teams"-tag cache in `./queries`
 * (this file must not import Next.js cache helpers).
 */
export async function listTeamsForEvent(eventId: string): Promise<Team[]> {
  try {
    const rows = await prisma.team.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { captain: { select: { id: true, name: true } } },
    });
    return rows.map(mapTeam);
  } catch {
    return demoStore.getTeamsForEvent(eventId);
  }
}

/** Batch-fetches teams for multiple events in one query. */
export async function getTeamsForEvents(eventIds: string[]): Promise<Map<string, Team[]>> {
  const teamsByEvent = new Map(eventIds.map((eventId) => [eventId, [] as Team[]]));
  if (!eventIds.length) return teamsByEvent;

  try {
    const rows = await prisma.team.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { captain: { select: { id: true, name: true } } },
    });
    for (const team of rows.map(mapTeam)) {
      if (team.eventId) teamsByEvent.get(team.eventId)?.push(team);
    }
  } catch {
    for (const eventId of eventIds) {
      teamsByEvent.set(eventId, demoStore.getTeamsForEvent(eventId));
    }
  }

  return teamsByEvent;
}

/** Batch-counts teams for event summary UI without transferring every team row. */
export async function getTeamCountsForEvents(eventIds: string[]): Promise<Map<string, number>> {
  const counts = new Map(eventIds.map((eventId) => [eventId, 0]));
  if (!eventIds.length) return counts;

  try {
    const rows = await prisma.team.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.eventId) counts.set(row.eventId, row._count._all);
    }
  } catch {
    for (const eventId of eventIds) {
      counts.set(eventId, demoStore.getTeamsForEvent(eventId).length);
    }
  }

  return counts;
}

export async function getCaptainTeams(userId: string | undefined): Promise<Team[]> {
  if (!userId) return [];

  try {
    const rows = await prisma.team.findMany({
      where: { captainId: userId },
      include: { captain: { select: { id: true, name: true } } },
    });
    return rows.map(mapTeam);
  } catch {
    return demoStore.getCaptainTeams(userId);
  }
}

export async function getPlayersForTeam(teamId: string): Promise<Player[]> {
  try {
    const rows = await prisma.player.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapPlayer);
  } catch {
    return demoStore.getPlayersForTeam(teamId);
  }
}

export async function getPlayersForTeams(teamIds: string[]): Promise<Player[]> {
  if (!teamIds.length) return [];

  try {
    const rows = await prisma.player.findMany({
      where: { teamId: { in: teamIds } },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    });
    return rows.map(mapPlayer);
  } catch {
    return teamIds.flatMap((teamId) => demoStore.getPlayersForTeam(teamId));
  }
}

export async function getPlayersForEvent(eventId: string): Promise<Player[]> {
  try {
    const rows = await prisma.player.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapPlayer);
  } catch {
    return demoStore.getPlayersForEvent(eventId);
  }
}

async function assertRosterEditable(eventId: string, client: TransactionClient): Promise<void> {
  const event = await client.event.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event) throw new Error("Event tidak ditemukan.");
  if (event.status === "Ongoing" || event.status === "Finished") {
    throw new Error("Roster tim sudah terkunci karena turnamen sudah berjalan atau selesai.");
  }
}

export async function assertCaptainCanManageTeam(captainUserId: string, teamId: string): Promise<{ eventId?: string }> {
  try {
    const team = await prisma.team.findFirst({
      where: { id: teamId, captainId: captainUserId },
      select: { eventId: true },
    });
    if (!team) throw new Error("Not authorized");
    return team.eventId ? { eventId: team.eventId } : {};
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") throw error;
    const team = demoStore.getCaptainTeams(captainUserId).find((candidate) => candidate.id === teamId);
    if (!team) throw new Error("Not authorized");
    return team.eventId ? { eventId: team.eventId } : {};
  }
}

export async function updateCaptainTeamLogo(captainUserId: string, teamId: string, logoUrl: string): Promise<Team> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: teamId, captainId: captainUserId },
        select: { eventId: true },
      });
      if (!team) throw new Error("Not authorized");
      return tx.team.update({ where: { id: teamId }, data: { logoUrl } });
    });
    return mapTeam(row);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") throw error;
    const team = demoStore.updateCaptainTeamLogo(captainUserId, teamId, logoUrl);
    if (!team) throw new Error("Not authorized");
    return team;
  }
}

export type AddPlayerInput = {
  teamId: string;
  eventId?: string;
  displayName: string;
  nickname: string;
  position?: string;
  jerseyNumber?: number;
};

async function createPlayerForTeam(
  input: AddPlayerInput,
  captainUserId: string | undefined,
): Promise<Player> {
  try {
    return await prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: input.teamId, ...(captainUserId ? { captainId: captainUserId } : {}) },
        select: { eventId: true },
      });
      if (!team) throw new Error("Tim tidak ditemukan untuk akun ini.");
      if (input.eventId && team.eventId && input.eventId !== team.eventId) {
        throw new Error("Data event pemain tidak cocok dengan tim.");
      }

      const eventId = team.eventId ?? input.eventId;
      if (eventId) await assertRosterEditable(eventId, tx);

      const row = await tx.player.create({
        data: {
          teamId: input.teamId,
          ...(eventId ? { eventId } : {}),
          displayName: input.displayName.trim(),
          nickname: input.nickname.trim(),
          position: input.position?.trim() ?? "",
          ...(input.jerseyNumber != null ? { jerseyNumber: input.jerseyNumber } : {}),
        },
      });
      return mapPlayer(row);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Pemain dengan IGN ini sudah ada di tim.");
    }
    throw error;
  }
}

export async function addPlayer(captainUserId: string, input: AddPlayerInput): Promise<Player> {
  return createPlayerForTeam(input, captainUserId);
}

export async function addPlayerWithoutActor(input: AddPlayerInput): Promise<Player> {
  return createPlayerForTeam(input, undefined);
}

export async function updatePlayer(
  id: string,
  captainUserId: string,
  data: { displayName?: string; nickname?: string; position?: string; jerseyNumber?: number | null },
): Promise<Player> {
  return prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to edit this player.");
    }
    if (player.team.eventId) await assertRosterEditable(player.team.eventId, tx);
    return mapPlayer(await tx.player.update({ where: { id }, data }));
  });
}

export async function deletePlayer(id: string, captainUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id },
      include: { team: { select: { captainId: true, eventId: true } } },
    });
    if (!player || player.team.captainId !== captainUserId) {
      throw new Error("Not authorized to delete this player.");
    }
    if (player.team.eventId) await assertRosterEditable(player.team.eventId, tx);
    await tx.player.delete({ where: { id } });
  });
}

export async function setTeamCaptainDisplay(teamId: string, captainUserId: string, playerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const player = await tx.player.findFirst({
      where: { id: playerId, teamId, team: { captainId: captainUserId } },
      select: { displayName: true },
    });
    if (!player) throw new Error("Not authorized to update this team.");
    await tx.team.update({ where: { id: teamId }, data: { captainName: player.displayName } });
  });
}

/**
 * Minimal shape the demo-store fallback needs. Legacy `admin` is already
 * normalised to an organizer actor upstream (see `toEventReadActorCompatibility`),
 * so the demo store's `role === "admin"` branch is intentionally unreachable here.
 */
function toDemoStoreUser(actor: ActorContext): AppUser {
  return { id: actor.userId, role: actor.role, email: "", name: "" };
}

/**
 * Organizer team-logo update. Ownership is re-verified *inside* the same
 * transaction as the write, closing the gap a separate preflight-then-write
 * pair would leave open if the team's event relationship changed between
 * the check and the write.
 */
export async function updateTeamLogoForActor(actor: ActorContext | null, teamId: string, logoUrl: string): Promise<Team> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      await assertActorCanManageTeam(actor, teamId, tx);
      return tx.team.update({ where: { id: teamId }, data: { logoUrl } });
    });
    return mapTeam(row);
  } catch (error) {
    if (error instanceof ForbiddenError) throw error;
    const team = actor ? demoStore.updateTeamLogo(toDemoStoreUser(actor), teamId, logoUrl) : null;
    if (!team) throw new ForbiddenError("Not authorized");
    return team;
  }
}

/**
 * Assigns or clears the captain for a team. Runs the existence check,
 * ownership check, captain-role validation, and write inside one
 * transaction so a reassignment cannot target a team whose event
 * relationship changed after authorization.
 */
export async function assignCaptainForActor(
  actor: ActorContext | null,
  teamId: string,
  captainUserId: string | null,
): Promise<Team> {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { id: true, eventId: true } });
    if (!team?.eventId) throw new NotFoundError("Tim tidak ditemukan.");

    await assertActorCanManageEvent(actor, team.eventId, tx);

    if (captainUserId) {
      const captain = await tx.user.findUnique({
        where: { id: captainUserId, role: "captain" },
        select: { id: true, name: true },
      });
      if (!captain) throw new NotFoundError("Kapten tidak ditemukan.");

      const row = await tx.team.update({
        where: { id: teamId },
        data: { captainId: captain.id, captainName: captain.name },
      });
      return mapTeam(row);
    }

    const row = await tx.team.update({ where: { id: teamId }, data: { captainId: null, captainName: null } });
    return mapTeam(row);
  });
}

/**
 * Deletes a team. Runs the existence check, Draft-status check, and
 * ownership check inside the same transaction as the delete so the team's
 * event relationship cannot change between authorization and the write.
 */
export async function deleteTeamForActor(actor: ActorContext | null, teamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: teamId },
      include: { event: { select: { id: true, status: true } } },
    });
    if (!team?.event || !team.eventId) throw new NotFoundError("Tim tidak ditemukan.");
    if (team.event.status !== "Draft") throw new ConflictError("Tim hanya dapat dihapus dari event Draft.");

    await assertActorCanManageEvent(actor, team.eventId, tx);
    await tx.team.delete({ where: { id: teamId } });
  });
}
