import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createCompetitionOperations, type OperationCommand } from "../src/lib/tournament/operations";
import { TOURNAMENT_FORMAT_PRESETS } from "../src/lib/tournament/formats/types";

const prisma = new PrismaClient();
const isTestMode = process.argv.includes("--test");

function teamTag(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

async function seedPlatformProfile() {
  await prisma.platformProfile.upsert({
    where: { id: "global" },
    update: { displayName: "Miracle", contactChannel: "WhatsApp", contactValue: "+62 811 0000 0000" },
    create: { id: "global", displayName: "Miracle", contactChannel: "WhatsApp", contactValue: "+62 811 0000 0000" },
  });
}
function demoTeamId(eventSlug: string, index: number) {
  return `team-${eventSlug}-${index + 1}`;
}

const seededOngoingSchedule = {
  timezone: "Asia/Jakarta",
  eventWindow: { start: "2026-08-12T02:00:00.000Z", end: "2026-08-13T02:00:00.000Z" },
  matchDurationMinutes: 45,
  bufferMinutes: 10,
  minimumRestMinutes: 15,
  rooms: ["Flashpeak Arena A", "Flashpeak Arena B"],
};

const seededFinishedSchedule = {
  ...seededOngoingSchedule,
  eventWindow: { start: "2026-06-28T02:00:00.000Z", end: "2026-06-28T10:00:00.000Z" },
  rooms: ["Flashpeak Arena Final A", "Flashpeak Arena Final B"],
};

const legacyFlashpeakMatchIds = new Set([
  "match-flash-o-1", "match-flash-o-2", "match-flash-o-3", "match-flash-o-4",
  "match-flash-f-1", "match-flash-f-2", "match-flash-f-3", "match-flash-f-4",
  "match-flash-f-5", "match-flash-f-6", "match-flash-f-7",
]);

async function clearLegacyFlashpeakFixture(eventId: string) {
  if (await prisma.competitionPhase.count({ where: { eventId } })) return;

  const legacyMatches = await prisma.match.findMany({
    where: { eventId, id: { in: [...legacyFlashpeakMatchIds] } },
    select: { id: true },
  });
  if (!legacyMatches.length) return;

  const allMatches = await prisma.match.findMany({ where: { eventId }, select: { id: true } });
  if (allMatches.some((match) => !legacyFlashpeakMatchIds.has(match.id))) {
    throw new Error(`Refusing to replace non-fixture matches while upgrading Flashpeak event ${eventId}`);
  }

  const ids = legacyMatches.map((match) => match.id);
  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { eventId, id: { in: ids } } });
    await tx.scheduleRevision.deleteMany({ where: { eventId, idempotencyKey: { startsWith: "seed-v3-flashpeak-" } } });
    await tx.competitionAuditLog.deleteMany({ where: { eventId, idempotencyKey: { startsWith: "seed-v3-flashpeak-" } } });
    await tx.event.update({ where: { id: eventId }, data: { publishedScheduleVersion: null } });
  });
}

function createSeedOperationRunner(eventId: string, organizerId: string) {
  const operations = createCompetitionOperations(prisma);
  const actor = { id: organizerId, role: "organizer" };
  return async (idempotencyKey: string, command: OperationCommand) => {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { competitionVersion: true },
    });
    return operations.execute({
      eventId,
      actor,
      expectedVersion: event.competitionVersion,
      idempotencyKey,
      command,
    });
  };
}

async function ensureAuthoritativeCompetition(
  eventId: string,
  organizerId: string,
  teams: Array<{ id: string }>,
  namespace: string,
  schedule?: typeof seededOngoingSchedule,
) {
  await clearLegacyFlashpeakFixture(eventId);
  const run = createSeedOperationRunner(eventId, organizerId);
  let event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true, publishedScheduleVersion: true },
  });
  let phase = await prisma.competitionPhase.findFirst({ where: { eventId, sequence: 1 } });

  if (!phase || phase.status === "draft") {
    if (event.status !== "Registration Closed") {
      await prisma.event.update({ where: { id: eventId }, data: { status: "Registration Closed" } });
    }
    if (!phase) {
      await run(`seed-v3-${namespace}-drawing`, {
        kind: "drawing_save",
        config: TOURNAMENT_FORMAT_PRESETS.singleElimination,
        teams: teams.map((team, index) => ({ id: team.id, seed: index + 1 })),
      });
    }
    await run(`seed-v3-${namespace}-drawing-publish`, { kind: "drawing_publish" });
  }

  if (!schedule) return run;

  await prisma.event.update({ where: { id: eventId }, data: { status: "Ongoing" } });
  event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true, publishedScheduleVersion: true },
  });
  if (event.publishedScheduleVersion == null) {
    const draft = await run(`seed-v3-${namespace}-schedule-save`, { kind: "schedule_save", input: schedule });
    const revisionId = draft.resourceId
      ?? (await prisma.scheduleRevision.findFirst({
        where: { eventId, idempotencyKey: `seed-v3-${namespace}-schedule-save` },
        select: { id: true },
      }))?.id;
    if (!revisionId) throw new Error(`Seeded ${namespace} schedule draft did not return a revision id`);
    await run(`seed-v3-${namespace}-schedule-publish`, { kind: "schedule_publish", revisionId });
  }
  return run;
}

async function seedAuthoritativeDrawingCompetition(eventId: string, organizerId: string, teams: Array<{ id: string }>) {
  await ensureAuthoritativeCompetition(eventId, organizerId, teams, "flashpeak-revision-closed");
}

async function seedAuthoritativeOngoingCompetition(eventId: string, organizerId: string, teams: Array<{ id: string }>) {
  const run = await ensureAuthoritativeCompetition(eventId, organizerId, teams, "flashpeak-rising", seededOngoingSchedule);
  const liveMatch = await prisma.match.findFirst({ where: { eventId, status: "Live" }, select: { id: true } });
  if (!liveMatch) {
    const playableMatch = await prisma.match.findFirst({
      where: { eventId, status: "Scheduled", homeTeamId: { not: "" }, awayTeamId: { not: "" } },
      orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!playableMatch) throw new Error("Seeded ongoing competition has no playable match to start");
    await run("seed-v3-flashpeak-rising-match-start", {
      kind: "match_start",
      matchId: playableMatch.id,
      reason: "Deterministic public V3 showcase fixture",
    });
  }
}

async function seedAuthoritativeFinishedCompetition(eventId: string, organizerId: string, teams: Array<{ id: string }>) {
  const existingCompletion = await prisma.tournamentCompletion.findUnique({ where: { eventId }, select: { id: true } });
  if (existingCompletion) return;

  const run = await ensureAuthoritativeCompetition(eventId, organizerId, teams, "flashpeak-champions", seededFinishedSchedule);
  const phase = await prisma.competitionPhase.findFirstOrThrow({ where: { eventId, sequence: 1 } });

  for (;;) {
    const match = await prisma.match.findFirst({
      where: { eventId, status: { in: ["Scheduled", "Live"] }, homeTeamId: { not: "" }, awayTeamId: { not: "" } },
      orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }],
      select: { id: true, status: true, scheduleMetadata: true },
    });
    if (!match) break;
    const graphMatch = (match.scheduleMetadata as { graphMatch?: { bestOf?: number } } | null)?.graphMatch;
    const bestOf = graphMatch?.bestOf ?? 1;
    if (match.status === "Scheduled") {
      await run(`seed-v3-flashpeak-champions-match-start-${match.id}`, {
        kind: "match_start",
        matchId: match.id,
        reason: "Deterministic public V3 completed fixture",
      });
    }
    const gameCount = bestOf === 1 ? 1 : Math.ceil(bestOf / 2);
    await run(`seed-v3-flashpeak-champions-result-${match.id}`, {
      kind: "result_submit",
      matchId: match.id,
      games: Array.from({ length: gameCount }, (_, index) => ({ gameNumber: index + 1, homeScore: 2, awayScore: 0 })),
    });
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { competitionVersion: true } });
  await prisma.$transaction(async (tx) => {
    await tx.competitionPhase.update({ where: { id: phase.id }, data: { status: "completed" } });
    await tx.event.update({ where: { id: eventId }, data: { status: "Finished" } });
    await tx.tournamentCompletion.create({
      data: {
        eventId,
        status: "completed",
        format: "single_elimination",
        sourceSnapshot: { eventId, version: event.competitionVersion },
        completedByUserId: organizerId,
      },
    });
  });
}

async function seedTest() {
  const adminPasswordHash = await bcrypt.hash("TestAdmin123!", 10);
  const captainPasswordHash = await bcrypt.hash("TestCaptain123!", 10);

  await prisma.user.upsert({
    where: { email: "test-admin@miraclefc.gg" },
    update: { name: "Test Admin", role: "platform_admin", passwordHash: adminPasswordHash },
    create: { email: "test-admin@miraclefc.gg", name: "Test Admin", role: "platform_admin", passwordHash: adminPasswordHash },
  });

  const organizerPasswordHash = await bcrypt.hash("TestOrganizer123!", 10);
  const organizer = await prisma.user.upsert({
    where: { email: "test-organizer@miraclefc.gg" },
    update: { name: "Test Organizer", role: "organizer", passwordHash: organizerPasswordHash },
    create: { email: "test-organizer@miraclefc.gg", name: "Test Organizer", role: "organizer", passwordHash: organizerPasswordHash },
  });
  await prisma.organizerProfile.upsert({
    where: { userId: organizer.id },
    update: { organizationName: "Test Organizer", contactChannel: "WhatsApp", contactValue: "+62 811 0000 0001" },
    create: { userId: organizer.id, organizationName: "Test Organizer", contactChannel: "WhatsApp", contactValue: "+62 811 0000 0001" },
  });
  await seedPlatformProfile();
  const captain = await prisma.user.upsert({
    where: { email: "test-captain@miraclefc.gg" },
    update: { name: "Test Captain", role: "captain", passwordHash: captainPasswordHash },
    create: { email: "test-captain@miraclefc.gg", name: "Test Captain", role: "captain", passwordHash: captainPasswordHash },
  });

  const event = await prisma.event.upsert({
    where: { slug: "test-event-e2e" },
    update: { name: "E2E Test Event", status: "Ongoing" },
    create: {
      slug: "test-event-e2e",
      name: "E2E Test Event",
      description: "Deterministic test event for E2E tests.",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 8,
      registrationWindow: "2026-01-01 - 2026-01-07",
      startsAt: "2026-01-08",
      venue: "Online",
    },
  });

  const teamA = await prisma.team.upsert({
    where: { eventId_tag: { eventId: event.id, tag: "TMA" } },
    update: {},
    create: { id: "test-team-a", eventId: event.id, captainId: captain.id, name: "Test Team Alpha", logoText: "TM", tag: "TMA", source: "demo" },
  });

  const teamB = await prisma.team.upsert({
    where: { eventId_tag: { eventId: event.id, tag: "TMB" } },
    update: {},
    create: { id: "test-team-b", eventId: event.id, captainId: captain.id, name: "Test Team Beta", logoText: "TB", tag: "TMB", source: "demo" },
  });

  await prisma.match.upsert({
    where: { id: "test-match-1" },
    update: {},
    create: {
      id: "test-match-1",
      eventId: event.id,
      roundLabel: "Semifinal",
      homeTeamId: teamA.id,
      awayTeamId: teamB.id,
      homeScore: 0,
      awayScore: 0,
      status: "Scheduled",
      round: 1,
      slot: 1,
    },
  });

  console.log("Seeded deterministic test data for E2E tests.");
}

async function main() {
  if (isTestMode) {
    await seedTest();
    return;
  }

  await seedPlatformProfile();

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

  await prisma.organizerProfile.upsert({
    where: { userId: organizerA.id },
    update: { organizationName: "Flashpeak Organizer", contactChannel: "WhatsApp", contactValue: "+62 812 0000 0000" },
    create: { userId: organizerA.id, organizationName: "Flashpeak Organizer", contactChannel: "WhatsApp", contactValue: "+62 812 0000 0000" },
  });

  const kurokoSummerEvent = await prisma.event.upsert({
    where: { slug: "kuroko-summer-cup" },
    update: {
      name: "Kuroko Street Rival Summer Cup", description: "Deterministic draft event used by legacy registration and bracket E2E.",
      gameId: "game-kuroko", gameModeId: "mode-kuroko-3v3", format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      status: "Draft", participantCap: 8, registrationWindow: "October 1, 2026 - October 7, 2026", startsAt: "October 10, 2026",
      registrationOpensAt: new Date("2026-10-01T02:00:00.000Z"), registrationClosesAt: new Date("2026-10-07T14:00:00.000Z"), eventStartsAt: new Date("2026-10-10T03:00:00.000Z"),
      timezone: "Asia/Jakarta", venue: "Miracle Test Arena", registrationFeeRequired: false, registrationFeeAmount: null,
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
    },
    create: {
      slug: "kuroko-summer-cup", name: "Kuroko Street Rival Summer Cup", description: "Deterministic draft event used by legacy registration and bracket E2E.",
      gameId: "game-kuroko", gameModeId: "mode-kuroko-3v3", format: "Single Elimination", formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination,
      status: "Draft", participantCap: 8, registrationWindow: "October 1, 2026 - October 7, 2026", startsAt: "October 10, 2026",
      registrationOpensAt: new Date("2026-10-01T02:00:00.000Z"), registrationClosesAt: new Date("2026-10-07T14:00:00.000Z"), eventStartsAt: new Date("2026-10-10T03:00:00.000Z"),
      timezone: "Asia/Jakarta", venue: "Miracle Test Arena", registrationFeeRequired: false,
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
    },
  });
  for (const index of Array.from({ length: 8 }, (_, value) => value + 1)) {
    const tag = `KS${index}`;
    await prisma.team.upsert({
      where: { eventId_tag: { eventId: kurokoSummerEvent.id, tag } },
      update: { name: `Kuroko Seed Team ${index}`, captainId: captain.id, source: "e2e" },
      create: { eventId: kurokoSummerEvent.id, name: `Kuroko Seed Team ${index}`, tag, logoText: tag, captainId: captain.id, source: "e2e" },
    });
  }

  await prisma.event.upsert({
    where: { slug: "flashpeak-revision-published" },
    update: {
      name: "Flashpeak Revision Published", description: "Original public description for revision E2E.",
      gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
      formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination, status: "Published", participantCap: 16,
      registrationWindow: "September 10, 2026 - September 20, 2026", startsAt: "September 28, 2026",
      registrationOpensAt: new Date("2026-09-10T02:00:00.000Z"), registrationClosesAt: new Date("2026-09-20T14:00:00.000Z"),
      eventStartsAt: new Date("2026-09-28T03:00:00.000Z"), timezone: "Asia/Jakarta", venue: "Revision Arena",
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
      registrationFeeRequired: false, registrationFeeAmount: null, prizePoolLabel: "Original prize",
    },
    create: {
      slug: "flashpeak-revision-published", name: "Flashpeak Revision Published",
      description: "Original public description for revision E2E.",
      gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
      formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination, status: "Published", participantCap: 16,
      registrationWindow: "September 10, 2026 - September 20, 2026", startsAt: "September 28, 2026",
      registrationOpensAt: new Date("2026-09-10T02:00:00.000Z"), registrationClosesAt: new Date("2026-09-20T14:00:00.000Z"),
      eventStartsAt: new Date("2026-09-28T03:00:00.000Z"), timezone: "Asia/Jakarta", venue: "Revision Arena",
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
      registrationFeeRequired: false, prizePoolLabel: "Original prize",
    },
  });

  const flashpeakDrawingEvent = await prisma.event.upsert({
    where: { slug: "flashpeak-revision-closed" },
    update: {
      name: "Flashpeak Registration Closed", description: "Closed registration revision fixture.",
      gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
      formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination, status: "Registration Closed", participantCap: 16,
      registrationWindow: "September 1, 2026 - September 5, 2026", startsAt: "September 15, 2026",
      registrationOpensAt: new Date("2026-09-01T02:00:00.000Z"), registrationClosesAt: new Date("2026-09-05T14:00:00.000Z"),
      eventStartsAt: new Date("2026-09-15T03:00:00.000Z"), timezone: "Asia/Jakarta", venue: "Closed Arena",
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
      registrationFeeRequired: true, registrationFeeAmount: 50000,
    },
    create: {
      slug: "flashpeak-revision-closed", name: "Flashpeak Registration Closed",
      description: "Closed registration revision fixture.",
      gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "Single Elimination",
      formatConfig: TOURNAMENT_FORMAT_PRESETS.singleElimination, status: "Registration Closed", participantCap: 16,
      registrationWindow: "September 1, 2026 - September 5, 2026", startsAt: "September 15, 2026",
      registrationOpensAt: new Date("2026-09-01T02:00:00.000Z"), registrationClosesAt: new Date("2026-09-05T14:00:00.000Z"),
      eventStartsAt: new Date("2026-09-15T03:00:00.000Z"), timezone: "Asia/Jakarta", venue: "Closed Arena",
      organizerUserId: organizerA.id, organizerName: "Flashpeak Organizer", organizerVerified: true,
      registrationFeeRequired: true, registrationFeeAmount: 50000,
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
      status: "Registration Closed",
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
      status: "Registration Closed",
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
      event: flashpeakDrawingEvent,
      names: ["Closed Circuit", "Bracket Bloom", "Seeded Sparks", "Draw District"],
      positions: ["Forward", "Midfielder", "Defender", "Goalkeeper"],
    },
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

  await seedAuthoritativeDrawingCompetition(
    flashpeakDrawingEvent.id,
    organizerA.id,
    teamsByEventSlug.get(flashpeakDrawingEvent.slug) ?? [],
  );
  await seedAuthoritativeOngoingCompetition(
    flashpeakOngoingEvent.id,
    organizerA.id,
    teamsByEventSlug.get(flashpeakOngoingEvent.slug) ?? [],
  );
  await seedAuthoritativeFinishedCompetition(
    flashpeakFinishedEvent.id,
    organizerA.id,
    teamsByEventSlug.get(flashpeakFinishedEvent.slug) ?? [],
  );

  const matchSeeds = [
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
      where: {
        eventId_type_recipientKind_recipientId_version: {
          eventId: flashpeakFinishedEvent.id,
          type: "champion",
          recipientKind: "team",
          recipientId: flashpeakChampion.id,
          version: 1,
        },
      },
      update: {
        teamId: flashpeakChampion.id,
        recipientName: flashpeakChampion.name,
        imageUrl: "/certificates/demo-flashpeak-champions-32.png",
      },
      create: {
        eventId: flashpeakFinishedEvent.id,
        teamId: flashpeakChampion.id,
        type: "champion",
        recipientKind: "team",
        recipientId: flashpeakChampion.id,
        recipientName: flashpeakChampion.name,
        version: 1,
        imageUrl: "/certificates/demo-flashpeak-champions-32.png",
      },
    });
  }

  if (mlbbChampion) {
    await prisma.certificate.upsert({
      where: {
        eventId_type_recipientKind_recipientId_version: {
          eventId: mlbbFinishedEvent.id,
          type: "champion",
          recipientKind: "team",
          recipientId: mlbbChampion.id,
          version: 1,
        },
      },
      update: {
        teamId: mlbbChampion.id,
        recipientName: mlbbChampion.name,
        imageUrl: "/certificates/demo-mlbb-dawn-finals-16.png",
      },
      create: {
        eventId: mlbbFinishedEvent.id,
        teamId: mlbbChampion.id,
        type: "champion",
        recipientKind: "team",
        recipientId: mlbbChampion.id,
        recipientName: mlbbChampion.name,
        version: 1,
        imageUrl: "/certificates/demo-mlbb-dawn-finals-16.png",
      },
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
