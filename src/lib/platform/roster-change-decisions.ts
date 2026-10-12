import type { Prisma } from "@prisma/client";
import { disqualifiedTeamIds } from "../tournament/operations/result-projection";
import { gameModes } from "./config";
import { prisma } from "./db";
import { assertUserCanManageEvent, readRosterChangeState, runSerializableRegistrationTransaction } from "./repository";
import {
  assertPositionAllowed,
  assertRosterSizeAfter,
  checkJoiningPlayer,
  isCaptainPlayer,
  isGroupPlayoffsFormat,
  MAX_ROSTER_CHANGE_LIMIT,
  normalizeIncoming,
  playerSnapshotSchema,
  RosterChangeError,
  type IncomingPlayer,
} from "./roster-change-rules";
import { isActivePlayer, parseRosterGaps } from "./roster-membership";
import type { AppUser, GameMode } from "./types";

type Tx = Prisma.TransactionClient;
type Decision = "approve" | "reject";
type Actor = Pick<AppUser, "id" | "role">;

const MAX_NOTE_LENGTH = 200;

export interface DecideRosterChangeInput {
  actor: Actor;
  requestId: string;
  decision: Decision;
  note?: string;
}

function cleanNote(note: string | undefined): string | null {
  const trimmed = note?.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? trimmed : null;
}

/**
 * The organizer's answer to a captain's request. Approving is the only place the
 * roster changes: the leaving player is marked removed (never deleted, so their
 * statistics stay), and a former player coming back reuses their old row.
 * Everything the captain's request assumed is checked again here.
 */
export async function decideRosterChange(input: DecideRosterChangeInput): Promise<{ eventId: string }> {
  const found = await prisma.rosterChangeRequest.findUnique({ where: { id: input.requestId }, select: { eventId: true } });
  if (!found) throw new RosterChangeError("request_not_found");
  await assertUserCanManageEvent(input.actor as AppUser, found.eventId);

  const note = cleanNote(input.note);
  try {
    await runSerializableRegistrationTransaction((tx) =>
      input.decision === "reject" ? reject(tx, input, note) : approve(tx, input, note));
  } catch (error) {
    if (isNicknameConflict(error)) throw new RosterChangeError("nickname_taken");
    throw error;
  }
  return { eventId: found.eventId };
}

/** The only unique index a roster change can hit is (team, IGN); any other one is not the captain's mistake. */
function isNicknameConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return !Array.isArray(target) || target.includes("nickname");
}

async function loadPendingRequest(tx: Tx, requestId: string) {
  const request = await tx.rosterChangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new RosterChangeError("request_not_found");
  if (request.status !== "pending") throw new RosterChangeError("request_not_pending");
  return request;
}

type PendingRequest = Awaited<ReturnType<typeof loadPendingRequest>>;

async function reject(tx: Tx, input: DecideRosterChangeInput, note: string | null): Promise<void> {
  const request = await loadPendingRequest(tx, input.requestId);
  await closeRequest(tx, request.id, { status: "rejected", decidedById: input.actor.id, decisionNote: note });
  await writeAudit(tx, request, input.actor.id, "roster_change_reject", note, {});
}

type RosterRow = { id: string; displayName: string; nickname: string; position: string; removedAt: Date | null; rosterGaps: unknown };
type CaptainFields = { id: string; captainUid: string | null; captainIgn: string | null; captainIsPlayer: boolean };

async function approve(tx: Tx, input: DecideRosterChangeInput, note: string | null): Promise<void> {
  const request = await loadPendingRequest(tx, input.requestId);
  const { mode, team } = await assertTeamMayChange(tx, request);

  const players: RosterRow[] = await tx.player.findMany({
    where: { teamId: team.id },
    select: { id: true, displayName: true, nickname: true, position: true, removedAt: true, rosterGaps: true },
  });
  const plan = planChange(request, team, mode, players);

  const now = new Date();
  if (plan.leaving) {
    const left = await tx.player.updateMany({ where: { id: plan.leaving.id, teamId: team.id, removedAt: null }, data: { removedAt: now } });
    if (left.count !== 1) throw new RosterChangeError("player_not_found");
  }
  const inPlayerId = plan.joining
    ? await bringIn(tx, { eventId: request.eventId, teamId: team.id, joining: plan.joining, returning: plan.returning, now })
    : null;

  await closeRequest(tx, request.id, { status: "approved", decidedById: input.actor.id, decisionNote: note, inPlayerId, now });
  await writeAudit(tx, request, input.actor.id, "roster_change_approve", note, {
    outPlayerId: plan.leaving?.id ?? null,
    inPlayerId,
    returned: Boolean(plan.returning),
  });
}

/** What the event and the team allow right now: window, disqualification, live match, allowance. */
async function assertTeamMayChange(tx: Tx, request: PendingRequest): Promise<{ mode: GameMode; team: CaptainFields }> {
  const eventId = request.eventId;
  const event = await tx.event.findUnique({ where: { id: eventId }, select: { rosterChangeLimit: true, gameModeId: true } });
  const mode = gameModes.find((candidate) => candidate.id === event?.gameModeId);
  if (!event || !mode) throw new RosterChangeError("invalid_change");

  const state = await readRosterChangeState(tx, eventId);
  if (state.window !== "limited") throw new RosterChangeError("window_closed");

  const team = await tx.team.findFirst({
    where: { id: request.teamId, eventId },
    select: { id: true, captainUid: true, captainIgn: true, captainIsPlayer: true },
  });
  if (!team) throw new RosterChangeError("team_not_found");
  if (state.graph && disqualifiedTeamIds(state.graph).has(team.id)) throw new RosterChangeError("team_disqualified");

  const liveMatches = await tx.match.count({
    where: { eventId, status: "Live", OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
  });
  if (liveMatches > 0) throw new RosterChangeError("match_live");

  // This request is still pending, so it is not part of the approved count.
  const approvedBefore = await tx.rosterChangeRequest.count({ where: { teamId: team.id, status: "approved" } });
  if (approvedBefore >= event.rosterChangeLimit) throw new RosterChangeError("no_allowance");
  return { mode, team };
}

interface ChangePlan {
  leaving: RosterRow | null;
  joining: IncomingPlayer | null;
  returning: RosterRow | undefined;
}

/** Decides who leaves and who joins from the roster as it is now. Writes nothing. */
function planChange(request: PendingRequest, team: CaptainFields, mode: GameMode, players: RosterRow[]): ChangePlan {
  const active = players.filter(isActivePlayer);
  const kind = request.kind;

  const leaving = kind === "add" ? null : active.find((player) => player.id === request.outPlayerId) ?? null;
  if (kind !== "add" && !leaving) throw new RosterChangeError("player_not_found");
  if (leaving && isCaptainPlayer(team, leaving)) throw new RosterChangeError("captain_player");

  const joining = kind === "remove" ? null : parseIncoming(request.incoming);
  assertRosterSizeAfter(kind, active.length, mode);
  if (joining) assertPositionAllowed(joining.position, mode.positions);
  const returning = joining ? checkJoiningPlayer(joining, players, active, leaving) : undefined;
  return { leaving, joining, returning };
}

function parseIncoming(value: unknown): IncomingPlayer {
  const parsed = playerSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new RosterChangeError("invalid_change");
  return normalizeIncoming(parsed.data);
}

/** A returning player keeps their row; a new player gets one in the event. Returns the player's id. */
async function bringIn(
  tx: Tx,
  args: { eventId: string; teamId: string; joining: IncomingPlayer; returning: RosterRow | undefined; now: Date },
): Promise<string> {
  const { eventId, teamId, joining, returning, now } = args;
  if (!returning) {
    const created = await tx.player.create({
      data: { teamId, eventId, displayName: joining.displayName, nickname: joining.nickname, position: joining.position },
    });
    return created.id;
  }
  const earlier = parseRosterGaps(returning.rosterGaps).map((gap) => ({ from: gap.from.toISOString(), to: gap.to.toISOString() }));
  const latest = returning.removedAt && returning.removedAt < now ? [{ from: returning.removedAt.toISOString(), to: now.toISOString() }] : [];
  await tx.player.update({
    where: { id: returning.id },
    data: { removedAt: null, rosterGaps: [...earlier, ...latest], nickname: joining.nickname, position: joining.position || returning.position },
  });
  return returning.id;
}

async function closeRequest(
  tx: Tx,
  requestId: string,
  decision: { status: "approved" | "rejected"; decidedById: string; decisionNote: string | null; inPlayerId?: string | null; now?: Date },
): Promise<void> {
  const updated = await tx.rosterChangeRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: {
      status: decision.status,
      decidedById: decision.decidedById,
      decidedAt: decision.now ?? new Date(),
      decisionNote: decision.decisionNote,
      ...(decision.status === "approved" ? { inPlayerId: decision.inPlayerId ?? null } : {}),
    },
  });
  if (updated.count !== 1) throw new RosterChangeError("request_not_pending");
}

async function writeAudit(
  tx: Tx,
  request: { id: string; eventId: string; teamId: string; kind: string },
  actorId: string,
  action: "roster_change_approve" | "roster_change_reject",
  reason: string | null,
  extra: Record<string, unknown>,
): Promise<void> {
  await tx.competitionAuditLog.create({
    data: {
      eventId: request.eventId,
      actorUserId: actorId,
      action,
      reason,
      idempotencyKey: request.id,
      payload: { requestId: request.id, teamId: request.teamId, kind: request.kind, ...extra } as Prisma.InputJsonValue,
    },
  });
}

export async function setRosterChangeLimit(input: { actor: Actor; eventId: string; limit: number }): Promise<void> {
  if (!Number.isInteger(input.limit) || input.limit < 0 || input.limit > MAX_ROSTER_CHANGE_LIMIT) {
    throw new RosterChangeError("invalid_limit");
  }
  await assertUserCanManageEvent(input.actor as AppUser, input.eventId);

  await runSerializableRegistrationTransaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      select: { status: true, formatConfig: true, rosterChangeLimit: true },
    });
    if (!event) throw new RosterChangeError("team_not_found");
    if (event.status === "Finished") throw new RosterChangeError("locked");
    if (input.limit > 0 && !isGroupPlayoffsFormat(event.formatConfig)) throw new RosterChangeError("format_not_supported");

    const usage = await tx.rosterChangeRequest.groupBy({
      by: ["teamId"],
      where: { eventId: input.eventId, status: { in: ["pending", "approved"] } },
      _count: { _all: true },
    });
    const mostUsed = usage.reduce((max, row) => Math.max(max, row._count._all), 0);
    if (input.limit < mostUsed) throw new RosterChangeError("limit_below_used");

    if (event.rosterChangeLimit === input.limit) return;
    await tx.event.update({ where: { id: input.eventId }, data: { rosterChangeLimit: input.limit } });
    await tx.competitionAuditLog.create({
      data: {
        eventId: input.eventId,
        actorUserId: input.actor.id,
        action: "roster_change_limit_set",
        payload: { from: event.rosterChangeLimit, to: input.limit },
      },
    });
  });
}
