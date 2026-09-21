import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    competitionPhase: {
      count: vi.fn(),
    },
    matchResultRevision: { findMany: vi.fn() },
    eventRoundConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    matchGame: {
      findMany: vi.fn(),
    },
    team: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    teamRegistrationRequest: {
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organizerProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    eventPreviewToken: {
      updateMany: vi.fn(),
    },
    eventEditRevision: {
      updateMany: vi.fn(),
    },
    eventSlugRedirect: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    eventVisualAsset: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    player: {
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registrationImportBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    eventPaymentSettings: {
      findUnique: vi.fn(),
    },
    registrationImportItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playerStat: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    statSubmission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    certificate: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tournamentCompletion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    competitionAuditLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  addPlayer,
  approveEventVisualAsset,
  assertUserCanManageEvent,
  assertCaptainCanSubmitStats,
  countAiVisualAttempts,
  createEventVisualAsset,
  deletePlayer,
  getEventRoundConfigs,
  getEventsByIds,
  getOpenRegistrationEventsForCaptain,
  approveTeamRegistrationRequest,
  createTeamRegistrationRequest,
  getCaptainRegistrationRequests,
  getCertificateByEvent,
  getCertificatesForEvents,
  getPaymentSettings,
  getLeaderboardForEvent,
  getFlashpeakLeaderboardForEvent,
  getPublicDiscoveryEvents,
  getManageableEventsForUser,
  getManageableEventDraft,
  getOrganizerProfileForUser,
  getMatchGamesForEvent,
  getMatchesForEvent,
  getOrganizerUserById,
  getOrganizerUsers,
  getPublicEventBySlug,
  getPublicVisibleBracketPreview,
  commitRegistrationImportBatch,
  getRegistrationRecordsForEvent,
  getRegistrationImportBatchesForEvent,
  getRegistrationImportHistoryForEvent,
  getPaymentReviewForEvent,
  getRegistrationImportEventContext,
  getRegistrationImportUsersByEmails,
  getTeamRegistrationRequestForEvent,
  getEventPaymentSettingsForManager,
  RegistrationMutationConflictError,
  getTeamCountsForEvents,
  getTeamsForEvent,
  getTeamsForEvents,
  listEventVisualAssets,
  rejectEventVisualAsset,
  setEventStatus,
  setEventVisualFocalPoint,
  registerTeam,
  recordCertificateSuccess,
  recordCertificateFailure,
  rejectTeamRegistrationRequest,
  updateTeamRegistrationProof,
  updateEventPublicInfo,
  updatePublishedEventSlugAsAdmin,
  updateOrganizerProfileForUser,
  updatePaymentSettings,
  updateTeamLogo,
  updatePlayer,
  adminWriteMatchPlayerStats,
  readEventMatchStatistics,
  approveStatSubmission,
  rejectStatSubmission,
  upsertStatSubmission,
} from "./repository";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };
const admin = { id: "admin-2", role: "admin" as const, email: "admin2@test.com", name: "Admin Two" };
const organizer = { id: "org-1", role: "organizer" as const, email: "org@test.com", name: "Organizer" };

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
});

const championCertificateRow = {
  id: "certificate-champion-v2",
  eventId: "event-1",
  teamId: "team-champion",
  type: "champion",
  recipientKind: "team",
  recipientId: "team-champion",
  recipientName: "Miracle Champions",
  version: 2,
  imageUrl: "/certificates/champion-v2.png",
  publishedUrl: "/certificates/champion-v2.png",
  publishedAt: new Date("2026-09-12T00:00:00.000Z"),
  status: "ready",
  lastError: null,
  attemptCount: 1,
  createdAt: new Date("2026-09-12T00:00:00.000Z"),
  updatedAt: new Date("2026-09-12T00:00:00.000Z"),
};

describe("legacy Champion certificate repository compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.tournamentCompletion.findFirst.mockResolvedValue(null);
  });

  it("returns the latest Champion team certificate for the event-level lookup", async () => {
    prisma.certificate.findFirst.mockResolvedValue(championCertificateRow);

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        type: "champion",
        recipientKind: "team",
        status: "ready",
        publishedUrl: { not: null },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  });

  it("keeps a newer unpublished Champion from hiding the latest published event certificate", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findFirst.mockImplementation(async (query: { where: Record<string, unknown> }) => {
      const publishedUrl = query.where.publishedUrl as { not?: unknown } | undefined;
      return query.where.status === "ready" && publishedUrl?.not === null
        ? championCertificateRow
        : unpublishedChampion;
    });

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
  });

  it("does not label an unpublished Champion as ready if persistence returns one", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findFirst.mockImplementation(async (query: { where: Record<string, unknown> }) => (
      query.where.status === "ready" ? null : unpublishedChampion
    ));

    await expect(getCertificateByEvent("event-1")).resolves.toMatchObject({
      id: "certificate-champion-v3",
      imageUrl: "",
      status: "failed",
    });
  });

  it("keeps one latest Champion per event in the batch API", async () => {
    prisma.certificate.findMany.mockResolvedValue([
      championCertificateRow,
      {
        ...championCertificateRow,
        id: "certificate-champion-v1",
        imageUrl: "/certificates/champion-v1.png",
      },
    ]);

    const certificates = await getCertificatesForEvents(["event-1"]);

    expect(certificates.get("event-1")).toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
    });
    expect(prisma.certificate.findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["event-1"] },
        type: "champion",
        recipientKind: "team",
        status: "ready",
        publishedUrl: { not: null },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  });

  it("keeps newer unpublished Champions from hiding published certificates in batch reads", async () => {
    const unpublishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v3",
      version: 3,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "generated",
    };
    prisma.certificate.findMany.mockImplementation(async (query: { where: Record<string, unknown> }) => {
      const publishedUrl = query.where.publishedUrl as { not?: unknown } | undefined;
      return query.where.status === "ready" && publishedUrl?.not === null
        ? [championCertificateRow]
        : [unpublishedChampion, championCertificateRow];
    });

    const certificates = await getCertificatesForEvents(["event-1"]);

    expect(certificates.get("event-1")).toMatchObject({
      id: "certificate-champion-v2",
      imageUrl: "/certificates/champion-v2.png",
      status: "ready",
    });
  });

  it("falls back per event to the latest non-published Champion when batch reads have no published version", async () => {
    const failedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-event-2-v1",
      eventId: "event-2",
      teamId: "team-runner-up",
      recipientId: "team-runner-up",
      recipientName: "Runner Up",
      version: 1,
      imageUrl: "",
      publishedUrl: null,
      publishedAt: null,
      status: "failed",
      lastError: "renderer unavailable",
    };
    prisma.certificate.findMany.mockImplementation(async (query: { where: Record<string, unknown> }) => (
      query.where.status === "ready" ? [championCertificateRow] : [failedChampion]
    ));

    const certificates = await getCertificatesForEvents(["event-1", "event-2"]);

    expect(certificates.get("event-1")).toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(certificates.get("event-2")).toMatchObject({
      id: "certificate-champion-event-2-v1",
      status: "failed",
      lastError: "renderer unavailable",
    });
  });

  it("persists legacy generation as a published Champion team certificate", async () => {
    prisma.certificate.findFirst.mockResolvedValue(null);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.create.mockResolvedValue(championCertificateRow);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({
      eventId: "event-1",
      teamId: "team-champion",
      imageUrl: "/certificates/champion-v2.png",
    });
    expect(prisma.certificate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        teamId: "team-champion",
        type: "champion",
        recipientKind: "team",
        recipientId: "team-champion",
        recipientName: "Miracle Champions",
        imageUrl: "/certificates/champion-v2.png",
        publishedUrl: "/certificates/champion-v2.png",
        status: "ready",
      }),
    });
  });

  it.each([
    ["success", () => recordCertificateSuccess("event-1", "team-champion", "/certificates/legacy-new.png")],
    ["failure", () => recordCertificateFailure("event-1", "team-champion", "legacy renderer failed")],
  ])("refuses a legacy %s write once Completion V3 owns the event", async (_label, write) => {
    prisma.tournamentCompletion.findFirst.mockResolvedValue({ id: "completion-1" });
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.findFirst.mockResolvedValue({
      ...championCertificateRow,
      templateVersion: "miracle-v3",
      completionId: "completion-1",
    });

    await expect(write()).rejects.toThrow("Certificate Studio");
    expect(prisma.tournamentCompletion.findFirst).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      select: { id: true },
    });
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it("appends a version and supersedes the published Champion instead of overwriting it", async () => {
    const publishedChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v1",
      version: 1,
      publishedUrl: "/certificates/champion-v1.png",
    };
    const nextChampion = {
      ...championCertificateRow,
      id: "certificate-champion-v2",
      version: 2,
    };
    prisma.certificate.findFirst.mockResolvedValue(publishedChampion);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.update.mockResolvedValue({ ...publishedChampion, supersededByVersion: 2 });
    prisma.certificate.create.mockResolvedValue(nextChampion);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", imageUrl: "/certificates/champion-v2.png" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.certificate.update).toHaveBeenCalledWith({
      where: { id: "certificate-champion-v1" },
      data: { supersededByVersion: 2 },
    });
    expect(prisma.certificate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        version: 2,
        imageUrl: "/certificates/champion-v2.png",
      }),
    });
  });

  it("does not downgrade a published Champion when a concurrent generation reports failure", async () => {
    const publishedChampion = {
      ...championCertificateRow,
      version: 1,
      publishedUrl: "/certificates/champion-v1.png",
    };
    prisma.certificate.findFirst.mockResolvedValue(publishedChampion);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });

    await expect(
      recordCertificateFailure("event-1", "team-champion", "late renderer failure"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it("retries P2034 and P2002 write conflicts before publishing the certificate", async () => {
    let attempts = 0;
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      if (attempts === 2) throw Object.assign(new Error("version conflict"), { code: "P2002" });
      return callback(prisma);
    });
    prisma.certificate.findFirst.mockResolvedValue(null);
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });
    prisma.certificate.create.mockResolvedValue(championCertificateRow);

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).resolves.toMatchObject({ id: "certificate-champion-v2", status: "ready" });
    expect(attempts).toBe(3);
  });

  it("stops after three certificate write conflicts and rethrows the terminal database error", async () => {
    let attempts = 0;
    const terminalConflict = Object.assign(new Error("serialization conflict"), { code: "P2034" });
    prisma.$transaction.mockImplementation(async () => {
      attempts += 1;
      throw terminalConflict;
    });
    prisma.team.findUnique.mockResolvedValue({ name: "Miracle Champions" });

    await expect(
      recordCertificateSuccess("event-1", "team-champion", "/certificates/champion-v2.png"),
    ).rejects.toBe(terminalConflict);
    expect(attempts).toBe(3);
  });
});

describe("event lifecycle status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it("revokes every active preview token atomically on an explicit status transition", async () => {
    prisma.event.update.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Event",
      logoUrl: null, gameImageUrl: null, gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", status: "Draft", participantCap: 16,
      registrationWindow: "TBD", startsAt: "TBD", venue: "Online", stream: null,
    });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(setEventStatus("event-1", "Draft")).resolves.toMatchObject({ status: "Draft" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.eventPreviewToken.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });


  it("discards an active revision when status becomes Ongoing", async () => {
    prisma.event.update.mockResolvedValue({
      id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Event",
      logoUrl: null, gameImageUrl: null, gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", status: "Ongoing", participantCap: 16,
      registrationWindow: "TBD", startsAt: "TBD", venue: "Online", stream: null, activeVisualAsset: null,
    });
    prisma.eventEditRevision.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPreviewToken.updateMany.mockResolvedValue({ count: 1 });
    await setEventStatus("event-1", "Ongoing");
    expect(prisma.eventEditRevision.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "Draft" },
      data: { status: "Discarded", discardedAt: expect.any(Date), discardReason: "event_started" },
    });
  });

  it("lets only platform admins change a published slug while preserving the old URL", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1", slug: "old-slug" })
      .mockResolvedValueOnce(null);
    prisma.eventSlugRedirect.findUnique.mockResolvedValue(null);
    prisma.eventSlugRedirect.create.mockResolvedValue({ id: "redirect-1" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });
    await expect(updatePublishedEventSlugAsAdmin(platformAdmin, "event-1", "new-slug"))
      .resolves.toEqual({ oldSlug: "old-slug", slug: "new-slug" });
    expect(prisma.eventSlugRedirect.create).toHaveBeenCalledWith({ data: { oldSlug: "old-slug", eventId: "event-1" } });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" }, data: { slug: "new-slug", publishedRevision: { increment: 1 } },
    });
    await expect(updatePublishedEventSlugAsAdmin(organizer, "event-1", "nope"))
      .rejects.toThrow("Not authorized");
  });
});

describe("organizer profile repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it("reads only the signed-in organizer profile", async () => {
    prisma.organizerProfile.findUnique.mockResolvedValue({ organizationName: "Miracle Esports", contactChannel: "WhatsApp", contactValue: "+628123456789", verified: false });
    await expect(getOrganizerProfileForUser(organizer)).resolves.toMatchObject({ organizationName: "Miracle Esports" });
    expect(prisma.organizerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "org-1" },
      select: { organizationName: true, contactChannel: true, contactValue: true, verified: true },
    });
  });

  it("upserts the organizer profile and propagates its public name only to owned events", async () => {
    await updateOrganizerProfileForUser(organizer, { organizationName: "Miracle Esports", contactChannel: "WhatsApp", contactValue: "+628123456789" });
    expect(prisma.organizerProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "org-1" },
      create: expect.objectContaining({ userId: "org-1", organizationName: "Miracle Esports" }),
    }));
    expect(prisma.event.updateMany).toHaveBeenCalledWith({ where: { organizerUserId: "org-1" }, data: { organizerName: "Miracle Esports" } });
  });

  it("does not expose or write an organizer profile to another role", async () => {
    await expect(getOrganizerProfileForUser(platformAdmin)).resolves.toBeNull();
    await expect(updateOrganizerProfileForUser(platformAdmin, { organizationName: "Admin", contactChannel: "Email", contactValue: "admin@example.com" })).rejects.toThrow("Not authorized");
  });
});
describe("organizer user lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizer accounts for platform-admin event assignment", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    await expect(getOrganizerUsers()).resolves.toEqual([
      { id: "org-1", email: "org@test.com", name: "Organizer", role: "organizer" },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "organizer" },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true },
    });
  });

  it("finds only organizer accounts by id", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    await expect(getOrganizerUserById("org-1")).resolves.toEqual({
      id: "org-1",
      email: "org@test.com",
      name: "Organizer",
      role: "organizer",
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "org-1", role: "organizer" },
      select: { id: true, email: true, name: true, role: true },
    });
  });
});

describe("registration intake commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", slug: "redclover-cup", format: "Single Elimination" });
    prisma.match.count.mockResolvedValue(0);
    prisma.team.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.count.mockResolvedValue(0);
    prisma.registrationImportBatch.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === "function") return callback(prisma);
      return callback;
    });
  });

  it("creates teams, players, and only exports credentials for newly created captain accounts", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-new",
          status: "new",
          normalizedData: {
            teamName: "Gamma",
            teamTag: "GAM",
            captainName: "Gina",
            captainContact: "081",
            captainEmail: "gina@example.com",
            players: [{ nickname: "Gina", displayName: "Gina", position: "Unassigned" }],
          },
        },
        {
          id: "item-existing",
          status: "changed",
          teamId: "team-alpha",
          normalizedData: {
            teamName: "Alpha",
            teamTag: "ALP",
            captainName: "Alya",
            captainContact: "082",
            captainEmail: "alya@example.com",
            players: [{ nickname: "Alya", displayName: "Alya", position: "Guard" }],
          },
        },
      ],
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "captain-existing", email: "alya@example.com", role: "captain", name: "Alya" });
    prisma.user.create.mockResolvedValue({ id: "captain-new", email: "gina@example.com", role: "captain", name: "Gina" });
    prisma.team.create.mockResolvedValue({ id: "team-gamma" });
    prisma.team.update.mockResolvedValue({ id: "team-alpha" });

    const result = await commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new", "item-existing"]);

    expect(result.importedCount).toBe(2);
    expect(result.credentials).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 60_000,
      },
    );
    expect(result.credentials[0]).toMatchObject({
      teamName: "Gamma",
      teamTag: "GAM",
      captainName: "Gina",
      email: "gina@example.com",
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.team.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ captainId: "captain-new", source: "registration-intake" }),
    }));
    expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "team-alpha" },
      data: expect.objectContaining({ captainId: "captain-existing" }),
    }));
    expect(prisma.player.deleteMany).toHaveBeenCalledWith({ where: { teamId: "team-alpha" } });
    expect(prisma.player.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.registrationImportItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: "item-new" },
      data: expect.objectContaining({ selected: true, status: "imported", teamId: "team-gamma" }),
    });
    expect(prisma.registrationImportItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: "item-existing" },
      data: expect.objectContaining({ selected: true, status: "imported", teamId: "team-alpha" }),
    });
    expect(prisma.registrationImportBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ status: "committed" }),
    });
  });

  it("returns the idempotent result when another transaction already claimed the batch", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      status: "validated",
      committedAt: null,
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination", participantCap: 8 },
      items: [{
        id: "item-new",
        status: "new",
        normalizedData: {
          teamName: "Gamma",
          teamTag: "GAM",
          captainName: "Gina",
          captainContact: "081",
          captainEmail: "gina@example.com",
          players: [],
        },
      }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "captain-existing", role: "captain" });
    prisma.registrationImportBatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new"]))
      .resolves.toEqual({ importedCount: 0, credentials: [] });
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.registrationImportBatch.update).not.toHaveBeenCalled();
  });

  it("rejects a selected row when the captain email belongs to a non-captain user", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [
        {
          id: "item-staff",
          status: "new",
          normalizedData: {
            teamName: "Staff",
            teamTag: "STF",
            captainName: "Staff",
            captainContact: "081",
            captainEmail: "staff@example.com",
            players: [{ nickname: "Staff", displayName: "Staff", position: "Unassigned" }],
          },
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "organizer-1", email: "staff@example.com", role: "organizer", name: "Staff" });

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-staff"]))
      .rejects.toThrow("Email kapten sudah dipakai akun non-captain.");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("blocks commits after the drawing or tournament becomes authoritative", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination" },
      items: [],
    });
    prisma.match.count.mockResolvedValue(1);

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", []))
      .rejects.toThrow("Roster tim sudah terkunci");
  });

  it("counts pending-review reservations before importing new teams", async () => {
    prisma.registrationImportBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      eventId: "event-1",
      event: { id: "event-1", slug: "redclover-cup", format: "Single Elimination", participantCap: 8 },
      items: [{
        id: "item-new",
        status: "new",
        normalizedData: {
          teamName: "Gamma",
          teamTag: "GAM",
          captainName: "Gina",
          captainContact: "081",
          captainEmail: "gina@example.com",
          players: [],
        },
      }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: "captain-existing", email: "gina@example.com", role: "captain", name: "Gina" });
    prisma.team.count.mockResolvedValue(7);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);

    await expect(commitRegistrationImportBatch(platformAdmin, "batch-1", ["item-new"]))
      .rejects.toThrow("Slot pendaftaran event ini tidak cukup");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });
});

describe("event-local registration workspace repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1" });
  });

  it("maps queue records to the requested event and preserves import source provenance", async () => {
    prisma.team.findMany.mockResolvedValue([{
      id: "team-import",
      eventId: "event-1",
      name: "Imported Team",
      tag: "IMP",
      source: "registration-intake",
      captainId: "captain-1",
      captainName: "Captain",
      captainContact: "081",
      captainIgn: "CaptainIGN",
      captainUid: "uid-1",
      captainIsPlayer: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      players: [{ id: "player-1" }],
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }]);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([{ teamId: "team-import", batch: { sourceKind: "csv" } }]);

    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toEqual([
      expect.objectContaining({
        id: "team-import",
        eventId: "event-1",
        source: "import_csv",
        status: "accepted",
        rosterCount: 1,
      }),
    ]);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event-1" } }));
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventId: "event-1" }) }));
  });

  it("returns import history without exposing unrelated batches", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: { new: 2 },
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: new Date("2026-09-10T00:00:00.000Z"),
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      items: [{ id: "item-1", status: "imported", teamId: "team-1" }],
    }]);

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1")).resolves.toEqual([
      expect.objectContaining({ id: "batch-1", eventId: "event-1", itemCount: 1 }),
    ]);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event-1" } }));
  });

  it("rejects import-batch item overflow even when the nested delegate ignores take", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      items: Array.from({ length: 501 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ items: expect.objectContaining({ take: 501 }) }),
    }));
  });

  it("supports exactly the import-batch item cap", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      items: Array.from({ length: 500 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(1);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ items: expect.objectContaining({ take: 501 }) }),
    }));
  });

  it("rejects import-batch outer overflow independently of nested items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      items: [],
    })));

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 8 });
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 9,
      include: expect.objectContaining({ items: expect.objectContaining({ take: 501 }) }),
    }));
  });

  it("supports exactly the import-batch outer cap independently of nested items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      items: [],
    })));

    await expect(getRegistrationImportBatchesForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(8);
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 9 }));
  });

  it("rejects import-history outer overflow and independently rejects nested item overflow", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      items: [],
    })));
    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 100 });
    expect(prisma.registrationImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 101,
      include: expect.objectContaining({ items: expect.objectContaining({ take: 501 }) }),
    }));

    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      items: Array.from({ length: 501 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);
    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
  });

  it("supports exactly 100 import-history batches independently of nested items", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      id: `batch-${index + 1}`,
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      items: [],
    })));

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .resolves.toHaveLength(100);
  });

  it("supports exactly 500 nested import-history items independently of outer batches", async () => {
    prisma.registrationImportBatch.findMany.mockResolvedValue([{
      id: "batch-1",
      eventId: "event-1",
      sourceKind: "xlsx",
      sourceLabel: "teams.xlsx",
      worksheetName: "Sheet1",
      status: "committed",
      summary: {},
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      committedAt: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      items: Array.from({ length: 500 }, (_, index) => ({ id: `item-${index + 1}`, status: "new", teamId: null })),
    }]);

    await expect(getRegistrationImportHistoryForEvent(platformAdmin, "event-1"))
      .resolves.toEqual([expect.objectContaining({ itemCount: 500 })]);
  });

  it("rejects import-context team and nested player overflow independently", async () => {
    const team = (index: number, players: number) => ({
      id: `team-${index}`,
      name: `Team ${index}`,
      tag: `T${index}`,
      captainName: "Captain",
      captainContact: "081",
      players: Array.from({ length: players }, (_, playerIndex) => ({ nickname: `p-${playerIndex}`, displayName: `Player ${playerIndex}`, position: "Forward" })),
    });
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 500, format: "Single Elimination",
      teams: Array.from({ length: 501 }, (_, index) => team(index + 1, 0)),
    });
    await expect(getRegistrationImportEventContext(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(prisma.event.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ teams: expect.objectContaining({ take: 501, select: expect.objectContaining({ players: expect.objectContaining({ take: 501 }) }) }) }),
    }));

    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 1, format: "Single Elimination",
      teams: [team(1, 501)],
    });
    await expect(getRegistrationImportEventContext(platformAdmin, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
  });

  it("supports exactly 500 import-context teams independently of nested players", async () => {
    const team = (index: number) => ({
      id: `team-${index}`,
      name: `Team ${index}`,
      tag: `T${index}`,
      captainName: "Captain",
      captainContact: "081",
      players: [],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 500, format: "Single Elimination",
      teams: Array.from({ length: 500 }, (_, index) => team(index + 1)),
    });

    const result = await getRegistrationImportEventContext(platformAdmin, "event-1");
    expect(result?.teams).toHaveLength(500);
  });

  it("supports exactly 500 import-context players independently of outer teams", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: "event-1", slug: "event", name: "Event", gameModeId: "mode", participantCap: 1, format: "Single Elimination",
      teams: [{
        id: "team-1",
        name: "Team 1",
        tag: "T1",
        captainName: "Captain",
        captainContact: "081",
        players: Array.from({ length: 500 }, (_, index) => ({ nickname: `p-${index}`, displayName: `Player ${index}`, position: "Forward" })),
      }],
    });

    const result = await getRegistrationImportEventContext(platformAdmin, "event-1");
    expect(result?.teams).toHaveLength(1);
    expect(result?.teams[0]?.players).toHaveLength(500);
  });

  it("reads payment proofs only for the event and requested review status", async () => {
    prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([{
      id: "request-1",
      eventId: "event-1",
      captainId: "captain-1",
      teamId: null,
      teamName: "Proof Team",
      teamTag: "PRF",
      status: "pending_review",
      proofImageUrl: "/proofs/request-1.png",
      rejectReason: null,
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }]);

    await expect(getPaymentReviewForEvent(organizer, "event-1", "pending_review")).resolves.toEqual([
      expect.objectContaining({ id: "request-1", eventId: "event-1", proofImageUrl: "/proofs/request-1.png" }),
    ]);
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", status: "pending_review" },
    }));
  });

  it("rejects registration-reader overflow even when the delegate ignores take", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1" });
    const teams = Array.from({ length: 501 }, (_, index) => ({
      id: `team-${index + 1}`,
      eventId: "event-1",
      name: `Team ${index + 1}`,
      tag: `T${index + 1}`,
      source: "registration-intake",
      captainId: "captain-1",
      captainName: "Captain",
      captainContact: "081",
      captainIgn: null,
      captainUid: null,
      captainIsPlayer: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      players: [],
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    }));
    prisma.team.findMany.mockResolvedValue(teams);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([]);

    await expect(getRegistrationRecordsForEvent(organizer, "event-1"))
      .rejects.toMatchObject({ name: "ReaderResultOverflowError", limit: 500 });
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 501,
      include: expect.objectContaining({ players: expect.objectContaining({ take: 501 }) }),
    }));

    prisma.team.findMany.mockResolvedValue(teams.slice(0, 500));
    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toHaveLength(500);
  });

  it("detects payment-review overflow instead of silently truncating the capped list", async () => {
    prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.teamRegistrationRequest.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({
      id: `request-${index + 1}`,
      eventId: "event-1",
      captainId: "captain-1",
      teamId: null,
      teamName: `Proof Team ${index + 1}`,
      teamTag: `PR${index + 1}`,
      status: "pending_review",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date("2026-09-20T00:00:00.000Z"),
      createdAt: new Date(2026, 0, index + 1),
      updatedAt: new Date(2026, 0, index + 1),
      captain: { id: "captain-1", name: "Captain", email: "captain@example.com" },
    })));

    await expect(getPaymentReviewForEvent(organizer, "event-1", "pending_review"))
      .rejects.toThrow(/payment review.*more than|overflow/i);
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: expect.any(Number),
    }));
  });

  it("returns event QRIS draft state without falling back to global settings", async () => {
    prisma.eventPaymentSettings.findUnique.mockResolvedValue({
      id: "event-payment-1",
      eventId: "event-1",
      qrisImageUrl: "/payment-qris/event-1.png",
      instructions: "Scan QRIS",
      status: "draft",
      version: 4,
      publishedAt: null,
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await expect(getEventPaymentSettingsForManager(platformAdmin, "event-1")).resolves.toMatchObject({
      eventId: "event-1", source: "event", status: "draft", version: 4,
      qrisImageUrl: "/payment-qris/event-1.png",
    });
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("does not expose sensitive event reads through an unauthenticated string-only call", async () => {
    await expect((getRegistrationRecordsForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportHistoryForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getPaymentReviewForEvent as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportEventContext as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getEventPaymentSettingsForManager as unknown as (eventId: string) => Promise<unknown>)("event-1"))
      .rejects.toThrow("Not authorized");
    await expect((getRegistrationImportUsersByEmails as unknown as (emails: string[]) => Promise<unknown>)(["captain@example.com"]))
      .rejects.toThrow("Not authorized");
  });

  it("allows the event owner and platform roles through the secured repository boundary", async () => {
    prisma.team.findMany.mockResolvedValue([]);
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
    prisma.registrationImportItem.findMany.mockResolvedValue([]);
    await expect(getRegistrationRecordsForEvent(organizer, "event-1")).resolves.toEqual([]);
    await expect(getRegistrationRecordsForEvent(admin, "event-1")).resolves.toEqual([]);
    await expect(getRegistrationRecordsForEvent(platformAdmin, "event-1")).resolves.toEqual([]);
    expect(prisma.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizerUserId: "org-1" }) }));
  });

  it("rejects stale approval before creating a team", async () => {
    const updatedAt = new Date("2026-09-14T10:00:00.000Z");
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({
      eventId: "event-1", status: "pending_review", updatedAt,
    });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1", {
      expectedStatus: "pending_review",
      expectedUpdatedAt: new Date("2026-09-14T09:00:00.000Z"),
    })).rejects.toBeInstanceOf(RegistrationMutationConflictError);
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("rejects stale payment rejection without a partial write", async () => {
    const updatedAt = new Date("2026-09-14T10:00:00.000Z");
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue({
      id: "request-1", eventId: "event-1", status: "pending_review", updatedAt,
    });

    await expect(rejectTeamRegistrationRequest(platformAdmin, "request-1", "Tidak sesuai", {
      expectedStatus: "pending_review",
      expectedUpdatedAt: new Date("2026-09-14T09:00:00.000Z"),
    })).rejects.toBeInstanceOf(RegistrationMutationConflictError);
    expect(prisma.teamRegistrationRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("assertCaptainCanSubmitStats", () => {
  const input = {
    captainId: "captain-1",
    eventId: "event-1",
    matchId: "match-1",
    teamId: "team-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.match.findFirst.mockResolvedValue({ id: "match-1" });
    prisma.team.findFirst.mockResolvedValue({ id: "team-1" });
  });

  it("allows a captain to submit stats only for their completed match participant", async () => {
    await expect(assertCaptainCanSubmitStats(input)).resolves.toBeUndefined();

    expect(prisma.match.findFirst).toHaveBeenCalledWith({
      where: {
        id: "match-1",
        eventId: "event-1",
        status: "Completed",
        OR: [{ homeTeamId: "team-1" }, { awayTeamId: "team-1" }],
      },
      select: { id: true },
    });
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: {
        id: "team-1",
        eventId: "event-1",
        captainId: "captain-1",
      },
      select: { id: true },
    });
  });

  it("rejects when the match is not a completed match for that event and team", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(assertCaptainCanSubmitStats(input)).rejects.toThrow("Not authorized");
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when the team does not belong to the authenticated captain", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(assertCaptainCanSubmitStats(input)).rejects.toThrow("Not authorized");
  });
});

describe("organizer event ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "owned-event",
        name: "Owned Event",
        description: "Owned",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Draft",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: "org-1",
        organizerName: "Organizer",
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
      },
    ]);
  });

  it("filters manageable events to the authenticated organizer", async () => {
    await expect(getManageableEventsForUser(organizer)).resolves.toEqual([
      expect.objectContaining({ id: "event-1", organizerUserId: "org-1" }),
    ]);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { organizerUserId: "org-1" },
      include: { stream: true, activeVisualAsset: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("allows platform admin to read all manageable events", async () => {
    await getManageableEventsForUser(platformAdmin);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      include: { stream: true, activeVisualAsset: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("allows an organizer to manage only their own event", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });

    await expect(assertUserCanManageEvent(organizer, "event-1")).resolves.toBeUndefined();
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
  });

  it("rejects an organizer managing someone else's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(assertUserCanManageEvent(organizer, "event-other")).rejects.toThrow("Not authorized");
  });

  it("loads draft workspace data only through the organizer ownership filter", async () => {
    prisma.event.findFirst.mockResolvedValue({
      id: "event-1", slug: "owned-event", name: "Owned Event", description: "Owned", gameId: "game-1", gameModeId: "mode-1",
      format: "Single Elimination", formatConfig: null, participantCap: 8, registrationOpensAt: null,
      registrationClosesAt: null, eventStartsAt: null, timezone: "Asia/Jakarta", venue: "Online", venueAddress: null,
      registrationFeeRequired: false, registrationFeeAmount: null, logoUrl: null, gameImageUrl: null,
      draftRevision: 3, status: "Draft", organizer: { organizerProfile: null },
    });

    await expect(getManageableEventDraft(organizer, "event-1")).resolves.toEqual(expect.objectContaining({
      id: "event-1", name: "Owned Event", formatConfig: null, draftRevision: 3, status: "Draft",
    }));
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: expect.objectContaining({ id: true, name: true, draftRevision: true, organizer: expect.any(Object) }),
    });
  });

  it("lets platform admins load a draft without an organizer ownership filter", async () => {
    prisma.event.findFirst.mockResolvedValue({
      id: "event-1", name: "Owned Event", formatConfig: null, draftRevision: 3, status: "Draft",
    });

    await getManageableEventDraft(platformAdmin, "event-1");

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1" },
      select: expect.objectContaining({ id: true, name: true, draftRevision: true, organizer: expect.any(Object) }),
    });
  });

  it("updates a team logo only when the organizer owns the team's event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-1" });
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.team.update.mockResolvedValue({
      id: "team-1",
      eventId: "event-1",
      captainId: null,
      name: "Logo Squad",
      logoText: "LS",
      logoUrl: "/team-logos/team-1.png",
      tag: "LOG",
      captainName: null,
      captainContact: null,
      source: "demo",
    });

    await expect(updateTeamLogo(organizer, "team-1", "/team-logos/team-1.png")).resolves.toMatchObject({
      id: "team-1",
      logoUrl: "/team-logos/team-1.png",
    });

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: { id: true, eventId: true },
    });
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-1" },
      data: { logoUrl: "/team-logos/team-1.png" },
    });
  });

  it("rejects a team logo update when the organizer does not own the team's event", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "team-1", eventId: "event-other" });
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(updateTeamLogo(organizer, "team-1", "/team-logos/team-1.png")).rejects.toThrow("Not authorized");
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("updates public event info only after ownership is verified", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.event.update.mockResolvedValue({
      id: "event-1",
      slug: "owned-event",
      name: "Owned Event",
      description: "Fresh public description",
      logoUrl: null,
      gameImageUrl: null,
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      status: "Published",
      participantCap: 8,
      registrationWindow: "Aug 20 - Aug 28",
      startsAt: "Aug 30, 2026",
      venue: "Online",
      organizerUserId: "org-1",
      organizerName: "Organizer",
      organizerVerified: false,
      prizePoolLabel: "Rp1.000.000",
      registrationFeeLabel: null,
      registrationUrl: null,
      characterArtUrl: null,
      accentColor: null,
      stream: null,
    });

    const result = await updateEventPublicInfo(organizer, "event-1", {
      description: "Fresh public description",
      registrationWindow: "Aug 20 - Aug 28",
      startsAt: "Aug 30, 2026",
      venue: "Online",
      prizePoolLabel: "Rp1.000.000",
      registrationFeeLabel: null,
      registrationUrl: null,
    });

    expect(result).toMatchObject({
      id: "event-1",
      prizePoolLabel: "Rp1.000.000",
    });
    expect(result).not.toHaveProperty("registrationFeeLabel");

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { id: true },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        description: "Fresh public description",
        registrationWindow: "Aug 20 - Aug 28",
        startsAt: "Aug 30, 2026",
        venue: "Online",
        prizePoolLabel: "Rp1.000.000",
        registrationFeeLabel: null,
        registrationUrl: null,
      },
      include: { stream: true, activeVisualAsset: true },
    });
  });
});

describe("event visual asset lifecycle", () => {
  const assetRow = {
    id: "asset-2",
    eventId: "event-1",
    source: "ai_generated",
    status: "ready_for_review",
    url: "https://assets.example/generated.webp",
    mimeType: "image/webp",
    width: 1200,
    height: 630,
    focalX: 0.5,
    focalY: 0.5,
    provider: "openai",
    model: "gpt-image-1",
    promptVersion: "v1",
    workflowRunId: "run-1",
    sourceUrl: null,
    rightsAttestedAt: null,
    errorCode: null,
    createdByUserId: "org-1",
    approvedAt: null,
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) => run(prisma));
  });

  it("lists revisions newest first for an authorized organizer", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findMany.mockResolvedValue([assetRow]);

    await expect(listEventVisualAssets(organizer, "event-1")).resolves.toMatchObject([
      { id: "asset-2", eventId: "event-1", source: "ai_generated", status: "ready_for_review" },
    ]);
    expect(prisma.eventVisualAsset.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("refuses to list revisions for another organizer's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(listEventVisualAssets(organizer, "event-1")).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.findMany).not.toHaveBeenCalled();
  });

  it("records the creating user on a new revision", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.create.mockResolvedValue(assetRow);

    await createEventVisualAsset(organizer, {
      eventId: "event-1",
      source: "organizer_upload",
      status: "ready_for_review",
      url: "https://assets.example/upload.webp",
    });

    expect(prisma.eventVisualAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event-1", createdByUserId: "org-1" }),
    });
  });

  it("refuses to create a revision on another organizer's event", async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(
      createEventVisualAsset(organizer, { eventId: "event-1", source: "organizer_upload", status: "ready_for_review" }),
    ).rejects.toThrow("Not authorized");
    expect(prisma.eventVisualAsset.create).not.toHaveBeenCalled();
  });

  it("approves a reviewable revision and activates it in one transaction", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-2")).resolves.toMatchObject({
      id: "asset-2",
      status: "approved",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.eventVisualAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-2", eventId: "event-1", status: { in: ["ready_for_review", "approved"] } },
      select: { id: true },
    });
    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { status: "approved", approvedAt: expect.any(Date) },
    });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2" },
    });
  });

  it("dual-writes the legacy background url in the same transaction during the migration window", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({
      ...assetRow,
      status: "approved",
      url: "https://assets.example/approved.webp",
    });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await approveEventVisualAsset(organizer, "event-1", "asset-2", { dualWriteLegacyImage: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-2", gameImageUrl: "https://assets.example/approved.webp" },
    });
  });

  it("activates an older approved revision for rollback", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-1" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, id: "asset-1", status: "approved" });
    prisma.event.update.mockResolvedValue({ id: "event-1" });

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-1")).resolves.toMatchObject({ id: "asset-1" });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { activeVisualAssetId: "asset-1" },
    });
  });

  it("refuses to approve a revision that is not reviewable", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue(null);

    await expect(approveEventVisualAsset(organizer, "event-1", "asset-2")).rejects.toThrow(
      "Visual revision is not available for approval",
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("refuses to reject the active revision", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-2" });

    await expect(rejectEventVisualAsset(organizer, "event-1", "asset-2")).rejects.toThrow(
      "Cannot reject the active visual revision",
    );
    expect(prisma.eventVisualAsset.update).not.toHaveBeenCalled();
  });

  it("rejects a non-active revision", async () => {
    prisma.event.findFirst
      .mockResolvedValueOnce({ id: "event-1" })
      .mockResolvedValueOnce({ activeVisualAssetId: "asset-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, status: "rejected" });

    await expect(rejectEventVisualAsset(organizer, "event-1", "asset-2")).resolves.toMatchObject({
      status: "rejected",
    });
    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { status: "rejected" },
    });
  });

  it("clamps focal point coordinates into the unit square", async () => {
    prisma.event.findFirst.mockResolvedValue({ id: "event-1" });
    prisma.eventVisualAsset.findFirst.mockResolvedValue({ id: "asset-2" });
    prisma.eventVisualAsset.update.mockResolvedValue({ ...assetRow, focalX: 1, focalY: 0 });

    await setEventVisualFocalPoint(organizer, "event-1", "asset-2", { x: 4.2, y: -1 });

    expect(prisma.eventVisualAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-2" },
      data: { focalX: 1, focalY: 0 },
    });
  });

  it("counts only AI attempts inside the rate-limit window", async () => {
    const since = new Date("2026-08-22T00:00:00.000Z");
    prisma.eventVisualAsset.count.mockResolvedValue(3);

    await expect(countAiVisualAttempts("event-1", since)).resolves.toBe(3);
    expect(prisma.eventVisualAsset.count).toHaveBeenCalledWith({
      where: { eventId: "event-1", source: "ai_generated", createdAt: { gte: since } },
    });
  });
});

describe("event visual asset mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the active visual revision url, status, focal point, and source", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "event-one",
        name: "Event One",
        description: "Event",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Ongoing",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: null,
        organizerName: null,
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
        activeVisualAssetId: "asset-1",
        activeVisualAsset: {
          id: "asset-1",
          eventId: "event-1",
          source: "organizer_upload",
          status: "approved",
          url: "https://assets.example/event.webp",
          mimeType: "image/webp",
          width: 1200,
          height: 630,
          focalX: 0.5,
          focalY: 0.4,
          provider: null,
          model: null,
          promptVersion: null,
          workflowRunId: null,
          sourceUrl: null,
          rightsAttestedAt: null,
          errorCode: null,
          createdByUserId: null,
          approvedAt: new Date("2026-08-22T00:00:00.000Z"),
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
          updatedAt: new Date("2026-08-22T00:00:00.000Z"),
        },
      },
    ]);

    const result = await getEventsByIds(["event-1"]);

    expect(result[0]).toMatchObject({
      activeVisualAssetId: "asset-1",
      activeVisualAsset: {
        id: "asset-1",
        eventId: "event-1",
        source: "organizer_upload",
        status: "approved",
        url: "https://assets.example/event.webp",
        focalX: 0.5,
        focalY: 0.4,
      },
    });
  });
});

describe("dashboard batch lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches selected captain events without loading the full event catalog", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        slug: "event-one",
        name: "Event One",
        description: "Event",
        logoUrl: null,
        gameImageUrl: null,
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Ongoing",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: null,
        organizerName: null,
        organizerVerified: false,
        characterArtUrl: null,
        accentColor: null,
        stream: null,
      },
    ]);

    await expect(getEventsByIds(["event-1"])).resolves.toHaveLength(1);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["event-1"] } },
      include: { stream: true, activeVisualAsset: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("batch-fetches teams grouped by event", async () => {
    prisma.team.findMany.mockResolvedValue([
      {
        id: "team-1",
        eventId: "event-1",
        captainId: null,
        name: "Alpha",
        logoText: "AL",
        logoUrl: null,
        tag: "ALP",
        captainName: null,
        captainContact: null,
        source: "demo",
      },
      {
        id: "team-2",
        eventId: "event-2",
        captainId: null,
        name: "Beta",
        logoText: "BE",
        logoUrl: null,
        tag: "BET",
        captainName: null,
        captainContact: null,
        source: "demo",
      },
    ]);

    const result = await getTeamsForEvents(["event-1", "event-2"]);

    expect(result.get("event-1")).toHaveLength(1);
    expect(result.get("event-2")).toHaveLength(1);
    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["event-1", "event-2"] } },
      include: { captain: { select: { id: true, name: true } } },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("batch-counts teams without fetching every team row", async () => {
    prisma.team.groupBy.mockResolvedValue([
      { eventId: "event-1", _count: { _all: 32 } },
    ]);

    const result = await getTeamCountsForEvents(["event-1", "event-2"]);

    expect(result.get("event-1")).toBe(32);
    expect(result.get("event-2")).toBe(0);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
    expect(prisma.team.groupBy).toHaveBeenCalledWith({
      by: ["eventId"],
      where: { eventId: { in: ["event-1", "event-2"] } },
      _count: { _all: true },
    });
  });
});

function publishedEventRow(overrides: Partial<{ id: string; slug: string; name: string; status: string; participantCap: number; format: string }> = {}) {
  return {
    id: overrides.id ?? "event-open",
    slug: overrides.slug ?? overrides.id ?? "event-open",
    name: overrides.name ?? "Open Event",
    description: "Open registration event",
    logoUrl: null,
    gameImageUrl: null,
    gameId: "game-kuroko",
    gameModeId: "mode-kuroko-3v3",
    format: overrides.format ?? "Single Elimination",
    status: overrides.status ?? "Published",
    participantCap: overrides.participantCap ?? 8,
    registrationWindow: "Aug 24 - Aug 31",
    startsAt: "2026-09-01",
    venue: "Online",
    organizerUserId: null,
    organizerName: null,
    organizerVerified: null,
    characterArtUrl: null,
    accentColor: null,
    stream: null,
  };
}

describe("existing captain event registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.teamRegistrationRequest.groupBy.mockResolvedValue([]);
    prisma.teamRegistrationRequest.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
  });

  it("lists only published events the captain has not joined, with capacity and unlocked bracket", async () => {
    prisma.event.findMany.mockResolvedValue([
      publishedEventRow({ id: "event-open", slug: "open-cup", name: "Open Cup", participantCap: 8 }),
      publishedEventRow({ id: "event-joined", slug: "joined-cup", name: "Joined Cup", participantCap: 8 }),
      publishedEventRow({ id: "event-full", slug: "full-cup", name: "Full Cup", participantCap: 2 }),
      publishedEventRow({ id: "event-locked", slug: "locked-cup", name: "Locked Cup", participantCap: 8 }),
    ]);
    prisma.team.findMany.mockResolvedValue([{ eventId: "event-joined" }]);
    prisma.team.groupBy.mockResolvedValue([{ eventId: "event-full", _count: { _all: 2 } }]);
    prisma.match.count.mockImplementation(async ({ where }: { where: { eventId: string } }) =>
      where.eventId === "event-locked" ? 1 : 0,
    );

    const result = await getOpenRegistrationEventsForCaptain("captain-1");

    expect(result).toEqual([expect.objectContaining({ id: "event-open", name: "Open Cup" })]);
  });

  it("registers an existing captain team only for a published event and stores registration source", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-open", slug: "open-cup" }));
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.team.create.mockResolvedValue({
      id: "team-new",
      eventId: "event-open",
      captainId: "captain-1",
      name: "Session United",
      logoText: "SE",
      logoUrl: null,
      tag: "SES",
      captainName: null,
      captainContact: null,
      source: "registration",
    });

    await expect(registerTeam({ eventId: "event-open", captainId: "captain-1", name: "Session United", tag: "ses" })).resolves.toEqual(
      expect.objectContaining({ id: "team-new", source: "registration", tag: "SES" }),
    );
    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "registration", tag: "SES", logoText: "SE" }),
    });
  });

  it("rejects a new registration before its structured opening time", async () => {
    prisma.event.findUnique.mockResolvedValue({
      ...publishedEventRow({ id: "event-upcoming" }),
      registrationOpensAt: new Date(Date.now() + 60_000),
      registrationClosesAt: new Date(Date.now() + 120_000),
    });

    await expect(registerTeam({
      eventId: "event-upcoming",
      captainId: "captain-1",
      name: "Early Team",
      tag: "EAR",
    })).rejects.toThrow("Event tidak valid atau sudah tidak membuka pendaftaran.");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("rejects a draft roster above the selected game mode maximum", async () => {
    prisma.team.findFirst.mockResolvedValue({
      id: "draft-large",
      captainId: "captain-1",
      eventId: null,
      source: "draft",
      name: "Large Draft",
      tag: "BIG",
      logoText: "BI",
      logoUrl: null,
      captainName: "Captain",
      captainContact: null,
      players: Array.from({ length: 9 }, (_, index) => ({
        displayName: `UID-${index}`,
        nickname: `IGN-${index}`,
        position: "",
        jerseyNumber: null,
      })),
    });
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-open" }));

    await expect(registerTeam({
      eventId: "event-open",
      captainId: "captain-1",
      draftTeamId: "draft-large",
    })).rejects.toThrow("Roster tim maksimal");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("rejects existing captain registration when the event is not published", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-closed", status: "Registration Closed" }));

    await expect(registerTeam({ eventId: "event-closed", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Event tidak valid atau sudah tidak membuka pendaftaran.",
    );
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("rejects existing captain registration when the captain already has a team in the event", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-open" }));
    prisma.team.count.mockResolvedValue(1);
    prisma.team.findFirst.mockResolvedValue({ id: "team-existing" });
    prisma.match.count.mockResolvedValue(0);

    await expect(registerTeam({ eventId: "event-open", captainId: "captain-1", name: "Another Team", tag: "AT" })).rejects.toThrow(
      "Kamu sudah mendaftarkan tim untuk event ini.",
    );
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("treats pending-review payment requests as occupied for direct registration", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-full", participantCap: 2 }));
    prisma.team.count.mockResolvedValue(1);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);

    await expect(registerTeam({ eventId: "event-full", captainId: "captain-1", name: "Late Team", tag: "LT" })).rejects.toThrow(
      "Slot pendaftaran event ini sudah penuh.",
    );
    expect(prisma.team.create).not.toHaveBeenCalled();
  });
  it("rejects existing captain registration when the event is full", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-full", participantCap: 2 }));
    prisma.team.count.mockResolvedValue(2);

    await expect(registerTeam({ eventId: "event-full", captainId: "captain-1", name: "Late Team", tag: "LT" })).rejects.toThrow(
      "Slot pendaftaran event ini sudah penuh.",
    );
    expect(prisma.team.create).not.toHaveBeenCalled();
  });
  it("creates a pending payment request for a paid published event", async () => {
    const future = new Date("2026-08-25T00:00:00.000Z");
    prisma.event.findUnique.mockResolvedValue({
      ...publishedEventRow({ id: "event-paid", slug: "paid-cup" }),
      registrationFeeRequired: true,
      registrationFeeAmount: 25000,
    });
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
    prisma.teamRegistrationRequest.create.mockResolvedValue({
      id: "request-1",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Session United",
      teamTag: "SES",
      status: "pending_payment",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: future,
      approvedAt: null,
      approvedById: null,
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      event: publishedEventRow({ id: "event-paid", slug: "paid-cup" }),
      captain: { id: "captain-1", name: "Captain" },
    });

    await expect(
      createTeamRegistrationRequest({ eventId: "event-paid", captainId: "captain-1", name: "Session United", tag: "ses" }),
    ).resolves.toEqual(expect.objectContaining({ id: "request-1", status: "pending_payment", teamTag: "SES" }));

    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.teamRegistrationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-paid",
        captainId: "captain-1",
        teamName: "Session United",
        teamTag: "SES",
        status: "pending_payment",
        expiresAt: expect.any(Date),
      }),
      include: expect.any(Object),
    });
  });

  it("reserves a slot atomically only when payment proof is accepted", async () => {
    const request = {
      id: "request-proof",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Session United",
      teamTag: "SES",
      status: "pending_payment",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { ...publishedEventRow({ id: "event-paid", participantCap: 16 }), registrationFeeRequired: true },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(14);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);
    prisma.teamRegistrationRequest.update.mockResolvedValue({ ...request, status: "pending_review", proofImageUrl: "/proof.png" });
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));

    await expect(updateTeamRegistrationProof("captain-1", "request-proof", "/proof.png")).resolves.toMatchObject({
      status: "pending_review",
      proofImageUrl: "/proof.png",
    });
    expect(prisma.teamRegistrationRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-proof" },
      data: { proofImageUrl: "/proof.png", rejectReason: null, status: "pending_review" },
    }));
  });

  it("persists the expired status before reporting an expired proof request", async () => {
    const request = {
      id: "request-expired",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Expired Team",
      teamTag: "EXP",
      status: "pending_payment",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date(Date.now() - 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { ...publishedEventRow({ id: "event-paid" }), registrationFeeRequired: true },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.teamRegistrationRequest.update.mockResolvedValue({ ...request, status: "expired" });

    await expect(updateTeamRegistrationProof("captain-1", "request-expired", "/proof.png"))
      .rejects.toThrow("Pendaftaran pembayaran sudah kedaluwarsa.");
    expect(prisma.teamRegistrationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-expired" },
      data: { status: "expired" },
    });
  });

  it("keeps pending_payment unchanged when the final slot is already occupied", async () => {
    const request = {
      id: "request-full",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Late Team",
      teamTag: "LATE",
      status: "pending_payment",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { ...publishedEventRow({ id: "event-paid", participantCap: 16 }), registrationFeeRequired: true },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(15);
    prisma.teamRegistrationRequest.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));

    await expect(updateTeamRegistrationProof("captain-1", "request-full", "/proof.png")).rejects.toThrow(
      "Slot pendaftaran event ini sudah penuh",
    );
    expect(prisma.teamRegistrationRequest.update).not.toHaveBeenCalled();
  });

  it("accepts proof during the request's full 24-hour window after registration closes", async () => {
    const request = {
      id: "request-closed",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "On Time Team",
      teamTag: "OTT",
      status: "pending_payment",
      proofImageUrl: null,
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: { ...publishedEventRow({ id: "event-paid", status: "Registration Closed", participantCap: 16 }), registrationFeeRequired: true },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(10);
    prisma.teamRegistrationRequest.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.update.mockResolvedValue({ ...request, status: "pending_review", proofImageUrl: "/proof.png" });
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));

    await expect(updateTeamRegistrationProof("captain-1", "request-closed", "/proof.png")).resolves.toMatchObject({
      status: "pending_review",
    });
  });
  it("approves a paid registration request by creating the active team", async () => {
    const request = {
      id: "request-1",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Session United",
      teamTag: "SES",
      status: "pending_review",
      proofImageUrl: "/payment-proofs/request-1.png",
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      event: { ...publishedEventRow({ id: "event-paid", slug: "paid-cup" }), registrationFeeRequired: true, registrationFeeAmount: 25000 },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(3);
    prisma.match.count.mockResolvedValue(0);
    prisma.team.create.mockResolvedValue({
      id: "team-paid",
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Session United",
      logoText: "SE",
      logoUrl: null,
      tag: "SES",
      captainName: null,
      captainContact: null,
      source: "registration",
    });
    prisma.teamRegistrationRequest.update.mockResolvedValue({ ...request, status: "approved", teamId: "team-paid" });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1")).resolves.toEqual(
      expect.objectContaining({ id: "team-paid", source: "registration" }),
    );

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-paid",
        captainId: "captain-1",
        name: "Session United",
        tag: "SES",
        source: "registration",
      }),
    });
    expect(prisma.teamRegistrationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({ status: "approved", teamId: "team-paid", approvedById: "admin-1" }),
      include: expect.any(Object),
    });
  });

  it("approves a reserved request after registration has closed", async () => {
    const request = {
      id: "request-closed-review",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Reserved Team",
      teamTag: "RSV",
      status: "pending_review",
      proofImageUrl: "/payment-proofs/reserved.png",
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: {
        ...publishedEventRow({ id: "event-paid", status: "Registration Closed" }),
        registrationFeeRequired: true,
      },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.team.create.mockResolvedValue({
      id: "team-reserved",
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Reserved Team",
      logoText: "RS",
      logoUrl: null,
      tag: "RSV",
      captainName: null,
      captainContact: null,
      source: "registration",
    });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-closed-review"))
      .resolves.toEqual(expect.objectContaining({ id: "team-reserved" }));
  });

  it("approves a migrated registration request by reusing its already-linked team", async () => {
    // Regression test: migration script (scripts/migrate-existing-teams-payment-status.mjs)
    // creates TeamRegistrationRequest rows linked via teamId to a Team that already exists
    // (e.g. ATL/Astra Lumina). Approving must not treat that same team as a duplicate, and
    // must not attempt to create a second Team with the same eventId+tag.
    const request = {
      id: "request-atl",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: "team-atl",
      teamName: "Astra Lumina",
      teamTag: "ATL",
      status: "pending_review",
      proofImageUrl: "/payment-proofs/request-atl.png",
      rejectReason: null,
      expiresAt: new Date(Date.now() + 60_000),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      event: { ...publishedEventRow({ id: "event-paid", slug: "paid-cup" }), registrationFeeRequired: true, registrationFeeAmount: 25000 },
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(3);
    prisma.match.count.mockResolvedValue(0);
    // existingCaptainTeam lookup must exclude the request's own linked team, so it resolves null
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.update.mockResolvedValue({
      id: "team-atl",
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Astra Lumina",
      logoText: "AT",
      logoUrl: null,
      tag: "ATL",
      captainName: null,
      captainContact: null,
      source: "registration",
    });
    prisma.teamRegistrationRequest.update.mockResolvedValue({ ...request, status: "approved", teamId: "team-atl" });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-atl")).resolves.toEqual(
      expect.objectContaining({ id: "team-atl", source: "registration" }),
    );

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { eventId: "event-paid", captainId: "captain-1", id: { not: "team-atl" } },
      select: { id: true },
    });
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "team-atl" },
      data: { eventId: "event-paid", source: "registration" },
    });
    expect(prisma.teamRegistrationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-atl" },
      data: expect.objectContaining({ status: "approved", teamId: "team-atl", approvedById: "admin-1" }),
      include: expect.any(Object),
    });
  });

  it("still approves a pending_review request whose original deadline already passed", async () => {
    // A captain who uploaded proof before the deadline should never be blocked by an
    // admin being slow to review it - only never-uploaded (pending_payment) requests
    // are meant to expire.
    const request = {
      id: "request-late-review",
      eventId: "event-paid",
      captainId: "captain-1",
      teamId: null,
      teamName: "Session United",
      teamTag: "SES",
      status: "pending_review",
      proofImageUrl: "/payment-proofs/request-late-review.png",
      rejectReason: null,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      approvedAt: null,
      approvedById: null,
      createdAt: new Date("2025-12-30T00:00:00.000Z"),
      updatedAt: new Date("2025-12-30T00:00:00.000Z"),
      event: publishedEventRow({ id: "event-paid" }),
      captain: { id: "captain-1", name: "Captain" },
    };
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(request);
    prisma.team.count.mockResolvedValue(3);
    prisma.match.count.mockResolvedValue(0);
    prisma.team.create.mockResolvedValue({
      id: "team-late",
      eventId: "event-paid",
      captainId: "captain-1",
      name: "Session United",
      tag: "SES",
      source: "registration",
    });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-late-review")).resolves.toEqual(
      expect.objectContaining({ id: "team-late", source: "registration" }),
    );
    expect(prisma.teamRegistrationRequest.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "expired" }) }),
    );
  });

  it("does not auto-expire pending_review requests when sweeping stale requests", async () => {
    // expireStaleRegistrationRequests() runs as a side effect of createTeamRegistrationRequest;
    // its updateMany status filter must exclude pending_review so an uploaded-but-unreviewed
    // request is never silently flipped to expired.
    prisma.event.findUnique.mockResolvedValue({
      ...publishedEventRow({ id: "event-paid", slug: "paid-cup" }),
      registrationFeeRequired: true,
      registrationFeeAmount: 25000,
    });
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
    prisma.teamRegistrationRequest.create.mockResolvedValue({
      id: "request-2",
      eventId: "event-paid",
      captainId: "captain-2",
      teamName: "Session United 2",
      teamTag: "SE2",
      status: "pending_payment",
      expiresAt: new Date(),
      event: publishedEventRow({ id: "event-paid" }),
      captain: { id: "captain-2", name: "Captain 2" },
    });

    await createTeamRegistrationRequest({ eventId: "event-paid", captainId: "captain-2", name: "Session United 2", tag: "se2" });

    expect(prisma.teamRegistrationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: expect.objectContaining({ in: expect.not.arrayContaining(["pending_review"]) }) }),
      }),
    );
  });

  it("stores global QRIS payment settings", async () => {
    prisma.paymentSettings.upsert.mockResolvedValue({
      id: "global",
      qrisImageUrl: "/payment/qris.png",
      instructions: "Transfer lalu upload bukti.",
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
    });

    await expect(
      updatePaymentSettings({ qrisImageUrl: "/payment/qris.png", instructions: "Transfer lalu upload bukti." }),
    ).resolves.toEqual(expect.objectContaining({ id: "global", qrisImageUrl: "/payment/qris.png" }));

    expect(prisma.paymentSettings.upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      update: { qrisImageUrl: "/payment/qris.png", instructions: "Transfer lalu upload bukti." },
      create: { id: "global", qrisImageUrl: "/payment/qris.png", instructions: "Transfer lalu upload bukti." },
    });
  });
});
describe("public demo fallback reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.event.findFirst.mockRejectedValue(new Error("database unavailable"));
    prisma.event.findUnique.mockRejectedValue(new Error("database unavailable"));
    prisma.team.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.match.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.eventRoundConfig.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.matchGame.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.player.findMany.mockRejectedValue(new Error("database unavailable"));
    prisma.playerStat.findMany.mockRejectedValue(new Error("database unavailable"));
  });

  it("resolves a public demo event by slug when Prisma cannot connect", async () => {
    await expect(getPublicEventBySlug("kuroko-summer-cup")).resolves.toMatchObject({
      id: "event-kuroko-summer",
      slug: "kuroko-summer-cup",
      status: "Ongoing",
    });
  });

  it("resolves demo teams and matches for public demo event pages when Prisma cannot connect", async () => {
    await expect(getTeamsForEvent("event-kuroko-summer")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "team-seirin", name: "Seirin" }),
      ]),
    );
    await expect(getMatchesForEvent("event-kuroko-summer")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "match-kuroko-1", status: "Completed" }),
      ]),
    );
  });

  it("resolves demo public bracket projection when Prisma cannot connect", async () => {
    const preview = await getPublicVisibleBracketPreview("event-kuroko-summer");

    expect(preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^event-kuroko-summer-r\d+-m\d+$/) }),
      ]),
    );
  });

  it("resolves empty bracket metadata when Prisma cannot connect", async () => {
    await expect(getEventRoundConfigs("event-kuroko-summer")).resolves.toEqual([]);
    await expect(getMatchGamesForEvent("event-kuroko-summer")).resolves.toEqual(new Map());
  });

  it("resolves demo leaderboard when Prisma cannot connect", async () => {
    await expect(getLeaderboardForEvent("event-kuroko-summer", "game-kuroko")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerName: "Taiga Kagami" }),
      ]),
    );
  });
});

describe("Flashpeak V3 leaderboard reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates only completed event matches without demo fallback", async () => {
    prisma.playerStat.findMany.mockResolvedValue([
      {
        matchId: "match-1",
        teamId: "team-1",
        stats: { scores: [7.6, null, 8.1], goal: 3, assist: 4, passing: 28, defense: 12 },
        match: {
          resultSnapshot: { bestOf: 3, games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] },
          games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }],
        },
        player: {
          id: "player-1",
          displayName: "Nadia Putri",
          nickname: "Nyx",
          position: "Forward",
          team: { id: "team-1", name: "Garuda Nova", eventId: "event-1" },
        },
      },
    ]);

    await expect(getFlashpeakLeaderboardForEvent("event-1")).resolves.toEqual([
      expect.objectContaining({
        playerId: "player-1",
        nickname: "Nyx",
        game: 2,
        score: 7.85,
        goal: 3,
        assist: 4,
        passing: 28,
        defense: 12,
      }),
    ]);
    expect(prisma.playerStat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameSlug: "flashpeak",
        match: { eventId: "event-1", status: "Completed" },
      },
    }));
  });

  it("returns an honest empty state when the database is unavailable", async () => {
    const error = new Error("database unavailable");
    prisma.playerStat.findMany.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getFlashpeakLeaderboardForEvent("event-1")).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load Flashpeak leaderboard",
      expect.objectContaining({ eventId: "event-1", error }),
    );
    consoleError.mockRestore();
  });
});

describe("authoritative player-stat write boundary", () => {
  const canonicalStats = {
    "player-1": { scores: [7.6], goal: 3, assist: 4, passing: 28, defense: 12 },
  };

  function prepareBoundary() {
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.tournamentCompletion.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", mustChangePassword: false });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", competitionVersion: 7, organizerUserId: "owner-1" });
    prisma.competitionAuditLog.findFirst.mockResolvedValue(null);
    prisma.competitionAuditLog.create.mockResolvedValue({ id: "audit-1" });
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1",
      eventId: "event-1",
      status: "Completed",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      roundLabel: "Final",
      resultSnapshot: { bestOf: 1, games: [{ gameNumber: 1 }] },
      resultVersion: 2,
      games: [{ gameNumber: 1 }],
      event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    });
    prisma.team.findFirst.mockResolvedValue({ id: "team-1" });
    prisma.player.findMany.mockResolvedValue([{ id: "player-1", nickname: "Nyx", position: "Forward" }]);
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 1 });
    prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prepareBoundary();
  });

  const guard = { eventId: "event-1", matchId: "match-1", expectedVersion: 7, expectedResultVersion: 2, operationId: "operation-1", submittedAt: "2026-09-16T00:00:00.000Z" };
  const pending = () => ({ id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1", submittedBy: "captain-1", status: "pending", submittedAt: new Date(guard.submittedAt), stats: canonicalStats });

  it("reads only the authorized match with ordered games, roster, submissions and revisions", async () => {
    prisma.match.findFirst.mockResolvedValue({id:"match-1",eventId:"event-1",resultVersion:2,status:"Completed",homeTeamId:"team-1",awayTeamId:"team-2",roundLabel:"Final",resultSnapshot:{bestOf:3},games:[{gameNumber:2,homeScore:2,awayScore:1},{gameNumber:1,homeScore:2,awayScore:0}],event:{gameId:"game-flashpeak",gameModeId:"mode-flashpeak-5v5"}});
    prisma.team.findMany.mockResolvedValue([{id:"team-1",name:"Home"},{id:"team-2",name:"Away"}]);
    prisma.player.findMany.mockResolvedValue([{id:"player-1",teamId:"team-1",nickname:"Nyx",position:"Forward"}]);
    prisma.playerStat.findMany.mockResolvedValue([{playerId:"player-1",stats:canonicalStats["player-1"]}]);
    prisma.statSubmission.findMany.mockResolvedValue([{...pending(),reviewedAt:null,reviewedBy:null,rejectionNote:null}]);
    prisma.matchResultRevision.findMany.mockResolvedValue([]);
    const result=await readEventMatchStatistics("event-1","match-1","admin-1");
    expect(result.games.map(game=>game.gameNumber)).toEqual([1,2]);
    expect(result.scoreGameNumbers).toEqual([1,2]);
    expect(result.submissions[0]).toMatchObject({status:"pending",submittedAt:guard.submittedAt});
    expect(result.teams[0].players[0].nickname).toBe("Nyx");
    expect(prisma.statSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{eventId:"event-1",matchId:"match-1"}}));
  });
  it("rejects foreign event readers before fetching sensitive statistics",async()=>{
    prisma.user.findUnique.mockResolvedValue({id:"stranger",role:"organizer"});
    await expect(readEventMatchStatistics("event-1","match-b","stranger")).rejects.toThrow("authorized");
    expect(prisma.match.findFirst).not.toHaveBeenCalled();
    expect(prisma.statSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns a generic missing result for a manipulated match ID before nested reads", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", mustChangePassword: false });
    prisma.event.findUnique.mockResolvedValue({ id: "event-1", organizerUserId: "owner-1", competitionVersion: 7 });
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(readEventMatchStatistics("event-1", "match-b", "admin-1")).rejects.toThrow("Match not found");
    expect(prisma.statSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(prisma.matchResultRevision.findMany).not.toHaveBeenCalled();
  });

  it("rejects a captain calling the organizer repository directly", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "captain-1", role: "captain" });
    await expect(adminWriteMatchPlayerStats({ matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "captain-1", stats: canonicalStats })).rejects.toThrow("authorized");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-owner organizer inside the write transaction", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "other", role: "organizer", mustChangePassword: false });
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(approveStatSubmission("submission-1", "other", guard)).rejects.toThrow("authorized");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { expectedVersion: 6 }, { expectedResultVersion: 1 },
    { submittedAt: "2026-09-15T00:00:00.000Z" }, { eventId: "foreign-event" }, { matchId: "foreign-match" },
  ])("rejects stale or foreign review %j without writes", async change => {
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(approveStatSubmission("submission-1", "admin-1", { ...guard, ...change })).rejects.toThrow();
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("returns a generic missing denial for a manipulated submission ID before any write", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue(null);

    await expect(approveStatSubmission("submission-b", "admin-1", guard)).rejects.toThrow("Submission not found");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.competitionAuditLog.create).not.toHaveBeenCalled();
  });

  it("requires a nonblank rejection reason at the shared boundary", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue(pending());
    await expect(rejectStatSubmission("submission-1", "admin-1", "  ", guard)).rejects.toThrow("reason");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("writes an organizer overwrite audit and replays uncertain success without a second write", async () => {
    const input = { matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: canonicalStats, guard };
    await adminWriteMatchPlayerStats(input);
    expect(prisma.competitionAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "event-1", matchId: "match-1", actorUserId: "admin-1", action: "player_stats_save", idempotencyKey: "operation-1" }) }));
    const receipt = prisma.competitionAuditLog.create.mock.calls[0][0].data;
    prisma.competitionAuditLog.findFirst.mockResolvedValue(receipt);
    prisma.playerStat.upsert.mockClear();
    prisma.event.updateMany.mockClear();
    await adminWriteMatchPlayerStats(input);
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    await expect(adminWriteMatchPlayerStats({ ...input, stats: { "player-1": { ...canonicalStats["player-1"], goal: 4 } } })).rejects.toThrow("conflict");
  });

  it("allows the guarded player-stat transaction to finish under CI database load", async () => {
    await adminWriteMatchPlayerStats({ matchId: "match-1", teamId: "team-1", eventId: "event-1", adminId: "admin-1", stats: canonicalStats, guard });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 20_000,
    });
  });

  it("rejects a captain payload containing a player from another team", async () => {
    await expect(upsertStatSubmission({
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      stats: { "foreign-player": canonicalStats["player-1"] },
    })).rejects.toThrow("does not belong");
    expect(prisma.statSubmission.upsert).not.toHaveBeenCalled();
  });
  it("resets prior review metadata when captain resubmits and leaves published player stats untouched",async()=>{
    await upsertStatSubmission({matchId:"match-1",teamId:"team-1",eventId:"event-1",submittedBy:"captain-1",stats:canonicalStats});
    expect(prisma.statSubmission.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({status:"pending",reviewedAt:null,reviewedBy:null,rejectionNote:null})}));
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a forged stored captain payload again during approval", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      status: "pending",
      stats: { "foreign-player": canonicalStats["player-1"] },
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("does not belong");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.update).not.toHaveBeenCalled();
  });

  it("rejects an organizer direct save when match, team, and event do not agree", async () => {
    prisma.match.findFirst.mockResolvedValue(null);
    await expect(adminWriteMatchPlayerStats({
      matchId: "match-other-event",
      teamId: "team-1",
      eventId: "event-1",
      adminId: "admin-1",
      stats: canonicalStats,
    })).rejects.toThrow("relationship is invalid");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it("rejects a captain submission whose score array became stale before approval", async () => {
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1",
      eventId: "event-1",
      status: "Completed",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      roundLabel: "Final",
      resultSnapshot: { bestOf: 3, games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }] },
      resultVersion: 2,
      games: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }],
      event: { gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5" },
    });
    prisma.eventRoundConfig.findUnique.mockResolvedValue({ bestOf: 3 });
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      matchId: "match-1",
      teamId: "team-1",
      eventId: "event-1",
      submittedBy: "captain-1",
      status: "pending",
      stats: canonicalStats,
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("score array length");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("rejects stale approval when the submission is already %s", async (status) => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status, stats: canonicalStats,
    });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("no longer pending");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("rejects stale rejection when the submission is already %s", async (status) => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status, stats: canonicalStats,
    });
    await expect(rejectStatSubmission("submission-1", "admin-1", "Stale tab")).rejects.toThrow("no longer pending");
    expect(prisma.statSubmission.updateMany).not.toHaveBeenCalled();
  });

  it("fails the approval when a competing reviewer wins the pending transition", async () => {
    prisma.statSubmission.findUnique.mockResolvedValue({
      id: "submission-1", matchId: "match-1", teamId: "team-1", eventId: "event-1",
      submittedBy: "captain-1", status: "pending", stats: canonicalStats,
    });
    prisma.statSubmission.updateMany.mockResolvedValue({ count: 0 });
    await expect(approveStatSubmission("submission-1", "admin-1")).rejects.toThrow("no longer pending");
    expect(prisma.playerStat.upsert).not.toHaveBeenCalled();
    expect(prisma.statSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "submission-1", status: "pending" },
    }));
  });
});

describe("public discovery V3 reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns public database events with drawing, live, count, and freshness metadata", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        ...publishedEventRow({ id: "event-1", status: "Ongoing" }),
        updatedAt: new Date("2026-09-12T10:00:00.000Z"),
        competitionPhases: [{ status: "active" }],
        matches: [{ id: "match-live" }],
        _count: { teams: 12 },
      },
    ]);

    await expect(getPublicDiscoveryEvents()).resolves.toEqual([
      expect.objectContaining({
        event: expect.objectContaining({ id: "event-1", status: "Ongoing" }),
        phaseStatus: "active",
        hasLiveMatch: true,
        teamCount: 12,
        updatedAt: "2026-09-12T10:00:00.000Z",
      }),
    ]);
  });

  it("rejects database failures instead of returning fixture events", async () => {
    prisma.event.findMany.mockRejectedValue(new Error("database unavailable"));
    await expect(getPublicDiscoveryEvents()).rejects.toThrow("database unavailable");
  });
});

describe("captain roster edits respect the event lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["Published", "Registration Closed"] as const)(
    "allows addPlayer when the event is %s",
    async (status) => {
      prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));
      prisma.player.create.mockResolvedValue({
        id: "player-1",
        teamId: "team-1",
        eventId: "event-1",
        displayName: "New Player",
        nickname: "NP",
        position: "Top",
        jerseyNumber: null,
      });

      await expect(
        addPlayer({ teamId: "team-1", eventId: "event-1", displayName: "New Player", nickname: "NP", position: "Top" }),
      ).resolves.toEqual(expect.objectContaining({ id: "player-1" }));
      expect(prisma.player.create).toHaveBeenCalled();
    },
  );

  it.each(["Ongoing", "Finished"] as const)("rejects addPlayer when the event is %s", async (status) => {
    prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));

    await expect(
      addPlayer({ teamId: "team-1", eventId: "event-1", displayName: "New Player", nickname: "NP", position: "Top" }),
    ).rejects.toThrow("Roster tim sudah terkunci");
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it.each(["Published", "Registration Closed"] as const)(
    "allows updatePlayer/deletePlayer when the event is %s",
    async (status) => {
      prisma.player.findUnique.mockResolvedValue({
        id: "player-1",
        team: { captainId: "captain-1", eventId: "event-1" },
      });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));
      prisma.player.update.mockResolvedValue({ id: "player-1", displayName: "Updated" });

      await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" })).resolves.toEqual(
        expect.objectContaining({ id: "player-1" }),
      );
      await expect(deletePlayer("player-1", "captain-1")).resolves.toBeUndefined();
      expect(prisma.player.update).toHaveBeenCalled();
      expect(prisma.player.delete).toHaveBeenCalled();
    },
  );

  it.each(["Ongoing", "Finished"] as const)("rejects updatePlayer/deletePlayer when the event is %s", async (status) => {
    prisma.player.findUnique.mockResolvedValue({
      id: "player-1",
      team: { captainId: "captain-1", eventId: "event-1" },
    });
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status }));

    await expect(updatePlayer("player-1", "captain-1", { displayName: "Updated" })).rejects.toThrow(
      "Roster tim sudah terkunci",
    );
    await expect(deletePlayer("player-1", "captain-1")).rejects.toThrow(
      "Roster tim sudah terkunci",
    );
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.delete).not.toHaveBeenCalled();
  });

  it.each(["single_elimination", "double_elimination", "round_robin", "group_playoffs"])(
    "locks player roster edits after a %s drawing is published",
    async () => {
      prisma.$transaction.mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
      prisma.team.findFirst.mockResolvedValue({ eventId: "event-1" });
      prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-1", status: "Registration Closed" }));
      prisma.competitionPhase.count.mockResolvedValue(1);

      await expect(addPlayer({
        teamId: "team-1", eventId: "event-1", displayName: "Late Player", nickname: "Late",
      })).rejects.toThrow("Roster tim sudah terkunci");
      expect(prisma.player.create).not.toHaveBeenCalled();
    },
  );

  it("still enforces ownership for a manipulated player ID before checking status or writing", async () => {
    prisma.player.findUnique.mockResolvedValue({
      id: "player-b",
      team: { captainId: "other-captain", eventId: "event-1" },
    });

    await expect(updatePlayer("player-b", "captain-1", { displayName: "Updated" })).rejects.toThrow(
      "Not authorized to edit this player.",
    );
    await expect(deletePlayer("player-b", "captain-1")).rejects.toThrow(
      "Not authorized to delete this player.",
    );
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.delete).not.toHaveBeenCalled();
  });
});
