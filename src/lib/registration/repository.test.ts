import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/security/public-error";

import type { AppUser } from "@/lib/platform/types";

const { prisma, writeServerLog } = vi.hoisted(() => ({
  prisma: {
    team: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    teamRegistrationRequest: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  writeServerLog: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog }));

import {
  copyDraftPlayersForEvent,
  createOrUpdateCaptainDraftTeam,
  generateSyntheticRegistrationEmail,
  getPaymentRegistrationRequestsForAdmin,
} from "./repository";
import type { CaptainRegistrationDraft } from "./repository";

const NOW = new Date("2026-03-01T10:00:00.000Z");
const LATER = new Date("2026-03-02T10:00:00.000Z");

const admin: AppUser = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" };
const platformAdmin: AppUser = { id: "pa-1", email: "pa@test.com", name: "PA", role: "platform_admin" };
const organizer: AppUser = { id: "org-1", email: "org@test.com", name: "Org", role: "organizer" };
const captain: AppUser = { id: "cap-1", email: "cap@test.com", name: "Cap", role: "captain" };

const requestInclude = {
  event: { include: { stream: true } },
  captain: { select: { id: true, name: true, email: true } },
};

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    eventId: "event-1",
    captainId: "captain-1",
    teamId: null,
    teamName: "Alpha Squad",
    teamTag: "ALP",
    status: "pending_payment",
    proofImageUrl: null,
    rejectReason: null,
    expiresAt: LATER,
    approvedAt: null,
    approvedById: null,
    createdAt: NOW,
    updatedAt: NOW,
    captain: { id: "captain-1", name: "Budi", email: "budi@test.com" },
    ...overrides,
  };
}

function draftTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    eventId: null,
    captainId: "captain-1",
    name: "Alpha Squad",
    logoText: "AL",
    logoUrl: null,
    tag: "ALP",
    captainName: "Budi",
    captainContact: null,
    captainIgn: null,
    captainUid: null,
    captainIsPlayer: false,
    source: "draft",
    ...overrides,
  };
}

function draft(players: CaptainRegistrationDraft["players"]): CaptainRegistrationDraft {
  return {
    id: "draft-1",
    name: "Alpha Squad",
    tag: "ALP",
    logoText: "AL",
    logoUrl: null,
    captainName: "Budi",
    captainContact: null,
    captainIgn: null,
    captainUid: null,
    captainIsPlayer: false,
    players,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
  prisma.team.deleteMany.mockResolvedValue({ count: 0 });
  prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);
});

describe("generateSyntheticRegistrationEmail", () => {
  it("joins event slug and tag into a lowercase address on the miraclefc.gg domain", () => {
    const used = new Set<string>();

    const email = generateSyntheticRegistrationEmail("Spring-Cup", "ALP", used);

    expect(email).toBe("spring-cup-alp@miraclefc.gg");
    expect([...used]).toEqual(["spring-cup-alp@miraclefc.gg"]);
  });

  it("replaces every run of non-alphanumeric characters with a single dash", () => {
    expect(generateSyntheticRegistrationEmail("cup  2026!!", "A_B", new Set())).toBe("cup-2026-a-b@miraclefc.gg");
  });

  it("trims leading and trailing dashes from the local part", () => {
    expect(generateSyntheticRegistrationEmail("--cup", "alp--", new Set())).toBe("cup-alp@miraclefc.gg");
    expect(generateSyntheticRegistrationEmail("cup", "!!", new Set())).toBe("cup@miraclefc.gg");
  });

  it("drops non-ASCII letters and emoji instead of transliterating them", () => {
    expect(generateSyntheticRegistrationEmail("cup", "Ünik🔥", new Set())).toBe("cup-nik@miraclefc.gg");
  });

  it("produces an address without a local part when slug and tag have no usable characters", () => {
    expect(generateSyntheticRegistrationEmail("!!!", "???", new Set())).toBe("@miraclefc.gg");
  });

  it("appends -2, -3 and so on while the address is already used", () => {
    const used = new Set<string>();

    const emails = [
      generateSyntheticRegistrationEmail("cup", "alp", used),
      generateSyntheticRegistrationEmail("cup", "ALP", used),
      generateSyntheticRegistrationEmail("Cup", "Alp", used),
    ];

    expect(emails).toEqual(["cup-alp@miraclefc.gg", "cup-alp-2@miraclefc.gg", "cup-alp-3@miraclefc.gg"]);
    expect(used.size).toBe(3);
  });

  it("treats tags that normalize to the same text as a collision", () => {
    const used = new Set<string>();

    generateSyntheticRegistrationEmail("cup", "a b", used);
    const second = generateSyntheticRegistrationEmail("cup", "a-b", used);

    expect(second).toBe("cup-a-b-2@miraclefc.gg");
  });

  it("starts from numbered candidates already present in the set", () => {
    const used = new Set<string>(["cup-alp@miraclefc.gg", "cup-alp-2@miraclefc.gg"]);

    expect(generateSyntheticRegistrationEmail("cup", "alp", used)).toBe("cup-alp-3@miraclefc.gg");
  });

  it("keeps different tags in the same batch independent", () => {
    const used = new Set<string>();

    expect(generateSyntheticRegistrationEmail("cup", "alp", used)).toBe("cup-alp@miraclefc.gg");
    expect(generateSyntheticRegistrationEmail("cup", "bet", used)).toBe("cup-bet@miraclefc.gg");
  });
});

describe("copyDraftPlayersForEvent", () => {
  it("returns an empty list for a draft without players", () => {
    expect(copyDraftPlayersForEvent(draft([]), "team-1", "event-1")).toEqual([]);
  });

  it("copies each player with the team and event ids", () => {
    const source = draft([
      { displayName: "Budi", nickname: "Bud", position: "Mid", jerseyNumber: 7 },
      { displayName: "Sari", nickname: "Sar", position: "Jungle", jerseyNumber: null },
    ]);

    expect(copyDraftPlayersForEvent(source, "team-9", "event-3")).toEqual([
      { teamId: "team-9", eventId: "event-3", displayName: "Budi", nickname: "Bud", position: "Mid", jerseyNumber: 7 },
      { teamId: "team-9", eventId: "event-3", displayName: "Sari", nickname: "Sar", position: "Jungle", jerseyNumber: null },
    ]);
  });

  it("trims display name, nickname and position", () => {
    const source = draft([{ displayName: "  Budi  ", nickname: "\tBud\n", position: "  Mid ", jerseyNumber: 1 }]);

    const [player] = copyDraftPlayersForEvent(source, "team-1", "event-1");

    expect(player).toMatchObject({ displayName: "Budi", nickname: "Bud", position: "Mid" });
  });

  it("uses an empty position when the stored position is missing", () => {
    const source = draft([
      { displayName: "Budi", nickname: "Bud", position: undefined as unknown as string, jerseyNumber: null },
      { displayName: "Sari", nickname: "Sar", position: null as unknown as string, jerseyNumber: null },
    ]);

    const players = copyDraftPlayersForEvent(source, "team-1", "event-1");

    expect(players.map((player) => player.position)).toEqual(["", ""]);
  });

  it("keeps jersey number 0 and null as they are", () => {
    const source = draft([
      { displayName: "Budi", nickname: "Bud", position: "Mid", jerseyNumber: 0 },
      { displayName: "Sari", nickname: "Sar", position: "Mid", jerseyNumber: null },
    ]);

    const players = copyDraftPlayersForEvent(source, "team-1", "event-1");

    expect(players.map((player) => player.jerseyNumber)).toEqual([0, null]);
  });

  it("does not change the draft it copies from", () => {
    const source = draft([{ displayName: " Budi ", nickname: " Bud ", position: " Mid ", jerseyNumber: 1 }]);

    copyDraftPlayersForEvent(source, "team-1", "event-1");

    expect(source.players).toEqual([{ displayName: " Budi ", nickname: " Bud ", position: " Mid ", jerseyNumber: 1 }]);
  });
});

describe("createOrUpdateCaptainDraftTeam", () => {
  const input = { captainId: "captain-1", captainName: "Budi", name: "Alpha Squad", tag: "ALP" };

  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
  });

  it("looks for and writes the draft inside one Serializable transaction", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow());

    await createOrUpdateCaptainDraftTeam(input);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
  });

  it("tries again after a write conflict, so two requests at once end with one draft", async () => {
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    let attempts = 0;
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => {
      attempts += 1;
      if (attempts === 1) throw conflict;
      return operation(prisma);
    });
    prisma.team.findFirst.mockResolvedValue({ id: "draft-1" });
    prisma.team.update.mockResolvedValue(draftTeamRow({ id: "draft-1" }));

    await expect(createOrUpdateCaptainDraftTeam(input)).resolves.toMatchObject({ id: "draft-1" });
    expect(attempts).toBe(2);
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  it("looks for the captain's existing draft outside any event", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow());

    await createOrUpdateCaptainDraftTeam(input);

    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { captainId: "captain-1", eventId: null, source: "draft" },
      select: { id: true },
    });
  });

  it("creates a new draft when the captain has none", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow({ id: "draft-new" }));

    const team = await createOrUpdateCaptainDraftTeam(input);

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: {
        eventId: null,
        captainId: "captain-1",
        captainName: "Budi",
        name: "Alpha Squad",
        logoText: "AL",
        tag: "ALP",
        source: "draft",
      },
    });
    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(team).toEqual({
      id: "draft-new",
      captainId: "captain-1",
      name: "Alpha Squad",
      logoText: "AL",
      tag: "ALP",
      captainName: "Budi",
      captainIsPlayer: false,
      source: "draft",
    });
  });

  it("updates the existing draft instead of creating another one", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "draft-1" });
    prisma.team.update.mockResolvedValue(draftTeamRow({ name: "Alpha Prime", tag: "APR", logoText: "AP" }));

    const team = await createOrUpdateCaptainDraftTeam({ ...input, name: "Alpha Prime", tag: "APR" });

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data: {
        eventId: null,
        captainId: "captain-1",
        captainName: "Budi",
        name: "Alpha Prime",
        logoText: "AP",
        tag: "APR",
        source: "draft",
      },
    });
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(team).toMatchObject({ id: "draft-1", name: "Alpha Prime", tag: "APR", logoText: "AP" });
  });

  it("trims the name, uppercases and trims the tag and derives the logo text from the tag", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow());

    await createOrUpdateCaptainDraftTeam({ ...input, name: "  Alpha Squad  ", tag: "  mir " });

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Alpha Squad", tag: "MIR", logoText: "MI" }),
    });
  });

  it("uses the whole tag as logo text when the tag has one character", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow());

    await createOrUpdateCaptainDraftTeam({ ...input, tag: "x" });

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tag: "X", logoText: "X" }),
    });
  });

  it("trims the captain name", async () => {
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue(draftTeamRow());

    await createOrUpdateCaptainDraftTeam({ ...input, captainName: "  Budi  " });

    expect(prisma.team.create).toHaveBeenCalledWith({ data: expect.objectContaining({ captainName: "Budi" }) });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of spaces", { name: "   " }],
    ["an empty tag", { tag: "" }],
    ["a tag of spaces", { tag: "  " }],
  ])("refuses %s and writes nothing", async (_label, override) => {
    const failure = await createOrUpdateCaptainDraftTeam({ ...input, ...override }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect((failure as Error).message).toBe("Nama dan tag tim wajib diisi.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("propagates a lookup failure without writing", async () => {
    prisma.team.findFirst.mockRejectedValue(new Error("lookup failed"));

    await expect(createOrUpdateCaptainDraftTeam(input)).rejects.toThrow("lookup failed");

    expect(prisma.team.create).not.toHaveBeenCalled();
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it("propagates a create failure unchanged", async () => {
    const failure = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockRejectedValue(failure);

    await expect(createOrUpdateCaptainDraftTeam(input)).rejects.toBe(failure);
  });

  it("propagates an update failure unchanged", async () => {
    prisma.team.findFirst.mockResolvedValue({ id: "draft-1" });
    prisma.team.update.mockRejectedValue(new Error("update failed"));

    await expect(createOrUpdateCaptainDraftTeam(input)).rejects.toThrow("update failed");
  });
});

describe("getPaymentRegistrationRequestsForAdmin", () => {
  it("expires stale requests before reading, then lists all requests newest first for an admin", async () => {
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([]);

    await expect(getPaymentRegistrationRequestsForAdmin(admin)).resolves.toEqual([]);

    expect(prisma.teamRegistrationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending_payment", "rejected"] },
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: "expired" },
    });
    expect(prisma.team.deleteMany).toHaveBeenCalledWith({
      where: { eventId: null, source: "registration-intake", registrationRequest: { is: { status: "expired" } } },
    });
    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith({
      where: {},
      include: requestInclude,
      orderBy: { createdAt: "desc" },
    });
    expect(prisma.teamRegistrationRequest.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.teamRegistrationRequest.findMany.mock.invocationCallOrder[0]);
    expect(prisma.team.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.teamRegistrationRequest.findMany.mock.invocationCallOrder[0]);
  });

  it("does not add an event filter for a platform admin", async () => {
    await getPaymentRegistrationRequestsForAdmin(platformAdmin);

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("limits an organizer to requests for their own events", async () => {
    await getPaymentRegistrationRequestsForAdmin(organizer);

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { event: { organizerUserId: "org-1" } } }),
    );
  });

  it("applies the event filter", async () => {
    await getPaymentRegistrationRequestsForAdmin(admin, { eventId: "event-1" });

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "event-1" } }),
    );
  });

  it("applies the status filter", async () => {
    await getPaymentRegistrationRequestsForAdmin(admin, { status: "pending_review" });

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending_review" } }),
    );
  });

  it("combines event filter, status filter and organizer scope", async () => {
    await getPaymentRegistrationRequestsForAdmin(organizer, { eventId: "event-1", status: "rejected" });

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "event-1", status: "rejected", event: { organizerUserId: "org-1" } },
      }),
    );
  });

  it("ignores empty filter values", async () => {
    await getPaymentRegistrationRequestsForAdmin(admin, { eventId: "" });

    expect(prisma.teamRegistrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("maps rows to registration requests and keeps their order", async () => {
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([
      requestRow({
        id: "request-2",
        status: "pending_review",
        teamId: "team-2",
        proofImageUrl: "/proof.png",
        teamName: "Beta",
        teamTag: "BET",
      }),
      requestRow({ id: "request-1", status: "rejected", rejectReason: "Bukti buram", captain: null }),
    ]);

    const requests = await getPaymentRegistrationRequestsForAdmin(admin);

    expect(requests).toEqual([
      {
        id: "request-2",
        eventId: "event-1",
        captainId: "captain-1",
        teamId: "team-2",
        teamName: "Beta",
        teamTag: "BET",
        status: "pending_review",
        proofImageUrl: "/proof.png",
        expiresAt: LATER,
        createdAt: NOW,
        updatedAt: NOW,
        captain: { id: "captain-1", name: "Budi", email: "budi@test.com" },
      },
      {
        id: "request-1",
        eventId: "event-1",
        captainId: "captain-1",
        teamName: "Alpha Squad",
        teamTag: "ALP",
        status: "rejected",
        rejectReason: "Bukti buram",
        expiresAt: LATER,
        createdAt: NOW,
        updatedAt: NOW,
        captain: null,
      },
    ]);
  });

  it("rejects other roles before the expiry cleanup writes anything and before reading requests", async () => {
    await expect(getPaymentRegistrationRequestsForAdmin(captain)).rejects.toThrow("Not authorized");

    expect(prisma.teamRegistrationRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.team.deleteMany).not.toHaveBeenCalled();
    expect(prisma.teamRegistrationRequest.findMany).not.toHaveBeenCalled();
  });

  it("propagates an expiry failure without reading requests", async () => {
    prisma.teamRegistrationRequest.updateMany.mockRejectedValue(new Error("expire failed"));

    await expect(getPaymentRegistrationRequestsForAdmin(admin)).rejects.toThrow("expire failed");

    expect(prisma.teamRegistrationRequest.findMany).not.toHaveBeenCalled();
  });

  it("still returns requests when cleaning up expired team copies fails, and logs the failure", async () => {
    prisma.team.deleteMany.mockRejectedValue(Object.assign(new Error("cleanup failed"), { code: "P1001" }));
    prisma.teamRegistrationRequest.findMany.mockResolvedValue([requestRow()]);

    const requests = await getPaymentRegistrationRequestsForAdmin(admin);

    expect(requests).toHaveLength(1);
    expect(writeServerLog).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "failed", operation: "expired_request_cleanup", status: 500, errorCode: "P1001" }),
    );
  });

  it("propagates a read failure", async () => {
    prisma.teamRegistrationRequest.findMany.mockRejectedValue(new Error("read failed"));

    await expect(getPaymentRegistrationRequestsForAdmin(admin)).rejects.toThrow("read failed");
  });
});
