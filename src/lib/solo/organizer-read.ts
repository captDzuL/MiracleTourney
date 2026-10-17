import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/platform/db";
import { getSoloDrawRules } from "@/lib/platform/config";
import { assertUserCanManageEvent } from "@/lib/platform/shared/authz";
import type { PaymentReviewEntry } from "@/lib/registration/review-repository";
import type { AppUser, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { mapSoloStatus, type RegistrationRecord } from "@/lib/registration/records";

import { previewCloseSolo } from "./close-registration";
import { getSoloDrawView } from "./draw-repository";
import type { CloseSoloPreview, SoloDrawView } from "./draw-types";
import { getSoloQuotaSnapshot } from "./registration-repository";
import type { SoloQuotaSnapshot } from "./registration-types";

/** The most registrations one organizer screen reads. A solo event's quota is far below this. */
const ROW_LIMIT = 3_000;

/** Reading more than the limit would silently drop the oldest players, so it stops with an error the screen shows. */
function withinLimit<T>(rows: readonly T[]): readonly T[] {
  if (rows.length > ROW_LIMIT) throw new Error("Too many solo registrations to list on one screen.");
  return rows;
}

/** A payment row of a solo player, shaped like a team's so the same review screen can show it. */
export type SoloPaymentEntry = PaymentReviewEntry & {
  solo: { registrationId: string; version: number; uid: string; position: string };
};

export type SoloEventSummary = Readonly<{
  eventId: string;
  status: string;
  participantCap: number;
  feeRequired: boolean;
  /** Pass back when closing registration. */
  competitionVersion: number;
  /** True once the draw is locked into teams. */
  teamsLocked: boolean;
  requiredPosition: string;
  quota: SoloQuotaSnapshot;
}>;

/** The solo facts of an event, or null for a team event or while solo tournaments are switched off. */
export async function getSoloEventSummary(eventId: string): Promise<SoloEventSummary | null> {
  if (!isFeatureEnabled("solo_tournament_v1")) return null;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, status: true, entryMode: true, gameModeId: true, participantCap: true,
      registrationFeeRequired: true, competitionVersion: true, activeSoloDrawId: true,
    },
  });
  const rules = event ? getSoloDrawRules(event.gameModeId) : null;
  if (!event || event.entryMode !== "solo" || !rules) return null;
  return {
    eventId: event.id,
    status: event.status,
    participantCap: event.participantCap,
    feeRequired: event.registrationFeeRequired,
    competitionVersion: event.competitionVersion,
    teamsLocked: event.activeSoloDrawId !== null,
    requiredPosition: Object.keys(rules.requiredPositions)[0],
    quota: await getSoloQuotaSnapshot(event.id),
  };
}

/** Every solo registration of an event, as rows of the same list that teams use. Never includes WhatsApp. */
export async function listSoloRegistrationRecords(user: AppUser, eventId: string): Promise<RegistrationRecord[]> {
  await assertUserCanManageEvent(user, eventId);
  const rows = await prisma.soloRegistration.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ROW_LIMIT + 1,
  });
  return withinLimit(rows).map((row) => ({
    id: row.id,
    eventId: row.eventId,
    teamName: row.ign,
    teamTag: row.primaryPosition,
    captainName: row.uid,
    captainIgn: row.ign,
    captainUid: row.uid,
    captainIsPlayer: true,
    rosterCount: 1,
    source: "solo_registration" as const,
    status: mapSoloStatus(row.status),
    createdAt: row.createdAt,
    origin: "solo",
    solo: { registrationId: row.id, version: row.version, secondaryPosition: row.secondaryPosition },
  }));
}

/** Solo payments waiting for the organizer (or, with a filter, in any payment state). */
export async function listSoloPaymentEntries(
  user: AppUser,
  eventId: string,
  status?: TeamRegistrationRequestStatus,
): Promise<SoloPaymentEntry[]> {
  await assertUserCanManageEvent(user, eventId);
  const rows = await prisma.soloRegistration.findMany({
    where: { eventId, status: status ?? { in: ["pending_payment", "pending_review"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ROW_LIMIT + 1,
  });
  return withinLimit(rows).map((row) => ({
    id: row.id,
    eventId: row.eventId,
    captainId: row.userId,
    teamId: null,
    teamName: row.ign,
    teamTag: row.primaryPosition,
    status: row.status as TeamRegistrationRequestStatus,
    proofImageUrl: row.proofImageUrl,
    rejectReason: row.rejectReason,
    expiresAt: row.expiresAt ?? row.updatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    captain: { id: row.userId, name: row.uid },
    solo: { registrationId: row.id, version: row.version, uid: row.uid, position: row.primaryPosition },
  }));
}

export type SoloDrawPanelData = Readonly<{
  /** Null once the event has started, when registration can no longer be closed or redrawn. */
  preview: CloseSoloPreview | null;
  draw: SoloDrawView | null;
}>;

/** What the draw tab shows: how ready the players are, and the current draw if there is one. */
export async function getSoloDrawPanelData(input: { user: AppUser; eventId: string; status: string }): Promise<SoloDrawPanelData> {
  const open = input.status === "Published" || input.status === "Registration Closed";
  const [preview, draw] = await Promise.all([
    open ? previewCloseSolo({ actor: input.user, eventId: input.eventId }) : Promise.resolve(null),
    getSoloDrawView({ actor: input.user, eventId: input.eventId }),
  ]);
  return { preview, draw };
}
