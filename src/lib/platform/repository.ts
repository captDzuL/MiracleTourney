import { randomBytes } from "node:crypto";

import { cache } from "react";

import { unstable_cache } from "next/cache";



import bcrypt from "bcryptjs";



import {

  gameModes,

  games,

  findGameConfig,

  getFallbackLogoUrl,

  getGameConfig,

  getGameIdForMode,

  getGameModeConfig,

  getGamePrimaryStatKey,

} from "@/lib/platform/config";

import type { AppUser, Certificate, Event, EventRoundConfig, EventStatus, EventStream, Match, MatchGame, Player, Team, TournamentFormat } from "@/lib/platform/types";

import type { RegistrationNormalizedTeam, RegistrationPreviewItem, RegistrationSourceKind } from "@/lib/imports/registration-intake";

import {

  aggregatePlayerLeaderboard,

  buildLeagueStandings,

  generateRoundRobinSchedule,

  getPublicVisibleSingleEliminationBracket,

  getLiveStreamPresentation,

  projectSingleEliminationBracket,

} from "@/lib/tournament/engine";

import type { BracketMatch, MatchResultInput, PlayerMatchStatInput } from "@/lib/tournament/types";

import { Prisma } from "@prisma/client";

import * as demoStore from "./demo-store";

import { prisma } from "./db";



const PUBLIC_EVENT_STATUSES = new Set<EventStatus>(["Published", "Registration Closed", "Ongoing", "Finished"]);



// ── Helpers ──────────────────────────────────────────────────────────────────



function mapEvent(row: {

  id: string; slug: string; name: string; description: string;

  logoUrl: string | null; gameImageUrl: string | null;

  gameId: string; gameModeId: string; format: string; status: string;

  participantCap: number; registrationWindow: string; startsAt: string;

  venue: string; characterArtUrl?: string | null; accentColor?: string | null;

  organizerUserId?: string | null; organizerName?: string | null; organizerVerified?: boolean | null;

  prizePoolLabel?: string | null; registrationFeeLabel?: string | null; registrationUrl?: string | null;

  stream?: { platform: string; url: string; label: string; enabled: boolean; isLive: boolean; } | null;

}): Event {

  const event: Event = {

    id: row.id, slug: row.slug, name: row.name, description: row.description,

    gameId: row.gameId, gameModeId: row.gameModeId,

    format: row.format as TournamentFormat,

    status: row.status as EventStatus,

    participantCap: row.participantCap as Event["participantCap"],

    registrationWindow: row.registrationWindow, startsAt: row.startsAt, venue: row.venue,

  };

  const logoUrl = row.logoUrl ?? getFallbackLogoUrl(row.gameId);

  if (logoUrl) event.logoUrl = logoUrl;

  if (row.gameImageUrl) event.gameImageUrl = row.gameImageUrl;

  if (row.characterArtUrl) event.characterArtUrl = row.characterArtUrl;

  if (row.accentColor) event.accentColor = row.accentColor;

  if (row.organizerUserId) event.organizerUserId = row.organizerUserId;

  if (row.organizerName) event.organizerName = row.organizerName;

  if (row.organizerVerified != null) event.organizerVerified = row.organizerVerified;

  if (row.prizePoolLabel) event.prizePoolLabel = row.prizePoolLabel;

  if (row.registrationFeeLabel) event.registrationFeeLabel = row.registrationFeeLabel;

  if (row.registrationUrl) event.registrationUrl = row.registrationUrl;

  if (row.stream) {

    event.stream = {

      platform: row.stream.platform as EventStream["platform"],

      url: row.stream.url, label: row.stream.label,

      enabled: row.stream.enabled, isLive: row.stream.isLive,

    };

  }

  return event;

}



function mapTeam(row: {

  id: string; eventId: string | null; captainId: string | null;

  name: string; logoText: string; logoUrl?: string | null; tag: string;

  captainName: string | null; captainContact: string | null; source: string;

  captain?: { id: string; name: string } | null;

}): Team {

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



function mapPlayer(row: {

  id: string; teamId: string; eventId: string | null;

  displayName: string; nickname: string; position: string; jerseyNumber: number | null;

}): Player {

  return {

    id: row.id, teamId: row.teamId,

    ...(row.eventId ? { eventId: row.eventId } : {}),

    displayName: row.displayName, nickname: row.nickname, position: row.position,

    ...(row.jerseyNumber != null ? { jerseyNumber: row.jerseyNumber } : {}),

  };

}



function mapUser(row: { id: string; email: string; name: string; role: string; deactivatedAt?: Date | null }): AppUser {

  return {

    id: row.id,

    email: row.email,

    name: row.name,

    role: row.role as AppUser["role"],

    ...(row.deactivatedAt ? { deactivatedAt: row.deactivatedAt } : {}),

  };

}



function mapMatch(row: {

  id: string; eventId: string; roundLabel: string;

  homeTeamId: string; awayTeamId: string;

  homeScore: number; awayScore: number; status: string;

  slot: number | null; round: number | null; winnerTeamId: string | null; scheduledLabel: string | null;

}): Match {

  return {

    id: row.id, eventId: row.eventId, roundLabel: row.roundLabel,

    homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,

    homeScore: row.homeScore, awayScore: row.awayScore,

    status: row.status as Match["status"],

    ...(row.slot != null ? { slot: row.slot } : {}),

    ...(row.round != null ? { round: row.round } : {}),

    ...(row.winnerTeamId ? { winnerTeamId: row.winnerTeamId } : {}),

    ...(row.scheduledLabel ? { scheduledLabel: row.scheduledLabel } : {}),

  };

}



// ── Bracket sizing ─────────────────────────────────────────────────────────────

// `event.participantCap` is only the *maximum* registration allowed. The actual

// bracket must be sized to the number of teams that really registered, rounded

// up to the nearest power of two (byes fill the remaining slots). Using

// `participantCap` directly here was the bug: a 32-cap event with only 7 teams

// would render a full 5-round bracket instead of an 8-slot / 3-round one.

function getBracketSlotCount(teamCount: number): 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256 {

  const safeCount = Math.max(teamCount, 1);

  return Math.pow(2, Math.ceil(Math.log2(safeCount === 1 ? 2 : safeCount))) as 8 | 12 | 16 | 24 | 32 | 64 | 128 | 256;

}



// ── Credential helpers ────────────────────────────────────────────────────────



function generateTempPassword(): string {

  return randomBytes(6).toString("base64url").slice(0, 8);

}



function generateCaptainEmail(tag: string, usedInBatch: Set<string>, explicitEmail?: string): string {

  if (explicitEmail) {

    usedInBatch.add(explicitEmail);

    return explicitEmail;

  }

  let candidate = `${tag.toLowerCase()}@miraclefc.gg`;

  let n = 2;

  while (usedInBatch.has(candidate)) {

    candidate = `${tag.toLowerCase()}${n}@miraclefc.gg`;

    n++;

  }

  usedInBatch.add(candidate);

  return candidate;

}



function generateSyntheticRegistrationEmail(eventSlug: string, tag: string, usedInBatch: Set<string>): string {

  const base = `${eventSlug}-${tag}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let candidate = `${base}@miraclefc.gg`;

  let n = 2;

  while (usedInBatch.has(candidate)) {

    candidate = `${base}-${n}@miraclefc.gg`;

    n += 1;

  }

  usedInBatch.add(candidate);

  return candidate;

}



// ── Static config ─────────────────────────────────────────────────────────────



/** Returns the static list of all supported games from config. */

export function getAllGames() {

  return games;

}



/** Returns the static list of all supported game modes from config. */

export function getGameModes() {

  return gameModes;

}



/** Resolves the game definition for a given event. Throws if the game ID is not found in config. */

export function getGameForEvent(event: Event) {

  return getGameConfig(event.gameId);

}



/** Resolves the game mode definition for a given event. Throws if the mode ID is not found in config. */

export function getModeForEvent(event: Event) {

  return getGameModeConfig(event.gameModeId);

}



// ── Events ────────────────────────────────────────────────────────────────────



/** Returns all publicly-visible events (Published, Registration Closed, Ongoing, Finished). Used by sitemap. */

export async function getAllPublicEvents(): Promise<Array<{ slug: string; updatedAt: Date }>> {

  try {

    return await prisma.event.findMany({

      where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },

      select: { slug: true, updatedAt: true },

      orderBy: { updatedAt: "desc" },

    });

  } catch {

    return [];

  }

}



/** Returns all events (all statuses), ordered newest first. For admin use only. */

export async function getEvents(): Promise<Event[]> {

  const rows = await prisma.event.findMany({ include: { stream: true }, orderBy: { createdAt: "desc" } });

  return rows.map(mapEvent);

}



/** Returns selected events by ID, preserving database ordering newest first. */

export async function getEventsByIds(eventIds: string[]): Promise<Event[]> {

  if (!eventIds.length) return [];

  try {

    const rows = await prisma.event.findMany({

      where: { id: { in: eventIds } },

      include: { stream: true },

      orderBy: { createdAt: "desc" },

    });

    return rows.map(mapEvent);

  } catch {

    const eventIdSet = new Set(eventIds);

    return demoStore.getEvents().filter((event) => eventIdSet.has(event.id));

  }

}



export async function getManageableEventsForUser(user: AppUser): Promise<Event[]> {

  if (user.role === "platform_admin" || user.role === "admin") return getEvents();

  if (user.role !== "organizer") return [];



  const rows = await prisma.event.findMany({

    where: { organizerUserId: user.id },

    include: { stream: true },

    orderBy: { createdAt: "desc" },

  });

  return rows.map(mapEvent);

}



export async function assertUserCanManageEvent(user: AppUser, eventId: string): Promise<void> {

  if (user.role === "platform_admin" || user.role === "admin") return;

  if (user.role !== "organizer") throw new Error("Not authorized");



  const row = await prisma.event.findFirst({

    where: { id: eventId, organizerUserId: user.id },

    select: { id: true },

  });

  if (!row) throw new Error("Not authorized");

}



export async function assertUserCanReviewStatSubmission(user: AppUser, submissionId: string): Promise<void> {

  if (user.role === "platform_admin" || user.role === "admin") return;

  if (user.role !== "organizer") throw new Error("Not authorized");



  const row = await prisma.statSubmission.findFirst({

    where: { id: submissionId, event: { organizerUserId: user.id } },

    select: { id: true },

  });

  if (!row) throw new Error("Not authorized");

}



export async function assertUserCanManageTeam(user: AppUser, teamId: string): Promise<{ eventId: string }> {

  const team = await prisma.team.findFirst({

    where: { id: teamId },

    select: { id: true, eventId: true },

  });



  if (!team?.eventId) throw new Error("Not authorized");

  await assertUserCanManageEvent(user, team.eventId);

  return { eventId: team.eventId };

}



export type EventPublicInfoUpdates = {

  description: string;

  registrationWindow: string;

  startsAt: string;

  venue: string;

  prizePoolLabel?: string | null;

  registrationFeeLabel?: string | null;

  registrationUrl?: string | null;

};



export async function updateEventPublicInfo(

  user: AppUser,

  eventId: string,

  updates: EventPublicInfoUpdates,

): Promise<Event> {

  try {

    await assertUserCanManageEvent(user, eventId);

    const row = await prisma.event.update({

      where: { id: eventId },

      data: updates,

      include: { stream: true },

    });

    return mapEvent(row);

  } catch (error) {

    if (error instanceof Error && error.message === "Not authorized") throw error;

    const event = demoStore.updateEventPublicInfo(user, eventId, updates);

    if (!event) throw new Error("Not authorized");

    return event;

  }

}



/** Returns events with publicly visible statuses: Published, Registration Closed, Ongoing, Finished. */

export async function getPublicEvents(): Promise<Event[]> {

  try {

    const rows = await prisma.event.findMany({

      where: { status: { in: [...PUBLIC_EVENT_STATUSES] } },

      include: { stream: true },

      orderBy: { createdAt: "desc" },

    });

    return rows.map(mapEvent);

  } catch {

    return demoStore.getPublicEvents();

  }

}



/**

 * Returns events with status "Published" only, ordered by start date ascending.

 * Used for the captain sign-up event picker — "Ongoing" events are excluded so

 * captains cannot register once matches have started.

 */

export async function getPublishedEvents(): Promise<Event[]> {

  const rows = await prisma.event.findMany({

    where: { status: "Published" },

    include: { stream: true },

    orderBy: { startsAt: "asc" },

  });

  return rows.map(mapEvent);

}

export async function getOpenRegistrationEventsForCaptain(captainId: string): Promise<Array<Event & { registeredTeams: number }>> {

  if (!captainId) return [];



  const rows = await prisma.event.findMany({

    where: { status: "Published" },

    include: { stream: true },

    orderBy: { startsAt: "asc" },

  });

  const events = rows.map(mapEvent);

  const eventIds = events.map((event) => event.id);

  if (!eventIds.length) return [];



  const [captainTeams, teamCountRows, lockedEntries] = await Promise.all([

    prisma.team.findMany({

      where: { captainId, eventId: { in: eventIds } },

      select: { eventId: true },

    }),

    prisma.team.groupBy({

      by: ["eventId"],

      where: { eventId: { in: eventIds } },

      _count: { _all: true },

    }),

    Promise.all(events.map(async (event) => {

      if (event.format !== "Single Elimination") return [event.id, false] as const;

      const completedMatches = await prisma.match.count({ where: { eventId: event.id, status: "Completed" } });

      return [event.id, completedMatches > 0] as const;

    })),

  ]);



  const joinedEventIds = new Set(captainTeams.map((team) => team.eventId));

  const teamCounts = new Map(teamCountRows.map((row) => [row.eventId, row._count._all]));

  const lockedEventIds = new Set(lockedEntries.filter(([, locked]) => locked).map(([eventId]) => eventId));



  return events

    .map((event) => ({ ...event, registeredTeams: teamCounts.get(event.id) ?? 0 }))

    .filter((event) => !joinedEventIds.has(event.id))

    .filter((event) => event.registeredTeams < event.participantCap)

    .filter((event) => !lockedEventIds.has(event.id));

}



/** Direct DB lookup by slug with no status filter. For admin pages that need to see Draft events. */

export async function getEventBySlug(slug: string): Promise<Event | null> {

  try {

    const row = await prisma.event.findUnique({ where: { slug }, include: { stream: true } });

    return row ? mapEvent(row) : null;

  } catch {

    return demoStore.getEventBySlug(slug) ?? null;

  }

}



/**

 * Cached (60s, tag "events") public event lookup by slug.

 * Returns null for Draft events. Also memoised per-request via React cache.

 */

export const getPublicEventBySlug = cache(

  unstable_cache(

    async (slug: string): Promise<Event | null> => {

      try {

        const row = await prisma.event.findFirst({

          where: { slug, status: { in: [...PUBLIC_EVENT_STATUSES] } },

          include: { stream: true },

        });

        return row ? mapEvent(row) : null;

      } catch {

        return demoStore.getPublicEventBySlug(slug) ?? null;

      }

    },

    ["public-event-by-slug"],

    { revalidate: 60, tags: ["events"] },

  ),

);



// ── Teams ─────────────────────────────────────────────────────────────────────



/**

 * Cached (30s, tag "teams") team list for an event, ordered by registration time.

 * Cache is busted by `revalidateTag("teams")` after any team mutation.

 * Also memoised per-request via React cache to prevent duplicate DB hits within a render.

 */

export const getTeamsForEvent = cache(

  unstable_cache(

    async (eventId: string): Promise<Team[]> => {

      try {

        const rows = await prisma.team.findMany({ where: { eventId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { captain: { select: { id: true, name: true } } } });

        return rows.map(mapTeam);

      } catch {

        return demoStore.getTeamsForEvent(eventId);

      }

    },

    ["teams-for-event"],

    { revalidate: 30, tags: ["teams"] },

  ),

);



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



/** Returns all teams registered by a specific captain across all events. Returns empty array for undefined userId. */

export async function getCaptainTeams(userId: string | undefined): Promise<Team[]> {

  if (!userId) return [];

  const rows = await prisma.team.findMany({ where: { captainId: userId }, include: { captain: { select: { id: true, name: true } } } });

  return rows.map(mapTeam);

}



export async function updateTeamLogo(user: AppUser, teamId: string, logoUrl: string): Promise<Team> {

  try {

    await assertUserCanManageTeam(user, teamId);

    const row = await prisma.team.update({

      where: { id: teamId },

      data: { logoUrl },

    });

    return mapTeam(row);

  } catch (error) {

    if (error instanceof Error && error.message === "Not authorized") throw error;

    const team = demoStore.updateTeamLogo(user, teamId, logoUrl);

    if (!team) throw new Error("Not authorized");

    return team;

  }

}



export async function updateCaptainTeamLogo(captainId: string, teamId: string, logoUrl: string): Promise<Team> {

  try {

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

  } catch (error) {

    if (error instanceof Error && error.message === "Not authorized") throw error;

    const team = demoStore.updateCaptainTeamLogo(captainId, teamId, logoUrl);

    if (!team) throw new Error("Not authorized");

    return team;

  }

}



// ── Players ───────────────────────────────────────────────────────────────────



/** Returns all players for a single team, ordered by registration time. */

export async function getPlayersForTeam(teamId: string): Promise<Player[]> {

  try {

    const rows = await prisma.player.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });

    return rows.map(mapPlayer);

  } catch {

    return demoStore.getPlayersForTeam(teamId);

  }

}



/** Batch-fetches players for multiple teams in a single query, ordered by team then jersey number. */

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



/** Returns all players across all teams registered in a given event. */

export async function getPlayersForEvent(eventId: string): Promise<Player[]> {

  try {

    const rows = await prisma.player.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });

    return rows.map(mapPlayer);

  } catch {

    return demoStore.getPlayersForEvent(eventId);

  }

}



// ── Matches ───────────────────────────────────────────────────────────────────



/**

 * Cached (30s, tag "teams") match list for an event. Busted alongside teams so bracket

 * projection always reflects fresh results after any match mutation.

 * Also memoised per-request via React cache.

 */

export const getMatchesForEvent = cache(

  unstable_cache(

    async (eventId: string): Promise<Match[]> => {

      try {

        const rows = await prisma.match.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });

        return rows.map(mapMatch);

      } catch {

        return demoStore.getMatchesForEvent(eventId);

      }

    },

    ["matches-for-event"],

    { revalidate: 30, tags: ["teams"] },

  ),

);



/**

 * Returns true if a single-elimination bracket has at least one completed match.

 * A locked bracket prevents new team imports and registrations.

 * Always returns false for league-format events.

 */

export async function isEventBracketLocked(eventId: string): Promise<boolean> {

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { format: true } });

  if (!event || event.format !== "Single Elimination") return false;

  const completed = await prisma.match.count({ where: { eventId, status: "Completed" } });

  return completed > 0;

}



// ── Bracket helpers (copied from demo-store, now async) ───────────────────────



function getBracketRoundLabel(round: number, totalRounds: number) {

  const roundsRemaining = totalRounds - round + 1;

  if (roundsRemaining === 1) return "Final";

  if (roundsRemaining === 2) return "Semifinal";

  if (roundsRemaining === 3) return "Quarterfinal";

  if (roundsRemaining === 4) return "Round of 16";

  return `Round ${round}`;

}



function matchesProjectedPairing(

  match: Pick<Match, "homeTeamId" | "awayTeamId">,

  projected: Pick<BracketMatch, "homeTeamId" | "awayTeamId">,

) {

  return match.homeTeamId === projected.homeTeamId && match.awayTeamId === projected.awayTeamId;

}



async function getProjectedBracketMatches(event: Event): Promise<Match[]> {

  const teams = await getTeamsForEvent(event.id);

  const existingMatches = await getMatchesForEvent(event.id);

  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));

  const bracket = projectSingleEliminationBracket({

    teams: teamSeeds,

    slotCount: getBracketSlotCount(teams.length),

    results: existingMatches,

    eventId: event.id,

  }) as BracketMatch[];

  const existingBySlot = new Map(

    existingMatches

      .filter((m) => m.round != null && m.slot != null)

      .map((m) => [`${m.round}:${m.slot}`, m]),

  );

  const totalRounds = Math.max(...bracket.map((match) => match.round), 1);



  return bracket

    .filter((match) => Boolean(match.homeTeamId && match.awayTeamId))

    .map((match) => {

      const existing = match.round != null && match.slot != null

        ? existingBySlot.get(`${match.round}:${match.slot}`)

        : undefined;

      const aligned = existing ?? null;

      return {

        id: match.id, eventId: event.id,

        roundLabel: getBracketRoundLabel(match.round, totalRounds),

        homeTeamId: match.homeTeamId!, awayTeamId: match.awayTeamId!,

        homeScore: aligned?.homeScore ?? 0, awayScore: aligned?.awayScore ?? 0,

        status: aligned?.status ?? "Scheduled",

        round: match.round, slot: match.slot,

        winnerTeamId: aligned?.winnerTeamId ?? null,

      } satisfies Match;

    })

    .sort((l, r) => (l.round! - r.round!) || (l.slot! - r.slot!));

}



/**

 * Returns the admin-facing list of bracket matches for an event object.

 * For single-elimination: projects the bracket and merges recorded results.

 * For league: returns stored matches with round/slot set.

 */

export async function getBracketManageableMatchesForEvent(event: Event): Promise<Match[]> {

  if (event.format === "Single Elimination") {

    return getProjectedBracketMatches(event);

  }

  const rows = await prisma.match.findMany({

    where: { eventId: event.id, round: { not: null }, slot: { not: null } },

    orderBy: [{ round: "asc" }, { slot: "asc" }],

  });

  return rows.map(mapMatch);

}



/** Same as `getBracketManageableMatchesForEvent` but accepts an eventId string, fetching the event internally. */

export async function getBracketManageableMatches(eventId: string): Promise<Match[]> {

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, format: true, participantCap: true, slug: true, name: true, description: true, gameId: true, gameModeId: true, status: true, registrationWindow: true, startsAt: true, venue: true, logoUrl: true, gameImageUrl: true } });

  if (!event) return [];



  const fullEvent = mapEvent({ ...event, stream: null });



  if (event.format === "Single Elimination") {

    return getProjectedBracketMatches(fullEvent);

  }



  const rows = await prisma.match.findMany({

    where: { eventId, round: { not: null }, slot: { not: null } },

    orderBy: [{ round: "asc" }, { slot: "asc" }],

  });

  return rows.map(mapMatch);

}



/**

 * Saves a BO1 match result (direct scores). Draws are rejected for single-elimination.

 * If the match row doesn't exist yet, it is created from the projected bracket.

 * Returns null if the event or match is not found.

 */

export async function setMatchResult(input: {

  eventId: string;

  matchId: string;

  homeScore: number;

  awayScore: number;

}): Promise<Match | null> {

  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { format: true } });

  if (!event) return null;



  if (event.format === "Single Elimination" && input.homeScore === input.awayScore) {

    throw new Error("Single elimination matches cannot end in a draw.");

  }



  const existingRow = await prisma.match.findFirst({

    where: { id: input.matchId, eventId: input.eventId },

  });



  let homeTeamId: string;

  let awayTeamId: string;

  let roundLabel: string;

  let round: number | null = null;

  let slot: number | null = null;



  if (existingRow) {

    homeTeamId = existingRow.homeTeamId;

    awayTeamId = existingRow.awayTeamId;

    roundLabel = existingRow.roundLabel;

    round = existingRow.round;

    slot = existingRow.slot;

  } else if (event.format === "Single Elimination") {

    const fullEvent = await prisma.event.findUnique({ where: { id: input.eventId } });

    if (!fullEvent) return null;

    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }));

    const projMatch = projected.find((m) => m.id === input.matchId);

    if (!projMatch) return null;

    homeTeamId = projMatch.homeTeamId;

    awayTeamId = projMatch.awayTeamId;

    roundLabel = projMatch.roundLabel;

    round = projMatch.round ?? null;

    slot = projMatch.slot ?? null;

  } else {

    return null;

  }



  const winnerTeamId = input.homeScore > input.awayScore ? homeTeamId : awayTeamId;



  const row = await prisma.match.upsert({

    where: { id: input.matchId },

    update: { homeScore: input.homeScore, awayScore: input.awayScore, status: "Completed", winnerTeamId },

    create: {

      id: input.matchId, eventId: input.eventId, roundLabel, homeTeamId, awayTeamId,

      homeScore: input.homeScore, awayScore: input.awayScore,

      status: "Completed", round, slot, winnerTeamId,

    },

  });



  return mapMatch(row);

}



// ── Leaderboard / standings ───────────────────────────────────────────────────



const _getLeaderboardForEvent = unstable_cache(

  async (eventId: string, gameId: string) => {

    const game = findGameConfig(gameId);

    if (!game) return [];



    const metric = getGamePrimaryStatKey(game.id);

    let playerIds: string[];

    try {

      playerIds = (await prisma.player.findMany({ where: { eventId }, select: { id: true } })).map((p) => p.id);

    } catch {

      return demoStore.getLeaderboardForEvent(eventId);

    }



    let stats;

    try {

      stats = await prisma.playerStat.findMany({

        where: { gameSlug: game.slug, playerId: { in: playerIds } },

      });

    } catch {

      return demoStore.getLeaderboardForEvent(eventId);

    }



    const statInputs: PlayerMatchStatInput[] = stats.map((s) => ({

      matchId: s.matchId,

      playerId: s.playerId,

      playerName: s.playerName,

      teamId: s.teamId,

      position: s.position,

      gameSlug: s.gameSlug,

      stats: s.stats as Record<string, number>,

    }));



    return aggregatePlayerLeaderboard(statInputs, metric);

  },

  ["leaderboard-for-event"],

  { revalidate: 60, tags: ["stats"] },

);



/**

 * Returns the player leaderboard for an event, aggregated from approved stat submissions.

 * Cached (60s, tag "stats"). Primary metric is "goals" for Flashpeak, "points" for others.

 */

export async function getLeaderboardForEvent(eventId: string, gameId?: string) {

  try {

    const resolvedGameId = gameId ?? (await prisma.event.findUnique({ where: { id: eventId }, select: { gameId: true } }))?.gameId;

    if (!resolvedGameId) return [];

    return _getLeaderboardForEvent(eventId, resolvedGameId);

  } catch {

    return demoStore.getLeaderboardForEvent(eventId);

  }

}



/** Computes league standings from completed match results for an event. Ranked by points → score diff → score for. */

export async function getTeamStandings(eventId: string) {

  const teams = await getTeamsForEvent(eventId);

  const matches = await getMatchesForEvent(eventId);

  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));

  const results: MatchResultInput[] = matches

    .filter((match) => match.status === "Completed")

    .map((match) => ({

      id: match.id,

      homeTeamId: match.homeTeamId,

      awayTeamId: match.awayTeamId,

      homeScore: match.homeScore,

      awayScore: match.awayScore,

    }));



  return buildLeagueStandings(teamSeeds, results);

}



// ── Bracket preview ───────────────────────────────────────────────────────────



/**

 * Returns the fully projected bracket (all rounds, including downstream TBD slots).

 * For single-elimination: uses `projectSingleEliminationBracket` with all results applied.

 * For league: returns the round-robin schedule. Used internally and in the admin bracket view.

 */

export async function getBracketPreview(eventId: string) {

  let event;

  try {

    event = await prisma.event.findUnique({ where: { id: eventId } });

  } catch {

    return demoStore.getBracketPreview(eventId);

  }

  if (!event) return [];



  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);

  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));



  if (event.format === "Single Elimination") {

    return projectSingleEliminationBracket({

      teams: teamSeeds,

      slotCount: getBracketSlotCount(teams.length),

      results: matches,

      eventId,

    });

  }



  return generateRoundRobinSchedule(teamSeeds);

}



/**

 * Returns the public-visible bracket. Before kickoff (Published/Registration Closed),

 * hides downstream rounds until both teams are known. After kickoff (Ongoing/Finished),

 * shows the full projected bracket including TBD placeholders for undecided rounds.

 */

export async function getPublicVisibleBracketPreview(eventId: string) {

  let event;

  try {

    event = await prisma.event.findUnique({ where: { id: eventId } });

  } catch {

    return demoStore.getPublicVisibleBracketPreview(eventId);

  }

  if (!event || event.format !== "Single Elimination") return getBracketPreview(eventId);



  const [teams, matches] = await Promise.all([getTeamsForEvent(eventId), getMatchesForEvent(eventId)]);

  const teamSeeds = teams.map((team) => ({ id: team.id, name: team.name }));

  const slotCount = getBracketSlotCount(teams.length);



  // Once the event is live (or finished), the bracket is locked in — show the

  // fully projected bracket so every round's cards render (including TBD

  // placeholders for rounds that haven't been decided yet), instead of the

  // "only reveal what's already determined" view used before kickoff.

  if (event.status === "Ongoing" || event.status === "Finished") {

    return projectSingleEliminationBracket({

      teams: teamSeeds,

      slotCount,

      results: matches,

      eventId,

    });

  }



  return getPublicVisibleSingleEliminationBracket({

    teams: teamSeeds,

    slotCount,

    results: matches,

    eventId,

  });

}



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



/** Updates the captain's password hash and clears the `tempPassword` field in one write. */

export async function updateCaptainPassword(userId: string, newHash: string): Promise<void> {

  await prisma.user.update({

    where: { id: userId },

    data: { passwordHash: newHash, tempPassword: null },

  });

}



// ── Import snapshot ───────────────────────────────────────────────────────────



/**

 * Returns a lightweight snapshot of events and registered teams used by CSV import validation.

 * Includes `bracketLocked` flag so the validator can reject imports into locked events.

 */

export async function getImportSnapshot(user?: AppUser) {

  const eventWhere = user?.role === "organizer" ? { organizerUserId: user.id } : undefined;

  const events = await prisma.event.findMany({

    where: eventWhere,

    select: { id: true, slug: true, participantCap: true },

  });

  const eventIds = events.map((event) => event.id);

  const teams = await prisma.team.findMany({

    where: eventWhere ? { eventId: { in: eventIds } } : { eventId: { not: null } },

    select: { eventId: true, name: true, tag: true },

  });



  const lockedSet = new Set<string>();

  await Promise.all(

    events.map(async (event) => {

      const locked = await isEventBracketLocked(event.id);

      if (locked) lockedSet.add(event.id);

    }),

  );



  return {

    events: events.map((event) => ({

      id: event.id,

      slug: event.slug,

      participantCap: event.participantCap,

      bracketLocked: lockedSet.has(event.id),

    })),

    teams: teams

      .filter((team): team is typeof team & { eventId: string } => Boolean(team.eventId))

      .map((team) => ({ eventId: team.eventId, name: team.name, tag: team.tag })),

  };

}



/** Returns teams created via CSV import. Organizers only see teams from their own events. */

export async function getImportedTeams(user?: AppUser): Promise<Team[]> {

  const rows = await prisma.team.findMany({

    where: {

      source: { in: ["csv-import", "registration-intake"] },

      ...(user?.role === "organizer" ? { event: { organizerUserId: user.id } } : {}),

    },

    include: { captain: { select: { id: true, name: true } } },

  });

  return rows.map(mapTeam);

}



/**

 * Returns captain credentials (email + temp password) for all CSV-imported teams in an event.

 * Used by the admin panel to distribute login details to captains after import.

 */

export async function getCaptainCredentialsForEvent(eventId: string) {

  const teams = await prisma.team.findMany({

    where: { eventId, source: { in: ["csv-import", "registration-intake"] } },

    orderBy: { createdAt: "asc" },

    include: { captain: { select: { id: true, name: true } } },

  });

  const captainIds = teams.map((t) => t.captainId).filter(Boolean) as string[];

  const users = captainIds.length

    ? await prisma.user.findMany({ where: { id: { in: captainIds } } })

    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));



  return teams.map((team) => {

    const user = team.captainId ? userMap.get(team.captainId) : null;

    return {

      teamName: team.name,

      teamTag: team.tag,

      captainName: team.captainName ?? "",

      captainContact: team.captainContact ?? "",

      email: user?.email ?? "",

      tempPassword: user?.tempPassword ?? "",

    };

  });

}



// ── Mutations ─────────────────────────────────────────────────────────────────



/**

 * Creates a new event in "Draft" status. Game ID is resolved from the gameModeId.

 * Default description, venue ("Online"), and dates ("TBD") are set automatically.

 */

export async function createEvent(input: {

  name: string;

  slug: string;

  gameModeId: string;

  format: Event["format"];

  participantCap: Event["participantCap"];

  organizerUserId?: string;

  organizerName?: string;

  organizerVerified?: boolean;

}): Promise<Event> {

  const gameId = getGameIdForMode(input.gameModeId);

  const row = await prisma.event.create({

    data: {

      slug: input.slug,

      name: input.name,

      description: "New event created from admin panel.",

      gameId,

      gameModeId: input.gameModeId,

      format: input.format,

      status: "Draft",

      participantCap: input.participantCap,

      registrationWindow: "TBD",

      startsAt: "TBD",

      venue: "Online",

      organizerUserId: input.organizerUserId,

      organizerName: input.organizerName,

      organizerVerified: input.organizerVerified ?? false,

    },

    include: { stream: true },

  });

  return mapEvent(row);

}



/** Updates an event's lifecycle status. Use `autoTransitionEventToOngoing` for the match-triggered transition. */

export async function setEventStatus(eventId: string, status: Event["status"]): Promise<Event | null> {

  const row = await prisma.event.update({ where: { id: eventId }, data: { status }, include: { stream: true } });

  return mapEvent(row);

}



/**

 * Idempotently transitions an event from "Published" or "Registration Closed" to "Ongoing".

 * No-op if the event is already "Ongoing" or "Finished". Safe to call on every match save.

 */

export async function autoTransitionEventToOngoing(eventId: string): Promise<void> {

  await prisma.event.updateMany({

    where: { id: eventId, status: { in: ["Published", "Registration Closed"] } },

    data: { status: "Ongoing" },

  });

}



/** Registers one team for an existing captain while the event is still open. */

export async function registerTeam(input: {

  eventId: string;

  captainId: string;

  name?: string;

  tag?: string;

  draftTeamId?: string;

}): Promise<Team> {

  const event = await prisma.event.findUnique({

    where: { id: input.eventId },

    select: { id: true, slug: true, status: true, participantCap: true, format: true },

  });

  if (!event || event.status !== "Published") {

    throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");

  }



  let name = input.name?.trim() ?? "";

  let tag = input.tag?.trim().toUpperCase() ?? "";

  let draftPlayers: Array<{ displayName: string; nickname: string; position: string; jerseyNumber: number | null }> = [];



  if (input.draftTeamId) {

    const draftTeam = await prisma.team.findFirst({

      where: { id: input.draftTeamId, captainId: input.captainId, eventId: null, source: "draft" },

      include: { players: { orderBy: { createdAt: "asc" } } },

    });

    if (!draftTeam) {

      throw new Error("Draft tim tidak ditemukan untuk akun ini.");

    }



    name = draftTeam.name.trim();

    tag = draftTeam.tag.trim().toUpperCase();

    draftPlayers = draftTeam.players.map((player) => ({

      displayName: player.displayName.trim(),

      nickname: player.nickname.trim(),

      position: player.position?.trim() ?? "",

      jerseyNumber: player.jerseyNumber ?? null,

    }));



    const hasInvalidRoster = draftPlayers.some((player) => player.displayName.length < 2 || player.nickname.length < 2);

    if (draftPlayers.length === 0 || hasInvalidRoster) {

      throw new Error("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");

    }

  }



  if (name.length < 2) {

    throw new Error("Nama tim minimal 2 karakter.");

  }

  if (tag.length < 2 || tag.length > 5) {

    throw new Error("Tag tim harus 2-5 karakter.");

  }



  const [registeredTeams, existingCaptainTeam, completedMatches] = await Promise.all([

    prisma.team.count({ where: { eventId: input.eventId } }),

    prisma.team.findFirst({

      where: { eventId: input.eventId, captainId: input.captainId },

      select: { id: true },

    }),

    event.format === "Single Elimination"

      ? prisma.match.count({ where: { eventId: input.eventId, status: "Completed" } })

      : Promise.resolve(0),

  ]);



  if (registeredTeams >= event.participantCap) {

    throw new Error("Slot pendaftaran event ini sudah penuh.");

  }

  if (existingCaptainTeam) {

    throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");

  }

  if (completedMatches > 0) {

    throw new Error(`Event "${event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);

  }



  try {

    if (draftPlayers.length > 0) {

      return prisma.$transaction(async (tx) => {

        const row = await tx.team.create({

          data: {

            eventId: input.eventId,

            captainId: input.captainId,

            name,

            logoText: tag.slice(0, 2),

            tag,

            source: "registration",

          },

        });

        await tx.player.createMany({

          data: draftPlayers.map((player) => ({

            teamId: row.id,

            eventId: input.eventId,

            displayName: player.displayName,

            nickname: player.nickname,

            position: player.position,

            jerseyNumber: player.jerseyNumber,

          })),

        });

        return mapTeam(row);

      });

    }



    const row = await prisma.team.create({

      data: {

        eventId: input.eventId,

        captainId: input.captainId,

        name,

        logoText: tag.slice(0, 2),

        tag,

        source: "registration",

      },

    });

    return mapTeam(row);

  } catch (error) {

    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : "";

    const message = error instanceof Error ? error.message : "";

    if (code === "P2002" || message.includes("Unique constraint")) {

      throw new Error("Tag atau nama tim sudah digunakan di event ini.");

    }

    throw error;

  }

}



/** Creates or updates the captain's reusable draft team outside any event. */

export async function createOrUpdateCaptainDraftTeam(input: {

  captainId: string;

  captainName: string;

  name: string;

  tag: string;

}): Promise<Team> {

  const tag = input.tag.trim().toUpperCase();

  const existing = await prisma.team.findFirst({

    where: { captainId: input.captainId, eventId: null, source: "draft" },

    select: { id: true },

  });



  const data = {

    eventId: null,

    captainId: input.captainId,

    captainName: input.captainName,

    name: input.name.trim(),

    logoText: tag.slice(0, 2),

    tag,

    source: "draft",

  };



  const row = existing

    ? await prisma.team.update({ where: { id: existing.id }, data })

    : await prisma.team.create({ data });



  return mapTeam(row);

}



/**

 * Bulk-imports teams from a validated CSV row list. For each team, generates a captain User

 * (upserted by email) with a temp password, then creates the Team row.

 * Bcrypt hashing runs outside the DB transaction to avoid holding a connection during slow crypto.

 * Throws if any target event's bracket is already locked.

 */

export async function importTeams(input: Array<{

  eventId: string;

  teamName: string;

  teamTag: string;

  captainName: string;

  captainContact: string;

  captainEmail?: string;

}>): Promise<Team[]> {

  const eventIds = [...new Set(input.map((row) => row.eventId))];

  await Promise.all(

    eventIds.map(async (eventId) => {

      const locked = await isEventBracketLocked(eventId);

      if (locked) {

        const event = await prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });

        throw new Error(

          `Event "${event?.slug}" already has recorded match results, so additional teams cannot be imported.`,

        );

      }

    }),

  );



  // Phase 1: pre-generate credentials outside the transaction (bcrypt is slow)

  const usedEmails = new Set<string>();

  const preparedRows = await Promise.all(

    input.map(async (row) => {

      const email = generateCaptainEmail(row.teamTag, usedEmails, row.captainEmail);

      const tempPassword = generateTempPassword();

      const passwordHash = await bcrypt.hash(tempPassword, 10);

      return { ...row, email, tempPassword, passwordHash };

    }),

  );



  // Phase 2: upsert Users then create Teams — sequential non-transactional calls

  // avoid interactive $transaction which requires a persistent connection (breaks on Neon PgBouncer)

  const captainIds: Array<{ id: string; prep: (typeof preparedRows)[number] }> = [];

  for (const prep of preparedRows) {

    const captain = await prisma.user.upsert({

      where: { email: prep.email },

      update: { name: prep.captainName, passwordHash: prep.passwordHash, tempPassword: prep.tempPassword },

      create: {

        email: prep.email,

        name: prep.captainName,

        role: "captain",

        passwordHash: prep.passwordHash,

        tempPassword: prep.tempPassword,

      },

    });

    captainIds.push({ id: captain.id, prep });

  }



  const rows = await prisma.$transaction(

    captainIds.map(({ id, prep }) =>

      prisma.team.create({

        data: {

          eventId: prep.eventId,

          captainId: id,

          name: prep.teamName,

          logoText: prep.teamTag.slice(0, 2).toUpperCase(),

          tag: prep.teamTag.toUpperCase(),

          captainName: prep.captainName,

          captainContact: prep.captainContact,

          source: "csv-import",

        },

      }),

    ),

  );



  return rows.map(mapTeam);

}



export async function saveRegistrationImportPreviewBatch(input: {

  user: AppUser;

  eventId: string;

  sourceKind: RegistrationSourceKind;

  sourceLabel: string;

  worksheetName?: string;

  headerSignature: string;

  mapping: Prisma.InputJsonValue;

  items: RegistrationPreviewItem[];

  summary: Prisma.InputJsonValue;

}) {

  await assertUserCanManageEvent(input.user, input.eventId);



  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const profile = await prisma.registrationImportProfile.create({

    data: {

      eventId: input.eventId,

      createdById: input.user.id,

      sourceKind: input.sourceKind,

      sourceLabel: input.sourceLabel,

      worksheetName: input.worksheetName,

      headerSignature: input.headerSignature,

      mapping: input.mapping,

    },

  });



  return prisma.registrationImportBatch.create({

    data: {

      eventId: input.eventId,

      profileId: profile.id,

      createdById: input.user.id,

      sourceKind: input.sourceKind,

      sourceLabel: input.sourceLabel,

      worksheetName: input.worksheetName,

      status: "draft",

      summary: input.summary,

      expiresAt,

      items: {

        create: input.items.map((item) => ({

          sourceRow: item.sourceRow,

          status: item.status,

          selected: item.selected,

          normalizedData: item.normalized as Prisma.InputJsonValue | undefined,

          diff: item.diff as Prisma.InputJsonValue | undefined,

          validationErrors: item.errors as Prisma.InputJsonValue | undefined,

          teamId: item.existingTeamId,

        })),

      },

    },

    include: { items: true },

  });

}



export async function getRegistrationImportBatchesForEvent(user: AppUser, eventId: string) {

  await assertUserCanManageEvent(user, eventId);

  return prisma.registrationImportBatch.findMany({

    where: { eventId },

    orderBy: { createdAt: "desc" },

    take: 8,

    include: { items: { select: { id: true, status: true } } },

  });

}



export async function getRegistrationImportBatchForAdmin(user: AppUser, batchId: string) {

  const batch = await prisma.registrationImportBatch.findFirst({

    where: { id: batchId },

    include: {

      items: { orderBy: { sourceRow: "asc" } },

    },

  });

  if (!batch) return null;

  await assertUserCanManageEvent(user, batch.eventId);

  return batch;

}



export async function commitRegistrationImportBatch(

  user: AppUser,

  batchId: string,

  selectedItemIds: string[],

): Promise<{

  importedCount: number;

  credentials: Array<{

    teamName: string;

    teamTag: string;

    captainName: string;

    captainContact: string;

    email: string;

    tempPassword: string;

  }>;

}> {

  const batch = await prisma.registrationImportBatch.findFirst({

    where: { id: batchId },

    include: {

      event: { select: { id: true, slug: true, format: true } },

      items: {

        where: {

          id: { in: selectedItemIds },

          status: { in: ["new", "changed"] },

        },

      },

    },

  });



  if (!batch) throw new Error("Batch import registrasi tidak ditemukan.");

  await assertUserCanManageEvent(user, batch.eventId);



  const locked = await isEventBracketLocked(batch.eventId);

  if (locked) {

    throw new Error(`Event "${batch.event.slug}" already has recorded match results, so registration import cannot be committed.`);

  }



  const usedEmails = new Set<string>();

  const prepared = await Promise.all(

    batch.items.map(async (item) => {

      const normalized = item.normalizedData as RegistrationNormalizedTeam | null;

      if (!normalized) throw new Error("Item import tidak memiliki data normalisasi.");



      const explicitEmail = normalized.captainEmail?.trim().toLowerCase();

      const email = explicitEmail || generateSyntheticRegistrationEmail(batch.event.slug, normalized.teamTag, usedEmails);

      if (explicitEmail) usedEmails.add(explicitEmail);



      const existingUser = await prisma.user.findUnique({

        where: { email },

        select: { id: true, email: true, role: true, name: true },

      });

      if (existingUser && existingUser.role !== "captain") {

        throw new Error("Email kapten sudah dipakai akun non-captain.");

      }

      if (existingUser) {

        return { item, normalized, captainId: existingUser.id, email, tempPassword: null };

      }



      const tempPassword = generateTempPassword();

      const passwordHash = await bcrypt.hash(tempPassword, 10);

      return { item, normalized, captainId: null, email, tempPassword, passwordHash };

    }),

  );



  const credentials: Array<{

    teamName: string;

    teamTag: string;

    captainName: string;

    captainContact: string;

    email: string;

    tempPassword: string;

  }> = [];



  await prisma.$transaction(async (tx) => {

    for (const row of prepared) {

      let captainId = row.captainId;

      if (!captainId) {

        const captain = await tx.user.create({

          data: {

            email: row.email,

            name: row.normalized.captainName,

            role: "captain",

            passwordHash: row.passwordHash!,

            tempPassword: row.tempPassword,

          },

        });

        captainId = captain.id;

        credentials.push({

          teamName: row.normalized.teamName,

          teamTag: row.normalized.teamTag,

          captainName: row.normalized.captainName,

          captainContact: row.normalized.captainContact,

          email: row.email,

          tempPassword: row.tempPassword!,

        });

      }



      let teamId = row.item.teamId ?? "";

      const teamData = {

        eventId: batch.eventId,

        captainId,

        name: row.normalized.teamName,

        logoText: row.normalized.teamTag.slice(0, 2).toUpperCase(),

        tag: row.normalized.teamTag.toUpperCase(),

        captainName: row.normalized.captainName,

        captainContact: row.normalized.captainContact,

        source: "registration-intake",

      };



      if (row.item.status === "changed" && row.item.teamId) {

        const updated = await tx.team.update({

          where: { id: row.item.teamId },

          data: teamData,

        });

        teamId = updated.id;

        await tx.player.deleteMany({ where: { teamId } });

      } else {

        const created = await tx.team.create({ data: teamData });

        teamId = created.id;

      }



      if (row.normalized.players.length > 0) {

        await tx.player.createMany({

          data: row.normalized.players.map((player) => ({

            teamId,

            eventId: batch.eventId,

            displayName: player.displayName,

            nickname: player.nickname,

            position: player.position,

          })),

        });

      }



      await tx.registrationImportItem.update({

        where: { id: row.item.id },

        data: {

          selected: true,

          status: "imported",

          teamId,

          committedAt: new Date(),

        },

      });

    }



    await tx.registrationImportBatch.update({

      where: { id: batch.id },

      data: {

        status: "committed",

        committedAt: new Date(),

      },

    });

  }, { maxWait: 10_000, timeout: 60_000 });



  return { importedCount: prepared.length, credentials };

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

  const team = await prisma.team.findFirst({

    where: { id: input.teamId, ...(input.captainId ? { captainId: input.captainId } : {}) },

    select: { eventId: true },

  });

  if (!team) {

    throw new Error("Tim tidak ditemukan untuk akun ini.");

  }

  if (input.eventId && team.eventId && input.eventId !== team.eventId) {

    throw new Error("Data event pemain tidak cocok dengan tim.");

  }



  const eventId = input.eventId ?? team.eventId ?? undefined;

  const data = {

    teamId: input.teamId,

    ...(eventId ? { eventId } : {}),

    displayName: input.displayName.trim(),

    nickname: input.nickname.trim(),

    position: input.position?.trim() ?? "",

    ...(input.jerseyNumber != null ? { jerseyNumber: input.jerseyNumber } : {}),

  };



  try {

    const row = await prisma.player.create({ data });

    return mapPlayer(row);

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

 */

export async function updatePlayer(

  id: string,

  captainUserId: string,

  data: { displayName?: string; nickname?: string; position?: string; jerseyNumber?: number | null },

): Promise<Player> {

  const player = await prisma.player.findUnique({

    where: { id },

    include: { team: { select: { captainId: true } } },

  });

  if (!player || player.team.captainId !== captainUserId) {

    throw new Error("Not authorized to edit this player.");

  }

  const row = await prisma.player.update({ where: { id }, data });

  return mapPlayer(row);

}



/**

 * Deletes a player. Throws "Not authorized" if the player's team does not belong to `captainUserId`.

 * Ownership check mirrors `updatePlayer`.

 */

export async function deletePlayer(id: string, captainUserId: string): Promise<void> {

  const player = await prisma.player.findUnique({

    where: { id },

    include: { team: { select: { captainId: true } } },

  });

  if (!player || player.team.captainId !== captainUserId) {

    throw new Error("Not authorized to delete this player.");

  }

  await prisma.player.delete({ where: { id } });

}



export async function setTeamCaptainDisplay(teamId: string, captainUserId: string, playerId: string): Promise<void> {

  const player = await prisma.player.findFirst({

    where: { id: playerId, teamId, team: { captainId: captainUserId } },

    select: { displayName: true },

  });

  if (!player) {

    throw new Error("Not authorized to update this team.");

  }

  await prisma.team.update({ where: { id: teamId }, data: { captainName: player.displayName } });

}



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

  submission: {

    id: string;

    status: string;

    rejectionNote: string | null;

    stats: Record<string, Record<string, number>>;

  } | null;

};



/**

 * Returns all completed matches where the captain's teams participated, including stat submission status.

 * Batches event/team/submission lookups in a single `Promise.all` to avoid N+1 queries.

 */

export async function getCompletedMatchesForCaptain(captainId: string): Promise<CompletedMatchRow[]> {

  const captainTeams = await prisma.team.findMany({

    where: { captainId },

    select: { id: true, name: true, eventId: true },

  });

  const registeredCaptainTeams = captainTeams.filter((team): team is typeof team & { eventId: string } => Boolean(team.eventId));

  if (registeredCaptainTeams.length === 0) return [];



  const teamIds = registeredCaptainTeams.map((t) => t.id);

  const eventIds = [...new Set(registeredCaptainTeams.map((t) => t.eventId))];



  const [matches, events, allTeams, submissions] = await Promise.all([

    prisma.match.findMany({

      where: {

        eventId: { in: eventIds },

        status: "Completed",

        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],

      },

      orderBy: [{ round: "asc" }, { slot: "asc" }],

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

        submission: submission

          ? {

              id: submission.id,

              status: submission.status,

              rejectionNote: submission.rejectionNote,

              stats: submission.stats as Record<string, Record<string, number>>,

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



/**

 * Creates or replaces a captain's stat submission for a match.

 * Re-submission resets status to "pending" and clears any prior rejection note.

 */

export async function upsertStatSubmission(input: {

  matchId: string;

  teamId: string;

  eventId: string;

  submittedBy: string;

  stats: Record<string, Record<string, number>>;

}): Promise<void> {

  await prisma.statSubmission.upsert({

    where: { matchId_teamId: { matchId: input.matchId, teamId: input.teamId } },

    update: {

      status: "pending",

      rejectionNote: null,

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

  stats: Record<string, Record<string, number>>;

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

    stats: row.stats as Record<string, Record<string, number>>,

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

 * Players not found in the DB are skipped. Existing rows have their stats JSON replaced (not merged).

 */

async function writePlayerStatsToDb(

  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],

  matchId: string,

  teamId: string,

  gameSlug: string,

  statsMap: Record<string, Record<string, number>>,

  audit?: { source: string; lastUpdatedBy: string },

): Promise<void> {

  for (const [playerId, playerStats] of Object.entries(statsMap)) {

    const player = await tx.player.findUnique({

      where: { id: playerId },

      select: { displayName: true, nickname: true, position: true },

    });

    if (!player) continue;



    await tx.playerStat.upsert({

      where: { matchId_playerId: { matchId, playerId } },

      update: { stats: playerStats as object, ...(audit ? { source: audit.source, lastUpdatedBy: audit.lastUpdatedBy } : {}) },

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



/**

 * Approves a stat submission: writes `PlayerStat` rows for each player and marks the

 * submission as "approved" in a single transaction. Skips players not found in the DB.

 */

export async function approveStatSubmission(submissionId: string, adminId: string): Promise<void> {

  const submission = await prisma.statSubmission.findUnique({ where: { id: submissionId } });

  if (!submission) throw new Error("Submission not found");



  const event = await prisma.event.findUnique({

    where: { id: submission.eventId },

    select: { gameId: true },

  });

  const game = event?.gameId ? getGameConfig(event.gameId) : null;

  const gameSlug = game?.slug ?? "unknown";



  const statsMap = submission.stats as Record<string, Record<string, number>>;



  await prisma.$transaction(async (tx) => {

    await writePlayerStatsToDb(tx, submission.matchId, submission.teamId, gameSlug, statsMap, { source: "captain", lastUpdatedBy: submission.submittedBy });

    await tx.statSubmission.update({

      where: { id: submissionId },

      data: { status: "approved", reviewedAt: new Date(), reviewedBy: adminId },

    });

  });

}



/**

 * Returns a match with its roster (players from both teams) and existing PlayerStat rows.

 * Used by Admin to pre-fill the player statistics editor.

 */

export async function getMatchWithRosterAndStats(matchId: string): Promise<{

  match: { id: string; homeTeamId: string; awayTeamId: string; status: string; eventId: string };

  homePlayers: Player[];

  awayPlayers: Player[];

  existingStats: Record<string, Record<string, number>>;

} | null> {

  const match = await prisma.match.findUnique({

    where: { id: matchId },

    select: { id: true, homeTeamId: true, awayTeamId: true, status: true, eventId: true },

  });

  if (!match || !match.homeTeamId || !match.awayTeamId) return null;



  const [allPlayers, statRows] = await Promise.all([

    getPlayersForTeams([match.homeTeamId, match.awayTeamId]),

    prisma.playerStat.findMany({ where: { matchId } }),

  ]);



  const existingStats: Record<string, Record<string, number>> = {};

  for (const row of statRows) {

    existingStats[row.playerId] = row.stats as Record<string, number>;

  }



  return {

    match,

    homePlayers: allPlayers.filter((p) => p.teamId === match.homeTeamId),

    awayPlayers: allPlayers.filter((p) => p.teamId === match.awayTeamId),

    existingStats,

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

  stats: Record<string, Record<string, number>>;

}): Promise<void> {

  const event = await prisma.event.findUnique({

    where: { id: input.eventId },

    select: { gameId: true },

  });

  const game = event?.gameId ? getGameConfig(event.gameId) : null;

  const gameSlug = game?.slug ?? "unknown";



  // Upserts run without an interactive transaction — each row-level upsert is

  // independently atomic and Neon/PgBouncer doesn't support long-lived interactive

  // transactions (P2028: "Transaction not found / old closed transaction").

  for (const [playerId, playerStats] of Object.entries(input.stats)) {

    const player = await prisma.player.findUnique({

      where: { id: playerId },

      select: { displayName: true, nickname: true, position: true },

    });

    if (!player) continue;



    await prisma.playerStat.upsert({

      where: { matchId_playerId: { matchId: input.matchId, playerId } },

      update: { stats: playerStats as object, source: "admin", lastUpdatedBy: input.adminId },

      create: {

        matchId: input.matchId,

        playerId,

        playerName: player.nickname,

        teamId: input.teamId,

        position: player.position,

        gameSlug,

        stats: playerStats as object,

        source: "admin",

        lastUpdatedBy: input.adminId,

      },

    });

  }

}



/** Rejects a stat submission with a note shown to the captain. Does not delete PlayerStat rows. */

export async function rejectStatSubmission(

  submissionId: string,

  adminId: string,

  note: string,

): Promise<void> {

  await prisma.statSubmission.update({

    where: { id: submissionId },

    data: {

      status: "rejected",

      rejectionNote: note,

      reviewedAt: new Date(),

      reviewedBy: adminId,

    },

  });

}



/**

 * Sets or replaces the live stream URL for an event. Parses the URL to determine platform

 * (YouTube, TikTok, or external) and stores it as enabled + live immediately.

 */

export async function updateEventStream(eventId: string, url: string, label: string): Promise<Event | null> {

  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (!event) return null;



  const stream = getLiveStreamPresentation(url);

  await prisma.eventStream.upsert({

    where: { eventId },

    update: { platform: stream.platform, url, label, enabled: true, isLive: true },

    create: { eventId, platform: stream.platform, url, label, enabled: true, isLive: true },

  });



  const updated = await prisma.event.findUnique({ where: { id: eventId }, include: { stream: true } });

  return updated ? mapEvent(updated) : null;

}



// ── Captain self sign-up ──────────────────────────────────────────────────────



/** Creates a captain User without requiring an active event or team registration. */

export async function createCaptainAccount(input: {

  email: string;

  name: string;

  passwordHash: string;

}): Promise<{ userId: string }> {

  const user = await prisma.user.create({

    data: {

      email: input.email,

      name: input.name,

      role: "captain",

      passwordHash: input.passwordHash,

    },

  });

  return { userId: user.id };

}



/**

 * Legacy helper retained for imports/tests that still need one atomic account + event team create.

 * The public self sign-up flow now uses createCaptainAccount instead.

 */

export async function createCaptainWithTeam(input: {

  email: string;

  name: string;

  passwordHash: string;

  eventId: string;

  teamName: string;

  teamTag: string;

}): Promise<{ userId: string; teamId: string }> {

  const tag = input.teamTag.toUpperCase();

  return prisma.$transaction(async (tx) => {

    const user = await tx.user.create({

      data: {

        email: input.email,

        name: input.name,

        role: "captain",

        passwordHash: input.passwordHash,

      },

    });

    const team = await tx.team.create({

      data: {

        eventId: input.eventId,

        captainId: user.id,

        name: input.teamName,

        tag,

        logoText: tag,

        source: "registration",

      },

    });

    return { userId: user.id, teamId: team.id };

  });

}



// ── Round config (Best of N) ──────────────────────────────────────────────────



/** Returns all Best-of-N round configurations for an event (one per round label). Cached 30s under tag "teams". */

export const getEventRoundConfigs = cache(

  unstable_cache(

    async (eventId: string): Promise<EventRoundConfig[]> => {

      try {

        const rows = await prisma.eventRoundConfig.findMany({ where: { eventId } });

        return rows.map((r) => ({ id: r.id, eventId: r.eventId, roundLabel: r.roundLabel, bestOf: r.bestOf }));

      } catch {

        return [];

      }

    },

    ["event-round-configs"],

    { revalidate: 30, tags: ["teams"] },

  ),

);



/** Creates or updates the Best-of-N setting for a specific round label within an event. */

export async function upsertRoundConfig(eventId: string, roundLabel: string, bestOf: number): Promise<void> {

  await prisma.eventRoundConfig.upsert({

    where: { eventId_roundLabel: { eventId, roundLabel } },

    update: { bestOf },

    create: { eventId, roundLabel, bestOf },

  });

}



// ── Match games (Best of N results) ──────────────────────────────────────────



/** Returns per-game scores for a single match, ordered by game number ascending. */

export async function getMatchGames(matchId: string): Promise<MatchGame[]> {

  const rows = await prisma.matchGame.findMany({ where: { matchId }, orderBy: { gameNumber: "asc" } });

  return rows.map((r) => ({ id: r.id, matchId: r.matchId, gameNumber: r.gameNumber, homeScore: r.homeScore, awayScore: r.awayScore }));

}



const _getMatchGamesForEventCached = cache(

  unstable_cache(

    async (eventId: string): Promise<Array<{ matchId: string; games: MatchGame[] }>> => {

      let rows;

      try {

        rows = await prisma.matchGame.findMany({

          where: { match: { eventId } },

          orderBy: { gameNumber: "asc" },

        });

      } catch {

        return [];

      }

      const acc: Record<string, MatchGame[]> = {};

      for (const row of rows) {

        (acc[row.matchId] ??= []).push({ id: row.id, matchId: row.matchId, gameNumber: row.gameNumber, homeScore: row.homeScore, awayScore: row.awayScore });

      }

      return Object.entries(acc).map(([matchId, games]) => ({ matchId, games }));

    },

    ["match-games-for-event"],

    { revalidate: 30, tags: ["teams"] },

  ),

);



/**

 * Fetches all per-game scores for every match in an event in one query.

 * Returns a Map keyed by matchId for O(1) lookup during bracket page rendering.

 * Cached 30s under tag "teams" so score detail panels stay fresh after match saves.

 */

export async function getMatchGamesForEvent(eventId: string): Promise<Map<string, MatchGame[]>> {

  try {

    const entries = await _getMatchGamesForEventCached(eventId);

    return new Map(entries.map((e) => [e.matchId, e.games]));

  } catch {

    return new Map();

  }

}



/**

 * Saves per-game scores for a Best-of-N match. Automatically stops counting games once

 * a series winner is reached (`ceil(bestOf / 2)` wins). Upserts the parent Match row

 * with series win counts and deletes+recreates MatchGame rows atomically.

 * Throws if the match or event is not found.

 */

export async function setMatchGames(

  matchId: string,

  eventId: string,

  games: { gameNumber: number; homeScore: number; awayScore: number }[],

  bestOf: number,

): Promise<void> {

  let homeTeamId: string;

  let awayTeamId: string;

  let roundLabel: string;

  let round: number | null = null;

  let slot: number | null = null;



  const existingRow = await prisma.match.findFirst({ where: { id: matchId, eventId } });

  if (existingRow) {

    homeTeamId = existingRow.homeTeamId;

    awayTeamId = existingRow.awayTeamId;

    roundLabel = existingRow.roundLabel;

    round = existingRow.round;

    slot = existingRow.slot;

  } else {

    const fullEvent = await prisma.event.findUnique({ where: { id: eventId } });

    if (!fullEvent) throw new Error("Event not found");

    const projected = await getProjectedBracketMatches(mapEvent({ ...fullEvent, stream: null }));

    const projMatch = projected.find((m) => m.id === matchId);

    if (!projMatch) throw new Error("Match not found");

    homeTeamId = projMatch.homeTeamId;

    awayTeamId = projMatch.awayTeamId;

    roundLabel = projMatch.roundLabel;

    round = projMatch.round ?? null;

    slot = projMatch.slot ?? null;

  }



  const winsNeeded = Math.ceil(bestOf / 2);

  let homeWins = 0;

  let awayWins = 0;

  const playedGames: typeof games = [];



  for (const game of games.sort((a, b) => a.gameNumber - b.gameNumber)) {

    if (homeWins >= winsNeeded || awayWins >= winsNeeded) break;

    playedGames.push(game);

    if (game.homeScore > game.awayScore) homeWins++;

    else if (game.awayScore > game.homeScore) awayWins++;

  }



  const winnerTeamId =

    homeWins >= winsNeeded ? homeTeamId : awayWins >= winsNeeded ? awayTeamId : null;



  await prisma.$transaction(async (tx) => {

    await tx.match.upsert({

      where: { id: matchId },

      update: {

        homeScore: homeWins,

        awayScore: awayWins,

        status: winnerTeamId ? "Completed" : "Scheduled",

        winnerTeamId,

      },

      create: {

        id: matchId, eventId, roundLabel, homeTeamId, awayTeamId,

        homeScore: homeWins, awayScore: awayWins,

        status: winnerTeamId ? "Completed" : "Scheduled",

        round, slot, winnerTeamId,

      },

    });

    await tx.matchGame.deleteMany({ where: { matchId } });

    await tx.matchGame.createMany({

      data: playedGames.map((g) => ({ matchId, gameNumber: g.gameNumber, homeScore: g.homeScore, awayScore: g.awayScore })),

    });

  });

}



// ── Certificates ──────────────────────────────────────────────────────────────



/** Updates the character art URL and accent color for an event's certificate assets. */

export async function updateEventCertificateAssets(

  eventId: string,

  updates: { characterArtUrl?: string; accentColor?: string },

): Promise<void> {

  await prisma.event.update({ where: { id: eventId }, data: updates });

}



export async function updateEventBrandAssets(

  eventId: string,

  updates: { logoUrl?: string; gameImageUrl?: string },

): Promise<void> {

  try {

    await prisma.event.update({ where: { id: eventId }, data: updates });

  } catch {

    demoStore.updateEventBrandAssets(eventId, updates);

  }

}



/** Stores a generated certificate record for an event's champion team. */

export async function createCertificate(eventId: string, teamId: string, imageUrl: string): Promise<Certificate> {

  const row = await prisma.certificate.upsert({

    where: { eventId },

    update: { teamId, imageUrl },

    create: { eventId, teamId, imageUrl },

  });

  return { id: row.id, eventId: row.eventId, teamId: row.teamId, imageUrl: row.imageUrl, createdAt: row.createdAt };

}



/** Returns the certificate for an event, or null if none has been generated. */

export async function getCertificateByEvent(eventId: string): Promise<Certificate | null> {

  const row = await prisma.certificate.findUnique({ where: { eventId } });

  if (!row) return null;

  return { id: row.id, eventId: row.eventId, teamId: row.teamId, imageUrl: row.imageUrl, createdAt: row.createdAt };

}



/** Batch-fetches generated certificates for multiple events. */

export async function getCertificatesForEvents(eventIds: string[]): Promise<Map<string, Certificate | null>> {

  const certificates = new Map(eventIds.map((eventId) => [eventId, null as Certificate | null]));

  if (!eventIds.length) return certificates;



  try {

    const rows = await prisma.certificate.findMany({ where: { eventId: { in: eventIds } } });

    for (const row of rows) {

      certificates.set(row.eventId, {

        id: row.id,

        eventId: row.eventId,

        teamId: row.teamId,

        imageUrl: row.imageUrl,

        createdAt: row.createdAt,

      });

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



/** Counts existing certificates for a given game prefix (e.g. "game-flashpeak") to generate sequential IDs. */

export async function countCertificatesForGame(gameId: string): Promise<number> {

  return prisma.certificate.count({ where: { event: { gameId } } });

}
