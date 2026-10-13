import type { SoloRegistration as SoloRegistrationRow } from "@prisma/client";

import { getSoloDrawRules } from "@/lib/platform/config";
import type { prisma } from "@/lib/platform/db";
import { UserFacingError } from "@/lib/security/public-error";

import type { Tx } from "./event-lock";
import type { SoloCandidate, SoloRules } from "./types";

/** Version of the draw rules, stored with every draw so an old draw can still be explained later. */
export const SOLO_DRAW_ALGORITHM_VERSION = "solo-draw-v1";

/** The captain rule written into every draw. Volunteers first, otherwise any of the five. */
export const SOLO_CAPTAIN_RULE = "volunteer_first";

export type DrawEvent = Readonly<{
  id: string;
  slug: string;
  status: string;
  participantCap: number;
  registrationFeeRequired: boolean;
  competitionVersion: number;
  activeSoloDrawId: string | null;
  rules: SoloRules;
}>;

/** Loads an event for the draw steps. Refuses events that are not solo events of a supported game. */
export async function loadDrawEvent(tx: Tx | typeof prisma, eventId: string): Promise<DrawEvent> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, slug: true, status: true, entryMode: true, participantCap: true, gameModeId: true,
      registrationFeeRequired: true, competitionVersion: true, activeSoloDrawId: true,
    },
  });
  if (!event) throw new UserFacingError("Event tidak ditemukan.");
  if (event.entryMode !== "solo") throw new UserFacingError("Event ini bukan event solo.");
  const rules = getSoloDrawRules(event.gameModeId);
  if (!rules) throw new UserFacingError("Game ini belum mendukung event solo.");
  return {
    id: event.id,
    slug: event.slug,
    status: event.status,
    participantCap: event.participantCap,
    registrationFeeRequired: event.registrationFeeRequired,
    competitionVersion: event.competitionVersion,
    activeSoloDrawId: event.activeSoloDrawId,
    rules,
  };
}

/** The part of a registration the draw engine looks at. Earlier registrations keep their place. */
export function toCandidate(row: Pick<SoloRegistrationRow, "id" | "ign" | "uid" | "primaryPosition" | "secondaryPosition" | "willingCaptain" | "createdAt">): SoloCandidate {
  return {
    registrationId: row.id,
    ign: row.ign,
    uid: row.uid,
    primaryPosition: row.primaryPosition,
    secondaryPosition: row.secondaryPosition,
    willingCaptain: row.willingCaptain,
    registeredAt: row.createdAt.getTime(),
  };
}

/** Every approved registration of the event, in registration order. These are the players a draw is made from. */
export async function loadApprovedCandidates(tx: Tx, eventId: string) {
  const rows = await tx.soloRegistration.findMany({
    where: { eventId, status: "approved" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return { rows, candidates: rows.map(toCandidate) };
}
