import { z } from "zod";
import { isActivePlayer } from "./roster-membership";

/** Most roster changes an organizer can allow per team. */
export const MAX_ROSTER_CHANGE_LIMIT = 5;

export type RosterChangeErrorCode =
  | "team_not_found" | "not_open" | "locked" | "no_allowance" | "pending_exists"
  | "team_disqualified" | "match_live" | "player_not_found" | "captain_player"
  | "roster_size" | "already_on_roster" | "nickname_taken" | "invalid_change"
  | "request_not_found" | "request_not_pending" | "rate_limited"
  | "window_closed" | "invalid_limit" | "limit_below_used" | "format_not_supported";

/** Carries a code, never user-facing text: the action layer picks the wording. */
export class RosterChangeError extends Error {
  constructor(readonly code: RosterChangeErrorCode) {
    super(code);
    this.name = "RosterChangeError";
  }
}

export interface IncomingPlayer {
  displayName: string;
  nickname: string;
  position: string;
}

/** Shape of a joining or leaving player stored on a request; also what the organizer sees. */
export const playerSnapshotSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  nickname: z.string().trim().min(2).max(40),
  position: z.string().trim().max(40),
});

export function isGroupPlayoffsFormat(formatConfig: unknown): boolean {
  return typeof formatConfig === "object" && formatConfig !== null && (formatConfig as { kind?: unknown }).kind === "group_playoffs";
}

export type KnownPlayer = { id: string; displayName: string; nickname: string; position: string; removedAt: Date | null };

export const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function normalizeIncoming(player: IncomingPlayer): IncomingPlayer {
  return { displayName: player.displayName.trim(), nickname: player.nickname.trim(), position: player.position.trim() };
}

/** No position is fine; otherwise it must be one the game mode offers. */
export function assertPositionAllowed(position: string, offered: readonly string[]): void {
  if (position === "") return;
  if (!offered.some((candidate) => sameText(candidate, position))) throw new RosterChangeError("invalid_change");
}

/** Matches by UID, and by IGN when the team has no captain UID on file. */
export function isCaptainPlayer(
  team: { captainUid: string | null; captainIgn: string | null; captainIsPlayer: boolean },
  player: { displayName: string; nickname: string },
): boolean {
  if (!team.captainIsPlayer) return false;
  const sameUid = Boolean(team.captainUid) && sameText(player.displayName, team.captainUid ?? "");
  const sameIgn = Boolean(team.captainIgn) && sameText(player.nickname, team.captainIgn ?? "");
  return sameUid || sameIgn;
}

/** The row of a former player with this UID; the most recent one if the UID left more than once. */
export function latestFormerPlayer<T extends KnownPlayer>(players: T[], uid: string): T | undefined {
  return players
    .filter((player) => !isActivePlayer(player) && sameText(player.displayName, uid))
    .sort((a, b) => (b.removedAt?.getTime() ?? 0) - (a.removedAt?.getTime() ?? 0))[0];
}

/**
 * UID and IGN are not unique across teams or over time. Only two things block a
 * joining player: someone with the same UID or IGN is already on this roster, or
 * their IGN belongs to a different former player of this team (the table keeps
 * one row per team and IGN). A former player with the same UID simply returns.
 */
export function checkJoiningPlayer<T extends KnownPlayer>(
  joining: IncomingPlayer,
  players: T[],
  active: T[],
  leaving: T | null,
): T | undefined {
  if (leaving && sameText(leaving.displayName, joining.displayName)) throw new RosterChangeError("invalid_change");
  const stayingOnRoster = active.filter((player) => player.id !== leaving?.id);
  if (stayingOnRoster.some((player) => sameText(player.displayName, joining.displayName) || sameText(player.nickname, joining.nickname))) {
    throw new RosterChangeError("already_on_roster");
  }
  const returning = latestFormerPlayer(players, joining.displayName);
  if (players.some((player) => player.id !== returning?.id && sameText(player.nickname, joining.nickname))) {
    throw new RosterChangeError("nickname_taken");
  }
  return returning;
}

/** Add and remove must keep the roster inside the game mode's limits; a swap does not change its size. */
export function assertRosterSizeAfter(
  kind: "swap" | "add" | "remove",
  activeCount: number,
  mode: { teamSize: number; maxRosterSize: number },
): void {
  if (kind === "swap") return;
  const sizeAfter = activeCount + (kind === "add" ? 1 : -1);
  if (sizeAfter < mode.teamSize || sizeAfter > mode.maxRosterSize) throw new RosterChangeError("roster_size");
}
