import { prisma } from "@/lib/platform/db";

// Small reads the solo server actions need before they can check access or choose where to send the visitor.
// They live here because a server action may not talk to the database itself.

/** The slug of an event, or null when there is no such event. */
export async function findEventSlug(eventId: string): Promise<{ slug: string } | null> {
  return prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
}

/** The event a draw belongs to, so the access check runs against the right event. */
export async function findSoloDrawEvent(drawId: string): Promise<{ eventId: string } | null> {
  return prisma.soloDraw.findUnique({ where: { id: drawId }, select: { eventId: true } });
}

/** The event a registration belongs to, so the access check runs against the right event. */
export async function findSoloRegistrationEvent(registrationId: string): Promise<{ eventId: string } | null> {
  return prisma.soloRegistration.findUnique({ where: { id: registrationId }, select: { eventId: true } });
}

/** A player's own registration with the slug of its event. Somebody else's registration is not found. */
export async function findOwnSoloRegistration(
  registrationId: string,
  userId: string,
): Promise<{ eventId: string; event: { slug: string } } | null> {
  return prisma.soloRegistration.findFirst({
    where: { id: registrationId, userId },
    select: { eventId: true, event: { select: { slug: true } } },
  });
}
