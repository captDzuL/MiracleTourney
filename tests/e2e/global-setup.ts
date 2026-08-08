import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

export default async function globalSetup() {
  // Sync schema and seed users
  execSync("pnpm prisma db push --accept-data-loss --skip-generate", { stdio: "inherit" });
  execSync("pnpm prisma db seed", { stdio: "inherit" });

  const prisma = new PrismaClient();
  try {
    // Clean up test-created events to prevent unique constraint violations on re-run
    await prisma.event.deleteMany({ where: { slug: { in: ["flashpeak-24", "flashpeak-open-league", "admin-match-e2e"] } } });

    // Ensure kuroko-summer-cup exists with Draft status
    await prisma.event.upsert({
      where: { slug: "kuroko-summer-cup" },
      update: { status: "Draft" },
      create: {
        name: "Kuroko Street Rival Summer Cup",
        slug: "kuroko-summer-cup",
        status: "Draft",
        format: "Single Elimination",
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        participantCap: 8,
        description: "Demo tournament for E2E tests",
        registrationWindow: "Open",
        startsAt: "2026-09-01",
        venue: "Online",
      },
    });

    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "kuroko-summer-cup" } });

    // Remove match results and teams from previous runs to start clean
    await prisma.match.deleteMany({ where: { eventId: event.id } });
    await prisma.team.deleteMany({ where: { eventId: event.id } });

    // Create two teams for bracket projection (so admin page shows a manageable match)
    await prisma.team.createMany({
      data: [
        { eventId: event.id, name: "Seirin", tag: "SRI", logoText: "SRI", source: "demo" },
        { eventId: event.id, name: "Shutoku", tag: "STK", logoText: "STK", source: "demo" },
      ],
    });

    // Give the seed captain a team so the captain dashboard shows content
    const captainUser = await prisma.user.findUnique({ where: { email: "captain@miraclefc.gg" } });
    if (captainUser) {
      await prisma.team.upsert({
        where: { eventId_tag: { eventId: event.id, tag: "RKA" } },
        update: {},
        create: {
          eventId: event.id,
          captainId: captainUser.id,
          name: "Rakuzan",
          tag: "RKA",
          logoText: "RKA",
          source: "demo",
        },
      });

      const captainTeam = await prisma.team.findUniqueOrThrow({
        where: { eventId_tag: { eventId: event.id, tag: "RKA" } },
      });

      // Add a player to the captain's team for dashboard visibility
      const existingPlayer = await prisma.player.findFirst({
        where: { teamId: captainTeam.id, displayName: "Akashi Seijuro" },
      });
      if (!existingPlayer) {
        await prisma.player.create({
          data: {
            teamId: captainTeam.id,
            eventId: event.id,
            displayName: "Akashi Seijuro",
            nickname: "Akashi",
            position: "Point Guard",
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
