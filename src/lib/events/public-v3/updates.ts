// Public updates (announcements) of a public V3 event.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import type { CompatiblePublicEventInput, PublicV3Shared } from "@/lib/events/public-v3-types";
import { dateText, record, text } from "@/lib/events/public-v3/basics";

export function compatibleUpdates(input: CompatiblePublicEventInput): PublicV3Shared["updates"] {
  const source = input.announcements ?? input.updates;
  const now = input.now ?? new Date();
  return authoritativeUpdates(Array.isArray(source) ? source.filter((value) => {
    const row = record(value);
    return !text(row.status) || isPublishedAnnouncement(value, now);
  }) : source);
}

export function authoritativeUpdates(value: unknown): PublicV3Shared["updates"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const id = text(row.id);
    const title = text(row.title);
    const body = text(row.body);
    const publishedAt = dateText(row.publishedAt);
    if (!id || !title || !body || !publishedAt) return [];
    return [{ id, title, body, publishedAt }];
  });
}

export function isPublishedAnnouncement(value: unknown, now: Date): boolean {
  const row = record(value);
  if (text(row.status).toLowerCase() !== "published") return false;
  const publishedAt = dateText(row.publishedAt);
  if (!publishedAt) return false;
  const publishedDate = new Date(publishedAt);
  if (Number.isNaN(publishedDate.getTime()) || publishedDate > now) return false;
  const startsAt = dateText(row.startsAt);
  const endsAt = dateText(row.endsAt);
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) <= now) return false;
  return true;
}
