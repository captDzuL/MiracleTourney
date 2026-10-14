// Registration review: approve and reject requests, payment review, event payment settings for managers.
// Moved out of platform/repository.ts without changes (refactor PR 2.8).

import { prisma } from "@/lib/platform/db";
import { ReaderResultOverflowError } from "@/lib/platform/reader-bounds";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import { ORGANIZER_READER_HISTORY_LIMIT, ORGANIZER_READER_PAYMENT_PROBE_LIMIT } from "@/lib/platform/shared/constants";
import { mapTeam, mapTeamRegistrationRequest, registrationRequestInclude } from "@/lib/platform/shared/mappers";
import { assertEventExists, assertEventRosterMutable, expireStaleRegistrationRequests, runSerializableRegistrationTransaction } from "@/lib/platform/shared/tx";
import type { AppUser, Team, TeamRegistrationRequest, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import type { ResolvedEventPaymentSettings } from "@/lib/registration/event-payment-settings";
import { RegistrationMutationConflictError } from "@/lib/registration/repository";
import type { RegistrationReviewPrecondition } from "@/lib/registration/repository";

export async function approveTeamRegistrationRequest(
  user: AppUser,
  requestId: string,
  precondition?: RegistrationReviewPrecondition,
): Promise<Team> {
  const initial = await prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId },
    select: { eventId: true, status: true, updatedAt: true },
  });
  if (!initial) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  await assertUserCanManageEvent(user, initial.eventId);
  if (
    precondition?.expectedStatus && initial.status !== precondition.expectedStatus
    || precondition?.expectedUpdatedAt && initial.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
  ) {
    throw new RegistrationMutationConflictError(undefined, initial.updatedAt);
  }

  const teamRow = await runSerializableRegistrationTransaction(async (tx) => {
    const request = await tx.teamRegistrationRequest.findFirst({
      where: { id: requestId },
      include: registrationRequestInclude,
    });
    if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
    if (
      precondition?.expectedStatus && request.status !== precondition.expectedStatus
      || precondition?.expectedUpdatedAt && request.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
    ) {
      throw new RegistrationMutationConflictError(undefined, request.updatedAt);
    }
    if (request.status !== "pending_review") throw new Error("Pendaftaran belum siap diverifikasi.");
    if (!["Published", "Registration Closed"].includes(request.event.status)) {
      throw new Error("Event sudah dimulai sehingga pendaftaran tidak bisa disetujui.");
    }
    await assertEventRosterMutable(tx, request.eventId);

    const [registeredTeams, existingCaptainTeam, completedMatches] = await Promise.all([
      tx.team.count({ where: { eventId: request.eventId } }),
      tx.team.findFirst({
        where: {
          eventId: request.eventId,
          captainId: request.captainId,
          ...(request.teamId ? { id: { not: request.teamId } } : {}),
        },
        select: { id: true },
      }),
      request.event.format === "Single Elimination"
        ? tx.match.count({ where: { eventId: request.eventId, status: "Completed" } })
        : Promise.resolve(0),
    ]);
    if (registeredTeams >= request.event.participantCap) throw new Error("Slot pendaftaran event ini sudah penuh.");
    if (existingCaptainTeam) throw new Error("Kamu sudah mendaftarkan tim untuk event ini.");
    if (completedMatches > 0) {
      throw new Error(`Event "${request.event.slug}" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.`);
    }

    const row = request.teamId
      ? await tx.team.update({ where: { id: request.teamId }, data: { eventId: request.eventId, source: "registration" } })
      : await tx.team.create({
          data: {
            eventId: request.eventId,
            captainId: request.captainId,
            name: request.teamName,
            logoText: request.teamTag.slice(0, 2),
            tag: request.teamTag,
            source: "registration",
          },
    });
    await tx.player.updateMany({ where: { teamId: row.id }, data: { eventId: request.eventId } });
    const approvalData = { status: "approved", teamId: row.id, approvedAt: new Date(), approvedById: user.id };
    if (precondition) {
      const claimed = await tx.teamRegistrationRequest.updateMany({
        where: {
          id: request.id,
          status: precondition.expectedStatus ?? "pending_review",
          ...(precondition.expectedUpdatedAt ? { updatedAt: precondition.expectedUpdatedAt } : {}),
        },
        data: approvalData,
      });
      if (claimed.count !== 1) {
        const current = await tx.teamRegistrationRequest.findFirst({ where: { id: request.id }, select: { updatedAt: true } });
        throw new RegistrationMutationConflictError(undefined, current?.updatedAt);
      }
    } else {
      await tx.teamRegistrationRequest.update({
        where: { id: request.id },
        data: approvalData,
        include: registrationRequestInclude,
      });
    }
    return row;
  });
  return mapTeam(teamRow);
}

export async function rejectTeamRegistrationRequest(
  user: AppUser,
  requestId: string,
  reason: string,
  precondition?: RegistrationReviewPrecondition,
): Promise<TeamRegistrationRequest> {
  const request = await prisma.teamRegistrationRequest.findFirst({ where: { id: requestId }, include: registrationRequestInclude });
  if (!request) throw new Error("Pendaftaran pembayaran tidak ditemukan.");
  await assertUserCanManageEvent(user, request.eventId);
  if (!["pending_review", "pending_payment"].includes(request.status)) throw new Error("Pendaftaran ini tidak bisa ditolak.");
  if (
    precondition?.expectedStatus && request.status !== precondition.expectedStatus
    || precondition?.expectedUpdatedAt && request.updatedAt.getTime() !== precondition.expectedUpdatedAt.getTime()
  ) {
    throw new RegistrationMutationConflictError(undefined, request.updatedAt);
  }
  if (!precondition) {
    const row = await prisma.teamRegistrationRequest.update({
      where: { id: request.id },
      data: { status: "rejected", rejectReason: reason, proofImageUrl: null },
      include: registrationRequestInclude,
    });
    return mapTeamRegistrationRequest(row);
  }
  const update = await prisma.teamRegistrationRequest.updateMany({
    where: {
      id: request.id,
      status: precondition.expectedStatus ?? { in: ["pending_review", "pending_payment"] },
      ...(precondition.expectedUpdatedAt ? { updatedAt: precondition.expectedUpdatedAt } : {}),
    },
    data: { status: "rejected", rejectReason: reason, proofImageUrl: null },
  });
  if (update.count !== 1) {
    const current = await prisma.teamRegistrationRequest.findFirst({ where: { id: request.id }, select: { updatedAt: true } });
    throw new RegistrationMutationConflictError(undefined, current?.updatedAt);
  }
  const row = await prisma.teamRegistrationRequest.findFirst({ where: { id: request.id }, include: registrationRequestInclude });
  if (!row) throw new Error("Pendaftaran pembayaran tidak ditemukan setelah penolakan.");
  return mapTeamRegistrationRequest(row);
}

export type PaymentReviewEntry = {
  id: string;
  eventId: string;
  captainId: string;
  teamId?: string | null;
  teamName: string;
  teamTag: string;
  status: TeamRegistrationRequestStatus;
  proofImageUrl?: string | null;
  rejectReason?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  captain?: { id: string; name: string; email?: string } | null;
};

export class PaymentReviewOverflowError extends ReaderResultOverflowError {
  constructor() {
    super("payment review", ORGANIZER_READER_HISTORY_LIMIT);
    this.name = "PaymentReviewOverflowError";
    this.message = `Payment review contains more than ${ORGANIZER_READER_HISTORY_LIMIT} entries; use a paginated review reader.`;
  }
}

export type TeamRegistrationRequestTarget = {
  id: string;
  eventId: string;
  captainId: string;
  teamId: string | null;
  teamName: string;
  teamTag: string;
  status: TeamRegistrationRequestStatus;
  proofImageUrl: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export type EventPaymentManagerSettings = ResolvedEventPaymentSettings & { eventId: string; source: "event" };

export async function getPaymentReviewForEvent(user: AppUser, eventId: string, status?: TeamRegistrationRequestStatus): Promise<PaymentReviewEntry[]> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  await expireStaleRegistrationRequests();
  const rows = await prisma.teamRegistrationRequest.findMany({
    where: {
      eventId,
      status: status ?? { in: ["pending_payment", "pending_review"] },
    },
    include: { captain: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ORGANIZER_READER_PAYMENT_PROBE_LIMIT,
  });
  if (rows.length > ORGANIZER_READER_HISTORY_LIMIT) throw new PaymentReviewOverflowError();
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    captainId: row.captainId,
    teamId: row.teamId,
    teamName: row.teamName,
    teamTag: row.teamTag,
    status: row.status as TeamRegistrationRequestStatus,
    proofImageUrl: row.proofImageUrl,
    rejectReason: row.rejectReason,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    captain: row.captain,
  }));
}

export async function getTeamRegistrationRequestForEvent(user: AppUser, eventId: string, requestId: string): Promise<TeamRegistrationRequestTarget | null> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const row = await prisma.teamRegistrationRequest.findFirst({
    where: { id: requestId, eventId },
    select: {
      id: true, eventId: true, captainId: true, teamId: true, teamName: true, teamTag: true,
      status: true, proofImageUrl: true, updatedAt: true, createdAt: true,
    },
  });
  if (!row) return null;
  return { ...row, status: row.status as TeamRegistrationRequestStatus };
}

export async function getEventPaymentSettingsForManager(user: AppUser, eventId: string): Promise<EventPaymentManagerSettings> {
  await assertUserCanManageEvent(user, eventId);
  await assertEventExists(eventId);
  const row = await prisma.eventPaymentSettings.findUnique({ where: { eventId } });
  if (!row) {
    return { id: `event-payment-${eventId}`, eventId, source: "event", status: "draft", version: 0 };
  }
  return {
    id: row.id,
    eventId: row.eventId,
    source: "event",
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    ...(row.qrisImageUrl ? { qrisImageUrl: row.qrisImageUrl } : {}),
    ...(row.instructions ? { instructions: row.instructions } : {}),
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    updatedAt: row.updatedAt,
  };
}
