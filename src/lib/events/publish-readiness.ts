import { z } from "zod";
import { prisma } from "@/lib/platform/db";

const requiredText = z.string().trim().min(1);
const participantCap = z.union([z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(32), z.literal(64), z.literal(128), z.literal(256)]);
export const publishEventSchema = z.object({
  slug: requiredText, name: requiredText, description: requiredText, gameId: requiredText, gameModeId: requiredText,
  format: z.enum(["Single Elimination", "League"]), participantCap,
  registrationOpensAt: z.date(), registrationClosesAt: z.date(), eventStartsAt: z.date(),
  timezone: requiredText, venue: requiredText, venueAddress: z.string().trim().nullable().optional(),
  registrationFeeRequired: z.boolean(), registrationFeeAmount: z.number().int().nonnegative().nullable().optional(),
});

export type PublishReadinessItem = { code: string; field: string; section: "identity" | "schedule" | "registration" | "organizer" };
export type PublishReadiness = { ready: boolean; incomplete: PublishReadinessItem[]; notices: Array<{ code: "schedule_overlap"; severity: "info" }> };
export type EventPublicationActor = { id: string; role: "organizer" | "admin" | "platform_admin" };

const organizerContactSchema = z.object({
  organizer: z.object({ organizerProfile: z.object({ contactChannel: z.string(), contactValue: z.string() }).nullable().optional() }).nullable().optional(),
}).passthrough();
const crossFieldSchema = z.object({
  registrationOpensAt: z.unknown().optional(),
  registrationClosesAt: z.unknown().optional(),
  registrationFeeRequired: z.unknown().optional(),
  registrationFeeAmount: z.unknown().optional(),
}).passthrough();
const fieldSections: Record<string, PublishReadinessItem["section"]> = {
  slug: "identity", name: "identity", description: "identity", gameId: "identity", gameModeId: "identity",
  format: "schedule", participantCap: "schedule", registrationOpensAt: "schedule",
  registrationClosesAt: "schedule", eventStartsAt: "schedule", timezone: "schedule", venue: "schedule",
  registrationFeeRequired: "registration", registrationFeeAmount: "registration",
};

export function evaluatePublishReadiness(event: unknown, options: { hasScheduleOverlap?: boolean } = {}): PublishReadiness {
  const parsed = publishEventSchema.safeParse(event);
  const incomplete: PublishReadinessItem[] = [];
  const seen = new Set<string>();
  const addItem = (code: string, field: string, section: PublishReadinessItem["section"]) => {
    const key = field + ":" + code;
    if (seen.has(key)) return;
    seen.add(key);
    incomplete.push({ code, field, section });
  };

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "event");
      addItem(field, field, fieldSections[field] ?? "identity");
    }
  }

  const crossFields = crossFieldSchema.safeParse(event);
  if (crossFields.success) {
    const values = crossFields.data;
    if (
      values.registrationOpensAt instanceof Date &&
      values.registrationClosesAt instanceof Date &&
      values.registrationOpensAt >= values.registrationClosesAt
    ) {
      addItem("registration_date_order", "registrationClosesAt", "schedule");
    }
    if (
      values.registrationFeeRequired === true &&
      (values.registrationFeeAmount === null || values.registrationFeeAmount === undefined)
    ) {
      addItem("registration_fee_amount", "registrationFeeAmount", "registration");
    }
  }

  const contactResult = organizerContactSchema.safeParse(event);
  const contact = contactResult.success ? contactResult.data.organizer?.organizerProfile : null;
  if (!contact?.contactChannel.trim() || !contact.contactValue.trim()) addItem("organizer_contact", "organizerContact", "organizer");

  return { ready: incomplete.length === 0, incomplete, notices: options.hasScheduleOverlap ? [{ code: "schedule_overlap", severity: "info" }] : [] };
}

const publishCandidateSelect = {
  id: true, slug: true, status: true, organizerUserId: true, draftRevision: true,
  name: true, description: true, gameId: true, gameModeId: true, format: true, participantCap: true,
  registrationOpensAt: true, registrationClosesAt: true, eventStartsAt: true, timezone: true, venue: true,
  venueAddress: true, registrationFeeRequired: true, registrationFeeAmount: true,
  organizer: { select: { organizerProfile: { select: { contactChannel: true, contactValue: true } } } },
} as const;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
function sameWibDayBounds(date: Date) {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const start = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function publishEvent(eventId: string, actor: EventPublicationActor) {
  return prisma.$transaction(async (tx) => {
    const organizerScope = actor.role === "organizer" ? { organizerUserId: actor.id } : {};
    const event = await tx.event.findUnique({ where: { id: eventId, ...organizerScope }, select: publishCandidateSelect });
    if (!event) return { status: "not_found" as const };
    if (event.status === "Published") return { status: "already_published" as const, slug: event.slug };
    if (event.status !== "Draft") return { status: "not_draft" as const, slug: event.slug };

    const parsedCandidate = publishEventSchema.safeParse(event);
    let hasScheduleOverlap = false;
    if (parsedCandidate.success) {
      const { start, end } = sameWibDayBounds(parsedCandidate.data.eventStartsAt);
      hasScheduleOverlap = Boolean(await tx.event.findFirst({
        where: { id: { not: eventId }, eventStartsAt: { gte: start, lt: end } }, select: { id: true },
      }));
    }
    const readiness = evaluatePublishReadiness(event, { hasScheduleOverlap });
    if (!readiness.ready) return { status: "blocked" as const, readiness };

    const publishedAt = new Date();
    const transition = await tx.event.updateMany({
      where: { id: eventId, ...organizerScope, status: "Draft", draftRevision: event.draftRevision },
      data: { status: "Published", publishedAt },
    });
    if (transition.count !== 1) return { status: "conflict" as const };

    await tx.eventPreviewToken.updateMany({ where: { eventId, revokedAt: null }, data: { revokedAt: publishedAt } });
    return { status: "published" as const, slug: event.slug, publishedAt, readiness };
  });
}
