import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function teamTag(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function demoTeamId(eventSlug: string, index: number) {
  return `team-${eventSlug}-${index + 1}`;
}

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

  const captain = await prisma.user.upsert({
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

  const flashpeakFinishedEvent = await prisma.event.upsert({
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

  const flashpeakOngoingEvent = await prisma.event.upsert({
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

  const mlbbFinishedEvent = await prisma.event.upsert({
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

  const mlbbOngoingEvent = await prisma.event.upsert({
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

  const eventTeamSets = [
    {
      event: flashpeakFinishedEvent,
      names: [
        "Summit Strikers",
        "Miracle Five",
        "Northwind FC",
        "Pulse United",
        "Velvet Rangers",
        "Cinder Squad",
        "Orbit Kings",
        "Harbor Wolves",
      ],
      positions: ["Forward", "Midfielder", "Defender", "Goalkeeper"],
    },
    {
      event: flashpeakOngoingEvent,
      names: [
        "Rising Comets",
        "Thunder Street",
        "Vortex FC",
        "Scorch United",
        "Blitz Yard",
        "Cobalt Eleven",
        "Solaris Crew",
        "Metro Lions",
      ],
      positions: ["Forward", "Midfielder", "Defender", "Goalkeeper"],
    },
    {
      event: mlbbFinishedEvent,
      names: [
        "Dawn Breakers",
        "Royal Turtle",
        "Midnight Retribution",
        "Gold Lane Union",
        "Crimson Minions",
        "Lord Hunters",
        "Abyss Roamers",
        "Base Invaders",
      ],
      positions: ["EXP Lane", "Jungler", "Mid Lane", "Gold Lane", "Roamer"],
    },
    {
      event: mlbbOngoingEvent,
      names: [
        "Rank Warriors",
        "Savage Five",
        "Blue Buff Club",
        "Mythic Guard",
        "River Ambush",
        "Turret Breakers",
        "Jungle Tempo",
        "Lane Kings",
      ],
      positions: ["EXP Lane", "Jungler", "Mid Lane", "Gold Lane", "Roamer"],
    },
  ];

  const teamsByEventSlug = new Map<string, Awaited<ReturnType<typeof prisma.team.upsert>>[]>();
  const playersByTeamId = new Map<string, Awaited<ReturnType<typeof prisma.player.upsert>>>();

  for (const { event, names, positions } of eventTeamSets) {
    const teams = [];

    for (const [index, name] of names.entries()) {
      const tag = teamTag(name);
      const team = await prisma.team.upsert({
        where: { eventId_tag: { eventId: event.id, tag } },
        update: {
          name,
          logoText: tag.slice(0, 2),
          captainId: captain.id,
          source: "demo",
        },
        create: {
          id: demoTeamId(event.slug, index),
          eventId: event.id,
          captainId: captain.id,
          name,
          logoText: tag.slice(0, 2),
          tag,
          source: "demo",
        },
      });
      const player = await prisma.player.upsert({
        where: { id: `player-${team.id.replace(/^team-/, "")}` },
        update: {
          teamId: team.id,
          eventId: event.id,
          displayName: `${team.name} Ace`,
          nickname: team.tag,
          position: positions[index % positions.length],
          jerseyNumber: index + 1,
        },
        create: {
          id: `player-${team.id.replace(/^team-/, "")}`,
          teamId: team.id,
          eventId: event.id,
          displayName: `${team.name} Ace`,
          nickname: team.tag,
          position: positions[index % positions.length],
          jerseyNumber: index + 1,
        },
      });

      teams.push(team);
      playersByTeamId.set(team.id, player);
    }

    teamsByEventSlug.set(event.slug, teams);
  }

  const matchSeeds = [
    { id: "match-flash-f-1", event: flashpeakFinishedEvent, roundLabel: "Quarterfinal", teams: [0, 7], score: [3, 1], status: "Completed", round: 1, slot: 1 },
    { id: "match-flash-f-2", event: flashpeakFinishedEvent, roundLabel: "Quarterfinal", teams: [3, 4], score: [2, 0], status: "Completed", round: 1, slot: 2 },
    { id: "match-flash-f-3", event: flashpeakFinishedEvent, roundLabel: "Quarterfinal", teams: [1, 6], score: [1, 2], status: "Completed", round: 1, slot: 3 },
    { id: "match-flash-f-4", event: flashpeakFinishedEvent, roundLabel: "Quarterfinal", teams: [2, 5], score: [4, 2], status: "Completed", round: 1, slot: 4 },
    { id: "match-flash-f-5", event: flashpeakFinishedEvent, roundLabel: "Semifinal", teams: [0, 3], score: [2, 1], status: "Completed", round: 2, slot: 1 },
    { id: "match-flash-f-6", event: flashpeakFinishedEvent, roundLabel: "Semifinal", teams: [6, 2], score: [1, 3], status: "Completed", round: 2, slot: 2 },
    { id: "match-flash-f-7", event: flashpeakFinishedEvent, roundLabel: "Final", teams: [0, 2], score: [3, 2], status: "Completed", round: 3, slot: 1 },
    { id: "match-flash-o-1", event: flashpeakOngoingEvent, roundLabel: "Round 1", teams: [0, 7], score: [2, 1], status: "Completed", round: 1, slot: 1 },
    { id: "match-flash-o-2", event: flashpeakOngoingEvent, roundLabel: "Round 1", teams: [3, 4], score: [0, 2], status: "Completed", round: 1, slot: 2 },
    { id: "match-flash-o-3", event: flashpeakOngoingEvent, roundLabel: "Round 1", teams: [1, 6], score: [0, 0], status: "Scheduled", round: 1, slot: 3, scheduledLabel: "Tonight 20:00 WIB" },
    { id: "match-flash-o-4", event: flashpeakOngoingEvent, roundLabel: "Round 1", teams: [2, 5], score: [0, 0], status: "Scheduled", round: 1, slot: 4, scheduledLabel: "Tonight 21:00 WIB" },
    { id: "match-mlbb-f-1", event: mlbbFinishedEvent, roundLabel: "Quarterfinal", teams: [0, 7], score: [2, 0], status: "Completed", round: 1, slot: 1 },
    { id: "match-mlbb-f-2", event: mlbbFinishedEvent, roundLabel: "Quarterfinal", teams: [3, 4], score: [2, 1], status: "Completed", round: 1, slot: 2 },
    { id: "match-mlbb-f-3", event: mlbbFinishedEvent, roundLabel: "Quarterfinal", teams: [1, 6], score: [1, 2], status: "Completed", round: 1, slot: 3 },
    { id: "match-mlbb-f-4", event: mlbbFinishedEvent, roundLabel: "Quarterfinal", teams: [2, 5], score: [0, 2], status: "Completed", round: 1, slot: 4 },
    { id: "match-mlbb-f-5", event: mlbbFinishedEvent, roundLabel: "Semifinal", teams: [0, 3], score: [2, 1], status: "Completed", round: 2, slot: 1 },
    { id: "match-mlbb-f-6", event: mlbbFinishedEvent, roundLabel: "Semifinal", teams: [6, 5], score: [1, 2], status: "Completed", round: 2, slot: 2 },
    { id: "match-mlbb-f-7", event: mlbbFinishedEvent, roundLabel: "Final", teams: [0, 5], score: [3, 2], status: "Completed", round: 3, slot: 1 },
    { id: "match-mlbb-o-1", event: mlbbOngoingEvent, roundLabel: "Round 1", teams: [0, 7], score: [2, 1], status: "Completed", round: 1, slot: 1 },
    { id: "match-mlbb-o-2", event: mlbbOngoingEvent, roundLabel: "Round 1", teams: [3, 4], score: [1, 2], status: "Completed", round: 1, slot: 2 },
    { id: "match-mlbb-o-3", event: mlbbOngoingEvent, roundLabel: "Round 1", teams: [1, 6], score: [0, 0], status: "Scheduled", round: 1, slot: 3, scheduledLabel: "Tonight 19:30 WIB" },
    { id: "match-mlbb-o-4", event: mlbbOngoingEvent, roundLabel: "Round 1", teams: [2, 5], score: [0, 0], status: "Scheduled", round: 1, slot: 4, scheduledLabel: "Tonight 20:30 WIB" },
  ];

  for (const seed of matchSeeds) {
    const teams = teamsByEventSlug.get(seed.event.slug) ?? [];
    const homeTeam = teams[seed.teams[0]];
    const awayTeam = teams[seed.teams[1]];
    const winnerTeamId = seed.status === "Completed"
      ? seed.score[0] > seed.score[1] ? homeTeam.id : awayTeam.id
      : null;
    const match = await prisma.match.upsert({
      where: { id: seed.id },
      update: {
        eventId: seed.event.id,
        roundLabel: seed.roundLabel,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: seed.score[0],
        awayScore: seed.score[1],
        status: seed.status,
        round: seed.round,
        slot: seed.slot,
        winnerTeamId,
        scheduledLabel: seed.scheduledLabel ?? null,
      },
      create: {
        id: seed.id,
        eventId: seed.event.id,
        roundLabel: seed.roundLabel,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: seed.score[0],
        awayScore: seed.score[1],
        status: seed.status,
        round: seed.round,
        slot: seed.slot,
        winnerTeamId,
        scheduledLabel: seed.scheduledLabel ?? null,
      },
    });

    if (match.status !== "Completed") continue;

    for (const [index, team] of [homeTeam, awayTeam].entries()) {
      const player = playersByTeamId.get(team.id);
      if (!player) continue;

      const isMlbb = seed.event.gameId === "game-mobile-legends";
      await prisma.playerStat.upsert({
        where: { matchId_playerId: { matchId: match.id, playerId: player.id } },
        update: {
          playerName: player.displayName,
          teamId: team.id,
          position: player.position,
          gameSlug: isMlbb ? "mobile-legends" : "flashpeak",
          stats: isMlbb
            ? { kills: team.id === winnerTeamId ? 9 + index : 4 + index, assists: 6 + index, deaths: team.id === winnerTeamId ? 2 : 5, gold: 12000 + index * 700, damage: 28000 + index * 3000 }
            : { goals: team.id === winnerTeamId ? 2 + index : index, assists: 1 + index, tackles: 3 + index, blocks: index },
        },
        create: {
          id: `stat-${match.id}-${player.id}`,
          matchId: match.id,
          playerId: player.id,
          playerName: player.displayName,
          teamId: team.id,
          position: player.position,
          gameSlug: isMlbb ? "mobile-legends" : "flashpeak",
          stats: isMlbb
            ? { kills: team.id === winnerTeamId ? 9 + index : 4 + index, assists: 6 + index, deaths: team.id === winnerTeamId ? 2 : 5, gold: 12000 + index * 700, damage: 28000 + index * 3000 }
            : { goals: team.id === winnerTeamId ? 2 + index : index, assists: 1 + index, tackles: 3 + index, blocks: index },
        },
      });
    }
  }

  const flashpeakChampion = teamsByEventSlug.get(flashpeakFinishedEvent.slug)?.[0];
  const mlbbChampion = teamsByEventSlug.get(mlbbFinishedEvent.slug)?.[0];

  if (flashpeakChampion) {
    await prisma.certificate.upsert({
      where: { eventId: flashpeakFinishedEvent.id },
      update: { teamId: flashpeakChampion.id, imageUrl: "/certificates/demo-flashpeak-champions-32.png" },
      create: { eventId: flashpeakFinishedEvent.id, teamId: flashpeakChampion.id, imageUrl: "/certificates/demo-flashpeak-champions-32.png" },
    });
  }

  if (mlbbChampion) {
    await prisma.certificate.upsert({
      where: { eventId: mlbbFinishedEvent.id },
      update: { teamId: mlbbChampion.id, imageUrl: "/certificates/demo-mlbb-dawn-finals-16.png" },
      create: { eventId: mlbbFinishedEvent.id, teamId: mlbbChampion.id, imageUrl: "/certificates/demo-mlbb-dawn-finals-16.png" },
    });
  }

  console.log("Seeded admin, captain, organizer users, and organizer demo events.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
