import { prisma } from "@/lib/platform/db";

/** The WhatsApp number a player gave at sign-up, to prefill forms. Undefined when the account has no profile. */
export async function getPlayerWhatsapp(userId: string): Promise<string | undefined> {
  const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { whatsapp: true } });
  return profile?.whatsapp;
}
