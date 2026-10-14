import { prisma } from "@/lib/platform/db";

/** The WhatsApp number a player gave at sign-up, to prefill forms. Undefined when the account has no profile. */
export async function getPlayerWhatsapp(userId: string): Promise<string | undefined> {
  const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { whatsapp: true } });
  return profile?.whatsapp;
}

/** Saves the number, replacing the old one. It only fills in the next sign-up: past registrations keep the number they were made with. */
export async function savePlayerWhatsapp(userId: string, whatsapp: string): Promise<void> {
  await prisma.playerProfile.upsert({ where: { userId }, create: { userId, whatsapp }, update: { whatsapp } });
}
