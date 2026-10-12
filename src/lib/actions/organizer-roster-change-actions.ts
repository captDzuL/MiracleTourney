"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { decideRosterChange, setRosterChangeLimit } from "@/lib/platform/roster-change-decisions";
import { MAX_ROSTER_CHANGE_LIMIT, RosterChangeError } from "@/lib/platform/roster-change-rules";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeEntityIdSchema } from "@/lib/security/request-guard";

const RATE_LIMIT_ATTEMPTS = 60;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const NOTE_MAX_LENGTH = 200;
const ORGANIZER_ROLES = ["organizer", "platform_admin", "admin"] as const;

const decideSchema = z.object({
  eventId: safeEntityIdSchema,
  requestId: safeEntityIdSchema,
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});

function fieldText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Result codes are an allowlist the settings page maps to translated text; nothing user-written is reflected. */
type Outcome = { result: "approved" | "rejected" | "limit_saved" } | { error: string };

function settingsPath(eventId: string | null): string {
  return eventId ? `/organizer/events/${encodeURIComponent(eventId)}/settings` : "/organizer";
}

function backToSettings(eventId: string | null, outcome: Outcome): Promise<never> {
  const query = "result" in outcome ? `rcResult=${outcome.result}` : `rcError=${encodeURIComponent(outcome.error)}`;
  return redirectToActiveLocale(eventId ? `${settingsPath(eventId)}?${query}` : settingsPath(null));
}

function errorCodeOf(error: unknown): string {
  if (error instanceof RosterChangeError) return error.code;
  if (error instanceof Error && /^not authorized/i.test(error.message)) return "forbidden";
  console.error("Roster change decision failed", { name: error instanceof Error ? error.name : "unknown" });
  return "unknown";
}

async function organizerOrLogin() {
  const user = await requireAnyRole([...ORGANIZER_ROLES]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  return user;
}

function refreshRosters(): void {
  revalidateTag("teams");
  revalidateTag("stats");
  revalidatePath("/captain");
}

/** Approve or reject a captain's roster change request. */
export async function organizerDecideRosterChangeAction(formData: FormData): Promise<never> {
  const user = await organizerOrLogin();

  const parsed = decideSchema.safeParse({
    eventId: fieldText(formData, "eventId"),
    requestId: fieldText(formData, "requestId"),
    decision: fieldText(formData, "decision"),
    note: fieldText(formData, "note"),
  });
  const eventId = safeEntityIdSchema.safeParse(fieldText(formData, "eventId"));
  const fallbackEventId = eventId.success ? eventId.data : null;
  if (!parsed.success) return backToSettings(fallbackEventId, { error: "invalid_change" });

  if (!(await checkRateLimit(`roster-decision:${user.id}`, RATE_LIMIT_ATTEMPTS, RATE_LIMIT_WINDOW_MS))) {
    return backToSettings(parsed.data.eventId, { error: "rate_limited" });
  }

  let failure: string | null = null;
  let decidedEventId = parsed.data.eventId;
  try {
    const decided = await decideRosterChange({
      actor: user,
      requestId: parsed.data.requestId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    decidedEventId = decided.eventId;
  } catch (error) {
    failure = errorCodeOf(error);
  }
  if (failure) return backToSettings(parsed.data.eventId, { error: failure });

  if (parsed.data.decision === "approve") refreshRosters();
  return backToSettings(decidedEventId, { result: parsed.data.decision === "approve" ? "approved" : "rejected" });
}

/** Sets how many roster changes each team may make (0 = roster stays locked once the drawing is out). */
export async function organizerSetRosterChangeLimitAction(formData: FormData): Promise<never> {
  const user = await organizerOrLogin();

  const eventId = safeEntityIdSchema.safeParse(fieldText(formData, "eventId"));
  if (!eventId.success) return backToSettings(null, { error: "invalid_change" });

  if (!(await checkRateLimit(`roster-limit:${user.id}`, RATE_LIMIT_ATTEMPTS, RATE_LIMIT_WINDOW_MS))) {
    return backToSettings(eventId.data, { error: "rate_limited" });
  }

  const rawLimit = fieldText(formData, "limit").trim();
  const limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  if (!Number.isInteger(limit) || limit > MAX_ROSTER_CHANGE_LIMIT) return backToSettings(eventId.data, { error: "invalid_limit" });

  let failure: string | null = null;
  try {
    await setRosterChangeLimit({ actor: user, eventId: eventId.data, limit });
  } catch (error) {
    failure = errorCodeOf(error);
  }
  if (failure) return backToSettings(eventId.data, { error: failure });

  return backToSettings(eventId.data, { result: "limit_saved" });
}
