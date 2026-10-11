import { prisma } from "./db";
import { assertUserCanManageEvent, readRosterChangeState } from "./repository";
import {
  isGroupPlayoffsFormat,
  MAX_ROSTER_CHANGE_LIMIT,
  playerSnapshotSchema,
  RosterChangeError,
  sameText,
} from "./roster-change-rules";
import type { RosterChangeWindow } from "./roster-change-window";
import type { AppUser } from "./types";

/** Safety ceiling: a team has at most one waiting request, so this is far above any real event. */
const PENDING_LIMIT = 200;
const RECENT_DECISIONS = 10;

export interface PlayerSnapshot {
  displayName: string;
  nickname: string;
  position: string;
}

export interface RosterChangeRequestView {
  id: string;
  teamId: string;
  teamName: string;
  kind: string;
  status: string;
  createdAt: Date;
  note: string | null;
  decisionNote: string | null;
  outgoing: PlayerSnapshot | null;
  incoming: PlayerSnapshot | null;
  returning: boolean;
  /** Teams in this event that currently field the joining UID. Organizer eyes only. */
  activeElsewhere: string[];
  /** Approved changes this team already used. */
  teamUsed: number;
}

export interface RosterChangeSettings {
  limit: number;
  maxLimit: number;
  formatSupported: boolean;
  window: RosterChangeWindow;
  pending: RosterChangeRequestView[];
  recent: RosterChangeRequestView[];
}

const requestSelect = {
  id: true, teamId: true, kind: true, status: true, createdAt: true, note: true, decisionNote: true,
  returnPlayerId: true, outgoing: true, incoming: true, team: { select: { name: true } },
} as const;

function snapshotOf(value: unknown): PlayerSnapshot | null {
  const parsed = playerSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type ActiveHolder = { teamId: string; displayName: string; team: { name: string } };

/** Names of the other teams that field this UID right now; computed fresh, never taken from the stored snapshot. */
function teamsFieldingUid(holders: ActiveHolder[], uid: string, ownTeamId: string): string[] {
  return [...new Set(holders.filter((holder) => holder.teamId !== ownTeamId && sameText(holder.displayName, uid)).map((holder) => holder.team.name))];
}

/** Everything the organizer's roster-change panel shows. */
export async function getRosterChangeSettings(actor: Pick<AppUser, "id" | "role">, eventId: string): Promise<RosterChangeSettings> {
  await assertUserCanManageEvent(actor as AppUser, eventId);

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { rosterChangeLimit: true, formatConfig: true, status: true } });
  if (!event) throw new RosterChangeError("team_not_found");

  // Waiting and decided requests are read separately, so decided ones can never push a waiting one out of view.
  const [state, pendingRows, decidedRows, approvedByTeam] = await Promise.all([
    readRosterChangeState(prisma, eventId),
    prisma.rosterChangeRequest.findMany({
      where: { eventId, status: "pending" }, orderBy: { createdAt: "asc" }, take: PENDING_LIMIT, select: requestSelect,
    }),
    prisma.rosterChangeRequest.findMany({
      where: { eventId, status: { not: "pending" } }, orderBy: { decidedAt: "desc" }, take: RECENT_DECISIONS, select: requestSelect,
    }),
    prisma.rosterChangeRequest.groupBy({ by: ["teamId"], where: { eventId, status: "approved" }, _count: { _all: true } }),
  ]);
  const usedByTeam = new Map(approvedByTeam.map((row) => [row.teamId, row._count._all]));
  const holders: ActiveHolder[] = pendingRows.length
    ? await prisma.player.findMany({ where: { eventId, removedAt: null }, select: { teamId: true, displayName: true, team: { select: { name: true } } } })
    : [];

  const toView = (row: (typeof pendingRows)[number]): RosterChangeRequestView => {
    const incoming = snapshotOf(row.incoming);
    return {
      id: row.id,
      teamId: row.teamId,
      teamName: row.team.name,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
      note: row.note,
      decisionNote: row.decisionNote,
      outgoing: snapshotOf(row.outgoing),
      incoming,
      returning: Boolean(row.returnPlayerId),
      activeElsewhere: row.status === "pending" && incoming ? teamsFieldingUid(holders, incoming.displayName, row.teamId) : [],
      teamUsed: usedByTeam.get(row.teamId) ?? 0,
    };
  };

  return {
    limit: event.rosterChangeLimit,
    maxLimit: MAX_ROSTER_CHANGE_LIMIT,
    formatSupported: isGroupPlayoffsFormat(event.formatConfig),
    window: state.window,
    pending: pendingRows.map(toView),
    recent: decidedRows.map(toView),
  };
}
