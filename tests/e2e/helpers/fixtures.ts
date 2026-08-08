import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function prepareAdminMatchEvent() {
  const slug = "admin-match-e2e";

  const event = await prisma.event.upsert({
    where: { slug },
    update: {
      status: "Published",
      format: "Single Elimination",
      participantCap: 8,
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      description: "Deterministic admin match result test event",
      registrationWindow: "Open",
      startsAt: "2026-09-01",
      venue: "Online",
    },
    create: {
      slug,
      name: "Admin Match E2E",
      status: "Published",
      format: "Single Elimination",
      participantCap: 8,
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      description: "Deterministic admin match result test event",
      registrationWindow: "Open",
      startsAt: "2026-09-01",
      venue: "Online",
    },
  });

  await prisma.matchGame.deleteMany({ where: { match: { eventId: event.id } } });
  await prisma.match.deleteMany({ where: { eventId: event.id } });
  await prisma.eventRoundConfig.deleteMany({ where: { eventId: event.id } });
  await prisma.player.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({ where: { eventId: event.id } });

  await prisma.team.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      eventId: event.id,
      name: `Admin Team ${index + 1}`,
      tag: `A${index + 1}`,
      logoText: `A${index + 1}`,
      source: "e2e",
    })),
  });

  return { eventId: event.id, slug };
}
