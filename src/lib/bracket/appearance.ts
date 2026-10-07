import type { BracketAppearance } from "./types";
import { prisma } from "@/lib/platform/db";

export const DEFAULT_BRACKET_APPEARANCE: BracketAppearance = { backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 };
const appearanceSelect = { backgroundUrl: true, positionX: true, positionY: true, overlay: true } as const;
type Settings = Pick<BracketAppearance, "positionX" | "positionY" | "overlay">;

export async function getBracketAppearance(eventId: string): Promise<BracketAppearance> {
  const row = await prisma.eventBracketAppearance.findUnique({ where: { eventId }, select: appearanceSelect });
  return row ?? { ...DEFAULT_BRACKET_APPEARANCE };
}

/** backgroundUrl is only supplied by the server route after a validated upload, or null for reset. */
export async function saveBracketAppearance(eventId: string, settings: Settings, backgroundUrl?: string | null): Promise<BracketAppearance> {
  const background = backgroundUrl === undefined ? {} : { backgroundUrl };
  return prisma.eventBracketAppearance.upsert({
    where: { eventId },
    create: { eventId, ...settings, ...background },
    update: { ...settings, ...background },
    select: appearanceSelect,
  });
}
