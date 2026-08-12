import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? "Miracle2026!",
    12,
  );
  const captainPasswordHash = await bcrypt.hash(
    process.env.SEED_CAPTAIN_PASSWORD ?? "Miracle2026!",
    12,
  );
  const organizerPasswordHash = await bcrypt.hash(
    process.env.SEED_ORGANIZER_PASSWORD ?? "Miracle2026!",
    12,
  );

  await prisma.user.upsert({
    where: { email: "admin@miraclefc.gg" },
    update: { name: "League Commissioner", role: "platform_admin", passwordHash: adminPasswordHash },
    create: {
      email: "admin@miraclefc.gg",
      name: "League Commissioner",
      role: "platform_admin",
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "captain@miraclefc.gg" },
    update: { name: "Riko Aida", role: "captain", passwordHash: captainPasswordHash },
    create: {
      email: "captain@miraclefc.gg",
      name: "Riko Aida",
      role: "captain",
      passwordHash: captainPasswordHash,
    },
  });

  const organizerA = await prisma.user.upsert({
    where: { email: "organizer-a@miraclefc.gg" },
    update: { name: "Flashpeak Organizer", role: "organizer", passwordHash: organizerPasswordHash },
    create: {
      email: "organizer-a@miraclefc.gg",
      name: "Flashpeak Organizer",
      role: "organizer",
      passwordHash: organizerPasswordHash,
    },
  });

  const organizerB = await prisma.user.upsert({
    where: { email: "organizer-b@miraclefc.gg" },
    update: { name: "Mobile Legends Organizer", role: "organizer", passwordHash: organizerPasswordHash },
    create: {
      email: "organizer-b@miraclefc.gg",
      name: "Mobile Legends Organizer",
      role: "organizer",
      passwordHash: organizerPasswordHash,
    },
  });

  await prisma.event.upsert({
    where: { slug: "flashpeak-champions-32" },
    update: {
      name: "Flashpeak Champions 32",
      description:
        "Finished 5v5 Flashpeak showcase for testing organizer-owned completed events, result states, and public finished cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 32,
      registrationWindow: "June 1, 2026 - June 20, 2026",
      startsAt: "June 28, 2026",
      venue: "Flashpeak Arena",
      organizerUserId: organizerA.id,
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp2.000.000 + Champion Proof",
      registrationFeeLabel: "Gratis",
    },
    create: {
      slug: "flashpeak-champions-32",
      name: "Flashpeak Champions 32",
      description:
        "Finished 5v5 Flashpeak showcase for testing organizer-owned completed events, result states, and public finished cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 32,
      registrationWindow: "June 1, 2026 - June 20, 2026",
      startsAt: "June 28, 2026",
      venue: "Flashpeak Arena",
      organizerUserId: organizerA.id,
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp2.000.000 + Champion Proof",
      registrationFeeLabel: "Gratis",
    },
  });

  await prisma.event.upsert({
    where: { slug: "flashpeak-rising-64" },
    update: {
      name: "Flashpeak Rising 64",
      description:
        "Ongoing large-cap Flashpeak event for testing organizer dashboard isolation, live status, and scalable event cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 64,
      registrationWindow: "August 1, 2026 - August 9, 2026",
      startsAt: "August 12, 2026",
      venue: "Flashpeak Match Hub",
      organizerUserId: organizerA.id,
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp5.000.000",
      registrationFeeLabel: "Rp25.000 / team",
    },
    create: {
      slug: "flashpeak-rising-64",
      name: "Flashpeak Rising 64",
      description:
        "Ongoing large-cap Flashpeak event for testing organizer dashboard isolation, live status, and scalable event cards.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 64,
      registrationWindow: "August 1, 2026 - August 9, 2026",
      startsAt: "August 12, 2026",
      venue: "Flashpeak Match Hub",
      organizerUserId: organizerA.id,
      organizerName: "Flashpeak Organizer",
      organizerVerified: true,
      prizePoolLabel: "Rp5.000.000",
      registrationFeeLabel: "Rp25.000 / team",
    },
  });

  await prisma.event.upsert({
    where: { slug: "mlbb-dawn-finals-16" },
    update: {
      name: "MLBB Dawn Finals 16",
      description:
        "Finished Mobile Legends bracket for testing organizer-owned completed events with a smaller 16-team cap.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 16,
      registrationWindow: "May 5, 2026 - May 18, 2026",
      startsAt: "May 25, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: organizerB.id,
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp1.500.000",
      registrationFeeLabel: "Gratis",
    },
    create: {
      slug: "mlbb-dawn-finals-16",
      name: "MLBB Dawn Finals 16",
      description:
        "Finished Mobile Legends bracket for testing organizer-owned completed events with a smaller 16-team cap.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Finished",
      participantCap: 16,
      registrationWindow: "May 5, 2026 - May 18, 2026",
      startsAt: "May 25, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: organizerB.id,
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp1.500.000",
      registrationFeeLabel: "Gratis",
    },
  });

  await prisma.event.upsert({
    where: { slug: "mlbb-rank-war-32" },
    update: {
      name: "MLBB Rank War 32",
      description:
        "Ongoing Mobile Legends event for testing organizer-specific dashboard views and public live tournament discovery.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 32,
      registrationWindow: "August 3, 2026 - August 11, 2026",
      startsAt: "August 12, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: organizerB.id,
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp3.000.000",
      registrationFeeLabel: "Rp20.000 / team",
    },
    create: {
      slug: "mlbb-rank-war-32",
      name: "MLBB Rank War 32",
      description:
        "Ongoing Mobile Legends event for testing organizer-specific dashboard views and public live tournament discovery.",
      gameId: "game-mobile-legends",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 32,
      registrationWindow: "August 3, 2026 - August 11, 2026",
      startsAt: "August 12, 2026",
      venue: "Land of Dawn Online",
      organizerUserId: organizerB.id,
      organizerName: "Mobile Legends Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp3.000.000",
      registrationFeeLabel: "Rp20.000 / team",
    },
  });

  console.log("Seeded admin, captain, organizer users, and organizer demo events.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
