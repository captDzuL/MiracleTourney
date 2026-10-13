import type { Prisma } from "@prisma/client";
import { disqualifiedTeamIds } from "../tournament/operations/result-projection";
import { gameModes } from "./config";
import { prisma } from "./db";
import { runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import { readRosterChangeState } from "@/lib/registration/repository";
import {
  assertPositionAllowed,
  assertRosterSizeAfter,
  checkJoiningPlayer,
  isCaptainPlayer,
  normalizeIncoming,
  RosterChangeError,
  type IncomingPlayer,
  type KnownPlayer,
} from "./roster-change-rules";
import { isActivePlayer } from "./roster-membership";
import type { RosterChangeWindow } from "./roster-change-window";

export { RosterChangeError } from "./roster-change-rules";
export type { IncomingPlayer, RosterChangeErrorCode } from "./roster-change-rules";

export type RosterChange =
  | { kind: "swap"; outPlayerId: string; incoming: IncomingPlayer }
  | { kind: "add"; incoming: IncomingPlayer }
  | { kind: "remove"; outPlayerId: string };

export interface RequestRosterChangeInput {
  captainId: string;
  teamId: string;
  change: RosterChange;
}

type Tx = Prisma.TransactionClient;

/**
 * Files a request for the organizer to decide. It never edits Player rows: the
 * roster only changes when the organizer approves.
 */
export async function requestRosterChange(input: RequestRosterChangeInput): Promise<{ requestId: string; remaining: number }> {
  return runSerializableRegistrationTransaction((tx) => createRosterChangeRequest(tx, input));
}

async function createRosterChangeRequest(tx: Tx, input: RequestRosterChangeInput): Promise<{ requestId: string; remaining: number }> {
  const team = await tx.team.findFirst({
    where: { id: input.teamId, captainId: input.captainId },
    select: { id: true, eventId: true, captainUid: true, captainIgn: true, captainIsPlayer: true },
  });
  if (!team?.eventId) throw new RosterChangeError("team_not_found");
  const eventId = team.eventId;

  const event = await tx.event.findUnique({ where: { id: eventId }, select: { rosterChangeLimit: true, gameModeId: true } });
  const mode = gameModes.find((candidate) => candidate.id === event?.gameModeId);
  if (!event || !mode) throw new RosterChangeError("invalid_change");

  const state = await readRosterChangeState(tx, eventId);
  if (state.window === "free") throw new RosterChangeError("not_open");
  if (state.window === "locked") throw new RosterChangeError("locked");
  if (state.graph && disqualifiedTeamIds(state.graph).has(team.id)) throw new RosterChangeError("team_disqualified");

  const liveMatches = await tx.match.count({
    where: { eventId, status: "Live", OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
  });
  if (liveMatches > 0) throw new RosterChangeError("match_live");

  const counted = await tx.rosterChangeRequest.findMany({
    where: { teamId: team.id, status: { in: ["pending", "approved"] } },
    select: { status: true },
  });
  if (counted.some((request) => request.status === "pending")) throw new RosterChangeError("pending_exists");
  if (counted.length >= event.rosterChangeLimit) throw new RosterChangeError("no_allowance");

  const players = await tx.player.findMany({
    where: { teamId: team.id },
    select: { id: true, displayName: true, nickname: true, position: true, removedAt: true },
  });
  const active = players.filter(isActivePlayer);

  const leaving = resolveLeavingPlayer(input.change, active);
  if (leaving && isCaptainPlayer(team, leaving)) throw new RosterChangeError("captain_player");
  const joining = input.change.kind === "remove" ? null : normalizeIncoming(input.change.incoming);

  assertRosterSizeAfter(input.change.kind, active.length, mode);
  if (joining) assertPositionAllowed(joining.position, mode.positions);

  let returning: KnownPlayer | undefined;
  let activeElsewhere: { teamId: string; teamName: string }[] = [];
  if (joining) {
    returning = checkJoiningPlayer(joining, players, active, leaving);
    activeElsewhere = await findActiveOnOtherTeams(tx, eventId, team.id, joining.displayName);
  }

  const created = await tx.rosterChangeRequest.create({
    data: {
      eventId,
      teamId: team.id,
      requestedById: input.captainId,
      kind: input.change.kind,
      outPlayerId: leaving?.id ?? null,
      returnPlayerId: returning?.id ?? null,
      ...(leaving ? { outgoing: { displayName: leaving.displayName, nickname: leaving.nickname, position: leaving.position } } : {}),
      ...(joining ? { incoming: { ...joining, activeElsewhere } } : {}),
    },
  });
  return { requestId: created.id, remaining: event.rosterChangeLimit - counted.length - 1 };
}

export function resolveLeavingPlayer<T extends { id: string }>(change: RosterChange, active: T[]): T | null {
  if (change.kind === "add") return null;
  const leaving = active.find((player) => player.id === change.outPlayerId);
  if (!leaving) throw new RosterChangeError("player_not_found");
  return leaving;
}

/** Other teams in the event that currently field this UID; shown to the organizer, never to captains. */
export async function findActiveOnOtherTeams(tx: Pick<Tx, "player">, eventId: string, teamId: string, uid: string): Promise<{ teamId: string; teamName: string }[]> {
  const rows = await tx.player.findMany({
    where: { eventId, teamId: { not: teamId }, removedAt: null, displayName: { equals: uid, mode: "insensitive" } },
    select: { teamId: true, team: { select: { name: true } } },
  });
  return rows.map((row) => ({ teamId: row.teamId, teamName: row.team.name }));
}

export async function cancelRosterChangeRequest(input: { captainId: string; requestId: string }): Promise<void> {
  await runSerializableRegistrationTransaction(async (tx) => {
    const request = await tx.rosterChangeRequest.findFirst({
      where: { id: input.requestId, team: { captainId: input.captainId } },
      select: { id: true, status: true },
    });
    if (!request) throw new RosterChangeError("request_not_found");
    if (request.status !== "pending") throw new RosterChangeError("request_not_pending");
    const updated = await tx.rosterChangeRequest.updateMany({
      where: { id: request.id, status: "pending" },
      data: { status: "cancelled", decidedById: input.captainId, decidedAt: new Date() },
    });
    if (updated.count !== 1) throw new RosterChangeError("request_not_pending");
  });
}

/** Names and status only: the stored JSON also lists other teams, which a captain must not see. */
export interface RosterChangeHistoryItem {
  id: string;
  kind: string;
  status: string;
  createdAt: Date;
  outgoingName: string | null;
  incomingName: string | null;
  decisionNote: string | null;
}

function nicknameOf(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const nickname = (snapshot as { nickname?: unknown }).nickname;
  return typeof nickname === "string" && nickname.trim() ? nickname : null;
}

export interface RosterChangeOverview {
  window: RosterChangeWindow;
  limit: number;
  /** Approved changes only. */
  used: number;
  /** What the captain can still file: allowance minus approved and waiting requests. */
  remaining: number;
  pending: RosterChangeHistoryItem | null;
  history: RosterChangeHistoryItem[];
  rosterMin: number;
  rosterMax: number;
  activeCount: number;
}

/** Read model for the captain's roster tab. Returns null when the team is not theirs. */
export async function getRosterChangeOverview(captainId: string, teamId: string): Promise<RosterChangeOverview | null> {
  const team = await prisma.team.findFirst({ where: { id: teamId, captainId }, select: { id: true, eventId: true } });
  if (!team?.eventId) return null;

  const event = await prisma.event.findUnique({ where: { id: team.eventId }, select: { rosterChangeLimit: true, gameModeId: true } });
  const mode = gameModes.find((candidate) => candidate.id === event?.gameModeId);
  if (!event || !mode) return null;

  const [state, rows, players, used, waiting] = await Promise.all([
    readRosterChangeState(prisma, team.eventId),
    prisma.rosterChangeRequest.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, status: true, createdAt: true, outgoing: true, incoming: true, decisionNote: true },
    }),
    prisma.player.findMany({ where: { teamId: team.id, removedAt: null }, select: { id: true } }),
    // Counted in the database: the list above is capped, the allowance is not.
    prisma.rosterChangeRequest.count({ where: { teamId: team.id, status: "approved" } }),
    prisma.rosterChangeRequest.count({ where: { teamId: team.id, status: "pending" } }),
  ]);
  const history: RosterChangeHistoryItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    outgoingName: nicknameOf(row.outgoing),
    incomingName: nicknameOf(row.incoming),
    decisionNote: row.decisionNote,
  }));
  return {
    window: state.window,
    limit: event.rosterChangeLimit,
    used,
    remaining: Math.max(0, event.rosterChangeLimit - used - waiting),
    pending: history.find((item) => item.status === "pending") ?? null,
    history,
    rosterMin: mode.teamSize,
    rosterMax: mode.maxRosterSize,
    activeCount: players.length,
  };
}
