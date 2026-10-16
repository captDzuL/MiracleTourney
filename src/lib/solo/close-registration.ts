import { applyEventLifecycleSideEffects } from "@/lib/events/event-lifecycle";
import { prisma } from "@/lib/platform/db";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import type { AppUser } from "@/lib/platform/types";
import { UserFacingError } from "@/lib/security/public-error";

import { loadDrawEvent, toCandidate } from "./draw-support";
import type { CloseSoloPreview } from "./draw-types";
import { withEventLock, type Tx } from "./event-lock";
import { planTeams } from "./plan";
import { toView } from "./registration-repository";

const STALE_MESSAGE = "Data sudah berubah. Muat ulang halaman.";
const QUEUE_CLOSED_NOTE = "Pendaftaran ditutup.";

/** Registrations the organizer has to settle first: still unpaid, waiting for review, or rejected with time left to retry. */
function blockerWhere(eventId: string, now: Date) {
  return {
    eventId,
    OR: [
      { status: "pending_review" },
      { status: { in: ["pending_payment", "rejected"] }, expiresAt: { gt: now } },
    ],
  };
}

async function buildPreview(db: Tx | typeof prisma, eventId: string, now: Date): Promise<CloseSoloPreview> {
  const event = await loadDrawEvent(db, eventId);
  if (event.status !== "Published" && event.status !== "Registration Closed") {
    throw new UserFacingError("Event ini belum membuka pendaftaran.");
  }
  const [blockers, queuedCount, approved] = await Promise.all([
    db.soloRegistration.findMany({ where: blockerWhere(eventId, now), orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.soloRegistration.count({ where: { eventId, status: "queued" } }),
    db.soloRegistration.findMany({ where: { eventId, status: "approved" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const plan = planTeams({ candidates: approved.map(toCandidate), participantCap: event.participantCap, rules: event.rules });
  const unplaced = new Set(plan.unplacedRegistrationIds);
  return {
    pendingBlockers: blockers.map(toView),
    plan,
    willBeUnplaced: approved.filter((row) => unplaced.has(row.id)).map(toView),
    queuedCount,
    feeRequired: event.registrationFeeRequired,
    competitionVersion: event.competitionVersion,
  };
}

/** Shows what closing registration would do, without changing anything. Also used by the draw panel after closing. */
export async function previewCloseSolo(input: { actor: AppUser; eventId: string }): Promise<CloseSoloPreview> {
  await assertUserCanManageEvent(input.actor, input.eventId);
  return buildPreview(prisma, input.eventId, new Date());
}

/**
 * Closes registration of a solo event. It refuses while payments are still open, and while a player who
 * will not get a team has not been confirmed for a refund. Players still in the queue are released.
 */
export async function closeSoloRegistration(input: {
  actor: AppUser;
  eventId: string;
  confirmRefundIds: readonly string[];
  expectedCompetitionVersion: number;
}): Promise<void> {
  await assertUserCanManageEvent(input.actor, input.eventId);
  await withEventLock(input.eventId, async (tx) => {
    const now = new Date();
    const event = await loadDrawEvent(tx, input.eventId);
    if (event.status !== "Published") throw new UserFacingError("Pendaftaran hanya bisa ditutup saat event dibuka.");
    if (event.competitionVersion !== input.expectedCompetitionVersion) throw new UserFacingError(STALE_MESSAGE);

    // A payment past its deadline no longer holds a slot, so it cannot hold the closing back either.
    await tx.soloRegistration.updateMany({
      where: { eventId: event.id, status: { in: ["pending_payment", "rejected"] }, expiresAt: { lte: now } },
      data: { status: "expired", version: { increment: 1 } },
    });
    const preview = await buildPreview(tx, event.id, now);
    if (preview.pendingBlockers.length > 0) {
      throw new UserFacingError("Masih ada pembayaran yang belum selesai. Setujui atau tolak dulu.");
    }
    const confirmed = new Set(input.confirmRefundIds);
    if (preview.willBeUnplaced.some((registration) => !confirmed.has(registration.id))) {
      throw new UserFacingError("Konfirmasi dulu pemain yang tidak masuk tim dan perlu refund.");
    }

    await tx.soloRegistration.updateMany({
      where: { eventId: event.id, status: "queued" },
      data: { status: "withdrawn", withdrawnAt: now, rejectReason: QUEUE_CLOSED_NOTE, version: { increment: 1 } },
    });
    const closed = await tx.event.updateMany({
      where: { id: event.id, status: "Published", competitionVersion: event.competitionVersion },
      data: { status: "Registration Closed", competitionVersion: { increment: 1 } },
    });
    if (closed.count !== 1) throw new UserFacingError(STALE_MESSAGE);
    await applyEventLifecycleSideEffects(tx, event.id, "Registration Closed", now);
    await tx.competitionAuditLog.create({
      data: {
        eventId: event.id,
        actorUserId: input.actor.id,
        action: "solo_registration_closed",
        payload: {
          teamCount: preview.plan.teamCount,
          unplacedCount: preview.willBeUnplaced.length,
          queuedReleased: preview.queuedCount,
        },
      },
    });
  });
}
