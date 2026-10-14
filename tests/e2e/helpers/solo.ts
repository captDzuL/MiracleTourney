import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { seedSoloTournament } from "../../../prisma/seed-solo";
import { loginWithCredentials } from "./auth";

export const SOLO_EVENT_SLUG = "flashpeak-solo-cup";
export const SEED_PASSWORD = "Miracle2026!";
export const NEW_PLAYER_PASSWORD = "SoloFlow2026!";
/** A real, 1x1 PNG. The proof upload checks the file signature, not the picture. */
export const PROOF_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

const prisma = new PrismaClient();

export function playerEmail(index: number): string {
  return `solo-player-${String(index).padStart(2, "0")}@miraclefc.gg`;
}

export async function soloEvent() {
  return prisma.event.findUniqueOrThrow({ where: { slug: SOLO_EVENT_SLUG }, select: { id: true, name: true, organizerUserId: true } });
}

/**
 * Puts the solo event back to the moment right after seeding: open, no registrations, no draw, no teams, no
 * competition. Deleting the event takes everything under it along; the seed then makes it again under the same
 * id, because the server caches event pages by address and a new id would leave them pointing at nothing.
 */
export async function resetSoloEvent() {
  const previous = await prisma.event.findUnique({ where: { slug: SOLO_EVENT_SLUG }, select: { id: true } });
  await prisma.event.deleteMany({ where: { slug: SOLO_EVENT_SLUG } });
  const organizer = await prisma.user.findUniqueOrThrow({ where: { email: "organizer-a@miraclefc.gg" }, select: { id: true } });
  await seedSoloTournament(prisma, organizer.id, { eventId: previous?.id });
  return (await soloEvent()).id;
}

export type SeedRegistration = {
  email: string;
  ign: string;
  uid: string;
  position: "Goalkeeper" | "Forward" | "Midfielder" | "Defender";
  status: "queued" | "pending_payment" | "pending_review" | "approved";
  createdAt: Date;
  willingCaptain?: boolean;
};

/** Adds one registration the way the registration service would leave it, without driving the UI for every player. */
export async function addRegistration(eventId: string, input: SeedRegistration) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email }, select: { id: true } });
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { whatsapp: true } });
  const holdsSlot = input.status !== "queued";
  return prisma.soloRegistration.create({
    data: {
      eventId,
      userId: user.id,
      ign: input.ign,
      uid: input.uid,
      uidKey: input.uid.toLowerCase(),
      primaryPosition: input.position,
      slotGroup: input.position === "Goalkeeper" ? "required" : "open",
      willingCaptain: input.willingCaptain ?? false,
      whatsapp: profile.whatsapp,
      status: input.status,
      slotHeldAt: holdsSlot ? input.createdAt : null,
      expiresAt: input.status === "pending_payment" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      proofImageUrl: input.status === "pending_review" || input.status === "approved" ? "/e2e/release-payment-proof.png" : null,
      approvedAt: input.status === "approved" ? input.createdAt : null,
      createdAt: input.createdAt,
    },
  });
}

export async function loginAsSoloPlayer(page: Page, email: string, password = SEED_PASSWORD, locale: "id" | "en" = "id") {
  await loginWithCredentials(page, { locale, email, password, destination: /\/(id|en)\/(player|events|captain)/ });
}

export async function soloRegistrationStatus(eventId: string, email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return prisma.soloRegistration.findUnique({ where: { eventId_userId: { eventId, userId: user.id } }, select: { status: true, proofImageUrl: true, expiresAt: true } });
}

export { prisma as soloDb };
