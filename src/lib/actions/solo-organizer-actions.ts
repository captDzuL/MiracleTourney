"use server";

import { randomUUID } from "node:crypto";

import { revalidateTag } from "next/cache";

import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { withServerActionLog, writeServerLog } from "@/lib/observability/logger";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import type { AppUser } from "@/lib/platform/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserFacingError, describeActionError, toSafeActionMessage } from "@/lib/security/public-error";
import { isSafeEntityId } from "@/lib/security/request-guard";
import { closeSoloRegistration } from "@/lib/solo/close-registration";
import { createSoloDraw, lockSoloDraw, markSoloRefunded, swapSoloPlayers } from "@/lib/solo/draw-repository";
import { findSoloDrawEvent, findSoloRegistrationEvent } from "@/lib/solo/lookups";
import { approveSolo, rejectSolo } from "@/lib/solo/registration-repository";

/** What an organizer's button gets back. A message is always safe to show. */
export type SoloOrganizerResult =
  | { status: "ok"; message: string }
  | { status: "failed"; message: string }
  | { status: "conflict"; message: string };

const ORGANIZER_ROLES = ["organizer", "platform_admin", "admin"] as const;
const STALE_MARKER = "Data sudah berubah";
const NO_ACCESS = "Kamu tidak punya akses ke data ini.";
const DRAW_ATTEMPTS = 10;
const DRAW_WINDOW_MS = 60 * 1000;

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const failed = (message: string): SoloOrganizerResult => ({ status: "failed", message });

/** The time a draw was last changed, as the screen read it: a valid UTC time written the way `toISOString` does. */
function readInstant(data: FormData, key: string): Date | null {
  const raw = text(data, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A version is a whole number written with digits only. An empty field is not zero. */
function readVersion(data: FormData, key: string): number | null {
  const raw = text(data, key);
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

type Gate = { user: AppUser } | { denied: SoloOrganizerResult };

/** Who is asking, before anything about the data is looked up: nothing is read for a caller who may not be here. */
async function authenticate(): Promise<Gate> {
  if (!isFeatureEnabled("solo_tournament_v1")) return { denied: failed("Fitur solo belum dibuka.") };
  const user = await requireAnyRole([...ORGANIZER_ROLES]);
  if (!user) return { denied: failed("Sesi organizer tidak ditemukan.") };
  if (user.role === "organizer" && user.mustChangePassword) return { denied: failed("Ganti password sebelum mengelola event.") };
  return { user };
}

/** Whether this person manages that event. An unknown event and somebody else's event look the same. */
async function authorize(user: AppUser, eventId: string | null): Promise<SoloOrganizerResult | null> {
  if (!eventId || !isSafeEntityId(eventId)) return failed(NO_ACCESS);
  try {
    await assertUserCanManageEvent(user, eventId);
  } catch {
    return failed(NO_ACCESS);
  }
  return null;
}

/** An unexpected failure is logged by its class and code only, and the person sees a fixed message. */
function describeFailure(error: unknown, operation: string): SoloOrganizerResult {
  if (error instanceof UserFacingError) {
    return { status: error.message.includes(STALE_MARKER) ? "conflict" : "failed", message: error.message };
  }
  const { name, code } = describeActionError(error);
  writeServerLog({
    phase: "failed", operation, route: `/server-actions/${operation}`, requestId: randomUUID(), durationMs: 0, status: 500, errorCode: code ?? name,
  });
  return failed(toSafeActionMessage(error, "Perubahan tidak bisa disimpan. Coba lagi."));
}

async function perform(
  operation: string,
  eventId: string,
  success: string,
  work: (user: AppUser) => Promise<void>,
  tags: readonly string[] = [],
): Promise<SoloOrganizerResult> {
  return withServerActionLog(operation, `/server-actions/${operation}`, async () => {
    const access = await authenticate();
    if ("denied" in access) return access.denied;
    const refused = await authorize(access.user, eventId);
    if (refused) return refused;
    try {
      await work(access.user);
    } catch (error) {
      return describeFailure(error, operation);
    }
    for (const tag of tags) revalidateTag(tag);
    return { status: "ok", message: success } satisfies SoloOrganizerResult;
  });
}

/** Looks up the event a draw or registration belongs to, so the access check runs against the right event. */
async function eventOf(kind: "draw" | "registration", id: string): Promise<string | null> {
  if (!isSafeEntityId(id)) return null;
  const row = kind === "draw" ? await findSoloDrawEvent(id) : await findSoloRegistrationEvent(id);
  return row?.eventId ?? null;
}

async function performOn(
  kind: "draw" | "registration",
  id: string,
  operation: string,
  success: string,
  work: (user: AppUser, eventId: string) => Promise<void>,
  tags: readonly string[] = [],
): Promise<SoloOrganizerResult> {
  return withServerActionLog(operation, `/server-actions/${operation}`, async () => {
    // Who is asking comes first, so a stranger cannot learn from the answer whether an id exists.
    const access = await authenticate();
    if ("denied" in access) return access.denied;
    const eventId = await eventOf(kind, id);
    const refused = await authorize(access.user, eventId);
    if (refused || !eventId) return refused ?? failed(NO_ACCESS);
    try {
      await work(access.user, eventId);
    } catch (error) {
      return describeFailure(error, operation);
    }
    for (const tag of tags) revalidateTag(tag);
    return { status: "ok", message: success } satisfies SoloOrganizerResult;
  });
}

/** Closes registration. The form carries the event version it was loaded with and every refund the organizer confirmed. */
export async function closeSoloRegistrationAction(formData: FormData): Promise<SoloOrganizerResult> {
  const eventId = text(formData, "eventId");
  const version = readVersion(formData, "expectedVersion");
  if (version === null) return failed("Data tidak valid.");
  const confirmRefundIds = formData.getAll("confirmRefundId").map(String).filter(isSafeEntityId);
  return perform("solo_close_registration", eventId, "Pendaftaran ditutup.", (user) =>
    closeSoloRegistration({ actor: user, eventId, confirmRefundIds, expectedCompetitionVersion: version }), ["events"]);
}

/** Draws teams from the approved players, or draws again with a new seed. */
export async function createSoloDrawAction(formData: FormData): Promise<SoloOrganizerResult> {
  const eventId = text(formData, "eventId");
  const seed = text(formData, "seed");
  return perform("solo_draw_create", eventId, "Tim diacak.", async (user) => {
    // Every draw takes the event's lock and adds rows, so drawing again and again is capped.
    if (!(await checkRateLimit(`solo-draw:${user.id}:${eventId}`, DRAW_ATTEMPTS, DRAW_WINDOW_MS))) {
      throw new UserFacingError("Terlalu sering mengacak. Tunggu semenit lalu coba lagi.");
    }
    await createSoloDraw({ actor: user, eventId, ...(seed ? { seed } : {}) });
  });
}

/** Swaps two players between two teams of a draft draw. */
export async function swapSoloPlayersAction(formData: FormData): Promise<SoloOrganizerResult> {
  const drawId = text(formData, "drawId");
  const a = text(formData, "a");
  const b = text(formData, "b");
  const expectedUpdatedAt = readInstant(formData, "expectedUpdatedAt");
  if (!isSafeEntityId(a) || !isSafeEntityId(b) || !expectedUpdatedAt) return failed("Data tidak valid.");
  return performOn("draw", drawId, "solo_draw_swap", "Pemain ditukar.", async (user) => {
    await swapSoloPlayers({ actor: user, drawId, a, b, expectedUpdatedAt });
  });
}

/** Locks a draft draw into real teams. */
export async function lockSoloDrawAction(formData: FormData): Promise<SoloOrganizerResult> {
  const drawId = text(formData, "drawId");
  const expectedUpdatedAt = readInstant(formData, "expectedUpdatedAt");
  if (!expectedUpdatedAt) return failed("Data tidak valid.");
  return performOn("draw", drawId, "solo_draw_lock", "Tim dikunci.", async (user) => {
    await lockSoloDraw({ actor: user, drawId, expectedUpdatedAt });
  }, ["teams", "events"]);
}

/** Accepts a solo player's payment. `version` is the registration version the organizer was looking at. */
export async function approveSoloRegistrationAction(formData: FormData): Promise<SoloOrganizerResult> {
  const registrationId = text(formData, "registrationId");
  const version = readVersion(formData, "version");
  if (version === null) return failed("Data tidak valid.");
  return performOn("registration", registrationId, "solo_payment_approve", "Pembayaran disetujui.", async (user) => {
    await approveSolo({ actor: user, registrationId, expectedVersion: version });
  });
}

/** Turns a solo player's payment down. The reason is shown to the player. */
export async function rejectSoloRegistrationAction(formData: FormData): Promise<SoloOrganizerResult> {
  const registrationId = text(formData, "registrationId");
  const version = readVersion(formData, "version");
  if (version === null) return failed("Data tidak valid.");
  const reason = text(formData, "reason");
  return performOn("registration", registrationId, "solo_payment_reject", "Pembayaran ditolak.", async (user) => {
    await rejectSolo({ actor: user, registrationId, reason, expectedVersion: version });
  });
}

/** Records that a player was paid back. */
export async function markSoloRefundedAction(formData: FormData): Promise<SoloOrganizerResult> {
  const registrationId = text(formData, "registrationId");
  const note = text(formData, "note");
  return performOn("registration", registrationId, "solo_refund_mark", "Refund dicatat.", async (user) => {
    await markSoloRefunded({ actor: user, registrationId, note });
  });
}
