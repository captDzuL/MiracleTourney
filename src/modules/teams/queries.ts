import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { Player, Team } from "@/lib/platform/types";

import {
  getCaptainTeams as getCaptainTeamsInRepository,
  getPlayersForEvent as getPlayersForEventInRepository,
  getPlayersForTeam as getPlayersForTeamInRepository,
  getPlayersForTeams as getPlayersForTeamsInRepository,
  getTeamCountsForEvents as getTeamCountsForEventsInRepository,
  getTeamsForEvents as getTeamsForEventsInRepository,
  listTeamsForEvent,
} from "./repository";

/**
 * Cached (30s, tag "teams") team list for an event, ordered by registration
 * time. Cache is busted by `revalidateTag("teams")` after any team
 * mutation. Also memoised per-request via React cache to prevent duplicate
 * DB hits within a render. Public read, no actor required.
 */
export const getTeamsForEvent = cache(
  unstable_cache(
    async (eventId: string): Promise<Team[]> => listTeamsForEvent(eventId),
    ["teams-for-event"],
    { revalidate: 30, tags: ["teams"] },
  ),
);

/** Batch-fetches teams for multiple events in one query. Public read, no actor required. */
export async function getTeamsForEvents(eventIds: string[]): Promise<Map<string, Team[]>> {
  return getTeamsForEventsInRepository(eventIds);
}

/** Batch-counts teams for event summary UI without transferring every team row. Public read, no actor required. */
export async function getTeamCountsForEvents(eventIds: string[]): Promise<Map<string, number>> {
  return getTeamCountsForEventsInRepository(eventIds);
}

export async function getCaptainTeams(userId: string | undefined): Promise<Team[]> {
  return getCaptainTeamsInRepository(userId);
}

export async function getPlayersForTeam(teamId: string): Promise<Player[]> {
  return getPlayersForTeamInRepository(teamId);
}

export async function getPlayersForTeams(teamIds: string[]): Promise<Player[]> {
  return getPlayersForTeamsInRepository(teamIds);
}

export async function getPlayersForEvent(eventId: string): Promise<Player[]> {
  return getPlayersForEventInRepository(eventId);
}
