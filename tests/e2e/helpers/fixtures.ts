import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function prepareAdminMatchEvent() {
  const suffix = randomUUID().slice(0, 8);
  const slug = `admin-match-e2e-${suffix}`;

  const event = await prisma.event.create({
    data: {
      slug,
      name: `Admin Match E2E ${suffix}`,
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

/**
 * Creates a completed match with two teams + players so admin can input player stats.
 * Returns IDs needed to navigate directly to the stats editor.
 *
 * Use a unique slug per test group to avoid 60s unstable_cache stale-read across tests.
 */
export async function prepareCompletedMatchWithPlayers(slug = "admin-stats-e2e") {

  const event = await prisma.event.upsert({
    where: { slug },
    update: {
      status: "Ongoing",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
    },
    create: {
      slug,
      name: "Admin Stats E2E",
      status: "Ongoing",
      format: "Single Elimination",
      participantCap: 8,
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      description: "E2E test event for admin player stat entry",
      registrationWindow: "Open",
      startsAt: "2026-09-01",
      venue: "Online",
    },
  });

  // Clean slate for each run
  await prisma.playerStat.deleteMany({ where: { match: { eventId: event.id } } });
  await prisma.statSubmission.deleteMany({ where: { eventId: event.id } });
  await prisma.matchGame.deleteMany({ where: { match: { eventId: event.id } } });
  await prisma.match.deleteMany({ where: { eventId: event.id } });
  await prisma.player.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({ where: { eventId: event.id } });

  const homeTeam = await prisma.team.create({
    data: { eventId: event.id, name: "Stats Home", tag: "SHM", logoText: "SHM", source: "e2e" },
  });
  const awayTeam = await prisma.team.create({
    data: { eventId: event.id, name: "Stats Away", tag: "SAW", logoText: "SAW", source: "e2e" },
  });

  // Create players for both teams (3 each — enough for a 5v5 game test)
  const homePlayers = await Promise.all(
    ["Alpha", "Beta", "Gamma"].map((name) =>
      prisma.player.create({
        data: {
          eventId: event.id,
          teamId: homeTeam.id,
          displayName: name,
          nickname: name.toLowerCase(),
          position: "Forward",
        },
      }),
    ),
  );
  const awayPlayers = await Promise.all(
    ["Delta", "Echo", "Foxtrot"].map((name) =>
      prisma.player.create({
        data: {
          eventId: event.id,
          teamId: awayTeam.id,
          displayName: name,
          nickname: name.toLowerCase(),
          position: "Guard",
        },
      }),
    ),
  );

  const match = await prisma.match.create({
    data: {
      eventId: event.id,
      roundLabel: "Final",
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: 2,
      awayScore: 1,
      status: "Completed",
      winnerTeamId: homeTeam.id,
      round: 1,
      slot: 1,
    },
  });

  return {
    eventId: event.id,
    matchId: match.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homePlayers,
    awayPlayers,
    slug,
  };
}
