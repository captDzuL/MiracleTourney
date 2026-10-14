import { prisma } from "@/lib/platform/db";
import { getSoloQueuePosition, toView } from "@/lib/solo/registration-repository";
import { sweepSoloEventAndAnnounce } from "@/lib/solo/registration-service";
import type { SoloRegistrationView } from "@/lib/solo/registration-types";

/** Where a player stands in one event, in the order things happen to them. */
export type PlayerStage =
  | { kind: "queued"; position: number | null }
  | { kind: "pay"; deadline: Date | null }
  | { kind: "review" }
  | { kind: "rejected"; reason: string | null; deadline: Date | null }
  | { kind: "waiting" }
  | { kind: "in_team" }
  | { kind: "out_of_teams"; refund: RefundState }
  | { kind: "lost"; why: "expired" | "withdrawn"; refund: RefundState };

/** `none` when nothing was paid, `owed` while the organizer still has to pay back, `done` afterwards. */
export type RefundState = "none" | "owed" | "done";

type StageInput = Readonly<{
  registration: Pick<SoloRegistrationView, "status" | "expiresAt" | "rejectReason" | "approvedAt" | "refundedAt">;
  queuePosition: number | null;
  now: Date;
  event: Readonly<{ feeRequired: boolean; teamsLocked: boolean }>;
  /** What the locked draw did with this player. Null before the draw is locked. */
  placement: "starter" | "unplaced" | null;
}>;

const lapsed = (deadline: Date | null, now: Date) => deadline !== null && deadline <= now;

function refundOf(input: StageInput): RefundState {
  if (!input.event.feeRequired || input.registration.approvedAt === null) return "none";
  return input.registration.refundedAt === null ? "owed" : "done";
}

/**
 * What a player should be told. A deadline that has passed counts as lost even before the sweep wrote it
 * down, so nobody is asked to pay for a slot that is already gone.
 */
export function playerStage(input: StageInput): PlayerStage {
  const { registration, now } = input;
  switch (registration.status) {
    case "queued":
      return { kind: "queued", position: input.queuePosition };
    case "pending_payment":
      return lapsed(registration.expiresAt, now) ? { kind: "lost", why: "expired", refund: "none" } : { kind: "pay", deadline: registration.expiresAt };
    case "pending_review":
      return { kind: "review" };
    case "rejected":
      return lapsed(registration.expiresAt, now)
        ? { kind: "lost", why: "expired", refund: "none" }
        : { kind: "rejected", reason: registration.rejectReason, deadline: registration.expiresAt };
    case "expired":
      return { kind: "lost", why: "expired", refund: "none" };
    case "withdrawn":
      return { kind: "lost", why: "withdrawn", refund: refundOf(input) };
    case "approved":
      if (!input.event.teamsLocked || input.placement === null) return { kind: "waiting" };
      return input.placement === "starter" ? { kind: "in_team" } : { kind: "out_of_teams", refund: refundOf(input) };
    default:
      return { kind: "waiting" };
  }
}

export type PlayerTeamRef = Readonly<{ id: string; name: string; tag: string }>;

/** A team of the player's, and whether the player captains it (and so manages its roster on the captain pages). */
export type PlayerOwnTeam = PlayerTeamRef & Readonly<{ iAmCaptain: boolean }>;

export type PlayerRegistrationItem = Readonly<{
  registrationId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  secondaryPosition: string | null;
  createdAt: Date;
  event: Readonly<{ id: string; slug: string; name: string; status: string; feeRequired: boolean }>;
  stage: PlayerStage;
  team: PlayerOwnTeam | null;
}>;

export type PlayerMatch = Readonly<{
  matchId: string;
  eventId: string;
  eventName: string;
  teamName: string;
  opponentName: string | null;
  roundLabel: string;
  status: string;
  scheduledAt: Date | null;
  scheduledLabel: string | null;
}>;

export type PlayerDashboard = Readonly<{
  registrations: readonly PlayerRegistrationItem[];
  /** The soonest match of any team the player is in, if one is scheduled. */
  nextMatch: PlayerMatch | null;
}>;

const OPEN_MATCH_STATUSES = ["Scheduled", "Live"];

/** Earliest first; a match without a time comes after every match that has one. */
function bySchedule(left: { scheduledAt: Date | null; createdAt: Date }, right: { scheduledAt: Date | null; createdAt: Date }): number {
  if (left.scheduledAt && right.scheduledAt) return left.scheduledAt.getTime() - right.scheduledAt.getTime();
  if (left.scheduledAt) return -1;
  if (right.scheduledAt) return 1;
  return left.createdAt.getTime() - right.createdAt.getTime();
}

/** Matches of the given teams that are yet to be played, in the order they come. */
export async function listUpcomingMatches(teamIds: readonly string[], limit: number): Promise<PlayerMatch[]> {
  if (teamIds.length === 0) return [];
  const rows = await prisma.match.findMany({
    where: { status: { in: OPEN_MATCH_STATUSES }, OR: [{ homeTeamId: { in: [...teamIds] } }, { awayTeamId: { in: [...teamIds] } }] },
    include: { event: { select: { name: true } } },
    take: 200,
  });
  const ordered = [...rows].sort(bySchedule).slice(0, limit);
  const involved = new Set(ordered.flatMap((row) => [row.homeTeamId, row.awayTeamId]));
  const teams = await prisma.team.findMany({ where: { id: { in: [...involved] } }, select: { id: true, name: true } });
  const nameOf = new Map(teams.map((team) => [team.id, team.name]));
  return ordered.map((row) => {
    const mine = teamIds.includes(row.homeTeamId) ? row.homeTeamId : row.awayTeamId;
    const opponent = mine === row.homeTeamId ? row.awayTeamId : row.homeTeamId;
    return {
      matchId: row.id,
      eventId: row.eventId,
      eventName: row.event.name,
      teamName: nameOf.get(mine) ?? "",
      opponentName: nameOf.get(opponent) ?? null,
      roundLabel: row.roundLabel,
      status: row.status,
      scheduledAt: row.scheduledAt,
      scheduledLabel: row.scheduledLabel,
    };
  });
}

/** Lets late payments expire and the queue move on before the player looks, so nobody sees a slot that is gone. */
async function sweepOpenEvents(eventIds: readonly string[]): Promise<void> {
  await Promise.allSettled(eventIds.map((eventId) => sweepSoloEventAndAnnounce(eventId)));
}

/**
 * Everything the player area shows at a glance. A player only ever sees their own registrations and their own
 * teams: every query is scoped to the account that is asking.
 */
export async function getPlayerDashboard(userId: string, now: Date = new Date()): Promise<PlayerDashboard> {
  const initial = await prisma.soloRegistration.findMany({
    where: { userId },
    select: { eventId: true, event: { select: { status: true } } },
  });
  await sweepOpenEvents([...new Set(initial.filter((row) => row.event.status === "Published").map((row) => row.eventId))]);

  const rows = await prisma.soloRegistration.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { event: { select: { id: true, slug: true, name: true, status: true, registrationFeeRequired: true, activeSoloDrawId: true } } },
  });
  const [placements, memberships] = await Promise.all([
    prisma.soloDrawAssignment.findMany({
      where: { registrationId: { in: rows.map((row) => row.id) }, draw: { status: "locked" } },
      select: { registrationId: true, role: true },
    }),
    prisma.player.findMany({
      where: { userId, removedAt: null, team: { source: "solo-draw" } },
      select: { eventId: true, team: { select: { id: true, name: true, tag: true, captainId: true } } },
    }),
  ]);
  const placementOf = new Map(placements.map((row) => [row.registrationId, row.role === "starter" ? ("starter" as const) : ("unplaced" as const)]));
  const teamOfEvent = new Map(
    memberships.flatMap((row) =>
      row.eventId ? [[row.eventId, { id: row.team.id, name: row.team.name, tag: row.team.tag, iAmCaptain: row.team.captainId === userId }] as const] : [],
    ),
  );

  const registrations = await Promise.all(rows.map(async (row): Promise<PlayerRegistrationItem> => {
    const view = toView(row);
    const queuePosition = await getSoloQueuePosition(view);
    return {
      registrationId: row.id,
      ign: row.ign,
      uid: row.uid,
      primaryPosition: row.primaryPosition,
      secondaryPosition: row.secondaryPosition,
      createdAt: row.createdAt,
      event: { id: row.event.id, slug: row.event.slug, name: row.event.name, status: row.event.status, feeRequired: row.event.registrationFeeRequired },
      stage: playerStage({
        registration: view,
        queuePosition,
        now,
        event: { feeRequired: row.event.registrationFeeRequired, teamsLocked: row.event.activeSoloDrawId !== null },
        placement: placementOf.get(row.id) ?? null,
      }),
      team: teamOfEvent.get(row.eventId) ?? null,
    };
  }));

  const [nextMatch] = await listUpcomingMatches([...new Set(memberships.map((row) => row.team.id))], 1);
  return { registrations, nextMatch: nextMatch ?? null };
}

export type TeamMember = Readonly<{
  playerId: string;
  ign: string;
  uid: string;
  position: string;
  /** Digits with the 62 country code. Only players who gave it at sign-up, only ever shown to teammates. */
  whatsapp: string | null;
  isCaptain: boolean;
  isMe: boolean;
}>;

export type PlayerTeamView = Readonly<{
  event: Readonly<{ id: string; slug: string; name: string; status: string }>;
  team: PlayerTeamRef;
  members: readonly TeamMember[];
  /** True when this player is the captain, who then also manages the roster on the captain pages. */
  iAmCaptain: boolean;
  matches: readonly PlayerMatch[];
}>;

/**
 * The team a player drew in one event, with their teammates' contacts. Null unless the player is on that
 * team and the teams are locked, so nobody else, and nobody before the draw, gets a look at the numbers.
 */
export async function getPlayerTeamView(userId: string, eventId: string): Promise<PlayerTeamView | null> {
  const membership = await prisma.player.findFirst({
    where: { userId, eventId, removedAt: null, team: { source: "solo-draw" } },
    select: { teamId: true },
  });
  if (!membership) return null;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, name: true, status: true, activeSoloDrawId: true },
  });
  if (!event || event.activeSoloDrawId === null) return null;

  const team = await prisma.team.findUnique({
    where: { id: membership.teamId },
    select: { id: true, name: true, tag: true, captainId: true, players: { where: { removedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!team) return null;

  const userIds = team.players.flatMap((player) => (player.userId ? [player.userId] : []));
  const contacts = await prisma.soloRegistration.findMany({ where: { eventId, userId: { in: userIds } }, select: { userId: true, whatsapp: true } });
  const whatsappOf = new Map(contacts.map((row) => [row.userId, row.whatsapp]));

  return {
    event: { id: event.id, slug: event.slug, name: event.name, status: event.status },
    team: { id: team.id, name: team.name, tag: team.tag },
    members: team.players.map((player) => ({
      playerId: player.id,
      ign: player.nickname,
      uid: player.displayName,
      position: player.position,
      whatsapp: player.userId ? whatsappOf.get(player.userId) ?? null : null,
      isCaptain: player.userId !== null && player.userId === team.captainId,
      isMe: player.userId === userId,
    })),
    iAmCaptain: team.captainId === userId,
    matches: await listUpcomingMatches([team.id], 10),
  };
}
