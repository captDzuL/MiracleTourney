// Moved out of platform/repository.test.ts without changes (refactor Phase 4).

import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/security/public-error";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    match: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    competitionPhase: {
      count: vi.fn(),
      findFirst: vi.fn(),
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
      deleteMany: vi.fn(),
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
      findFirst: vi.fn(),
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
    $connect: vi.fn(),
  },
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { getOpenRegistrationEventsForCaptain } from "@/lib/events/repository";
import { updatePaymentSettings } from "@/lib/platform/settings-repository";
import { getCaptainRegistrationRequests, createTeamRegistrationRequest, registerTeam, updateTeamRegistrationProof, readRosterChangeWindow } from "@/lib/registration/repository";
import { approveTeamRegistrationRequest } from "@/lib/registration/review-repository";
import { getCaptainTeams, getPlayersForTeam, getPlayersForTeams, setTeamCaptainDisplay } from "@/lib/teams/repository";
import { generateCompetitionGraph, type GroupPlayoffsConfig } from "@/lib/tournament/competition";

const platformAdmin = { id: "admin-1", role: "platform_admin" as const, email: "admin@test.com", name: "Admin" };

beforeEach(() => {
  prisma.event.updateMany.mockResolvedValue({ count: 1 });
  prisma.competitionPhase.count.mockResolvedValue(0);
  prisma.match.count.mockResolvedValue(0);
  prisma.statSubmission.updateMany.mockResolvedValue({ count: 1 });
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

  it("stores the captain WhatsApp on the team when registering without a draft", async () => {
    prisma.event.findUnique.mockResolvedValue(publishedEventRow({ id: "event-open", slug: "open-cup" }));
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.team.create.mockResolvedValue({
      id: "team-new", eventId: "event-open", captainId: "captain-1", name: "Session United", logoText: "SE", logoUrl: null,
      tag: "SES", captainName: null, captainContact: "081234567890", source: "registration",
    });

    await registerTeam({ eventId: "event-open", captainId: "captain-1", name: "Session United", tag: "ses", captainContact: "  081234567890 " });

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "registration", captainContact: "081234567890" }),
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

  it("lists a captain's teams in a stable creation order", async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await expect(getCaptainTeams("captain-1")).resolves.toEqual([]);

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { captainId: "captain-1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    );
  });

  it("rejects a registration whose draft id is not a draft with a message the captain may see", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    const rejection = registerTeam({ eventId: "event-open", captainId: "captain-1", draftTeamId: "intake-copy" });

    await expect(rejection).rejects.toBeInstanceOf(UserFacingError);
    await expect(rejection).rejects.toThrow("Draft tim tidak ditemukan untuk akun ini.");
    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "intake-copy", captainId: "captain-1", eventId: null, source: "draft" } }),
    );
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

  it("keeps the captain WhatsApp on a pending team when a paid registration has no draft", async () => {
    prisma.event.findUnique.mockResolvedValue({
      ...publishedEventRow({ id: "event-paid", slug: "paid-cup" }),
      registrationFeeRequired: true,
      registrationFeeAmount: 25000,
    });
    prisma.team.count.mockResolvedValue(3);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue({ id: "pending-team" });
    prisma.teamRegistrationRequest.create.mockResolvedValue({
      id: "request-3", eventId: "event-paid", captainId: "captain-3", teamId: "pending-team", teamName: "Session United 3", teamTag: "SE3",
      status: "pending_payment", expiresAt: new Date(), event: publishedEventRow({ id: "event-paid" }), captain: { id: "captain-3", name: "Captain 3" },
    });

    await createTeamRegistrationRequest({ eventId: "event-paid", captainId: "captain-3", name: "Session United 3", tag: "se3", captainContact: "081234567890" });

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: null, captainId: "captain-3", captainContact: "081234567890", source: "registration-intake" }),
    });
    expect(prisma.teamRegistrationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: "pending-team" }) }),
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
describe("expired payment request cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
  });

  it("removes the leftover team copy of an expired payment request, and nothing else", async () => {
    await getCaptainRegistrationRequests("captain-1");

    expect(prisma.team.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.team.deleteMany).toHaveBeenCalledWith({
      where: { eventId: null, source: "registration-intake", registrationRequest: { is: { status: "expired" } } },
    });
  });

  it("expires stale requests before removing their team copies", async () => {
    await getCaptainRegistrationRequests("captain-1");

    const expireOrder = prisma.teamRegistrationRequest.updateMany.mock.invocationCallOrder[0];
    const deleteOrder = prisma.team.deleteMany.mock.invocationCallOrder[0];
    expect(expireOrder).toBeLessThan(deleteOrder);
  });

  it("keeps the page working and logs only the error code when the cleanup fails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    prisma.team.deleteMany.mockRejectedValueOnce(
      Object.assign(new Error("Invalid prisma.team.deleteMany() invocation: { name: 'Teil secret' }"), { name: "PrismaClientKnownRequestError", code: "P2003" }),
    );

    await expect(getCaptainRegistrationRequests("captain-1")).resolves.toEqual([]);

    const lines = info.mock.calls.map(([line]) => String(line));
    const failure = lines.map((line) => JSON.parse(line)).find((event) => event.operation === "expired_request_cleanup");
    expect(failure).toEqual(expect.objectContaining({ phase: "failed", status: 500, errorCode: "p2003" }));
    expect(lines.join("|")).not.toContain("secret");
    info.mockRestore();
  });
});

describe("limited roster changes: current roster reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.player.findMany.mockResolvedValue([]);
  });

  it("hides players who were replaced when listing one team", async () => {
    await getPlayersForTeam("team-1");
    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: "team-1", removedAt: null } }));
  });

  it("hides replaced players in the batch team lookup", async () => {
    await getPlayersForTeams(["team-1", "team-2"]);
    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: { in: ["team-1", "team-2"] }, removedAt: null } }));
  });

  it("does not let a captain pick a replaced player as the displayed captain", async () => {
    prisma.player.findFirst.mockResolvedValue({ displayName: "UID-1" });
    await setTeamCaptainDisplay("team-1", "captain-1", "player-1");
    expect(prisma.player.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "player-1", teamId: "team-1", removedAt: null, team: { captainId: "captain-1" } },
    }));
  });
});

describe("readRosterChangeWindow", () => {
  const config: GroupPlayoffsConfig = {
    version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2,
    groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference"] },
    playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, avoidImmediateGroupRematches: true },
  };
  const graph = generateCompetitionGraph({ eventId: "event-1", config, teams: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `t${n}`, seed: n })) });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.competitionPhase.count.mockResolvedValue(1);
    prisma.match.count.mockResolvedValue(0);
    prisma.match.findMany.mockResolvedValue([]);
    prisma.competitionPhase.findFirst.mockResolvedValue({ configuration: { graph } });
  });

  it("is free before the drawing is published", async () => {
    prisma.competitionPhase.count.mockResolvedValue(0);
    prisma.event.findUnique.mockResolvedValue({ status: "Published", rosterChangeLimit: 2 });
    await expect(readRosterChangeWindow(prisma as never, "event-1")).resolves.toBe("free");
  });

  it("stays locked, without reading the graph, when the organizer allowed no changes", async () => {
    prisma.event.findUnique.mockResolvedValue({ status: "Registration Closed", rosterChangeLimit: 0 });
    await expect(readRosterChangeWindow(prisma as never, "event-1")).resolves.toBe("locked");
    expect(prisma.competitionPhase.findFirst).not.toHaveBeenCalled();
  });

  it("is limited while the group stage runs and the organizer allowed changes", async () => {
    prisma.event.findUnique.mockResolvedValue({ status: "Registration Closed", rosterChangeLimit: 2 });
    await expect(readRosterChangeWindow(prisma as never, "event-1")).resolves.toBe("limited");
  });

  it("is locked once a playoff match is live", async () => {
    const playoff = graph.matches.find((match) => match.groupId === null)!;
    prisma.event.findUnique.mockResolvedValue({ status: "Registration Closed", rosterChangeLimit: 2 });
    prisma.match.findMany.mockResolvedValue([{ id: playoff.id, status: "Live", scheduleStatus: "live", resultVersion: 0 }]);
    await expect(readRosterChangeWindow(prisma as never, "event-1")).resolves.toBe("locked");
  });

  it("fails closed for a legacy event without a stored graph", async () => {
    prisma.event.findUnique.mockResolvedValue({ status: "Ongoing", rosterChangeLimit: 2 });
    prisma.competitionPhase.findFirst.mockResolvedValue(null);
    await expect(readRosterChangeWindow(prisma as never, "event-1")).resolves.toBe("locked");
  });

  it("is free for an unknown event, like the existing lock", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(readRosterChangeWindow(prisma as never, "missing")).resolves.toBe("free");
  });
});