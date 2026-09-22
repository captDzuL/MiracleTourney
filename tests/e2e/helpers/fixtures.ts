import { createHash, randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prepareCompletionFixture } from "./completion";

const prisma = new PrismaClient();
export const RELEASE_FIXTURE_NOW = new Date("2026-09-13T04:00:00.000Z");
const RELEASE_CERTIFICATE_LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARElEQVRYhe3XMREAUQxCQfwbw0pc8F3cNVukz0wIPJLefp1YoE5wRDhvGEZUVnzCaOI4gKSQ7EDpYHkUk6pmp5zuax08ZFa4l4EKcmAAAAAASUVORK5CYII=",
  "base64",
);

/**
 * The completed lifecycle fixture stays authoritative for competition and
 * certificates. Registration, import, payment, and QRIS use a separate fresh
 * event so its roster remains mutable through the intake journey.
 */
export async function prepareOrganizerReleaseFixture(namespace = randomUUID().slice(0, 12), mode: "on" | "off" = "on") {
  if (!/^[a-z0-9-]{1,48}$/.test(namespace)) throw new Error("Invalid fixture namespace");
  const base = await prepareCompletionFixture("single_elimination", namespace, { pendingFirstPlayerMatch: true });
  const expiresAt = new Date(RELEASE_FIXTURE_NOW.getTime() + 9 * 24 * 60 * 60 * 1000);
  const importSourceLabel = `release-${namespace}-ui.csv`;
  const deterministicRegistrationEventId = `e2e-release-registration-${namespace}`;
  const importCaptainEmail = `release-import-${deterministicRegistrationEventId}@example.test`;
  const certificateLogoStorageKey = `certificate-assets/${base.id}-logo.png`;
  const certificateLogoPath = path.resolve(process.cwd(), "public", certificateLogoStorageKey);
  let certificateLogoFileCreated = false;
  const cleanupCertificateLogo = async () => {
    if (!certificateLogoFileCreated) return;
    await unlink(certificateLogoPath).catch(() => undefined);
    certificateLogoFileCreated = false;
  };
  let registrationEventId: string | undefined;
  let createdCaptainId: string | undefined;
  let statSubmissionId: string | undefined;
  try {
    const registrationEvent = await prisma.event.create({
      data: {
        id: deterministicRegistrationEventId,
        slug: deterministicRegistrationEventId,
        name: "Release Registration Fixture",
        description: "Deterministic organizer release registration fixture",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        organizerUserId: base.actor.id,
        organizerName: "Completion Organizer",
        status: "Published",
        format: "Single Elimination",
        participantCap: 8,
        registrationWindow: "Open",
        registrationOpensAt: new Date(RELEASE_FIXTURE_NOW.getTime() - 24 * 60 * 60 * 1000),
        registrationClosesAt: expiresAt,
        startsAt: "2026-09-22",
        eventStartsAt: new Date(RELEASE_FIXTURE_NOW.getTime() + 10 * 24 * 60 * 60 * 1000),
        timezone: "Asia/Jakarta",
        venue: "Release Registration Arena",
        publishedAt: RELEASE_FIXTURE_NOW,
        publishedRevision: 1,
      },
      select: { id: true, slug: true },
    });
    registrationEventId = registrationEvent.id;
    const captain = await prisma.user.findUnique({ where: { email: "captain@miraclefc.gg" }, select: { id: true } })
      ?? await prisma.user.create({
        data: {
          email: `release-captain-${namespace}@example.test`,
          name: "Release Fixture Captain",
          role: "captain",
          passwordHash: await bcrypt.hash("FixtureOnly2026!", 10),
        },
        select: { id: true },
      });
    if (captain.id !== (await prisma.user.findUnique({ where: { email: "captain@miraclefc.gg" }, select: { id: true } }))?.id) {
      createdCaptainId = captain.id;
    }
    await prisma.event.update({
      where: { id: base.id },
      data: {
        status: "Ongoing",
        participantCap: 8,
        registrationFeeRequired: true,
        registrationFeeAmount: 25000,
        registrationFeeLabel: "Rp25.000 / team",
        publishedRevision: 3,
      },
    });
    await prisma.eventPaymentSettings.upsert({
      where: { eventId: registrationEvent.id },
      update: {
        qrisImageUrl: "/e2e/release-qris.png",
        instructions: "Scan the deterministic release QRIS fixture.",
        status: "draft",
        version: 1,
        publishedAt: null,
        updatedById: base.actor.id,
      },
      create: {
        eventId: registrationEvent.id,
        qrisImageUrl: "/e2e/release-qris.png",
        instructions: "Scan the deterministic release QRIS fixture.",
        status: "draft",
        version: 1,
        publishedAt: null,
        updatedById: base.actor.id,
      },
    });
    const paymentRequest = await prisma.teamRegistrationRequest.create({
      data: {
        eventId: registrationEvent.id,
        captainId: captain.id,
        teamId: null,
        teamName: "Release Fixture Team",
        teamTag: "RFT",
        status: "pending_review",
        proofImageUrl: "/e2e/release-payment-proof.png",
        expiresAt,
      },
    });
    await prisma.registrationImportProfile.create({
      data: {
        eventId: registrationEvent.id,
        createdById: base.actor.id,
        sourceKind: "csv",
        sourceLabel: importSourceLabel,
        worksheetName: null,
        headerSignature: `release-${namespace}`,
        mapping: { columns: { teamName: 0, teamTag: 1 }, players: [] } satisfies Prisma.InputJsonValue,
      },
    });
    const firstPlayer = base.players[0];
    const releaseMatchId = base.pendingFirstPlayerMatchId;
    if (!releaseMatchId) throw new Error("Release fixture requires a pending match for the first player");
    const releaseMatchPhaseId = base.graph.matches.find((match) => match.id === releaseMatchId)?.phaseId;
    if (!releaseMatchPhaseId) throw new Error("Release fixture requires the exact phase for the pending match");
    if (mode === "on") {
      await prisma.playerStat.deleteMany({ where: { matchId: releaseMatchId } });
    }
    await prisma.match.update({
      where: { id: releaseMatchId },
      data: {
        homeScore: 0,
        awayScore: 0,
        status: "Scheduled",
        scheduleStatus: "confirmed",
        winnerTeamId: null,
        resultVersion: 0,
        resultSnapshot: Prisma.JsonNull,
        resultConfirmedAt: null,
        actualStartedAt: null,
        actualEndedAt: null,
      },
    });
    if (mode === "on") {
      const statSubmission = await prisma.statSubmission.create({
        data: {
          matchId: releaseMatchId,
          eventId: base.id,
          teamId: firstPlayer.teamId,
          submittedBy: `release-captain-${namespace}`,
          status: "pending",
          stats: { [firstPlayer.id]: { scores: [8.5], goal: 2, assist: 1, passing: 3, defense: 2 } } satisfies Prisma.InputJsonValue,
          submittedAt: RELEASE_FIXTURE_NOW,
        },
        select: { id: true },
      });
      statSubmissionId = statSubmission.id;
    }
    await mkdir(path.dirname(certificateLogoPath), { recursive: true });
    await writeFile(certificateLogoPath, RELEASE_CERTIFICATE_LOGO_PNG);
    certificateLogoFileCreated = true;
    const certificateLogoStats = await stat(certificateLogoPath);
    const certificateLogoSha256 = createHash("sha256").update(RELEASE_CERTIFICATE_LOGO_PNG).digest("hex");
    const logoAsset = await prisma.eventVisualAsset.create({
      data: {
        eventId: base.id,
        createdByUserId: base.actor.id,
        source: "organizer_upload",
        status: "approved",
        purpose: "certificate_team_logo",
        url: `/certificate-assets/${base.id}-logo.png`,
        mimeType: "image/png",
        width: 32,
        height: 32,
        byteSize: certificateLogoStats.size,
        storageProvider: "local",
        storageKey: certificateLogoStorageKey,
        contentSha256: certificateLogoSha256,
        rightsAttestedAt: RELEASE_FIXTURE_NOW,
        approvedAt: RELEASE_FIXTURE_NOW,
      },
    });
    const releaseFixture = {
      ...base,
      registrationEventId: registrationEvent.id,
      importCaptainEmail,
      paymentRequestId: paymentRequest.id,
      importBatchId: undefined as string | undefined,
      importSourceLabel,
      qrisVersion: 1,
      statSubmissionId,
      releaseMatchId,
      releasePlayerId: firstPlayer.id,
      releasePlayerTeamId: firstPlayer.teamId,
      certificateLogoAssetId: logoAsset.id,
      fixtureNow: RELEASE_FIXTURE_NOW.toISOString(),
      captureImportBatchId: async () => {
        const batch = await prisma.registrationImportBatch.findFirst({
          where: { eventId: registrationEvent.id, sourceLabel: importSourceLabel },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        releaseFixture.importBatchId = batch?.id;
        return releaseFixture.importBatchId;
      },
      readState: async () => {
        const [event, registrationEventState, paymentRequestState, importBatchState, qris, match, completion, certificates] = await Promise.all([
          prisma.event.findUnique({ where: { id: base.id }, select: { id: true, status: true, publishedRevision: true, organizerUserId: true } }),
          prisma.event.findUnique({ where: { id: registrationEvent.id }, select: { id: true, status: true, organizerUserId: true } }),
          prisma.teamRegistrationRequest.findUnique({ where: { id: paymentRequest.id }, select: { id: true, eventId: true, status: true, proofImageUrl: true } }),
          releaseFixture.importBatchId
            ? prisma.registrationImportBatch.findUnique({ where: { id: releaseFixture.importBatchId }, select: { id: true, eventId: true, status: true, committedAt: true } })
            : prisma.registrationImportBatch.findFirst({ where: { eventId: registrationEvent.id, sourceLabel: importSourceLabel }, orderBy: { createdAt: "desc" }, select: { id: true, eventId: true, status: true, committedAt: true } }),
          prisma.eventPaymentSettings.findUnique({ where: { eventId: registrationEvent.id }, select: { eventId: true, version: true, status: true } }),
          prisma.match.findUnique({
            where: { id: releaseMatchId },
            select: {
              id: true,
              eventId: true,
              homeTeamId: true,
              awayTeamId: true,
              homeScore: true,
              awayScore: true,
              status: true,
              scheduleStatus: true,
              scheduledAt: true,
              scheduledEndsAt: true,
              scheduleRoom: true,
              actualStartedAt: true,
              resultVersion: true,
              resultRevisions: { select: { id: true, version: true } },
              playerStats: { select: { id: true, source: true } },
              statSubmissions: { select: { id: true, status: true, reviewedAt: true } },
            },
          }),
          prisma.tournamentCompletion.findUnique({ where: { eventId: base.id }, select: { id: true, status: true, certificateRevision: true, completedAt: true } }),
          prisma.certificate.findMany({ where: { eventId: base.id }, orderBy: [{ type: "asc" }, { version: "asc" }], select: { id: true, type: true, version: true, status: true, verificationCode: true } }),
        ]);
        const [certificateCount, publicationCount, latestPublication] = await Promise.all([
          prisma.certificate.count({ where: { eventId: base.id } }),
          prisma.certificatePublication.count({ where: { eventId: base.id } }),
          prisma.certificatePublication.findFirst({ where: { eventId: base.id }, orderBy: { version: "desc" }, select: { version: true } }),
        ]);
        return { event, registrationEvent: registrationEventState, paymentRequest: paymentRequestState, importBatch: importBatchState, qris, match, completion, certificates, certificateCount, publicationCount, publicationVersion: latestPublication?.version ?? 0 };
      },
      resetMatchForReleaseJourney: async () => {
        await prisma.competitionPhase.update({
          where: { id: releaseMatchPhaseId, eventId: base.id },
          data: { status: "active" },
        });
        await prisma.match.update({
          where: { id: releaseMatchId },
          data: {
            status: "Live",
            scheduleStatus: "live",
            scheduledAt: RELEASE_FIXTURE_NOW,
            scheduledEndsAt: new Date(RELEASE_FIXTURE_NOW.getTime() + 30 * 60 * 1000),
            scheduleRoom: "Release Arena",
            actualStartedAt: RELEASE_FIXTURE_NOW,
            actualEndedAt: null,
          },
        });
      },
      cleanup: async () => {
        await cleanupCertificateLogo();
        await prisma.event.deleteMany({ where: { id: registrationEvent.id, slug: registrationEvent.slug } });
        await prisma.user.deleteMany({ where: { email: importCaptainEmail } });
        await base.cleanup();
        if (createdCaptainId) await prisma.user.delete({ where: { id: createdCaptainId } }).catch(() => undefined);
      },
    };
    return releaseFixture;
  } catch (error) {
    await cleanupCertificateLogo();
    if (registrationEventId) {
      await prisma.event.deleteMany({ where: { id: registrationEventId } });
      await prisma.user.deleteMany({ where: { email: importCaptainEmail } });
    }
    await base.cleanup();
    if (createdCaptainId) await prisma.user.delete({ where: { id: createdCaptainId } }).catch(() => undefined);
    throw error;
  }
}

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
