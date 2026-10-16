// Player stats writes: submissions, approve and reject, admin write.
// Moved out of platform/repository.ts without changes (refactor PR 2.11).

import { getGameConfig, getStatKeysForMode } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { matchRosterReferenceTime, rosterForMatch } from "@/lib/platform/roster-membership";
import { mapPlayer } from "@/lib/platform/shared/mappers";
import type { AppUser, Player } from "@/lib/platform/types";
import { resolvePlayerScoreGameNumbers, validatePlayerStatPayload } from "@/lib/player-stats/form";
import type { PlayerStatPayloadMap } from "@/lib/player-stats/form";
import { getPlayerStatFormContext } from "@/lib/player-stats/repository";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { cache } from "react";

export async function assertAwardSourceWriteAllowed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  // Updating the shared version serializes this write with Completion's CAS.
  // Any rejection below rolls the increment back with the award-source write.
  const locked = await tx.event.updateMany({
    where: { id: eventId },
    data: { competitionVersion: { increment: 1 } },
  });
  if (locked.count !== 1) throw new Error("Event not found");

  const completion = await tx.tournamentCompletion.findUnique({
    where: { eventId },
    select: { status: true },
  });
  if (completion?.status === "completed") {
    throw new Error("Tournament completion locks award-source writes");
  }
}

export async function awardSourceTransaction<T>(
  eventId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await assertAwardSourceWriteAllowed(tx, eventId);
    return work(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type PlayerStatWriteGuard = {
  eventId: string; matchId: string; expectedVersion: number;
  expectedResultVersion: number; operationId: string; submittedAt?: string;
};

export type EventMatchStatistics = Awaited<ReturnType<typeof readEventMatchStatistics>>;

export async function readEventMatchStatistics(eventId:string,matchId:string,actorId:string) {
  return prisma.$transaction(async tx => {
    const [actor,event]=await Promise.all([
      tx.user.findUnique({where:{id:actorId},select:{id:true,role:true,mustChangePassword:true}}),
      tx.event.findUnique({where:{id:eventId},select:{organizerUserId:true,competitionVersion:true}}),
    ]);
    if(!actor||!event||!["admin","platform_admin","organizer"].includes(actor.role)||actor.role==="organizer"&&(actor.mustChangePassword||event.organizerUserId!==actor.id))throw new Error("Not authorized");
    const match=await tx.match.findFirst({where:{id:matchId,eventId},select:{
      id:true,status:true,homeTeamId:true,awayTeamId:true,resultVersion:true,roundLabel:true,resultSnapshot:true,
      actualStartedAt:true,actualEndedAt:true,resultConfirmedAt:true,
      games:{select:{gameNumber:true,homeScore:true,awayScore:true},orderBy:{gameNumber:"asc"}},
      event:{select:{gameId:true,gameModeId:true}},
    }});
    if(!match)throw new Error("Match not found");
    const teamIds=[match.homeTeamId,match.awayTeamId].filter(Boolean);
    const [teams,players,statRows,submissions,revisions,round]=await Promise.all([
      tx.team.findMany({where:{eventId,id:{in:teamIds}},select:{id:true,name:true}}),
      tx.player.findMany({where:{teamId:{in:teamIds}},select:{id:true,teamId:true,nickname:true,position:true,createdAt:true,removedAt:true,rosterGaps:true},orderBy:{id:"asc"}}),
      tx.playerStat.findMany({where:{matchId},select:{playerId:true,stats:true}}),
      tx.statSubmission.findMany({where:{eventId,matchId},orderBy:{submittedAt:"desc"},take:20}),
      tx.matchResultRevision.findMany({where:{eventId,matchId},orderBy:{version:"desc"},take:100,select:{id:true,version:true,homeScore:true,awayScore:true,reason:true,actorUserId:true,createdAt:true}}),
      tx.eventRoundConfig.findUnique({where:{eventId_roundLabel:{eventId,roundLabel:match.roundLabel}},select:{bestOf:true}}),
    ]);
    const rosterAt=matchRosterReferenceTime(match);
    const playerIdsWithStats=new Set(statRows.map(row=>row.playerId));
    const rosterOf=(teamId:string)=>rosterForMatch(players.filter(player=>player.teamId===teamId),rosterAt,playerIdsWithStats)
      .map(({id,teamId:ownerTeamId,nickname,position})=>({id,teamId:ownerTeamId,nickname,position}));
    const snapshot=match.resultSnapshot as {bestOf?:number;games?:{gameNumber:number;homeScore:number;awayScore:number}[]}|null;
    const games=[...(match.games.length?match.games:snapshot?.games??[])].sort((a,b)=>a.gameNumber-b.gameNumber);
    let scoreGameNumbers:number[]|null=null;
    let scoreContextUnavailable=false;
    if(match.status==="Completed"&&match.event.gameId==="game-flashpeak"){
      try{scoreGameNumbers=resolvePlayerScoreGameNumbers({matchGames:match.games,resultSnapshot:match.resultSnapshot,roundBestOf:round?.bestOf??snapshot?.bestOf??1});}
      catch{scoreContextUnavailable=true;}
    }
    return {
      eventId,matchId,eventVersion:event.competitionVersion,resultVersion:match.resultVersion,games,
      allowedStatKeys:getStatKeysForMode(match.event.gameModeId,match.event.gameId),scoreGameNumbers,scoreContextUnavailable,
      teams:teamIds.map(id=>teams.find(team=>team.id===id)).filter((team):team is NonNullable<typeof team>=>!!team).map(team=>({...team,players:rosterOf(team.id)})),
      stats:Object.fromEntries(statRows.map(row=>[row.playerId,row.stats])) as PlayerStatPayloadMap,
      submissions:submissions.map(row=>({id:row.id,teamId:row.teamId,status:row.status,stats:row.stats as PlayerStatPayloadMap,submittedAt:row.submittedAt.toISOString(),reviewedAt:row.reviewedAt?.toISOString()??null,reviewedBy:row.reviewedBy,rejectionNote:row.rejectionNote})),
      revisions:revisions.map(row=>({...row,createdAt:row.createdAt.toISOString()})),
    };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}

export function statFingerprint(value: unknown): string {
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

/** Every organizer entry point, including legacy adapters, shares this guarded transaction. */
export async function managePlayerStats(input: {
  actorId: string; action: "save" | "approve" | "reject"; submissionId?: string;
  eventId?: string; matchId?: string; teamId?: string; stats?: PlayerStatPayloadMap;
  note?: string; guard?: PlayerStatWriteGuard;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const submission = input.submissionId ? await tx.statSubmission.findUnique({ where: { id: input.submissionId } }) : null;
    if (input.submissionId && !submission) throw new Error("Submission not found");
    const eventId = submission?.eventId ?? input.eventId!;
    const matchId = submission?.matchId ?? input.matchId!;
    const teamId = submission?.teamId ?? input.teamId!;
    const [actor, event, match] = await Promise.all([
      tx.user.findUnique({ where: { id: input.actorId }, select: { id: true, role: true, mustChangePassword: true } }),
      tx.event.findUnique({ where: { id: eventId }, select: { id: true, organizerUserId: true, competitionVersion: true } }),
      tx.match.findFirst({ where: { id: matchId, eventId }, select: { id: true, eventId: true, resultVersion: true, homeTeamId: true, awayTeamId: true, status: true } }),
    ]);
    if (!actor || !event || !["admin", "platform_admin", "organizer"].includes(actor.role)
      || actor.role === "organizer" && (actor.mustChangePassword || event.organizerUserId !== actor.id)) throw new Error("Not authorized");
    if (!match || match.eventId !== eventId || ![match.homeTeamId, match.awayTeamId].includes(teamId)) throw new Error("Match, team, and event relationship is invalid.");
    const guard = input.guard ?? {
      eventId, matchId, expectedVersion: event.competitionVersion, expectedResultVersion: match.resultVersion,
      operationId: randomUUID(), ...(submission ? { submittedAt: submission.submittedAt?.toISOString() } : {}),
    };
    if (guard.eventId !== eventId || guard.matchId !== matchId || !guard.operationId || guard.operationId.length > 200
      || !Number.isSafeInteger(guard.expectedVersion) || guard.expectedVersion < 0
      || !Number.isSafeInteger(guard.expectedResultVersion) || guard.expectedResultVersion < 0) throw new Error("Statistics conflict");
    const reason = input.note?.trim() ?? "";
    if (input.action === "reject" && (!reason || reason.length > 4000)) throw new Error("Rejection reason is required.");
    const fingerprint = statFingerprint({ ...input, guard, note: reason });
    const prior = await tx.competitionAuditLog.findFirst({ where: { eventId, idempotencyKey: guard.operationId } });
    if (prior) {
      if (prior.actorUserId !== actor.id || (prior.payload as { fingerprint?: string } | null)?.fingerprint !== fingerprint) throw new Error("Statistics conflict: operation reused.");
      return;
    }
    if (event.competitionVersion !== guard.expectedVersion || match.resultVersion !== guard.expectedResultVersion) throw new Error("Statistics conflict: stale version.");
    if (submission?.status !== undefined && submission.status !== "pending") throw new Error("Submission is no longer pending.");
    if (submission && input.guard && (!guard.submittedAt || submission.submittedAt.toISOString() !== guard.submittedAt)) throw new Error("Statistics conflict: stale submission.");
    if (match.status !== "Completed") throw new Error("Completed match required.");
    const locked = await tx.event.updateMany({ where: { id: eventId, competitionVersion: guard.expectedVersion }, data: { competitionVersion: { increment: 1 } } });
    if (locked.count !== 1) throw new Error("Statistics conflict: stale version.");
    const completion = await tx.tournamentCompletion.findUnique({ where: { eventId }, select: { status: true } });
    if (completion?.status === "completed") throw new Error("Tournament completion locks award-source writes");
    const stats = (submission?.stats ?? input.stats) as PlayerStatPayloadMap;
    const context = input.action !== "reject" ? await validatePlayerStatWriteContext(tx, { eventId, matchId, teamId, stats }) : null;
    if (submission) {
      const transitioned = await tx.statSubmission.updateMany({
        where: { id: submission.id, status: "pending", ...(input.guard ? { submittedAt: new Date(guard.submittedAt!) } : {}) },
        data: { status: input.action === "approve" ? "approved" : "rejected", reviewedBy: actor.id, reviewedAt: new Date(), rejectionNote: input.action === "reject" ? reason : null },
      });
      if (transitioned.count !== 1) throw new Error("Submission is no longer pending.");
    }
    if (context) await writePlayerStatsToDb(tx, matchId, teamId, context.gameSlug, stats, context.roster, {
      source: submission ? "captain" : "admin", lastUpdatedBy: actor.id,
    });
    await tx.competitionAuditLog.create({ data: {
      eventId, matchId, actorUserId: actor.id, action: `player_stats_${input.action}`,
      reason: reason || null, idempotencyKey: guard.operationId,
      payload: { fingerprint, teamId, submissionId: submission?.id ?? null, previousVersion: guard.expectedVersion, version: guard.expectedVersion + 1, resultVersion: guard.expectedResultVersion, source: submission ? "captain" : "organizer" },
    } });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 20_000,
  });
}

/**
 * Creates or replaces a captain's stat submission for a match.
 * Re-submission resets status to "pending" and clears any prior rejection note.
 */
export async function upsertStatSubmission(input: {
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  stats: PlayerStatPayloadMap;
}): Promise<void> {
  await awardSourceTransaction(input.eventId, async (tx) => {
    await validatePlayerStatWriteContext(tx, {
      matchId: input.matchId,
      teamId: input.teamId,
      eventId: input.eventId,
      stats: input.stats,
      captainId: input.submittedBy,
    });
    await tx.statSubmission.upsert({
      where: { matchId_teamId: { matchId: input.matchId, teamId: input.teamId } },
      update: {
        status: "pending",
        rejectionNote: null,
        reviewedAt: null,
        reviewedBy: null,
        stats: input.stats,
        submittedBy: input.submittedBy,
        submittedAt: new Date(),
      },
      create: {
        matchId: input.matchId,
        teamId: input.teamId,
        eventId: input.eventId,
        submittedBy: input.submittedBy,
        status: "pending",
        stats: input.stats,
      },
    });
  });
}

/** Request-memoised count of pending stat submissions. Used for the admin notification badge. */
export const getPendingStatSubmissionCount = cache(async (user?: AppUser): Promise<number> => {
  return prisma.statSubmission.count({
    where: {
      status: "pending",
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
  });
});

export type StatSubmissionRow = {
  id: string;
  matchId: string;
  teamId: string;
  eventId: string;
  submittedBy: string;
  status: string;
  rejectionNote: string | null;
  stats: PlayerStatPayloadMap;
  submittedAt: Date;
  matchLabel: string;
  teamName: string;
  captainEmail: string;
  eventName: string;
};

/** Returns pending stat submissions with denormalized display fields (match label, team name, captain email). */
export async function getPendingStatSubmissions(user?: AppUser): Promise<StatSubmissionRow[]> {
  const rows = await prisma.statSubmission.findMany({
    where: {
      status: "pending",
      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),
    },
    orderBy: { submittedAt: "asc" },
  });
  if (rows.length === 0) return [];

  const [matches, teams, events, captains] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: rows.map((r) => r.matchId) } },
      select: { id: true, roundLabel: true, slot: true },
    }),
    prisma.team.findMany({
      where: { id: { in: rows.map((r) => r.teamId) } },
      select: { id: true, name: true },
    }),
    prisma.event.findMany({
      where: { id: { in: rows.map((r) => r.eventId) } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.submittedBy) } },
      select: { id: true, email: true },
    }),
  ]);

  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const captainMap = new Map(captains.map((u) => [u.id, u]));

  return rows.map((row) => ({
    id: row.id,
    matchId: row.matchId,
    teamId: row.teamId,
    eventId: row.eventId,
    submittedBy: row.submittedBy,
    status: row.status,
    rejectionNote: row.rejectionNote,
    stats: row.stats as PlayerStatPayloadMap,
    submittedAt: row.submittedAt,
    matchLabel: (() => {
      const m = matchMap.get(row.matchId);
      return m ? `${m.roundLabel}${m.slot != null ? ` · Match ${m.slot}` : ""}` : row.matchId;
    })(),
    teamName: teamMap.get(row.teamId)?.name ?? row.teamId,
    captainEmail: captainMap.get(row.submittedBy)?.email ?? row.submittedBy,
    eventName: eventMap.get(row.eventId)?.name ?? row.eventId,
  }));
}

/**
 * Upserts PlayerStat rows for each playerId in `statsMap` within a transaction.
 * Players must belong to the validated roster. Existing stats JSON is replaced, not merged.
 */
export async function writePlayerStatsToDb(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  matchId: string,
  teamId: string,
  gameSlug: string,
  statsMap: PlayerStatPayloadMap,
  roster: ReadonlyMap<string, { nickname: string; position: string }>,
  audit?: { source: string; lastUpdatedBy: string },
): Promise<void> {
  for (const [playerId, playerStats] of Object.entries(statsMap)) {
    const player = roster.get(playerId);
    if (!player) throw new Error("Player does not belong to the submitted team and event.");

    await tx.playerStat.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      update: {
        teamId,
        playerName: player.nickname,
        position: player.position,
        gameSlug,
        stats: playerStats as object,
        ...(audit ? { source: audit.source, lastUpdatedBy: audit.lastUpdatedBy } : {}),
      },
      create: {
        matchId,
        playerId,
        playerName: player.nickname,
        teamId,
        position: player.position,
        gameSlug,
        stats: playerStats as object,
        ...(audit ? { source: audit.source, lastUpdatedBy: audit.lastUpdatedBy } : {}),
      },
    });
  }
}

export async function validatePlayerStatWriteContext(
  tx: Prisma.TransactionClient,
  input: { matchId: string; teamId: string; eventId: string; stats: PlayerStatPayloadMap; captainId?: string },
): Promise<{ gameSlug: string; roster: Map<string, { nickname: string; position: string }> }> {
  const [match, team, players, savedStats] = await Promise.all([
    tx.match.findFirst({
      where: {
        id: input.matchId,
        eventId: input.eventId,
        status: "Completed",
        OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
      },
      select: {
        id: true,
        roundLabel: true,
        resultSnapshot: true,
        actualStartedAt: true,
        actualEndedAt: true,
        resultConfirmedAt: true,
        games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
        event: { select: { gameId: true, gameModeId: true } },
      },
    }),
    tx.team.findFirst({
      where: {
        id: input.teamId,
        eventId: input.eventId,
        ...(input.captainId ? { captainId: input.captainId } : {}),
      },
      select: { id: true },
    }),
    tx.player.findMany({
      where: { teamId: input.teamId },
      select: { id: true, nickname: true, position: true, createdAt: true, removedAt: true, rosterGaps: true },
    }),
    tx.playerStat.findMany({
      where: { matchId: input.matchId, teamId: input.teamId },
      select: { playerId: true },
    }),
  ]);
  if (!match || !team) throw new Error("Match, team, and event relationship is invalid.");

  const roundConfig = match.event.gameId === "game-flashpeak"
    ? await tx.eventRoundConfig.findUnique({
        where: { eventId_roundLabel: { eventId: input.eventId, roundLabel: match.roundLabel } },
        select: { bestOf: true },
      })
    : null;
  const snapshotBestOf = match.resultSnapshot && typeof match.resultSnapshot === "object" && !Array.isArray(match.resultSnapshot)
    && Number.isSafeInteger((match.resultSnapshot as { bestOf?: unknown }).bestOf)
    ? Number((match.resultSnapshot as { bestOf: number }).bestOf)
    : null;
  const scoreGameNumbers = match.event.gameId === "game-flashpeak"
    ? resolvePlayerScoreGameNumbers({
        matchGames: match.games,
        resultSnapshot: match.resultSnapshot,
        roundBestOf: roundConfig?.bestOf ?? snapshotBestOf ?? 1,
      })
    : null;
  validatePlayerStatPayload(input.stats, {
    allowedStatKeys: getStatKeysForMode(match.event.gameModeId, match.event.gameId),
    scoreSlotCount: scoreGameNumbers?.length ?? null,
  });

  // Judge against the roster the team had when the match started, so a later
  // roster change neither blocks corrections nor credits a newcomer for an old match.
  const matchRoster = rosterForMatch(players, matchRosterReferenceTime(match), new Set(savedStats.map((row) => row.playerId)));
  const roster = new Map(matchRoster.map((player) => [player.id, { nickname: player.nickname, position: player.position }]));
  for (const playerId of Object.keys(input.stats)) {
    if (!roster.has(playerId)) throw new Error("Player does not belong to the submitted team and event.");
  }
  const game = getGameConfig(match.event.gameId);
  return { gameSlug: game?.slug ?? "unknown", roster };
}

/**
 * Approves a stat submission: writes `PlayerStat` rows for each player and marks the
 * submission as "approved" in one guarded transaction. Foreign players reject the entire write.
 */
export async function approveStatSubmission(submissionId: string, adminId: string, guard?: PlayerStatWriteGuard): Promise<void> {
  await managePlayerStats({ actorId: adminId, action: "approve", submissionId, guard });
}

// The editor still opens for a match that has no score context yet (it is not completed, or its games are not saved).
// Any other failure, such as a lost database connection, must reach the caller instead of being hidden as "no context".
const MISSING_STAT_CONTEXT_MESSAGES = new Set([
  "Completed match not found.",
  "Completed MatchGame rows are required before entering player scores.",
]);

function ignoreMissingStatContext(error: unknown): null {
  if (error instanceof Error && MISSING_STAT_CONTEXT_MESSAGES.has(error.message)) return null;
  throw error;
}

/**
 * Returns a match with its roster (players from both teams) and existing PlayerStat rows.
 * Used by Admin to pre-fill the player statistics editor.
 */
export async function getMatchWithRosterAndStats(matchId: string): Promise<{
  match: { id: string; homeTeamId: string; awayTeamId: string; status: string; eventId: string };
  homePlayers: Player[];
  awayPlayers: Player[];
  existingStats: PlayerStatPayloadMap;
  scoreGameNumbers: number[] | null;
} | null> {
  const matchRow = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, homeTeamId: true, awayTeamId: true, status: true, eventId: true,
      actualStartedAt: true, actualEndedAt: true, resultConfirmedAt: true,
    },
  });
  if (!matchRow || !matchRow.homeTeamId || !matchRow.awayTeamId) return null;
  const match = {
    id: matchRow.id, homeTeamId: matchRow.homeTeamId, awayTeamId: matchRow.awayTeamId,
    status: matchRow.status, eventId: matchRow.eventId,
  };

  const [playerRows, statRows, statContext] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: { in: [match.homeTeamId, match.awayTeamId] } },
      orderBy: [{ teamId: "asc" }, { jerseyNumber: "asc" }],
    }),
    prisma.playerStat.findMany({ where: { matchId } }),
    getPlayerStatFormContext(match.id, match.eventId).catch(ignoreMissingStatContext),
  ]);
  // The roster the teams had when this match started, not today's roster.
  const allPlayers = rosterForMatch(
    playerRows,
    matchRosterReferenceTime(matchRow),
    new Set(statRows.map((row) => row.playerId)),
  ).map(mapPlayer);

  const existingStats: PlayerStatPayloadMap = {};
  for (const row of statRows) {
    existingStats[row.playerId] = row.stats as PlayerStatPayloadMap[string];
  }

  return {
    match,
    homePlayers: allPlayers.filter((p) => p.teamId === match.homeTeamId),
    awayPlayers: allPlayers.filter((p) => p.teamId === match.awayTeamId),
    existingStats,
    scoreGameNumbers: statContext?.scoreGameNumbers ?? null,
  };
}

/**
 * Writes player match statistics directly (admin override, bypasses captain submission queue).
 * Stats JSON is replaced per player — safe for editing existing values without double-counting.
 */
export async function adminWriteMatchPlayerStats(input: {
  matchId: string;
  teamId: string;
  eventId: string;
  adminId: string;
  stats: PlayerStatPayloadMap;
  guard?: PlayerStatWriteGuard;
}): Promise<void> {
  await managePlayerStats({ actorId: input.adminId, action: "save", eventId: input.eventId, matchId: input.matchId, teamId: input.teamId, stats: input.stats, guard: input.guard });
}

/** Rejects a stat submission with a note shown to the captain. Does not delete PlayerStat rows. */
export async function rejectStatSubmission(
  submissionId: string,
  adminId: string,
  note: string,
  guard?: PlayerStatWriteGuard,
): Promise<void> {
  await managePlayerStats({ actorId: adminId, action: "reject", submissionId, note, guard });
}
