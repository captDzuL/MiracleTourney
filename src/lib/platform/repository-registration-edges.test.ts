import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterization tests (refactor PR 0.3): pin edge paths of createTeamRegistrationRequest and the
// legacy setMatchResult write path that the main repository tests do not reach.

const { prisma } = vi.hoisted(() => ({
  prisma: {
    team: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    teamRegistrationRequest: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    player: { createMany: vi.fn() },
    event: { findUnique: vi.fn(), updateMany: vi.fn() },
    match: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    competitionPhase: { count: vi.fn() },
    tournamentCompletion: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { createTeamRegistrationRequest, setMatchResult } from "./repository";

const paidEvent = {
  id: "event-paid",
  slug: "paid-cup",
  status: "Published",
  participantCap: 8,
  format: "Round Robin",
  registrationFeeRequired: true,
  gameModeId: "mode-kuroko-3v3",
  registrationOpensAt: null,
  registrationClosesAt: null,
};

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    eventId: "event-paid",
    captainId: "captain-1",
    teamId: null,
    teamName: "Session United",
    teamTag: "SES",
    status: "pending_payment",
    proofImageUrl: null,
    rejectReason: null,
    expiresAt: new Date("2026-10-11T00:00:00.000Z"),
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T00:00:00.000Z"),
    reviewedAt: null,
    reviewedById: null,
    event: { id: "event-paid", stream: null },
    captain: { id: "captain-1", name: "Captain", email: "captain@test.com" },
    ...overrides,
  };
}

function draftTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    name: "Session United",
    tag: "ses",
    logoText: "SU",
    logoUrl: null,
    captainIgn: "Cap",
    captainUid: "uid-0",
    captainIsPlayer: true,
    captainName: "Captain",
    captainContact: null,
    players: [
      { displayName: " UID-1 ", nickname: " IGN-1 ", position: " GK ", jerseyNumber: 1 },
      { displayName: "UID-2", nickname: "IGN-2", position: null, jerseyNumber: null },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  prisma.teamRegistrationRequest.updateMany.mockResolvedValue({ count: 0 });
  prisma.event.findUnique.mockResolvedValue(paidEvent);
  prisma.team.count.mockResolvedValue(0);
  prisma.team.findFirst.mockResolvedValue(null);
  prisma.teamRegistrationRequest.count.mockResolvedValue(0);
  prisma.teamRegistrationRequest.findFirst.mockResolvedValue(null);
  prisma.match.count.mockResolvedValue(0);
  prisma.teamRegistrationRequest.create.mockResolvedValue(requestRow());
});

// KNOWN QUIRK: the capacity, duplicate-captain and identity checks below run outside the transaction (no
// Serializable isolation, no roster lock), unlike createCaptainWithTeam. Pinned as-is; a fix is a behavior change.
describe("createTeamRegistrationRequest guards", () => {
  const base = { eventId: "event-paid", captainId: "captain-1", name: "Session United", tag: "ses" };

  it("expires stale pending_payment and rejected requests before anything else", async () => {
    await createTeamRegistrationRequest(base);

    expect(prisma.teamRegistrationRequest.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ["pending_payment", "rejected"] }, expiresAt: { lte: expect.any(Date) } },
      data: { status: "expired" },
    });
    expect(prisma.teamRegistrationRequest.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.event.findUnique.mock.invocationCallOrder[0] as number,
    );
  });

  it("creates a pending_payment request with the tag uppercased and no team row for a manual name", async () => {
    const result = await createTeamRegistrationRequest(base);

    expect(prisma.team.create).not.toHaveBeenCalled();
    const data = prisma.teamRegistrationRequest.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ eventId: "event-paid", captainId: "captain-1", teamName: "Session United", teamTag: "SES", status: "pending_payment" });
    expect(data).not.toHaveProperty("teamId");
    expect(result).toMatchObject({ id: "request-1", status: "pending_payment", teamTag: "SES" });
  });

  it("rejects free events, which use direct registration", async () => {
    prisma.event.findUnique.mockResolvedValue({ ...paidEvent, registrationFeeRequired: false });

    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Event ini tidak membutuhkan verifikasi pembayaran.");
  });

  it("rejects a name shorter than 2 characters and a tag outside 2-5 characters", async () => {
    await expect(createTeamRegistrationRequest({ ...base, name: " A " })).rejects.toThrow("Nama tim minimal 2 karakter.");
    await expect(createTeamRegistrationRequest({ ...base, tag: "A" })).rejects.toThrow("Tag tim harus 2-5 karakter.");
    await expect(createTeamRegistrationRequest({ ...base, tag: "ABCDEF" })).rejects.toThrow("Tag tim harus 2-5 karakter.");
  });

  it("rejects a captain who already has a team or an active request in the event", async () => {
    prisma.team.findFirst.mockResolvedValueOnce({ id: "team-mine" });
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Kamu sudah mendaftarkan tim untuk event ini.");

    prisma.team.findFirst.mockResolvedValue(null);
    prisma.teamRegistrationRequest.findFirst.mockResolvedValueOnce({ id: "request-mine" });
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Kamu sudah mendaftarkan tim untuk event ini.");
    expect(prisma.teamRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it("reports a full event before a duplicate captain", async () => {
    prisma.team.count.mockResolvedValue(8);
    prisma.team.findFirst.mockResolvedValue({ id: "team-mine" });

    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Slot pendaftaran event ini sudah penuh.");
  });

  it("closes a Single Elimination event after a completed match, before the identity check", async () => {
    prisma.event.findUnique.mockResolvedValue({ ...paidEvent, format: "Single Elimination" });
    prisma.match.count.mockResolvedValue(1);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.teamRegistrationRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "request-same-name" });

    await expect(createTeamRegistrationRequest(base)).rejects.toThrow('Event "paid-cup" sudah memiliki hasil match');
  });

  it("rejects a name or tag already held by a team or a reserved request", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "team-same-name" });
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");

    prisma.team.findFirst.mockResolvedValue(null);
    prisma.teamRegistrationRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "request-same-name" });
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
  });

  it("translates a unique-constraint failure from the insert into the friendly duplicate message", async () => {
    prisma.teamRegistrationRequest.create.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "P2002" }));
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");

    prisma.teamRegistrationRequest.create.mockRejectedValueOnce(new Error("Unique constraint failed on the fields"));
    await expect(createTeamRegistrationRequest(base)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
  });

  it("rethrows other insert failures unchanged", async () => {
    const failure = Object.assign(new Error("connection lost"), { code: "P1001" });
    prisma.teamRegistrationRequest.create.mockRejectedValueOnce(failure);

    await expect(createTeamRegistrationRequest(base)).rejects.toBe(failure);
  });
});

describe("createTeamRegistrationRequest from a draft team", () => {
  const withDraft = { eventId: "event-paid", captainId: "captain-1", draftTeamId: "draft-1" };

  it("looks up the draft by captain, no event and draft source", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(draftTeamRow());
    prisma.team.create.mockResolvedValue({ id: "team-pending" });
    prisma.teamRegistrationRequest.create.mockResolvedValue(requestRow({ teamId: "team-pending" }));

    await createTeamRegistrationRequest(withDraft);

    expect(prisma.team.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: "draft-1", captainId: "captain-1", eventId: null, source: "draft" },
      include: { players: { orderBy: { createdAt: "asc" } } },
    });
  });

  // The intake team has no event yet, so its players carry no eventId (unlike copyDraftPlayersForEvent).
  it("copies the draft into an event-less registration-intake team and a trimmed roster", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(draftTeamRow());
    prisma.team.create.mockResolvedValue({ id: "team-pending" });
    prisma.teamRegistrationRequest.create.mockResolvedValue(requestRow({ teamId: "team-pending" }));

    const result = await createTeamRegistrationRequest(withDraft);

    expect(prisma.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: null,
        captainId: "captain-1",
        name: "Session United",
        tag: "SES",
        logoText: "SU",
        source: "registration-intake",
        captainIgn: "Cap",
        captainUid: "uid-0",
      }),
    });
    expect(prisma.player.createMany).toHaveBeenCalledWith({
      data: [
        { teamId: "team-pending", displayName: "UID-1", nickname: "IGN-1", position: "GK", jerseyNumber: 1 },
        { teamId: "team-pending", displayName: "UID-2", nickname: "IGN-2", position: "", jerseyNumber: null },
      ],
    });
    expect(prisma.teamRegistrationRequest.create.mock.calls[0]?.[0].data).toMatchObject({ teamId: "team-pending" });
    expect(result).toMatchObject({ teamId: "team-pending" });
  });

  it("falls back to the first two tag letters when the draft has no logo text", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(draftTeamRow({ logoText: "" }));
    prisma.team.create.mockResolvedValue({ id: "team-pending" });

    await createTeamRegistrationRequest(withDraft);

    expect(prisma.team.create.mock.calls[0]?.[0].data.logoText).toBe("SE");
  });

  it("rejects a missing draft, an empty roster and a roster with short UID or IGN", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(null);
    await expect(createTeamRegistrationRequest(withDraft)).rejects.toThrow("Draft tim tidak ditemukan untuk akun ini.");

    prisma.team.findFirst.mockResolvedValueOnce(draftTeamRow({ players: [] }));
    await expect(createTeamRegistrationRequest(withDraft)).rejects.toThrow("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");

    prisma.team.findFirst.mockResolvedValueOnce(
      draftTeamRow({ players: [{ displayName: "U", nickname: "IGN-1", position: "", jerseyNumber: null }] }),
    );
    await expect(createTeamRegistrationRequest(withDraft)).rejects.toThrow("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");

    prisma.team.findFirst.mockResolvedValueOnce(
      draftTeamRow({ players: [{ displayName: "UID-1", nickname: " I ", position: "", jerseyNumber: null }] }),
    );
    await expect(createTeamRegistrationRequest(withDraft)).rejects.toThrow("Lengkapi UID dan IGN roster draft sebelum mendaftar event.");
    expect(prisma.team.create).not.toHaveBeenCalled();
  });

  // The mocked $transaction cannot prove a rollback; this pins that the copy runs inside one transaction and that a
  // P2002 from the request insert, after the draft was copied, is translated.
  it("translates a P2002 from the request insert after the draft team and roster were copied", async () => {
    prisma.team.findFirst.mockResolvedValueOnce(draftTeamRow());
    prisma.team.create.mockResolvedValue({ id: "team-pending" });
    prisma.teamRegistrationRequest.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));

    await expect(createTeamRegistrationRequest(withDraft)).rejects.toThrow("Tag atau nama tim sudah digunakan di event ini.");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.team.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("setMatchResult (legacy write path)", () => {
  const input = { eventId: "event-1", matchId: "match-1", homeScore: 2, awayScore: 1 };

  beforeEach(() => {
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.tournamentCompletion.findUnique.mockResolvedValue(null);
    prisma.competitionPhase.count.mockResolvedValue(0);
    prisma.event.findUnique.mockResolvedValue({ format: "Round Robin" });
    prisma.match.findFirst.mockResolvedValue({
      id: "match-1",
      eventId: "event-1",
      roundLabel: "Round 1",
      homeTeamId: "team-home",
      awayTeamId: "team-away",
      homeScore: 0,
      awayScore: 0,
      status: "Scheduled",
      slot: 1,
      round: 1,
      winnerTeamId: null,
      scheduledLabel: null,
      phaseId: null,
      resultVersion: 0,
    });
    prisma.match.upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
      id: "match-1",
      eventId: "event-1",
      roundLabel: "Round 1",
      homeTeamId: "team-home",
      awayTeamId: "team-away",
      slot: 1,
      round: 1,
      scheduledLabel: null,
      ...update,
    }));
  });

  it("claims the event version, then completes the match and picks the home team as winner", async () => {
    await expect(setMatchResult(input)).resolves.toMatchObject({
      id: "match-1",
      homeScore: 2,
      awayScore: 1,
      status: "Completed",
      winnerTeamId: "team-home",
    });

    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { competitionVersion: { increment: 1 } },
    });
    expect(prisma.match.upsert).toHaveBeenCalledWith({
      where: { id: "match-1" },
      update: { homeScore: 2, awayScore: 1, status: "Completed", winnerTeamId: "team-home" },
      create: expect.objectContaining({ id: "match-1", eventId: "event-1", homeTeamId: "team-home", awayTeamId: "team-away", winnerTeamId: "team-home" }),
    });
  });

  it("picks the away team when it scores more", async () => {
    await expect(setMatchResult({ ...input, homeScore: 0, awayScore: 3 })).resolves.toMatchObject({ winnerTeamId: "team-away" });
  });

  // KNOWN QUIRK: `homeScore > awayScore ? home : away` makes the away team the winner of a drawn match.
  it("allows a draw outside Single Elimination and records the away team as winner", async () => {
    await expect(setMatchResult({ ...input, homeScore: 1, awayScore: 1 })).resolves.toMatchObject({ winnerTeamId: "team-away" });
  });

  it("rejects a draw in Single Elimination", async () => {
    prisma.event.findUnique.mockResolvedValue({ format: "Single Elimination" });

    await expect(setMatchResult({ ...input, homeScore: 1, awayScore: 1 })).rejects.toThrow("Single elimination matches cannot end in a draw.");
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  // Defensive: in production the version claim above already fails for a missing event, so this return is unreachable.
  it("returns null when the event lookup finds nothing", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(setMatchResult(input)).resolves.toBeNull();
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  describe("Single Elimination match that has no stored row yet", () => {
    const fullEventRow = {
      id: "event-1",
      slug: "se-cup",
      name: "SE Cup",
      description: "d",
      logoUrl: null,
      gameImageUrl: null,
      gameId: "game-kuroko",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      status: "Ongoing",
      participantCap: 8,
      registrationWindow: "w",
      startsAt: "2026-09-01",
      venue: "Online",
      organizerUserId: null,
      organizerName: null,
      organizerVerified: null,
      characterArtUrl: null,
      accentColor: null,
    };

    beforeEach(() => {
      prisma.match.findFirst.mockResolvedValue(null);
      prisma.team.findMany.mockResolvedValue([]);
      prisma.match.findMany.mockResolvedValue([]);
    });

    it("loads the full event and returns null when the projected bracket has no such match", async () => {
      prisma.event.findUnique.mockImplementation(async (args?: { select?: unknown }) =>
        args?.select ? { format: "Single Elimination" } : fullEventRow,
      );

      await expect(setMatchResult(input)).resolves.toBeNull();
      expect(prisma.event.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.team.findMany).toHaveBeenCalled();
      expect(prisma.match.upsert).not.toHaveBeenCalled();
    });

    it("returns null when the second full-event read finds nothing", async () => {
      prisma.event.findUnique.mockImplementation(async (args?: { select?: unknown }) =>
        args?.select ? { format: "Single Elimination" } : null,
      );

      await expect(setMatchResult(input)).resolves.toBeNull();
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });
  });

  it("returns null for an unknown match in a non-Single-Elimination event", async () => {
    prisma.match.findFirst.mockResolvedValue(null);

    await expect(setMatchResult(input)).resolves.toBeNull();
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  it("throws when the event cannot be locked", async () => {
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(setMatchResult(input)).rejects.toThrow("Event not found");
    expect(prisma.match.findFirst).not.toHaveBeenCalled();
  });

  it("is locked once the tournament is completed", async () => {
    prisma.tournamentCompletion.findUnique.mockResolvedValue({ status: "completed" });

    await expect(setMatchResult(input)).rejects.toThrow("Tournament completion locks competitive writes");
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  it("is refused when the event already has a competition phase", async () => {
    prisma.competitionPhase.count.mockResolvedValue(1);

    await expect(setMatchResult(input)).rejects.toThrow("Use the versioned competition operation to submit or correct this result.");
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  it("is refused for a match that belongs to a phase or already has a versioned result", async () => {
    prisma.match.findFirst.mockResolvedValueOnce({ id: "match-1", phaseId: "phase-1", resultVersion: 0 });
    await expect(setMatchResult(input)).rejects.toThrow("Use the versioned competition operation");

    prisma.match.findFirst.mockResolvedValueOnce({ id: "match-1", phaseId: null, resultVersion: 2 });
    await expect(setMatchResult(input)).rejects.toThrow("Use the versioned competition operation");
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });
});
