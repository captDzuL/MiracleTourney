// Platform settings: game and mode config, platform and organizer profiles, global payment settings.
// Moved out of platform/repository.ts without changes (refactor PR 2.1).

import { gameModes, games, getGameConfig, getGameModeConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { PAYMENT_SETTINGS_ID } from "@/lib/platform/shared/constants";
import { mapPaymentSettings } from "@/lib/platform/shared/mappers";
import type { AppUser, Event, PaymentSettings } from "@/lib/platform/types";

/** Returns the static list of all supported games from config. */
export function getAllGames() {
  return games;
}

/** Returns the static list of all supported game modes from config. */
export function getGameModes() {
  return gameModes;
}

/** Resolves the game definition for a given event. Throws if the game ID is not found in config. */
export function getGameForEvent(event: Event) {
  return getGameConfig(event.gameId);
}

/** Resolves the game mode definition for a given event. Throws if the mode ID is not found in config. */
export function getModeForEvent(event: Event) {
  return getGameModeConfig(event.gameModeId);
}

export type PlatformProfileSummary = {
  displayName: string;
  contactChannel: string;
  contactValue: string;
};

export async function getPlatformProfile(): Promise<PlatformProfileSummary | null> {
  return prisma.platformProfile.findUnique({
    where: { id: "global" },
    select: { displayName: true, contactChannel: true, contactValue: true },
  });
}

export async function updatePlatformProfile(input: PlatformProfileSummary): Promise<void> {
  await prisma.platformProfile.upsert({
    where: { id: "global" },
    update: input,
    create: { id: "global", ...input },
  });
}

export type OrganizerProfileSummary = {
  organizationName: string;
  contactChannel: string;
  contactValue: string;
  verified: boolean;
};

export async function getOrganizerProfileForUser(user: AppUser): Promise<OrganizerProfileSummary | null> {
  if (user.role !== "organizer") return null;
  const profile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
    select: { organizationName: true, contactChannel: true, contactValue: true, verified: true },
  });
  return profile;
}

export async function updateOrganizerProfileForUser(
  user: AppUser,
  input: { organizationName: string; contactChannel: string; contactValue: string },
): Promise<void> {
  if (user.role !== "organizer") throw new Error("Not authorized");
  await prisma.$transaction(async (tx) => {
    await tx.organizerProfile.upsert({
      where: { userId: user.id },
      update: input,
      create: { userId: user.id, ...input },
    });
    await tx.event.updateMany({
      where: { organizerUserId: user.id },
      data: { organizerName: input.organizationName },
    });
  });
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const row = await prisma.paymentSettings.findUnique({ where: { id: PAYMENT_SETTINGS_ID } });
  return mapPaymentSettings(row);
}

export async function updatePaymentSettings(input: { qrisImageUrl?: string | null; instructions?: string | null }): Promise<PaymentSettings> {
  const data = {
    qrisImageUrl: input.qrisImageUrl ?? null,
    instructions: input.instructions ?? null,
  };
  const row = await prisma.paymentSettings.upsert({
    where: { id: PAYMENT_SETTINGS_ID },
    update: data,
    create: { id: PAYMENT_SETTINGS_ID, ...data },
  });
  return mapPaymentSettings(row);
}
