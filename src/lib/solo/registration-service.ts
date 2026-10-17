import { randomUUID } from "node:crypto";

import { sendEmail } from "@/lib/email/send";
import { soloSlotOpenEmail } from "@/lib/email/templates/solo-slot-open";
import { writeServerLog } from "@/lib/observability/logger";
import { prisma } from "@/lib/platform/db";

import {
  SoloRegistrationNotice,
  registerSolo,
  sweepSoloEvent,
  uploadSoloProof,
  withdrawSolo,
  type RegisterSoloInput,
} from "./registration-repository";
import type { PromotedRegistration } from "./registration-types";

const ROUTE = "/server/solo";

function logFailure(operation: string, resourceId?: string) {
  writeServerLog({
    phase: "failed",
    operation,
    route: ROUTE,
    requestId: randomUUID(),
    durationMs: 0,
    status: 500,
    ...(resourceId ? { resourceId } : {}),
  });
}

function siteBaseUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? base : null;
}

/**
 * Tells players who just got a slot. Runs after the database change is committed and never throws:
 * a mail that cannot be sent must not undo a slot. Failures are logged with ids only.
 */
export async function announcePromotions(promoted: readonly PromotedRegistration[]): Promise<void> {
  if (promoted.length === 0) return;
  const base = siteBaseUrl();
  if (!base) {
    logFailure("solo_slot_email_no_site_url");
    return;
  }
  try {
    const [users, events] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: promoted.map((entry) => entry.userId) } }, select: { id: true, email: true, name: true } }),
      prisma.event.findMany({ where: { id: { in: promoted.map((entry) => entry.eventId) } }, select: { id: true, slug: true, name: true } }),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const eventById = new Map(events.map((event) => [event.id, event]));

    for (const entry of promoted) {
      const user = userById.get(entry.userId);
      const event = eventById.get(entry.eventId);
      if (!user || !event) continue;
      try {
        const mail = soloSlotOpenEmail({
          playerName: user.name,
          eventName: event.name,
          eventUrl: `${base}/id/events/${event.slug}/register`,
          status: entry.status,
          deadline: entry.expiresAt,
        });
        await sendEmail({ to: user.email, subject: mail.subject, html: mail.html });
      } catch {
        logFailure("solo_slot_email", entry.registrationId);
      }
    }
  } catch {
    logFailure("solo_slot_email_lookup");
  }
}

export async function registerSoloAndAnnounce(input: RegisterSoloInput) {
  const result = await registerSolo(input);
  await announcePromotions(result.promoted);
  return result;
}

export async function withdrawSoloAndAnnounce(input: { userId: string; registrationId: string }) {
  const result = await withdrawSolo(input);
  await announcePromotions(result.promoted);
  return result;
}

export async function uploadSoloProofAndAnnounce(input: { userId: string; registrationId: string; proofImageUrl: string }) {
  try {
    const result = await uploadSoloProof(input);
    await announcePromotions(result.promoted);
    return result;
  } catch (error) {
    // A refused upload (such as a missed deadline) can still have moved the queue forward.
    if (error instanceof SoloRegistrationNotice) await announcePromotions(error.promoted);
    throw error;
  }
}

/** Expires late slots and promotes the queue for pages that read a solo event. A failure here must not break the page. */
export async function sweepSoloEventAndAnnounce(eventId: string): Promise<{ expired: number; promoted: PromotedRegistration[] }> {
  try {
    const result = await sweepSoloEvent(eventId);
    await announcePromotions(result.promoted);
    return result;
  } catch {
    logFailure("solo_sweep", eventId);
    return { expired: 0, promoted: [] };
  }
}
