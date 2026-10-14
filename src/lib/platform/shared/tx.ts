// Transaction and registration-state helpers shared by the platform repositories. Moved out of repository.ts without changes (refactor PR 1.3).

import { prisma } from "../db";
import { EXPIRABLE_REGISTRATION_REQUEST_STATUSES, ROSTER_LOCKED_MESSAGE } from "./constants";
import { writeServerLog } from "@/lib/observability/logger";
import { UserFacingError, describeActionError } from "@/lib/security/public-error";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type RegistrationWindowEvent = {
  status: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
};

export function isNewRegistrationWindowOpen(event: RegistrationWindowEvent, now = new Date()): boolean {
  if (event.status !== "Published") return false;
  if (event.registrationOpensAt && now < event.registrationOpensAt) return false;
  if (event.registrationClosesAt && now >= event.registrationClosesAt) return false;
  return true;
}

export function assertNewRegistrationWindowOpen(event: RegistrationWindowEvent, now = new Date()): void {
  if (!isNewRegistrationWindowOpen(event, now)) {
    throw new UserFacingError("Event tidak valid atau sudah tidak membuka pendaftaran.");
  }
}

export async function runSerializableRegistrationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 60_000,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Pendaftaran berubah bersamaan. Silakan coba lagi.");
}

export async function expireStaleRegistrationRequests() {
  await prisma.teamRegistrationRequest.updateMany({
    where: {
      status: { in: EXPIRABLE_REGISTRATION_REQUEST_STATUSES },
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired" },
  });
  await deleteExpiredRequestTeamCopies();
}

/**
 * Each payment request keeps a "registration-intake" copy of the captain's draft (no event yet) so an approval can
 * promote it. Once the request has expired it can no longer be approved or resubmitted, so the copy is dead weight.
 * Scoped to copies still tied to an expired request: imported and approved teams have an eventId and are never touched,
 * and the captain's own draft has a different source. Its players go with it (cascade); the request keeps its history.
 */
export async function deleteExpiredRequestTeamCopies() {
  // Housekeeping only: it runs inside page loads and registrations, so a failure must never break them.
  try {
    await prisma.team.deleteMany({
      where: { eventId: null, source: "registration-intake", registrationRequest: { is: { status: "expired" } } },
    });
  } catch (error) {
    const { name, code } = describeActionError(error);
    writeServerLog({
      phase: "failed",
      operation: "expired_request_cleanup",
      route: "/captain",
      requestId: randomUUID(),
      durationMs: 0,
      status: 500,
      errorCode: code ?? name,
    });
  }
}

export async function assertEventExists(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new Error("Event tidak ditemukan.");
}

export type RosterLockReader = Pick<Prisma.TransactionClient, "event" | "competitionPhase" | "match">;

export async function readEventRosterLocked(db: RosterLockReader, eventId: string): Promise<boolean> {
  const [event, publishedPhases, startedMatches] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { status: true } }),
    db.competitionPhase.count({ where: { eventId, status: { in: ["active", "completed"] } } }),
    db.match.count({ where: { eventId, status: { in: ["Live", "Completed"] } } }),
  ]);
  if (!event) return false;
  return event.status === "Ongoing" || event.status === "Finished" || publishedPhases > 0 || startedMatches > 0;
}

/**
 * Serializes every event-roster mutation against competition operations through
 * Event.competitionVersion. If a drawing is published first this transaction
 * rolls back; if the roster wins the race, a stale drawing publish fails CAS and
 * must be rebuilt from the new authoritative roster.
 */
export async function assertEventRosterMutable(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  const claimed = await tx.event.updateMany({
    where: { id: eventId },
    data: { competitionVersion: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new UserFacingError("Event tidak ditemukan.");
  if (await readEventRosterLocked(tx, eventId)) throw new UserFacingError(ROSTER_LOCKED_MESSAGE);
}
