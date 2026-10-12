import { createHash, randomUUID } from "node:crypto";
import { cache } from "react";
import { getGameConfig, getStatKeysForMode } from "@/lib/platform/config";
import {
  resolvePlayerScoreGameNumbers,
  validatePlayerStatPayload,
  type PlayerStatPayloadMap,
} from "@/lib/player-stats/form";
import {
  aggregateFlashpeakLeaderboard,
  parsePlayerScoreArray,
  type FlashpeakLeaderboardEntry,
  type FlashpeakLeaderboardSource,
} from "@/lib/player-stats/flashpeak";
import type { AppUser, Certificate, Player } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { matchRosterReferenceTime, rosterForMatch } from "./roster-membership";
import { mapPlayer, mapUser } from "./shared/mappers";
export { runSerializableRegistrationTransaction } from "./shared/tx";
export { assertUserCanManageEvent, assertUserCanManageTeam, assertUserCanReviewStatSubmission } from "./shared/authz";
export { eventPublicInclude, mapEvent } from "./shared/mappers";
export { getAllGames, getGameForEvent, getGameModes, getModeForEvent, getOrganizerProfileForUser, getPaymentSettings, getPlatformProfile, updateOrganizerProfileForUser, updatePaymentSettings, updatePlatformProfile } from "@/lib/platform/settings-repository";
export type { OrganizerProfileSummary, PlatformProfileSummary } from "@/lib/platform/settings-repository";
export { autoTransitionEventToOngoing, createEvent, createOrganizerAndEventDraft, getAllPublicEvents, getEventBySlug, getEvents, getEventsByIds, getManageableEventDraft, getManageableEventsForUser, getOpenRegistrationEventsForCaptain, getPublicDiscoveryEvents, getPublicEventBySlug, getPublicEventSlugRedirect, getPublicEvents, getPublishedEvents, setEventStatus, updateEventOrganizerContact, updateEventPublicInfo, updateEventStream, updatePublishedEventSlugAsAdmin } from "@/lib/events/repository";
export type { CreateOrganizerAndEventDraftInput, EventPublicInfoUpdates } from "@/lib/events/repository";
export { approveEventVisualAsset, countAiVisualAttempts, createEventVisualAsset, listEventVisualAssets, rejectEventVisualAsset, setEventVisualFocalPoint, updateEventBrandAssets, updateEventCertificateAssets } from "@/lib/events/visual-repository";
export type { CreateEventVisualAssetInput } from "@/lib/events/visual-repository";
export { addPlayer, deletePlayer, getCaptainTeams, getPlayersForEvent, getPlayersForTeam, getPlayersForTeams, getTeamCountsForEvents, getTeamsForEvent, getTeamsForEvents, setTeamCaptainDisplay, updateCaptainTeamLogo, updatePlayer, updateTeamLogo } from "@/lib/teams/repository";
export { getBracketManageableMatches, getBracketManageableMatchesForEvent, getBracketPreview, getLeaderboardForEvent, getMatchesForEvent, getPublicVisibleBracketPreview, getTeamStandings, isEventBracketLocked, setMatchResult } from "@/lib/bracket/repository";
export { getEventRoundConfigs, getMatchGames, getMatchGamesForEvent, setMatchGames, upsertRoundConfig } from "@/lib/bracket/rounds-repository";
export { RegistrationMutationConflictError, createOrUpdateCaptainDraftTeam, createTeamRegistrationRequest, getCaptainRegistrationRequests, getPaymentRegistrationRequestsForAdmin, getRosterChangeWindow, readRosterChangeState, registerTeam, updateTeamRegistrationProof } from "@/lib/registration/repository";
export type { RegistrationReviewPrecondition } from "@/lib/registration/repository";
export { PaymentReviewOverflowError, approveTeamRegistrationRequest, getEventPaymentSettingsForManager, getPaymentReviewForEvent, getTeamRegistrationRequestForEvent, rejectTeamRegistrationRequest } from "@/lib/registration/review-repository";
export type { EventPaymentManagerSettings, PaymentReviewEntry, TeamRegistrationRequestTarget } from "@/lib/registration/review-repository";
export { commitRegistrationImportBatch, getCaptainCredentialsForEvent, getImportSnapshot, getImportedTeams, getRegistrationImportBatchForAdmin, getRegistrationImportBatchesForEvent, getRegistrationImportEventContext, getRegistrationImportHistoryForEvent, getRegistrationImportUsersByEmails, getRegistrationRecordsForEvent, importTeams, saveRegistrationImportPreviewBatch } from "@/lib/imports/repository";
export type { RegistrationImportEventContext, RegistrationImportHistoryEntry } from "@/lib/imports/repository";

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Credential helpers ────────────────────────────────────────────────────────

// ── Static config ─────────────────────────────────────────────────────────────

// ── Events ────────────────────────────────────────────────────────────────────

// ── Event visual assets ───────────────────────────────────────────────────────


// ── Teams ─────────────────────────────────────────────────────────────────────

// ── Players ───────────────────────────────────────────────────────────────────

// ── Matches ───────────────────────────────────────────────────────────────────

// ── Bracket helpers (copied from demo-store, now async) ───────────────────────

// ── Leaderboard / standings ───────────────────────────────────────────────────

// ── Bracket preview ───────────────────────────────────────────────────────────

// ── Users ─────────────────────────────────────────────────────────────────────

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
export async function getCaptainUsersForAdmin() {
  return prisma.user.findMany({
    where: { role: "captain" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Returns true if the user still has a temporary password set from a CSV import. Used to prompt password change on first login. */
export async function hasTempPassword(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tempPassword: true } });
  return row?.tempPassword != null;
}

/** Updates a password hash and clears any first-login lock without retaining the temporary secret. */
export async function updateUserPassword(userId: string, newHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, tempPassword: null, mustChangePassword: false } as never,
  });
}

/** Legacy captain alias retained for current captain settings and imports. */
export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {
  await updateUserPassword(userId, newHash);
}
// ── Import snapshot ───────────────────────────────────────────────────────────

// ── Mutations ─────────────────────────────────────────────────────────────────

// ── Stat Submissions (captain) ────────────────────────────────────────────────

export type CompletedMatchRow = {
  matchId: string;
  matchLabel: string;
  slot: number | null;
  eventId: string;
  eventName: string;
  gameId: string;
  gameModeId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  scoreGameNumbers: number[] | null;
  submission: {
    id: string;
    status: string;
    rejectionNote: string | null;
    stats: PlayerStatPayloadMap;
  } | null;
};

export type PlayerStatFormContext = {
  match: {
    id: string;
    eventId: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
  };
  allowedStatKeys: string[];
  scoreGameNumbers: number[] | null;
};

export async function getPlayerStatFormContext(matchId: string, eventId: string): Promise<PlayerStatFormContext> {
  const match = await prisma.match.findFirst({
    where: { id: matchId, eventId, status: "Completed" },
    select: {
      id: true,
      eventId: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      roundLabel: true,
      resultSnapshot: true,
      games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
      event: { select: { gameId: true, gameModeId: true } },
    },
  });
  if (!match) throw new Error("Completed match not found.");
  const allowedStatKeys = getStatKeysForMode(match.event.gameModeId, match.event.gameId);
  if (match.event.gameId !== "game-flashpeak") {
    return {
      match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      allowedStatKeys,
      scoreGameNumbers: null,
    };
  }
  const roundConfig = await prisma.eventRoundConfig.findUnique({
    where: { eventId_roundLabel: { eventId, roundLabel: match.roundLabel } },
    select: { bestOf: true },
  });
  const snapshotBestOf = match.resultSnapshot && typeof match.resultSnapshot === "object" && !Array.isArray(match.resultSnapshot)
    && Number.isSafeInteger((match.resultSnapshot as { bestOf?: unknown }).bestOf)
    ? Number((match.resultSnapshot as { bestOf: number }).bestOf)
    : null;
  const scoreGameNumbers = resolvePlayerScoreGameNumbers({
    matchGames: match.games,
    resultSnapshot: match.resultSnapshot,
    roundBestOf: roundConfig?.bestOf ?? snapshotBestOf ?? 1,
  });
  return {
    match: { id: match.id, eventId: match.eventId, status: match.status, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
    allowedStatKeys,
    scoreGameNumbers,
  };
}

/**
 * Reads the V3 Flashpeak leaderboard from completed matches only.
 *
 * This public discovery path intentionally has no demo fallback: an unavailable
 * database must produce an honest empty/error state instead of invented players.
 */
export type FlashpeakLeaderboardReadResult = {
  status: "ready" | "empty" | "error";
  entries: FlashpeakLeaderboardEntry[];
};

export async function getFlashpeakLeaderboardForEventResult(
  eventId: string,
): Promise<FlashpeakLeaderboardReadResult> {
  try {
    const rows = await prisma.playerStat.findMany({
      where: {
        gameSlug: "flashpeak",
        match: { eventId, status: "Completed" },
      },
      select: {
        matchId: true,
        teamId: true,
        stats: true,
        match: {
          select: {
            resultSnapshot: true,
            games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } },
          },
        },
        player: {
          select: {
            id: true,
            displayName: true,
            nickname: true,
            position: true,
            team: { select: { id: true, name: true, eventId: true } },
          },
        },
      },
    });
    const sources: FlashpeakLeaderboardSource[] = rows.flatMap((row) => {
      const stored = row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? row.stats as Record<string, unknown>
        : null;
      try {
        if (row.teamId !== row.player.team.id || row.player.team.eventId !== eventId) {
          throw new Error("PlayerStat roster identity does not match its event.");
        }
        if (stored && "scores" in stored) {
          const gameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: row.match.games,
            resultSnapshot: row.match.resultSnapshot,
            roundBestOf: 1,
          });
          if (!Array.isArray(stored.scores)) throw new Error("Invalid stored player score array.");
          parsePlayerScoreArray(stored.scores, gameNumbers.length);
        }
      } catch (error) {
        console.error("Ignoring invalid Flashpeak PlayerStat row", { eventId, matchId: row.matchId, playerId: row.player.id, error });
        return [];
      }
      return [{
        matchId: row.matchId,
        playerId: row.player.id,
        playerName: row.player.displayName,
        nickname: row.player.nickname,
        teamId: row.player.team.id,
        teamName: row.player.team.name,
        position: row.player.position,
        stats: row.stats,
      }];
    });
    const entries = aggregateFlashpeakLeaderboard(sources);
    if (rows.length === 0) return { status: "empty", entries };
    if (sources.length === 0 || entries.length === 0) return { status: "error", entries: [] };
    return { status: "ready", entries };
  } catch (error) {
    console.error("Failed to load Flashpeak leaderboard", { eventId, error });
    return { status: "error", entries: [] };
  }
}

export async function getFlashpeakLeaderboardForEvent(
  eventId: string,
): Promise<FlashpeakLeaderboardEntry[]> {
  return (await getFlashpeakLeaderboardForEventResult(eventId)).entries;
}

/**
 * Returns all completed matches where the captain's teams participated, including stat submission status.
 * Batches event/team/submission lookups in a single `Promise.all` to avoid N+1 queries.
 */
export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]> {
  const captainTeams = await prisma.team.findMany({
    where: { captainId },
    select: { id: true, name: true, eventId: true },
  });
  if (captainTeams.length === 0) return [];

  const eventTeams = captainTeams.filter((team): team is (typeof captainTeams)[number] & { eventId: string } => Boolean(team.eventId));
  if (eventTeams.length === 0) return [];

  const teamIds = eventTeams.map((t) => t.id);
  const eventIds = [...new Set(eventTeams.map((t) => t.eventId))];

  const [matches, events, allTeams, submissions, roundConfigs] = await Promise.all([
    prisma.match.findMany({
      where: {
        eventId: { in: eventIds },
        status: "Completed",
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
      include: { games: { select: { gameNumber: true }, orderBy: { gameNumber: "asc" } } },
    }),
    prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true, gameId: true, gameModeId: true },
    }),
    prisma.team.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, name: true, eventId: true },
    }),
    prisma.statSubmission.findMany({
      where: { teamId: { in: teamIds } },
    }),
    prisma.eventRoundConfig.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, roundLabel: true, bestOf: true },
    }),
  ]);

  const eventMap = new Map(events.map((e) => [e.id, e]));
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));
  const submissionMap = new Map(submissions.map((s) => [`${s.matchId}::${s.teamId}`, s]));

  return matches.flatMap((match) => {
    const rows: CompletedMatchRow[] = [];
    for (const team of captainTeams) {
      const isHome = match.homeTeamId === team.id;
      const isAway = match.awayTeamId === team.id;
      if (!isHome && !isAway) continue;

      const event = eventMap.get(match.eventId);
      if (!event) continue;

      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = teamMap.get(opponentId);
      const submission = submissionMap.get(`${match.id}::${team.id}`) ?? null;
      const roundBestOf = roundConfigs.find((config) => config.eventId === event.id && config.roundLabel === match.roundLabel)?.bestOf ?? 1;
      let scoreGameNumbers: number[] | null = null;
      if (event.gameId === "game-flashpeak") {
        try {
          scoreGameNumbers = resolvePlayerScoreGameNumbers({
            matchGames: match.games,
            resultSnapshot: match.resultSnapshot,
            roundBestOf,
          });
        } catch {
          scoreGameNumbers = [];
        }
      }

      rows.push({
        matchId: match.id,
        matchLabel: match.roundLabel,
        slot: match.slot,
        eventId: event.id,
        eventName: event.name,
        gameId: event.gameId,
        gameModeId: event.gameModeId,
        teamId: team.id,
        teamName: team.name,
        opponentName: opponent?.name ?? "Unknown",
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        scoreGameNumbers,
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              rejectionNote: submission.rejectionNote,
              stats: submission.stats as PlayerStatPayloadMap,
            }
          : null,
      });
    }
    return rows;
  });
}

/**
 * Verifies that a captain-submitted stat form targets one of their completed matches.
 * Hidden form IDs are attacker-controlled, so every relationship is rechecked server-side.
 */
export async function assertCaptainCanSubmitStats(input: {
  captainId: string;
  matchId: string;
  teamId: string;
  eventId: string;
}): Promise<void> {
  const match = await prisma.match.findFirst({
    where: {
      id: input.matchId,
      eventId: input.eventId,
      status: "Completed",
      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],
    },
    select: { id: true },
  });
  if (!match) {
    throw new Error("Not authorized");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: input.teamId,
      eventId: input.eventId,
      captainId: input.captainId,
    },
    select: { id: true },
  });
  if (!team) {
    throw new Error("Not authorized");
  }
}

async function assertAwardSourceWriteAllowed(
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

async function awardSourceTransaction<T>(
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

function statFingerprint(value: unknown): string {
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

/** Every organizer entry point, including legacy adapters, shares this guarded transaction. */
async function managePlayerStats(input: {
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

// ── Stat Submissions (admin) ──────────────────────────────────────────────────

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
async function writePlayerStatsToDb(
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

async function validatePlayerStatWriteContext(
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
    getPlayerStatFormContext(match.id, match.eventId).catch(() => null),
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

// ── Captain self sign-up ──────────────────────────────────────────────────────

const EMAIL_ALREADY_REGISTERED_MESSAGE = "Email ini sudah terdaftar. Coba login.";

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

// ── Round config (Best of N) ──────────────────────────────────────────────────

// ── Match games (Best of N results) ──────────────────────────────────────────

// ── Certificates ──────────────────────────────────────────────────────────────

/** Longest error message we persist on a failed certificate row. */
const MAX_CERTIFICATE_ERROR_LENGTH = 500;

async function runSerializableCertificateTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if ((code !== "P2034" && code !== "P2002") || attempt === 2) throw error;
    }
  }
  throw new Error("Certificate version changed concurrently. Please retry.");
}

type CertificateRow = {
  id: string;
  eventId: string;
  teamId: string;
  imageUrl: string;
  status: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    imageUrl: row.imageUrl,
    status: row.status === "ready" || row.status === "published" ? "ready" : "failed",
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const LEGACY_CHAMPION_CERTIFICATE_FILTER = {
  type: "champion",
  recipientKind: "team",
} as const;

const LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  templateVersion: "legacy-v1",
} as const;

const LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER = {
  ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
  status: "ready",
  publishedUrl: { not: null },
} as const;

async function getCertificateRecipientName(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return team?.name ?? teamId;
}

async function assertLegacyCertificateWriteAllowed(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const completion = await tx.tournamentCompletion.findFirst({
    where: { eventId },
    select: { id: true },
  });
  if (completion) {
    throw new Error("Completion V3 certificates must be generated in Certificate Studio");
  }
}

/** Marks an event's Champion certificate as successfully generated, clearing any previous failure. */
export async function recordCertificateSuccess(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {
  const recipientName = await getCertificateRecipientName(teamId);
  const now = new Date();
  const createData = {
    eventId,
    teamId,
    ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
    recipientId: teamId,
    recipientName,
    imageUrl,
    publishedUrl: imageUrl,
    status: "ready",
    generatedAt: now,
    publishedAt: now,
    lastError: null,
    attemptCount: 1,
  } as const;
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const isPublished = Boolean(existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl));

    if (isPublished && existing) {
      const nextVersion = existing.version + 1;
      await tx.certificate.update({
        where: { id: existing.id },
        data: { supersededByVersion: nextVersion },
      });
      return tx.certificate.create({ data: { ...createData, version: nextVersion } });
    }
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          imageUrl,
          publishedUrl: imageUrl,
          status: "ready",
          generatedAt: now,
          publishedAt: now,
          lastError: null,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({ data: createData });
  });
  return toCertificate(row);
}

/**
 * Records a failed generation attempt so the admin panel can surface the reason and offer a retry.
 * Keeps the Champion row so the failure is visible instead of looking like "no certificate yet".
 */
export async function recordCertificateFailure(eventId: string, teamId: string, message: string): Promise<Certificate> {
  const lastError = message.slice(0, MAX_CERTIFICATE_ERROR_LENGTH);
  const recipientName = await getCertificateRecipientName(teamId);
  const row = await runSerializableCertificateTransaction(async (tx) => {
    await assertLegacyCertificateWriteAllowed(tx, eventId);
    const existing = await tx.certificate.findFirst({
      where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_WRITE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    if (existing && (existing.publishedAt || existing.publishedUrl || existing.imageUrl)) return existing;
    if (existing) {
      return tx.certificate.update({
        where: { id: existing.id },
        data: {
          teamId,
          recipientId: teamId,
          recipientName,
          status: "failed",
          lastError,
          attemptCount: { increment: 1 },
        },
      });
    }
    return tx.certificate.create({
      data: {
        eventId,
        teamId,
        ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        recipientId: teamId,
        recipientName,
        imageUrl: "",
        status: "failed",
        lastError,
        attemptCount: 1,
      },
    });
  });
  return toCertificate(row);
}

/** Returns the latest Champion team certificate for an event, preserving the legacy API. */
export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {
  const publishedRow = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (publishedRow) return toCertificate(publishedRow);

  const row = await prisma.certificate.findFirst({
    where: { eventId, ...LEGACY_CHAMPION_CERTIFICATE_FILTER },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  if (!row) return null;
  return toCertificate(row);
}

/** Batch-fetches generated certificates for multiple events. */
export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {
  const certificates = new Map(eventIds.map((eventId) => [eventId, null as Certificate | null]));
  if (!eventIds.length) return certificates;

  try {
    const rows = await prisma.certificate.findMany({
      where: { eventId: { in: eventIds }, ...LEGACY_PUBLISHED_CHAMPION_CERTIFICATE_FILTER },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    for (const row of rows) {
      if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
    }
    const eventIdsWithoutPublishedCertificate = eventIds.filter((eventId) => !certificates.get(eventId));
    if (eventIdsWithoutPublishedCertificate.length) {
      const fallbackRows = await prisma.certificate.findMany({
        where: {
          eventId: { in: eventIdsWithoutPublishedCertificate },
          ...LEGACY_CHAMPION_CERTIFICATE_FILTER,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      });
      for (const row of fallbackRows) {
        if (!certificates.get(row.eventId)) certificates.set(row.eventId, toCertificate(row));
      }
    }
  } catch {
    await Promise.all(
      eventIds.map(async (eventId) => {
        certificates.set(eventId, await getCertificateByEvent(eventId));
      }),
    );
  }

  return certificates;
}

/**
 * Counts successfully generated certificates for a given game prefix (e.g. "game-flashpeak")
 * to generate sequential IDs. Failed attempts are excluded so the sequence has no gaps.
 */
export async function countCertificatesForGame(gameId: string): Promise<number> {
  return prisma.certificate.count({
    where: { status: "ready", ...LEGACY_CHAMPION_CERTIFICATE_FILTER, event: { gameId } },
  });
}
