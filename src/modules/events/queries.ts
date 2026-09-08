import { cache } from "react";
import { unstable_cache } from "next/cache";

import * as demoStore from "@/lib/platform/demo-store";
import type { ActorContext } from "@/modules/identity";
import type { Event } from "@/lib/platform/types";

import { resolveEventAccessScope } from "./policy";
import {
  findEventBySlug,
  findManageableEventDraft,
  findPublicEventBySlug,
  listCaptainRegistrationRequestEventIds,
  listCaptainTeamEventIds,
  listEventsByIds,
  listEventsForScope,
  listLockedSingleEliminationEventIds,
  listPublicEventMetadata,
  listPublicEvents,
  listPublishedEvents,
  listTeamCountsByEventIds,
} from "./repository";

const ACTIVE_REGISTRATION_REQUEST_STATUSES = ["pending_payment", "pending_review", "approved"] as const;

export async function getAllPublicEvents(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  try {
    return await listPublicEventMetadata();
  } catch {
    return [];
  }
}

export async function getEvents() {
  return listEventsForScope({ kind: "platform_admin" });
}

export async function getEventsByIds(eventIds: string[]) {
  if (!eventIds.length) return [];

  try {
    return await listEventsByIds(eventIds);
  } catch {
    const eventIdSet = new Set(eventIds);
    return demoStore.getEvents().filter((event) => eventIdSet.has(event.id));
  }
}

export async function getManageableEventsForActor(actor: ActorContext | null) {
  const scope = resolveEventAccessScope(actor);
  if (scope.kind === "none") return [];

  return listEventsForScope(scope);
}

export async function getManageableEventsForUser(actor: ActorContext | null) {
  return getManageableEventsForActor(actor);
}

export async function getManageableEventDraft(actor: ActorContext | null, eventId: string) {
  const scope = resolveEventAccessScope(actor);
  if (scope.kind === "none") return null;

  return findManageableEventDraft(scope, eventId);
}

export async function getPublicEvents() {
  try {
    return await listPublicEvents();
  } catch {
    return demoStore.getPublicEvents();
  }
}

export async function getPublishedEvents() {
  return listPublishedEvents();
}

export async function getOpenRegistrationEventsForCaptain(captainId: string) {
  if (!captainId) return [];

  const events = await listPublishedEvents();
  const eventIds = events.map((event) => event.id);
  if (!eventIds.length) return [];

  const [captainTeamEventIds, captainRequestEventIds, teamCounts, lockedEventIds] = await Promise.all([
    listCaptainTeamEventIds(captainId, eventIds),
    listCaptainRegistrationRequestEventIds(captainId, eventIds, ACTIVE_REGISTRATION_REQUEST_STATUSES),
    listTeamCountsByEventIds(eventIds),
    listLockedSingleEliminationEventIds(events),
  ]);

  const joinedEventIds = new Set([
    ...captainTeamEventIds,
    ...captainRequestEventIds,
  ]);

  return events
    .map((event) => ({ ...event, registeredTeams: teamCounts.get(event.id) ?? 0 }))
    .filter((event) => !joinedEventIds.has(event.id))
    .filter((event) => event.registeredTeams < event.participantCap)
    .filter((event) => !lockedEventIds.has(event.id));
}

export async function getEventBySlug(slug: string) {
  try {
    return await findEventBySlug(slug);
  } catch {
    return demoStore.getEventBySlug(slug) ?? null;
  }
}

export const getPublicEventBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Event | null> => {
      try {
        return await findPublicEventBySlug(slug);
      } catch {
        return demoStore.getPublicEventBySlug(slug) ?? null;
      }
    },
    ["public-event-by-slug"],
    { revalidate: 60, tags: ["events"] },
  ),
);
