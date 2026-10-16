// Constants shared by the platform repositories. Moved out of repository.ts without changes (refactor PR 1.1).

import type { EventStatus, TeamRegistrationRequestStatus } from "@/lib/platform/types";

export const PUBLIC_EVENT_STATUSES = new Set<EventStatus>(["Published", "Registration Closed", "Ongoing", "Finished"]);

// Organizer list readers keep the existing response shapes while preventing an
// event-sized request from turning into an unbounded database read.
export const ORGANIZER_READER_ROW_LIMIT = 500;
export const ORGANIZER_READER_HISTORY_LIMIT = 100;
export const ORGANIZER_READER_IMPORT_BATCH_LIMIT = 8;
export const ORGANIZER_READER_IMPORT_ITEM_LIMIT = 512;
export const ORGANIZER_READER_PAYMENT_PROBE_LIMIT = ORGANIZER_READER_HISTORY_LIMIT + 1;
export const PAYMENT_SETTINGS_ID = "global";
export const ACTIVE_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review", "approved"];
export const RESERVED_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "pending_review"];
export const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

// pending_review is deliberately excluded: once a captain has uploaded proof, the
// deadline no longer applies - only an admin approve/reject should resolve the request.
export const EXPIRABLE_REGISTRATION_REQUEST_STATUSES: TeamRegistrationRequestStatus[] = ["pending_payment", "rejected"];
export const ROSTER_LOCKED_MESSAGE = "Roster tim sudah terkunci setelah drawing dipublikasikan atau turnamen berjalan.";

/**
 * Cache tags for unstable_cache and revalidateTag. The server actions still pass the same strings as literals, so
 * their revalidation calls stay readable and src/lib/revalidation-map.test.ts can list them; shared/constants.test.ts
 * checks that every literal is one of these tags.
 */
export const CACHE_TAGS = {
  events: "events",
  teams: "teams",
  stats: "stats",
} as const;
