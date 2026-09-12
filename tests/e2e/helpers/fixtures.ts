import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function preparePublishedEventRevisionFixture() {
  const suffix = randomUUID().slice(0, 8);
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: "organizer-a@miraclefc.gg" },
    select: { id: true },
  });
  const originalSlug = `flashpeak-revision-${suffix}`;
  const name = `Flashpeak Revision ${suffix}`;
  const originalDescription = `Original public description for revision E2E ${suffix}.`;
  const event = await prisma.event.create({
    data: {
      slug: originalSlug,
      name,
      description: originalDescription,
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      formatConfig: {
        version: 1,
        kind: "single_elimination",
        bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
        thirdPlace: "none",
      } satisfies Prisma.InputJsonValue,
      status: "Published",
      participantCap: 16,
      registrationWindow: "September 10, 2026 - September 20, 2026",
      startsAt: "September 28, 2026",
      registrationOpensAt: new Date("2026-09-10T02:00:00.000Z"),
      registrationClosesAt: new Date("2026-09-20T14:00:00.000Z"),
      eventStartsAt: new Date("2026-09-28T03:00:00.000Z"),
      timezone: "Asia/Jakarta",
      venue: "Revision Arena",
      organizerUserId: organizer.id,
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      registrationFeeRequired: false,
      prizePoolLabel: "Original prize",
      publishedAt: new Date(),
    },
  });

  return {
    eventId: event.id,
    name,
    originalDescription,
    originalSlug,
    async cleanup() {
      await prisma.event.deleteMany({ where: { id: event.id } });
    },
  };
}

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


export async function prepareAdaptivePublicRegistrationFixtures() {
  const suffix = randomUUID().slice(0, 8);
  const password = "Adaptive2026!";
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const organizer = await prisma.user.create({
    data: {
      email: `org-${suffix}@example.test`,
      name: "Adaptive Organizer",
      role: "organizer",
      passwordHash,
      organizerProfile: {
        create: {
          organizationName: "Miracle Community",
          contactChannel: "WhatsApp",
          contactValue: "+62 812 3456 7890",
          verified: true,
          verifiedAt: now,
        },
      },
    },
  });
  const captain = await prisma.user.create({
    data: {
      email: `captain-${suffix}@example.test`,
      name: "Adaptive Captain",
      role: "captain",
      passwordHash,
    },
  });
  const paymentCaptain = await prisma.user.create({
    data: {
      email: `payment-${suffix}@example.test`,
      name: "Payment Captain",
      role: "captain",
      passwordHash,
    },
  });

  const formatConfig = {
    version: 1,
    kind: "single_elimination",
    bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
    thirdPlace: "none",
  } satisfies Prisma.InputJsonValue;

  async function createEvent(kind: "open" | "upcoming" | "closed" | "full") {
    const isUpcoming = kind === "upcoming";
    const isClosed = kind === "closed";
    return prisma.event.create({
      data: {
        slug: `adaptive-${kind}-${suffix}`,
        name: `Adaptive ${kind} ${suffix}`,
        description: "Turnamen komunitas dengan alur pendaftaran yang jelas dan terhubung.",
        logoUrl: "/logo/miracle-symbol-4096.png",
        gameImageUrl: "/logo/miracle-horizontal-2048.png",
        gameId: "game-mobile-legends",
        gameModeId: "mode-mlbb-5v5",
        format: "Single Elimination",
        formatConfig,
        status: isClosed ? "Registration Closed" : "Published",
        participantCap: 8,
        registrationWindow: "Structured",
        registrationOpensAt: new Date(now.getTime() + (isUpcoming ? day : -day)),
        registrationClosesAt: new Date(now.getTime() + (isClosed ? -day : 2 * day)),
        eventStartsAt: new Date(now.getTime() + 5 * day),
        startsAt: new Date(now.getTime() + 5 * day).toISOString(),
        timezone: "Asia/Jakarta",
        venue: "Discord Miracle Community",
        venueAddress: "Discord Miracle Community",
        organizerUserId: organizer.id,
        organizerName: "Miracle Community",
        organizerVerified: true,
        prizePoolLabel: "Rp5.000.000",
        registrationFeeRequired: true,
        registrationFeeAmount: 20000,
        registrationFeeLabel: "Rp20.000",
        publishedAt: now,
      },
    });
  }

  const open = await createEvent("open");
  const upcoming = await createEvent("upcoming");
  const closed = await createEvent("closed");
  const full = await createEvent("full");
  await prisma.team.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      eventId: full.id,
      name: `Full Team ${index + 1} ${suffix}`,
      tag: `F${index + 1}`,
      logoText: `F${index + 1}`,
      source: "e2e",
    })),
  });

  const paymentRequest = await prisma.teamRegistrationRequest.create({
    data: {
      eventId: open.id,
      captainId: paymentCaptain.id,
      teamName: `Proof Team ${suffix}`,
      teamTag: "PRF",
      status: "pending_payment",
      expiresAt: new Date(now.getTime() + day),
    },
  });

  const signupEmail = `signup-${suffix}@example.test`;
  const userIds = [organizer.id, captain.id, paymentCaptain.id];
  const eventIds = [open.id, upcoming.id, closed.id, full.id];

  return {
    suffix,
    password,
    organizer,
    captain,
    paymentCaptain,
    paymentRequest,
    signupEmail,
    events: { open, upcoming, closed, full },
    async cleanup() {
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.team.deleteMany({ where: { captainId: { in: userIds } } });
      await prisma.user.deleteMany({
        where: {
          OR: [
            { id: { in: userIds } },
            { email: signupEmail },
          ],
        },
      });
    },
  };
}
