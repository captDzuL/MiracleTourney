import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { normalizeWhatsapp } from "../src/lib/player/profile";
import { TOURNAMENT_FORMAT_PRESETS } from "../src/lib/tournament/formats/types";

/** The solo event the end-to-end tests drive, and the accounts that join it. */
export const SOLO_SEED_EVENT_SLUG = "flashpeak-solo-cup";
export const SOLO_SEED_PLAYER_COUNT = 14;
/** The QRIS the event shows. The file is a stand-in; the tests never scan it. */
const SOLO_SEED_QRIS_URL = "/e2e/release-qris.png";

export function soloSeedPlayerEmail(index: number): string {
  return `solo-player-${String(index).padStart(2, "0")}@miraclefc.gg`;
}

/**
 * Seeds one open solo event with a deliberately small quota (2 teams: 2 goalkeepers, 8 field players) and
 * a pool of player accounts to fill it. No registrations are created: the tests add the ones they need.
 * The password comes from SEED_PLAYER_PASSWORD, with the same development default the other seed accounts use.
 */
export async function seedSoloTournament(
  prisma: PrismaClient,
  organizerUserId: string,
  /** Only for a reset that must hand the event back under the id it had, so cached pages still point at it. */
  options: { eventId?: string } = {},
): Promise<void> {
  const passwordHash = await bcrypt.hash(process.env.SEED_PLAYER_PASSWORD ?? "Miracle2026!", 12);

  for (let index = 1; index <= SOLO_SEED_PLAYER_COUNT; index += 1) {
    const email = soloSeedPlayerEmail(index);
    const name = `Solo Player ${String(index).padStart(2, "0")}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: "player", passwordHash },
      create: { email, name, role: "player", passwordHash },
    });
    // Stored the way the sign-up form stores it: digits with the 62 country code.
    const whatsapp = normalizeWhatsapp(`0812 5500 ${String(1000 + index)}`);
    if (!whatsapp) throw new Error(`Seed player ${index} has an invalid WhatsApp number.`);
    await prisma.playerProfile.upsert({
      where: { userId: user.id },
      update: { whatsapp },
      create: { userId: user.id, whatsapp },
    });
  }

  // A window that stays open for any test clock; the cap is below the wizard's smallest choice on purpose.
  const data = {
    name: "Flashpeak Solo Cup",
    description: "Open solo event for the end-to-end tests. Players join one by one and the organizer draws the teams.",
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination,
    status: "Published",
    entryMode: "solo",
    participantCap: 2,
    registrationWindow: "January 1, 2026 - December 31, 2027",
    startsAt: "January 15, 2028",
    registrationOpensAt: new Date("2026-01-01T02:00:00.000Z"),
    registrationClosesAt: new Date("2027-12-31T14:00:00.000Z"),
    eventStartsAt: new Date("2028-01-15T03:00:00.000Z"),
    timezone: "Asia/Jakarta",
    venue: "Miracle Test Arena",
    organizerUserId,
    organizerName: "Flashpeak Organizer",
    organizerVerified: true,
    registrationFeeRequired: true,
    registrationFeeAmount: 25000,
    registrationFeeLabel: "Rp25.000 / pemain",
  };
  const event = await prisma.event.upsert({
    where: { slug: SOLO_SEED_EVENT_SLUG },
    update: data,
    create: { id: options.eventId, slug: SOLO_SEED_EVENT_SLUG, ...data },
  });

  const payment = {
    qrisImageUrl: SOLO_SEED_QRIS_URL,
    instructions: "Scan the QRIS, then upload the proof of payment.",
    status: "published",
    version: 1,
    publishedAt: new Date("2026-01-01T02:00:00.000Z"),
    updatedById: organizerUserId,
  };
  await prisma.eventPaymentSettings.upsert({
    where: { eventId: event.id },
    update: payment,
    create: { eventId: event.id, ...payment },
  });
}
