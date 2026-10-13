// Compatibility projection of stored events and announcements into a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { CompatiblePublicEventInput, CompatiblePublicMatch, CompatiblePublicTeam, PublicV3Shared, PublicViewer } from "@/lib/events/public-v3-types";
import { teamsFromRaw } from "@/lib/events/public-v3/authoritative";
import { AWARD_ORDER, PUBLIC_READER_ROW_LIMIT, callOptional, publicBracketKind, publicReaderRows, record, text } from "@/lib/events/public-v3/basics";
import type { AnyRecord } from "@/lib/events/public-v3/basics";
import { identityEvent } from "@/lib/events/public-v3/identity";
import { publicScore } from "@/lib/events/public-v3/parts";
import { authoritativeUpdates, isPublishedAnnouncement } from "@/lib/events/public-v3/updates";
import { createServerMilestoneLogger } from "@/lib/observability/logger";
import { findGameConfig } from "@/lib/platform/config";
import { assertReaderResultWithinLimit, readerProbeLimit } from "@/lib/platform/reader-bounds";
import { aggregateFlashpeakLeaderboard } from "@/lib/player-stats/flashpeak";

export async function readPublishedAnnouncements(
  eventId: string,
  now: Date,
  requestedPhase: string,
  trace?: ReturnType<typeof createServerMilestoneLogger>,
): Promise<PublicV3Shared["updates"]> {
  try {
    const rows = await callOptional("eventAnnouncement", "findMany", {
      where: { eventId, status: "published" },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT),
    });
    return authoritativeUpdates(publicReaderRows("public.eventAnnouncements", rows).filter((value) => isPublishedAnnouncement(value, now)));
  } catch {
    trace?.(`optional_announcements_${requestedPhase}`, { status: 500, terminal: "failed", errorCode: "internal_error", resourceId: eventId });
    return [];
  }
}

export function compatibleMatch(value: unknown): CompatiblePublicMatch {
  const row = record(value);
  return {
    id: text(row.id, "TBD"),
    roundLabel: typeof row.roundLabel === "string" ? row.roundLabel : null,
    round: publicScore(row.round),
    phaseId: typeof row.phaseId === "string" ? row.phaseId : null,
    groupId: typeof row.groupId === "string" ? row.groupId : null,
    groupNumber: publicScore(row.groupNumber),
    ...(typeof row.isPlayoff === "boolean" ? { isPlayoff: row.isPlayoff } : {}),
    bracket: publicBracketKind(row.bracket),
    homeTeamId: typeof row.homeTeamId === "string" ? row.homeTeamId : null,
    awayTeamId: typeof row.awayTeamId === "string" ? row.awayTeamId : null,
    homeScore: publicScore(row.homeScore),
    awayScore: publicScore(row.awayScore),
    status: typeof row.status === "string" ? row.status : null,
    scheduledAt: row.scheduledAt instanceof Date || typeof row.scheduledAt === "string" ? row.scheduledAt : null,
    scheduledEndsAt: row.scheduledEndsAt instanceof Date || typeof row.scheduledEndsAt === "string" ? row.scheduledEndsAt : null,
    scheduleRoom: typeof row.scheduleRoom === "string" ? row.scheduleRoom : null,
    resultVersion: publicScore(row.resultVersion),
    winnerTeamId: typeof row.winnerTeamId === "string" ? row.winnerTeamId : null,
    bestOf: publicScore(row.bestOf),
  };
}

export function compatibleRegistration(value: unknown): NonNullable<CompatiblePublicEventInput["registrations"]>[number] {
  const row = record(value);
  const teamRows = teamsFromRaw(row.team);
  return {
    status: typeof row.status === "string" ? row.status : undefined,
    team: teamRows[0] ?? null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
  };
}

export function compatibleLeaderboardRows(
  values: unknown,
  players: unknown,
  teams: CompatiblePublicTeam[],
  gameSlug: string,
): NonNullable<CompatiblePublicEventInput["leaderboard"]> {
  const playerById = new Map(publicReaderRows("public.compatibility.players", players).map((value) => {
    const row = record(value);
    const id = text(row.id);
    return [id, row] as const;
  }).filter(([id]) => Boolean(id)));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const source = publicReaderRows("public.compatibility.playerStats", values).flatMap((value) => {
    const row = record(value);
    const playerId = text(row.playerId);
    const player = playerById.get(playerId);
    const rowGameSlug = text(row.gameSlug);
    if (!playerId || rowGameSlug !== gameSlug) return [];
    const teamId = text(row.teamId);
    if (!player || teamId !== text(player.teamId) || !teamNames.has(teamId)) return [];
    return [{
      matchId: text(row.matchId, "unknown-match"),
      playerId,
      playerName: text(row.playerName, text(player?.displayName, playerId)),
      nickname: text(player?.nickname, text(row.playerName, playerId)),
      teamId,
      teamName: teamNames.get(teamId) ?? teamId,
      position: text(row.position, text(player?.position)),
      stats: row.stats,
    }];
  });
  return aggregateFlashpeakLeaderboard(source);
}

export async function compatibilitySnapshot(event: AnyRecord, viewer: PublicViewer, now: Date, persistedUpdates: PublicV3Shared["updates"] = []): Promise<CompatiblePublicEventInput> {
  const eventId = text(event.id);
  const [teams, matches, registrations, completion, publication, players] = await Promise.all([
    callOptional("team", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) }),
    callOptional("match", "findMany", { where: { eventId }, orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }], take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) }),
    callOptional("teamRegistrationRequest", "findMany", { where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) }),
    callOptional("tournamentCompletion", "findUnique", { where: { eventId }, include: { podiumPlacements: { orderBy: { rank: "asc" }, take: 3 }, awards: { include: { decision: true }, orderBy: { type: "asc" }, take: AWARD_ORDER.length } } }),
    callOptional("certificatePublication", "findFirst", { where: { eventId }, orderBy: { version: "desc" } }),
    callOptional("player", "findMany", { where: { eventId }, select: { id: true, displayName: true, nickname: true, teamId: true, position: true }, take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) }),
  ]);
  const publicationRecord = record(publication);
  const rawCertificateIds = publicationRecord.certificateIds;
  const certificateIds = Array.isArray(rawCertificateIds)
    ? rawCertificateIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  assertReaderResultWithinLimit("public.compatibility.certificateIds", certificateIds, PUBLIC_READER_ROW_LIMIT);
  const ids = certificateIds;
  const certificates = ids.length
    ? await callOptional("certificate", "findMany", { where: { eventId, id: { in: ids } }, take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) })
    : null;
  const teamRows = publicReaderRows("public.compatibility.teams", teams);
  const matchRows = publicReaderRows("public.compatibility.matches", matches);
  const registrationRows = publicReaderRows("public.compatibility.registrations", registrations);
  const certificateRows = publicReaderRows("public.compatibility.certificates", certificates);
  const publicTeams = teamsFromRaw(teamRows);
  const gameSlug = findGameConfig(text(event.gameId))?.slug;
  const playerRows = publicReaderRows("public.compatibility.players", players);
  const playerIds = playerRows.map((value) => text(record(value).id)).filter(Boolean);
  const playerStats = gameSlug === "flashpeak" && playerIds.length
    ? await callOptional("playerStat", "findMany", { where: { gameSlug, playerId: { in: playerIds }, match: { eventId, status: "Completed" } }, take: readerProbeLimit(PUBLIC_READER_ROW_LIMIT) })
    : null;
  return {
    event: identityEvent(event),
    viewer,
    now,
    teams: publicTeams,
    announcements: persistedUpdates,
    matches: matchRows.map(compatibleMatch),
    registrations: registrationRows.map(compatibleRegistration),
    leaderboard: gameSlug === "flashpeak" ? compatibleLeaderboardRows(playerStats, playerRows, publicTeams, gameSlug) : [],
    completion: completion && typeof completion === "object" ? completion as CompatiblePublicEventInput["completion"] : null,
    publication: publication && typeof publication === "object" ? publication as CompatiblePublicEventInput["publication"] : null,
    certificates: certificateRows.flatMap((value) => {
      const row = record(value);
      const id = text(row.id);
      const type = text(row.type);
      if (!id || !type) return [];
      return [{
        id,
        type,
        recipientKind: typeof row.recipientKind === "string" ? row.recipientKind : null,
        recipientId: typeof row.recipientId === "string" ? row.recipientId : null,
        recipientName: typeof row.recipientName === "string" ? row.recipientName : null,
        publishedUrl: typeof row.publishedUrl === "string" ? row.publishedUrl : null,
        verificationCode: typeof row.verificationCode === "string" ? row.verificationCode : null,
        publishedAt: row.publishedAt instanceof Date || typeof row.publishedAt === "string" ? row.publishedAt : null,
        status: typeof row.status === "string" ? row.status : null,
        completionId: typeof row.completionId === "string" ? row.completionId : null,
        completionVersion: publicScore(row.completionVersion),
      }];
    }),
  };
}
