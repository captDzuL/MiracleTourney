import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, tx } = vi.hoisted(() => {
  const createClient = () => ({
    event: { findUnique: vi.fn() },
    match: { count: vi.fn() },
    paymentSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    player: { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    team: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    teamRegistrationRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  });
  const tx = createClient();
  return {
    tx,
    prisma: {
      ...createClient(),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/platform/demo-store", () => ({
  createTeamRegistrationRequest: vi.fn(),
  getCaptainRegistrationRequests: vi.fn(),
  getPaymentSettings: vi.fn(),
  registerTeam: vi.fn(),
}));

import {
  approveTeamRegistrationRequest,
  assertCaptainCanUploadPaymentProof,
  createTeamRegistrationRequest,
  getPaymentRegistrationRequestsForAdmin,
  rejectTeamRegistrationRequest,
  registerTeam,
  updatePaymentSettings,
  updateTeamRegistrationProof,
} from "@/modules/registrations";

const captain = { userId: "captain-1", role: "captain" as const, tenantId: null };
const organizer = { userId: "organizer-1", role: "organizer" as const, tenantId: "organizer-1" };
const legacyAdmin = { userId: "legacy-1", role: "organizer" as const, tenantId: "legacy-1" };
const platformAdmin = { userId: "platform-1", role: "platform_admin" as const, tenantId: null };

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    slug: "event-1",
    status: "Published",
    participantCap: 8,
    format: "Single Elimination",
    registrationFeeRequired: false,
    registrationFeeAmount: null,
    organizerUserId: "organizer-1",
    ...overrides,
  };
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    eventId: "event-1",
    captainId: "captain-1",
    teamId: null,
    teamName: "Session United",
    teamTag: "SES",
    status: "pending_review",
    proofImageUrl: "/proof.png",
    rejectReason: null,
    expiresAt: new Date(Date.now() + 60_000),
    approvedAt: null,
    approvedById: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    event: eventRow(),
    captain: { id: "captain-1", name: "Captain" },
    ...overrides,
  };
}

describe("registrations authorization and transactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("denies another captain before payment proof upload", async () => {
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);

    await expect(assertCaptainCanUploadPaymentProof(captain, "request-other")).rejects.toThrow(
      "Pendaftaran pembayaran tidak ditemukan.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechecks proof ownership and mutable state on the update transaction client", async () => {
    prisma.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow({ status: "pending_payment" }));
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(null);

    await expect(updateTeamRegistrationProof(captain, "request-1", "/new-proof.png")).rejects.toThrow(
      "Pendaftaran pembayaran tidak ditemukan.",
    );
    expect(tx.teamRegistrationRequest.update).not.toHaveBeenCalled();
  });

  it("scopes organizer and legacy admin listings while platform admin remains global", async () => {
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);

    await getPaymentRegistrationRequestsForAdmin(organizer);
    await getPaymentRegistrationRequestsForAdmin(legacyAdmin);
    await getPaymentRegistrationRequestsForAdmin(platformAdmin);

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { event: { organizerUserId: "organizer-1" } },
    }));
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { event: { organizerUserId: "legacy-1" } },
    }));
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ where: {} }));
  });

  it("authorizes and approves from the stored request on one transaction client", async () => {
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow());
    tx.team.count.mockResolvedValue(1);
    tx.team.findFirst.mockResolvedValue(null);
    tx.match.count.mockResolvedValue(0);
    tx.team.create.mockResolvedValue({
      id: "team-1", eventId: "event-1", captainId: "captain-1", name: "Session United", logoText: "SE", tag: "SES", source: "registration",
    });
    tx.teamRegistrationRequest.update.mockResolvedValue(requestRow({ status: "approved", teamId: "team-1" }));

    await expect(approveTeamRegistrationRequest(organizer, "request-1")).resolves.toMatchObject({ id: "team-1" });
    expect(prisma.teamRegistrationRequest.findFirst).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request-1" } }));
    expect(tx.teamRegistrationRequest.update).toHaveBeenCalledOnce();
  });

  it("rejects cross-tenant review on the same transaction client", async () => {
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow({ event: eventRow({ organizerUserId: "organizer-2" }) }));

    await expect(rejectTeamRegistrationRequest(organizer, "request-1", "Bukti tidak sesuai.")).rejects.toThrow("Not authorized");
    expect(tx.teamRegistrationRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a linked team from another captain or request context", async () => {
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow({ teamId: "team-linked" }));
    tx.team.count.mockResolvedValue(1);
    tx.team.findFirst.mockResolvedValue(null);
    tx.match.count.mockResolvedValue(0);
    tx.team.findUnique.mockResolvedValue({ id: "team-linked", captainId: "captain-2", eventId: "event-1", source: "registration" });

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1")).rejects.toThrow(
      "Tim terkait tidak cocok dengan pendaftaran pembayaran.",
    );
    expect(tx.team.update).not.toHaveBeenCalled();
  });

  it("performs final free-registration capacity checks on the transaction client", async () => {
    tx.event.findUnique.mockResolvedValue(eventRow({ participantCap: 1 }));
    tx.team.count.mockResolvedValue(1);

    await expect(registerTeam({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Slot pendaftaran event ini sudah penuh.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
  });

  it("rejects a forged draft team when creating a paid request", async () => {
    tx.event.findUnique.mockResolvedValue(eventRow({ registrationFeeRequired: true, registrationFeeAmount: 25000 }));
    tx.team.findUnique.mockResolvedValue({ id: "draft-other", captainId: "captain-2", eventId: null, source: "draft" });

    await expect(createTeamRegistrationRequest({ eventId: "event-1", captainId: "captain-1", draftTeamId: "draft-other" })).rejects.toThrow(
      "Draft tim tidak ditemukan untuk akun ini.",
    );
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects forged draft IDs during %s on the transaction client", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));
    tx.team.findFirst.mockResolvedValue(null);

    await expect(operation({ eventId: "event-1", captainId: "captain-1", draftTeamId: "draft-other" })).rejects.toThrow(
      "Draft tim tidak ditemukan untuk akun ini.",
    );
    expect(prisma.team.findFirst).not.toHaveBeenCalled();
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects closed events during %s", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      status: "Registration Closed",
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));

    await expect(operation({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Event tidak valid atau sudah tidak membuka pendaftaran.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects capacity races during %s", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      participantCap: 1,
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));
    tx.team.count.mockResolvedValue(1);
    tx.team.findFirst.mockResolvedValue(null);
    tx.match.count.mockResolvedValue(0);

    await expect(operation({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Slot pendaftaran event ini sudah penuh.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects duplicate captain registration during %s", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));
    tx.team.count.mockResolvedValue(0);
    tx.team.findFirst.mockResolvedValueOnce({ id: "existing-team" }).mockResolvedValueOnce(null);
    tx.match.count.mockResolvedValue(0);

    await expect(operation({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Kamu sudah mendaftarkan tim untuk event ini.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects duplicate team name or tag during %s", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));
    tx.team.count.mockResolvedValue(0);
    tx.team.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "identity-conflict" });
    tx.match.count.mockResolvedValue(0);

    await expect(operation({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      "Tag atau nama tim sudah digunakan di event ini.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ["free registration", registerTeam, false],
    ["paid request", createTeamRegistrationRequest, true],
  ])("rejects completed single-elimination brackets during %s", async (_label, operation, paid) => {
    tx.event.findUnique.mockResolvedValue(eventRow({
      registrationFeeRequired: paid,
      registrationFeeAmount: paid ? 25000 : null,
    }));
    tx.team.count.mockResolvedValue(0);
    tx.team.findFirst.mockResolvedValue(null);
    tx.match.count.mockResolvedValue(1);

    await expect(operation({ eventId: "event-1", captainId: "captain-1", name: "Session United", tag: "SES" })).rejects.toThrow(
      'Event "event-1" sudah memiliki hasil match, jadi pendaftaran tim baru ditutup.',
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an approval that races with a team name or tag collision", async () => {
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow());
    tx.team.count.mockResolvedValue(1);
    tx.team.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "identity-conflict" });
    tx.match.count.mockResolvedValue(0);

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1")).rejects.toThrow(
      "Tag atau nama tim sudah digunakan di event ini.",
    );
    expect(tx.team.create).not.toHaveBeenCalled();
    expect(tx.teamRegistrationRequest.update).not.toHaveBeenCalled();
  });

  it("keeps an expired pending_review request reviewable", async () => {
    tx.teamRegistrationRequest.findFirst.mockResolvedValue(requestRow({ expiresAt: new Date("2026-01-01T00:00:00.000Z") }));
    tx.team.count.mockResolvedValue(1);
    tx.team.findFirst.mockResolvedValue(null);
    tx.match.count.mockResolvedValue(0);
    tx.team.create.mockResolvedValue({
      id: "team-1", eventId: "event-1", captainId: "captain-1", name: "Session United", logoText: "SE", tag: "SES", source: "registration",
    });
    tx.teamRegistrationRequest.update.mockResolvedValue(requestRow({ status: "approved", teamId: "team-1" }));

    await expect(approveTeamRegistrationRequest(platformAdmin, "request-1")).resolves.toMatchObject({ id: "team-1" });
  });

  it("allows only platform admin to update global payment settings", async () => {
    tx.paymentSettings.upsert.mockResolvedValue({ id: "global", qrisImageUrl: "/qris.png", instructions: null });

    await expect(updatePaymentSettings(organizer, { qrisImageUrl: "/qris.png" })).rejects.toThrow("Not authorized");
    await expect(updatePaymentSettings(platformAdmin, { qrisImageUrl: "/qris.png" })).resolves.toMatchObject({ id: "global" });
    expect(tx.paymentSettings.upsert).toHaveBeenCalledOnce();
  });
});