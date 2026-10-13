/**
 * Runs closing registration, drawing, swapping and locking against a real PostgreSQL database, because
 * what matters here (one lock winning, teams created in one transaction, the competition engine working
 * on the result) only means something with real transactions.
 *
 * Opt in with SOLO_TEST_DATABASE_URL, which must point at a local database that already has every
 * migration applied. Without it the whole file is skipped. Each run creates rows under a unique
 * prefix and deletes them afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.SOLO_TEST_DATABASE_URL ?? "";

function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

if (databaseUrl && !isLocalDatabase(databaseUrl)) {
  throw new Error("SOLO_TEST_DATABASE_URL must point at a local database. Refusing to run against a remote host.");
}

const run = `solodr${Date.now().toString(36)}`;

type Modules = {
  prisma: typeof import("@/lib/platform/db").prisma;
  reg: typeof import("./registration-repository");
  close: typeof import("./close-registration");
  draw: typeof import("./draw-repository");
  read: typeof import("./organizer-read");
  platform: typeof import("@/lib/platform/repository");
  operations: typeof import("@/lib/tournament/operations");
};
let m: Modules;

const createdEvents: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

type EventOptions = Partial<{ cap: number; fee: boolean; status: string; entryMode: string; organizerUserId: string | null }>;

async function makeEvent(options: EventOptions = {}) {
  counter += 1;
  const event = await m.prisma.event.create({
    data: {
      slug: `${run}-event-${counter}`,
      name: `Solo Draw IT ${counter}`,
      description: "integration test",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: options.status ?? "Published",
      participantCap: options.cap ?? 2,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      entryMode: options.entryMode ?? "solo",
      registrationFeeRequired: options.fee ?? false,
      organizerUserId: options.organizerUserId ?? null,
    },
  });
  createdEvents.push(event.id);
  return event;
}

async function makeUser(role = "player") {
  counter += 1;
  const user = await m.prisma.user.create({
    data: { email: `${run}-u${counter}@test.local`, name: `User ${counter}`, role, passwordHash: "x" },
  });
  createdUsers.push(user.id);
  return user;
}

let playerCounter = 0;
async function join(eventId: string, position: string, extra: Partial<Parameters<Modules["reg"]["registerSolo"]>[0]> = {}) {
  playerCounter += 1;
  const user = await makeUser();
  return m.reg.registerSolo({
    eventId,
    userId: user.id,
    ign: `Ign${playerCounter}`,
    uid: `UID-${run}-${playerCounter}`,
    primaryPosition: position,
    secondaryPosition: null,
    willingCaptain: false,
    whatsapp: "6281234567890",
    ...extra,
  });
}

async function joinMany(eventId: string, position: string, count: number) {
  const results = [];
  for (let i = 0; i < count; i += 1) results.push(await join(eventId, position));
  return results;
}

/** An organizer-owned free event with a full set of players for `teams` teams (1 keeper + 4 field each). */
async function setUpEvent(teams = 2, options: EventOptions = {}) {
  const organizer = await makeUser("organizer");
  const event = await makeEvent({ cap: teams, organizerUserId: organizer.id, ...options });
  await joinMany(event.id, "Goalkeeper", teams);
  await joinMany(event.id, "Forward", teams * 4);
  return { organizer: asActor(organizer), event };
}

const asActor = (user: { id: string; email: string; name: string; role: string }) =>
  ({ id: user.id, email: user.email, name: user.name, role: user.role }) as import("@/lib/platform/types").AppUser;

async function closeAndDraw(teams = 2, seed = "seed-1") {
  const { organizer, event } = await setUpEvent(teams);
  const preview = await m.close.previewCloseSolo({ actor: organizer, eventId: event.id });
  await m.close.closeSoloRegistration({ actor: organizer, eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: preview.competitionVersion });
  const draw = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed });
  return { organizer, event, draw };
}

const eventRow = (id: string) => m.prisma.event.findUniqueOrThrow({ where: { id } });

/** The draw as a screen last saw it: what a swap or a lock has to send back. */
const seen = async (drawId: string) => (await m.prisma.soloDraw.findUniqueOrThrow({ where: { id: drawId } })).updatedAt;
const lockDraw = async (actor: import("@/lib/platform/types").AppUser, drawId: string) =>
  m.draw.lockSoloDraw({ actor, drawId, expectedUpdatedAt: await seen(drawId) });
const swapDraw = async (actor: import("@/lib/platform/types").AppUser, drawId: string, a: string, b: string) =>
  m.draw.swapSoloPlayers({ actor, drawId, a, b, expectedUpdatedAt: await seen(drawId) });

describe.skipIf(!databaseUrl)("solo draw repository (real database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    m = {
      prisma: (await import("@/lib/platform/db")).prisma,
      reg: await import("./registration-repository"),
      close: await import("./close-registration"),
      draw: await import("./draw-repository"),
      read: await import("./organizer-read"),
      platform: await import("@/lib/platform/repository"),
      operations: await import("@/lib/tournament/operations"),
    };
  });

  afterAll(async () => {
    if (!m) return;
    await m.prisma.event.deleteMany({ where: { id: { in: createdEvents } } });
    await m.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await m.prisma.$disconnect();
  });

  describe("closing registration", () => {
    it("previews who would be left out, who still blocks, and how many are queued", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      await joinMany(event.id, "Goalkeeper", 2);
      const keeper = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id } });
      await m.reg.uploadSoloProof({ userId: keeper.userId, registrationId: keeper.id, proofImageUrl: "/proof.png" });
      await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id, status: "pending_payment" }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const preview = await m.close.previewCloseSolo({ actor: asActor(organizer), eventId: event.id });

      expect(preview.pendingBlockers.map((entry) => entry.status)).toEqual(["pending_review"]);
      expect(preview.plan.teamCount).toBe(0);
      expect(preview.feeRequired).toBe(true);
      expect(preview.queuedCount).toBe(0);
      expect(JSON.stringify(preview)).not.toContain("6281234567890");
    });

    it("closes a free event whose players all fit, writes the audit trail and raises the version", async () => {
      const { organizer, event } = await setUpEvent(2);
      const before = await eventRow(event.id);

      await m.close.closeSoloRegistration({ actor: organizer, eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: before.competitionVersion });

      const after = await eventRow(event.id);
      expect(after.status).toBe("Registration Closed");
      expect(after.competitionVersion).toBe(before.competitionVersion + 1);
      const audit = await m.prisma.competitionAuditLog.findFirstOrThrow({ where: { eventId: event.id, action: "solo_registration_closed" } });
      expect(audit.actorUserId).toBe(organizer.id);
      expect(audit.payload).toEqual({ teamCount: 2, unplacedCount: 0, queuedReleased: 0 });
    });

    it("refuses while a payment is still open, but not for one past its deadline", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      await join(event.id, "Forward");
      const { competitionVersion } = await eventRow(event.id);

      await expect(
        m.close.closeSoloRegistration({ actor: asActor(organizer), eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: competitionVersion }),
      ).rejects.toThrow("Masih ada pembayaran yang belum selesai");

      await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await m.close.closeSoloRegistration({ actor: asActor(organizer), eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: competitionVersion });
      expect((await eventRow(event.id)).status).toBe("Registration Closed");
      expect(await m.prisma.soloRegistration.count({ where: { eventId: event.id, status: "expired" } })).toBe(1);
    });

    it("refuses until every player who will not get a team is confirmed for a refund", async () => {
      const { organizer, event } = await setUpEvent(2);
      const extra = await join(event.id, "Forward");
      expect(extra.outcome).toBe("queued");
      // A third keeper can only be approved if a slot frees, so make room by raising the cap's worth of players.
      await m.prisma.soloRegistration.update({ where: { id: extra.registration.id }, data: { status: "approved", slotHeldAt: new Date(), approvedAt: new Date() } });
      const preview = await m.close.previewCloseSolo({ actor: organizer, eventId: event.id });
      expect(preview.willBeUnplaced.map((entry) => entry.id)).toEqual([extra.registration.id]);

      await expect(
        m.close.closeSoloRegistration({ actor: organizer, eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: preview.competitionVersion }),
      ).rejects.toThrow("Konfirmasi dulu pemain yang tidak masuk tim");
      expect((await eventRow(event.id)).status).toBe("Published");

      await m.close.closeSoloRegistration({ actor: organizer, eventId: event.id, confirmRefundIds: [extra.registration.id], expectedCompetitionVersion: preview.competitionVersion });
      expect((await eventRow(event.id)).status).toBe("Registration Closed");
    });

    it("lets go of the queue with a reason the player can read", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      const queued = await join(event.id, "Forward");
      expect(queued.outcome).toBe("queued");
      const { competitionVersion } = await eventRow(event.id);

      await m.close.closeSoloRegistration({ actor: asActor(organizer), eventId: event.id, confirmRefundIds: [], expectedCompetitionVersion: competitionVersion });

      const row = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: queued.registration.id } });
      expect(row).toMatchObject({ status: "withdrawn", rejectReason: "Pendaftaran ditutup." });
      expect(row.withdrawnAt).toBeInstanceOf(Date);
    });

    it("refuses another organizer, a team event, an event that is not open, and stale data", async () => {
      const { organizer, event } = await setUpEvent(2);
      const stranger = asActor(await makeUser("organizer"));
      const { competitionVersion } = await eventRow(event.id);
      const close = (actor = organizer, eventId = event.id, version = competitionVersion) =>
        m.close.closeSoloRegistration({ actor, eventId, confirmRefundIds: [], expectedCompetitionVersion: version });

      await expect(close(stranger)).rejects.toThrow("Not authorized");
      await expect(close(organizer, event.id, competitionVersion + 5)).rejects.toThrow("Data sudah berubah");
      const teamEvent = await makeEvent({ entryMode: "team", organizerUserId: organizer.id });
      await expect(close(organizer, teamEvent.id)).rejects.toThrow("bukan event solo");
      const draft = await makeEvent({ status: "Draft", organizerUserId: organizer.id });
      await expect(close(organizer, draft.id)).rejects.toThrow("hanya bisa ditutup saat event dibuka");
      expect((await eventRow(event.id)).status).toBe("Published");
    });
  });

  describe("drawing", () => {
    it("refuses to draw before registration is closed", async () => {
      const { organizer, event } = await setUpEvent(2);
      await expect(m.draw.createSoloDraw({ actor: organizer, eventId: event.id })).rejects.toThrow("Tutup pendaftaran dulu");
    });

    it("refuses when fewer than two teams can be formed", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, status: "Registration Closed" });
      await joinMany(event.id, "Forward", 3).catch(() => undefined);
      await expect(m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id })).rejects.toThrow("belum cukup untuk membentuk 2 tim");
    });

    it("keeps a draft with one keeper and one captain in every team, and nobody twice", async () => {
      const { draw } = await closeAndDraw(2);

      expect(draw).toMatchObject({ version: 1, status: "draft", teamCount: 2, unplacedCount: 0, canLock: true });
      expect(draw.teams).toHaveLength(2);
      for (const team of draw.teams) {
        expect(team.members).toHaveLength(5);
        expect(team.members.filter((member) => member.position === "Goalkeeper")).toHaveLength(1);
        expect(team.members.filter((member) => member.isCaptain)).toHaveLength(1);
      }
      const ids = draw.teams.flatMap((team) => team.members.map((member) => member.registrationId));
      expect(new Set(ids).size).toBe(10);
      expect(JSON.stringify(draw)).not.toContain("6281234567890");
    });

    it("draws again as a new version, sets the old draft aside, and gives the same result for the same seed", async () => {
      const { organizer, event, draw: first } = await closeAndDraw(2, "same-seed");
      const second = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed: "same-seed" });
      const third = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed: "another-seed" });

      expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
      expect(second.teams).toEqual(first.teams);
      expect(third.teams).not.toEqual(first.teams);
      const statuses = await m.prisma.soloDraw.findMany({ where: { eventId: event.id }, orderBy: { version: "asc" }, select: { status: true } });
      expect(statuses.map((row) => row.status)).toEqual(["superseded", "superseded", "draft"]);
      expect((await m.draw.getSoloDrawView({ actor: organizer, eventId: event.id }))?.id).toBe(third.id);
    });

    it("lists approved players who did not make a team, with whether a refund is still owed", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      const players = [...(await joinMany(event.id, "Goalkeeper", 2)), ...(await joinMany(event.id, "Forward", 8))];
      await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id }, data: { status: "approved", expiresAt: null, approvedAt: new Date() } });
      const extra = await join(event.id, "Forward");
      await m.prisma.soloRegistration.update({ where: { id: extra.registration.id }, data: { status: "approved", approvedAt: new Date() } });
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      expect(players).toHaveLength(10);

      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "refund" });
      expect(draw.unplacedCount).toBe(1);
      expect(draw.unplaced).toEqual([expect.objectContaining({ registrationId: extra.registration.id, needsRefund: true, refundedAt: null })]);

      await m.draw.markSoloRefunded({ actor: asActor(organizer), registrationId: extra.registration.id, note: "Transfer ulang" });
      const after = await m.draw.getSoloDrawView({ actor: asActor(organizer), eventId: event.id });
      expect(after?.unplaced[0]).toMatchObject({ needsRefund: false });
      expect(after?.unplaced[0].refundedAt).toBeInstanceOf(Date);
      await expect(m.draw.markSoloRefunded({ actor: asActor(organizer), registrationId: extra.registration.id })).rejects.toThrow("sudah dicatat");
    });

    it("refuses another organizer", async () => {
      const { event } = await closeAndDraw(2);
      const stranger = asActor(await makeUser("organizer"));
      await expect(m.draw.createSoloDraw({ actor: stranger, eventId: event.id })).rejects.toThrow("Not authorized");
      await expect(m.draw.getSoloDrawView({ actor: stranger, eventId: event.id })).rejects.toThrow("Not authorized");
    });
  });

  describe("swapping", () => {
    const fieldPlayer = (team: { members: readonly { registrationId: string; position: string }[] }) =>
      team.members.find((member) => member.position !== "Goalkeeper")!.registrationId;
    const keeper = (team: { members: readonly { registrationId: string; position: string }[] }) =>
      team.members.find((member) => member.position === "Goalkeeper")!.registrationId;

    it("moves two field players to each other's team and keeps the rules", async () => {
      const { organizer, draw } = await closeAndDraw(2);
      const [one, two] = draw.teams;
      const a = fieldPlayer(one);
      const b = fieldPlayer(two);

      const swapped = await swapDraw(organizer, draw.id, a, b);

      expect(swapped.teams[0].members.map((member) => member.registrationId)).toContain(b);
      expect(swapped.teams[1].members.map((member) => member.registrationId)).toContain(a);
      for (const team of swapped.teams) {
        expect(team.members.filter((member) => member.position === "Goalkeeper")).toHaveLength(1);
        expect(team.members.filter((member) => member.isCaptain)).toHaveLength(1);
      }
      const audit = await m.prisma.competitionAuditLog.findMany({ where: { eventId: draw.eventId, action: "solo_draw_swapped" } });
      expect(audit).toHaveLength(1);
    });

    it("refuses a keeper for a field player, two players of one team, and a stranger's draw", async () => {
      const { organizer, draw } = await closeAndDraw(2);
      const [one, two] = draw.teams;
      const swap = (a: string, b: string, actor = organizer) => swapDraw(actor, draw.id, a, b);

      await expect(swap(keeper(one), fieldPlayer(two))).rejects.toThrow("posisi wajib");
      await expect(swap(fieldPlayer(one), one.members.find((member) => member.registrationId !== fieldPlayer(one) && member.position !== "Goalkeeper")!.registrationId)).rejects.toThrow("tim yang berbeda");
      await expect(swap(fieldPlayer(one), fieldPlayer(two), asActor(await makeUser("organizer")))).rejects.toThrow("Not authorized");
      await expect(swap(fieldPlayer(one), "nope")).rejects.toThrow();
    });

    it("refuses once teams are locked, and on a draw that was set aside", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      const a = fieldPlayer(draw.teams[0]);
      const b = fieldPlayer(draw.teams[1]);
      const newer = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed: "newer" });

      await expect(swapDraw(organizer, draw.id, a, b)).rejects.toThrow("sudah diganti");
      await lockDraw(organizer, newer.id);
      await expect(
        swapDraw(organizer, newer.id, fieldPlayer(newer.teams[0]), fieldPlayer(newer.teams[1])),
      ).rejects.toThrow("Tim sudah dikunci");
    });
  });

  describe("locking", () => {
    it("creates ordinary teams and players from the draw, mapped as the design says", async () => {
      const { organizer, event, draw } = await closeAndDraw(2, "lock-mapping");
      const before = await eventRow(event.id);

      const { teamIds } = await lockDraw(organizer, draw.id);

      expect(teamIds).toHaveLength(2);
      const teams = await m.prisma.team.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" }, include: { players: true } });
      expect(teams.map((team) => [team.name, team.tag, team.logoText, team.source])).toEqual([
        ["Tim 1", "T1", "T1", "solo-draw"],
        ["Tim 2", "T2", "T2", "solo-draw"],
      ]);
      expect(teams[0].createdAt.getTime()).toBeLessThan(teams[1].createdAt.getTime());
      for (const [index, team] of teams.entries()) {
        const drawTeam = draw.teams[index];
        const captain = drawTeam.members.find((member) => member.isCaptain)!;
        const registration = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: captain.registrationId } });
        expect(team).toMatchObject({
          captainId: registration.userId,
          captainIgn: registration.ign,
          captainUid: registration.uid,
          captainIsPlayer: true,
          captainContact: registration.whatsapp,
        });
        expect(team.players).toHaveLength(5);
        expect(team.players.filter((player) => player.position === "Goalkeeper")).toHaveLength(1);
        for (const player of team.players) {
          const member = drawTeam.members.find((entry) => entry.uid === player.displayName)!;
          expect(player).toMatchObject({ nickname: member.ign, position: member.position, eventId: event.id });
          expect(player.userId).not.toBeNull();
        }
      }
      const after = await eventRow(event.id);
      expect(after.participantCap).toBe(before.participantCap);
      expect(after.activeSoloDrawId).toBe(draw.id);
      expect(after.status).toBe("Registration Closed");
      const links = await m.prisma.soloDrawAssignment.findMany({ where: { drawId: draw.id, role: "starter" } });
      expect(links.every((link) => link.teamId !== null && link.playerId !== null)).toBe(true);
      const audit = await m.prisma.competitionAuditLog.findFirstOrThrow({ where: { eventId: event.id, action: "solo_draw_locked" } });
      expect(JSON.stringify(audit.payload)).not.toContain("6281234567890");
      expect(audit.payload).toMatchObject({ drawId: draw.id, version: 1, seed: "lock-mapping", teamCount: 2 });
    });

    it("sets the other drafts aside and shows the locked draw afterwards", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await lockDraw(organizer, draw.id);

      const view = await m.draw.getSoloDrawView({ actor: organizer, eventId: event.id });
      expect(view).toMatchObject({ id: draw.id, status: "locked" });
      expect(view?.lockedAt).toBeInstanceOf(Date);
      await expect(m.draw.createSoloDraw({ actor: organizer, eventId: event.id })).rejects.toThrow("Tim sudah dikunci");
    });

    it("refuses when an approved player was added or removed after the draw", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      const someone = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id, status: "approved", slotGroup: "open" } });
      await m.prisma.soloRegistration.update({ where: { id: someone.id }, data: { status: "withdrawn" } });

      await expect(lockDraw(organizer, draw.id)).rejects.toThrow("Pendaftar berubah. Acak ulang dulu.");

      expect(await m.prisma.team.count({ where: { eventId: event.id } })).toBe(0);
      expect((await eventRow(event.id)).activeSoloDrawId).toBeNull();
    });

    it("lets exactly one of two simultaneous locks win", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);

      const settled = await Promise.allSettled([
        lockDraw(organizer, draw.id),
        lockDraw(organizer, draw.id),
      ]);

      expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(1);
      expect(await m.prisma.team.count({ where: { eventId: event.id } })).toBe(2);
      expect(await m.prisma.player.count({ where: { eventId: event.id } })).toBe(10);
    });

    it("refuses when a draw is not the event's own, or the event is not solo", async () => {
      const { organizer, draw } = await closeAndDraw(2);
      const stranger = asActor(await makeUser("organizer"));
      await expect(lockDraw(stranger, draw.id)).rejects.toThrow("Not authorized");
      await expect(m.draw.lockSoloDraw({ actor: organizer, drawId: "missing", expectedUpdatedAt: new Date() })).rejects.toThrow("tidak ditemukan");
    });

    it("leaves a locked event ready for the competition engine, without any change to it", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      const operations = m.operations.createCompetitionOperations(m.prisma);
      const config = (await import("@/lib/tournament/formats/types")).TOURNAMENT_FORMAT_PRESETS.singleElimination;
      const save = (teams: { id: string; seed: number }[], key: string, expectedVersion: number) =>
        operations.execute({ eventId: event.id, actor: { id: organizer.id, role: "organizer" }, expectedVersion, idempotencyKey: `${run}-${key}`, command: { kind: "drawing_save", config, teams } });

      let version = (await eventRow(event.id)).competitionVersion;
      await expect(save([{ id: "a", seed: 1 }, { id: "b", seed: 2 }], "early", version)).rejects.toThrow("Kunci tim dulu sebelum mengacak grup.");

      await lockDraw(organizer, draw.id);
      version = (await eventRow(event.id)).competitionVersion;
      const teams = (await m.prisma.team.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" }, select: { id: true } })).map((team, index) => ({ id: team.id, seed: index + 1 }));
      const saved = await save(teams, "saved", version);
      const published = await operations.execute({
        eventId: event.id, actor: { id: organizer.id, role: "organizer" }, expectedVersion: saved.version, idempotencyKey: `${run}-publish`, command: { kind: "drawing_publish" },
      });

      expect(published.version).toBeGreaterThan(saved.version);
      expect(await m.prisma.competitionPhase.count({ where: { eventId: event.id, status: "active" } })).toBeGreaterThan(0);
      expect(await m.prisma.match.count({ where: { eventId: event.id } })).toBe(1);
    });
  });

  describe("what the organizer screens read", () => {
    const withFlag = async <T,>(on: boolean, work: () => Promise<T>) => {
      const before = process.env.FEATURE_FLAG_SOLO_TOURNAMENT_V1;
      process.env.FEATURE_FLAG_SOLO_TOURNAMENT_V1 = on ? "true" : "false";
      try {
        return await work();
      } finally {
        if (before === undefined) delete process.env.FEATURE_FLAG_SOLO_TOURNAMENT_V1;
        else process.env.FEATURE_FLAG_SOLO_TOURNAMENT_V1 = before;
      }
    };

    it("summarises a solo event, and says nothing for a team event or while the flag is off", async () => {
      const { event } = await setUpEvent(2);
      const team = await makeEvent({ entryMode: "team" });

      const summary = await withFlag(true, () => m.read.getSoloEventSummary(event.id));
      expect(summary).toMatchObject({ eventId: event.id, status: "Published", participantCap: 2, feeRequired: false, teamsLocked: false, requiredPosition: "Goalkeeper" });
      expect(summary?.quota).toEqual({ required: { quota: 2, held: 2, queued: 0 }, open: { quota: 8, held: 8, queued: 0 } });
      expect(await withFlag(true, () => m.read.getSoloEventSummary(team.id))).toBeNull();
      expect(await withFlag(false, () => m.read.getSoloEventSummary(event.id))).toBeNull();
    });

    it("lists solo players as rows of the registration list, without contact numbers", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      const queued = await join(event.id, "Forward");
      const first = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id, status: "pending_payment" }, orderBy: { createdAt: "asc" } });
      await m.reg.uploadSoloProof({ userId: first.userId, registrationId: first.id, proofImageUrl: "/proof.png" });

      const records = await m.read.listSoloRegistrationRecords(asActor(organizer), event.id);

      expect(records).toHaveLength(11);
      const byId = new Map(records.map((record) => [record.id, record]));
      expect(byId.get(queued.registration.id)).toMatchObject({ status: "queued", source: "solo_registration", rosterCount: 1, solo: { registrationId: queued.registration.id } });
      expect(byId.get(first.id)).toMatchObject({ status: "pending_review", teamName: first.ign, captainName: first.uid, teamTag: first.primaryPosition });
      expect(JSON.stringify(records)).not.toContain("6281234567890");
      const paid = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id, status: "pending_payment" } });
      await m.reg.approveSolo({ actor: asActor(organizer), registrationId: first.id, expectedVersion: (await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: first.id } })).version });
      expect((await m.read.listSoloRegistrationRecords(asActor(organizer), event.id)).find((record) => record.id === first.id)?.status).toBe("accepted");
      expect(paid.id).not.toBe(first.id);
    });

    it("lists solo payments with the version the review has to send back", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      await joinMany(event.id, "Forward", 2);
      const first = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
      await m.reg.uploadSoloProof({ userId: first.userId, registrationId: first.id, proofImageUrl: "/proof.png" });

      const waiting = await m.read.listSoloPaymentEntries(asActor(organizer), event.id);
      expect(waiting.map((entry) => entry.status).sort()).toEqual(["pending_payment", "pending_review"]);
      const reviewed = waiting.find((entry) => entry.id === first.id)!;
      expect(reviewed).toMatchObject({ teamName: first.ign, proofImageUrl: "/proof.png", captain: { name: first.uid }, solo: { registrationId: first.id, uid: first.uid, version: expect.any(Number) } });
      const onlyReview = await m.read.listSoloPaymentEntries(asActor(organizer), event.id, "pending_review");
      expect(onlyReview.map((entry) => entry.id)).toEqual([first.id]);
      await expect(m.read.listSoloPaymentEntries(asActor(await makeUser("organizer")), event.id)).rejects.toThrow("Not authorized");
    });

    it("has no preview once the event is running, but still shows the draw", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await lockDraw(organizer, draw.id);
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Ongoing" } });

      const panel = await m.read.getSoloDrawPanelData({ user: organizer, eventId: event.id, status: "Ongoing" });
      expect(panel.preview).toBeNull();
      expect(panel.draw).toMatchObject({ status: "locked" });
      const fresh = await setUpEvent(2);
      const early = await m.read.getSoloDrawPanelData({ user: fresh.organizer, eventId: fresh.event.id, status: "Published" });
      expect(early.preview?.plan.teamCount).toBe(2);
      expect(early.draw).toBeNull();
    });
  });

  describe("a screen that is out of date", () => {
    it("cannot swap or lock after somebody else changed the draw", async () => {
      const { organizer, draw } = await closeAndDraw(2);
      const before = await seen(draw.id);
      const a = draw.teams[0].members.find((member) => member.position !== "Goalkeeper")!.registrationId;
      const b = draw.teams[1].members.find((member) => member.position !== "Goalkeeper")!.registrationId;
      await swapDraw(organizer, draw.id, a, b);

      await expect(m.draw.swapSoloPlayers({ actor: organizer, drawId: draw.id, a: b, b: a, expectedUpdatedAt: before })).rejects.toThrow("Data sudah berubah");
      await expect(m.draw.lockSoloDraw({ actor: organizer, drawId: draw.id, expectedUpdatedAt: before })).rejects.toThrow("Data sudah berubah");
      expect(await m.prisma.team.count({ where: { eventId: draw.eventId } })).toBe(0);
      await lockDraw(organizer, draw.id);
    });

    it("is told to reload when the draw was replaced or locked meanwhile", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      const newer = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed: "newer" });

      await expect(lockDraw(organizer, draw.id)).rejects.toThrow("Data sudah berubah. Hasil acak ini sudah diganti");
      await lockDraw(organizer, newer.id);
      await expect(lockDraw(organizer, newer.id)).rejects.toThrow("Data sudah berubah. Tim sudah dikunci");
      await expect(swapDraw(organizer, newer.id, newer.teams[0].members[1].registrationId, newer.teams[1].members[1].registrationId)).rejects.toThrow("Data sudah berubah. Tim sudah dikunci");
    });

    it("draws again over a swapped draft: the swapped one is set aside and the new one starts clean", async () => {
      const { organizer, event, draw: first } = await closeAndDraw(2, "again");
      const a = first.teams[0].members.find((member) => member.position !== "Goalkeeper")!.registrationId;
      const b = first.teams[1].members.find((member) => member.position !== "Goalkeeper")!.registrationId;
      const swapped = await swapDraw(organizer, first.id, a, b);
      expect(swapped.teams).not.toEqual(first.teams);

      const again = await m.draw.createSoloDraw({ actor: organizer, eventId: event.id, seed: "again" });

      expect(again.teams).toEqual(first.teams);
      expect((await m.prisma.soloDraw.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("superseded");
      expect(again.version).toBe(2);
    });
  });

  describe("swapping a captain", () => {
    it("leaves one captain in each team and keeps it in the database", async () => {
      const { organizer, draw } = await closeAndDraw(2, "captains");
      const captain = draw.teams[0].members.find((member) => member.isCaptain)!;
      const keeper = captain.position === "Goalkeeper";
      const partner = draw.teams[1].members.find((member) => (member.position === "Goalkeeper") === keeper && !member.isCaptain)!;

      const swapped = await swapDraw(organizer, draw.id, captain.registrationId, partner.registrationId);

      for (const team of swapped.teams) expect(team.members.filter((member) => member.isCaptain)).toHaveLength(1);
      const rows = await m.prisma.soloDrawAssignment.findMany({ where: { drawId: draw.id, role: "starter" } });
      for (const index of [1, 2]) expect(rows.filter((row) => row.teamIndex === index && row.isCaptain)).toHaveLength(1);
      expect(rows.find((row) => row.registrationId === captain.registrationId)?.teamIndex).toBe(2);
      expect(rows.find((row) => row.registrationId === partner.registrationId)?.teamIndex).toBe(1);
    });
  });

  describe("locking in harder cases", () => {
    it("locks a draw that leaves players out, and keeps them out of every team", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      const extra = await join(event.id, "Forward");
      await m.prisma.soloRegistration.update({ where: { id: extra.registration.id }, data: { status: "approved", approvedAt: new Date() } });
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "left-out" });
      expect(draw.unplacedCount).toBe(1);

      await lockDraw(asActor(organizer), draw.id);

      expect(await m.prisma.player.count({ where: { eventId: event.id } })).toBe(10);
      expect(await m.prisma.player.count({ where: { eventId: event.id, userId: extra.registration.userId } })).toBe(0);
      const left = await m.prisma.soloDrawAssignment.findFirstOrThrow({ where: { drawId: draw.id, registrationId: extra.registration.id } });
      expect(left).toMatchObject({ role: "unplaced", teamId: null, playerId: null });
    });

    it("puts a field player who offered in a keeper's place and records them as the keeper", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      await join(event.id, "Goalkeeper");
      await joinMany(event.id, "Forward", 7);
      const backup = await join(event.id, "Forward", { secondaryPosition: "Goalkeeper" });
      const ninth = await join(event.id, "Forward");
      await m.prisma.soloRegistration.update({ where: { id: ninth.registration.id }, data: { status: "approved", approvedAt: new Date() } });
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "emergency" });
      expect(draw.teamCount).toBe(2);

      await lockDraw(asActor(organizer), draw.id);

      const teams = await m.prisma.team.findMany({ where: { eventId: event.id }, include: { players: true } });
      for (const team of teams) expect(team.players.filter((player) => player.position === "Goalkeeper")).toHaveLength(1);
      const asKeeper = await m.prisma.player.findFirstOrThrow({ where: { eventId: event.id, userId: backup.registration.userId } });
      expect(asKeeper.position).toBe("Goalkeeper");
    });

    it("refuses a draw that cannot be locked, such as a team that repeats an in-game name", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id, slotGroup: "open" }, data: { ign: "Same" } });
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "clash" });
      expect(draw.canLock).toBe(false);

      await expect(lockDraw(asActor(organizer), draw.id)).rejects.toThrow("belum bisa dikunci");
      expect(await m.prisma.team.count({ where: { eventId: event.id } })).toBe(0);
    });

    it("refuses when the captain has no name that a team may carry", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      const rows = await m.prisma.soloRegistration.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
      for (const [index, row] of rows.entries()) {
        await m.prisma.soloRegistration.update({ where: { id: row.id }, data: { ign: `<${index}>` } });
        await m.prisma.user.update({ where: { id: row.userId }, data: { name: "<i>" } });
      }
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "names" });

      await expect(lockDraw(asActor(organizer), draw.id)).rejects.toThrow("Nama kapten tidak valid");
      expect(await m.prisma.team.count({ where: { eventId: event.id } })).toBe(0);
      expect((await eventRow(event.id)).activeSoloDrawId).toBeNull();
    });

    it("falls back to the other player's name when the account name is not allowed", async () => {
      const { organizer, event, draw } = await closeAndDraw(2, "fallback");
      const captain = draw.teams[0].members.find((member) => member.isCaptain)!;
      const registration = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: captain.registrationId } });
      await m.prisma.user.update({ where: { id: registration.userId }, data: { name: "<i>" } });

      await lockDraw(organizer, draw.id);

      const team = await m.prisma.team.findFirstOrThrow({ where: { eventId: event.id, captainId: registration.userId } });
      expect(team.captainName).toBe(registration.ign);
    });

    it("refuses when the event already has teams", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await m.prisma.team.create({ data: { eventId: event.id, name: "Old", tag: "OLD", logoText: "O", source: "registration" } });

      await expect(lockDraw(organizer, draw.id)).rejects.toThrow("sudah punya tim");
    });

    it("locks a draw of sixty-four teams inside the time a transaction has", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 64, organizerUserId: organizer.id, status: "Registration Closed" });
      const { randomUUID } = await import("node:crypto");
      const total = 64 * 5;
      const users = Array.from({ length: total }, (_, index) => ({ id: randomUUID(), email: `${run}-big${index}@test.local`, name: `Big ${index}`, role: "player", passwordHash: "x" }));
      await m.prisma.user.createMany({ data: users });
      createdUsers.push(...users.map((user) => user.id));
      const now = Date.now();
      await m.prisma.soloRegistration.createMany({
        data: users.map((user, index) => ({
          id: randomUUID(), eventId: event.id, userId: user.id, ign: `BigIgn${index}`, uid: `BIG-${run}-${index}`, uidKey: `big-${run}-${index}`.toLowerCase(),
          primaryPosition: index < 64 ? "Goalkeeper" : "Forward", slotGroup: index < 64 ? "required" : "open", willingCaptain: false, whatsapp: "6281234567890",
          status: "approved", slotHeldAt: new Date(now), approvedAt: new Date(now), createdAt: new Date(now + index),
        })),
      });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "big" });
      expect(draw.teamCount).toBe(64);

      const started = Date.now();
      const { teamIds } = await lockDraw(asActor(organizer), draw.id);

      expect(Date.now() - started).toBeLessThan(15_000);
      expect(teamIds).toHaveLength(64);
      const tags = (await m.prisma.team.findMany({ where: { eventId: event.id }, select: { name: true, tag: true } }));
      expect(new Set(tags.map((team) => team.tag)).size).toBe(64);
      expect(tags.find((team) => team.name === "Tim 41")?.tag).toBe("TM41");
      expect(tags.find((team) => team.name === "Tim 40")?.tag).toBe("T40");
      expect(await m.prisma.player.count({ where: { eventId: event.id } })).toBe(total);
      expect(await m.prisma.soloDrawAssignment.count({ where: { drawId: draw.id, teamId: null } })).toBe(0);
      expect(await m.prisma.soloDrawAssignment.count({ where: { drawId: draw.id, playerId: null } })).toBe(0);
    }, 60_000);
  });

  describe("after teams are locked", () => {
    const lockedEvent = async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await lockDraw(organizer, draw.id);
      return { organizer, event, draw };
    };

    it("refuses new sign-ups, withdrawals and reviews even if the event is reopened", async () => {
      const { organizer, event, draw } = await lockedEvent();
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Published" } });
      const member = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id, status: "approved" } });
      const waiting = await m.prisma.soloRegistration.create({
        data: {
          eventId: event.id, userId: (await makeUser()).id, ign: "Late", uid: `LATE-${run}`, uidKey: `late-${run}`, primaryPosition: "Forward", slotGroup: "open",
          whatsapp: "6281234567890", status: "pending_review", proofImageUrl: "/p.png", slotHeldAt: new Date(),
        },
      });

      await expect(join(event.id, "Forward")).rejects.toThrow("Tim sudah dikunci");
      await expect(m.reg.withdrawSolo({ userId: member.userId, registrationId: member.id })).rejects.toThrow("Tim sudah dikunci");
      await expect(m.reg.approveSolo({ actor: organizer, registrationId: waiting.id, expectedVersion: waiting.version })).rejects.toThrow("Tim sudah dikunci");
      await expect(m.reg.rejectSolo({ actor: organizer, registrationId: waiting.id, reason: "Bukti buram", expectedVersion: waiting.version })).rejects.toThrow("Tim sudah dikunci");
      expect((await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("pending_review");
      expect((await m.prisma.soloDraw.findUniqueOrThrow({ where: { id: draw.id } })).status).toBe("locked");
    });

    it("lets exactly one of a lock and an approval win when a payment is still open", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      const late = await m.prisma.soloRegistration.create({
        data: {
          eventId: event.id, userId: (await makeUser()).id, ign: "Racer", uid: `RACE-${run}`, uidKey: `race-${run}`, primaryPosition: "Forward", slotGroup: "open",
          whatsapp: "6281234567890", status: "pending_review", proofImageUrl: "/p.png", slotHeldAt: new Date(),
        },
      });

      const settled = await Promise.allSettled([
        lockDraw(organizer, draw.id),
        m.reg.approveSolo({ actor: organizer, registrationId: late.id, expectedVersion: late.version }),
      ]);

      expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      const teams = await m.prisma.team.count({ where: { eventId: event.id } });
      const status = (await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: late.id } })).status;
      expect(teams === 2 ? status : "approved").toBe(teams === 2 ? "pending_review" : "approved");
    });
  });

  describe("changing an event's status by hand", () => {
    it("does not let a solo event be closed except from its draw panel", async () => {
      const { event } = await setUpEvent(2);
      await expect(m.platform.setEventStatus(event.id, "Registration Closed")).rejects.toThrow("tab Acak tim");
      expect((await eventRow(event.id)).status).toBe("Published");
      const team = await makeEvent({ entryMode: "team" });
      await expect(m.platform.setEventStatus(team.id, "Registration Closed")).resolves.toMatchObject({ status: "Registration Closed" });
    });

    it("does not reopen a solo event whose teams are locked, but lets it run on", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await lockDraw(organizer, draw.id);

      await expect(m.platform.setEventStatus(event.id, "Published")).rejects.toThrow("Tim sudah dikunci");
      await expect(m.platform.setEventStatus(event.id, "Draft")).rejects.toThrow("Tim sudah dikunci");
      await expect(m.platform.setEventStatus(event.id, "Ongoing")).resolves.toMatchObject({ status: "Ongoing" });
    });
  });

  describe("refunds, strictly", () => {
    it("is only for a player who paid and is out, and is written to the audit trail", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      const players = [...(await joinMany(event.id, "Goalkeeper", 2)), ...(await joinMany(event.id, "Forward", 8))];
      await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id }, data: { status: "approved", expiresAt: null, approvedAt: new Date() } });
      const extra = await join(event.id, "Forward");
      await m.prisma.soloRegistration.update({ where: { id: extra.registration.id }, data: { status: "approved", approvedAt: new Date() } });
      const queuedOut = await join(event.id, "Forward");
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      await m.prisma.soloRegistration.update({ where: { id: queuedOut.registration.id }, data: { status: "withdrawn", withdrawnAt: new Date(), approvedAt: null } });
      const draw = await m.draw.createSoloDraw({ actor: asActor(organizer), eventId: event.id, seed: "strict-refund" });
      const placed = draw.teams[0].members[0].registrationId;
      const owner = asActor(organizer);

      await expect(m.draw.markSoloRefunded({ actor: owner, registrationId: placed })).rejects.toThrow("tidak masuk tim");
      await expect(m.draw.markSoloRefunded({ actor: owner, registrationId: queuedOut.registration.id })).rejects.toThrow("tidak masuk tim");
      expect(players).toHaveLength(10);

      await m.draw.markSoloRefunded({ actor: owner, registrationId: extra.registration.id, note: "Transfer ulang" });
      const audit = await m.prisma.competitionAuditLog.findFirstOrThrow({ where: { eventId: event.id, action: "solo_refund_marked" } });
      expect(audit.payload).toEqual({ registrationId: extra.registration.id });
      expect(audit.actorUserId).toBe(organizer.id);
    });
  });

  describe("removing data", () => {
    it("deletes the whole event with its registrations, draws and placements", async () => {
      const { event, draw } = await closeAndDraw(2);
      expect(await m.prisma.soloDrawAssignment.count({ where: { drawId: draw.id } })).toBe(10);

      await m.prisma.event.delete({ where: { id: event.id } });

      expect(await m.prisma.soloRegistration.count({ where: { eventId: event.id } })).toBe(0);
      expect(await m.prisma.soloDraw.count({ where: { eventId: event.id } })).toBe(0);
      expect(await m.prisma.soloDrawAssignment.count({ where: { drawId: draw.id } })).toBe(0);
    });

    it("removes only a player's own placement with their registration", async () => {
      const { event, draw } = await closeAndDraw(2);
      const member = draw.teams[0].members[0];

      await m.prisma.soloRegistration.delete({ where: { id: member.registrationId } });

      expect(await m.prisma.soloRegistration.count({ where: { eventId: event.id } })).toBe(9);
      expect(await m.prisma.soloDrawAssignment.count({ where: { drawId: draw.id } })).toBe(9);
    });

    it("keeps the roster of a locked event when a player account is deleted", async () => {
      const { organizer, event, draw } = await closeAndDraw(2);
      await lockDraw(organizer, draw.id);
      const player = await m.prisma.player.findFirstOrThrow({ where: { eventId: event.id, userId: { not: null } } });

      await m.prisma.user.delete({ where: { id: player.userId! } });

      expect(await m.prisma.player.count({ where: { eventId: event.id } })).toBe(10);
      expect(await m.prisma.player.findUniqueOrThrow({ where: { id: player.id } })).toMatchObject({ userId: null });
      expect(await m.prisma.team.count({ where: { eventId: event.id } })).toBe(2);
    });
  });

  describe("refunds", () => {
    it("records a refund only for a player who paid, once", async () => {
      const organizer = await makeUser("organizer");
      const free = await makeEvent({ cap: 2, organizerUserId: organizer.id });
      const freePlayer = await join(free.id, "Forward");
      await expect(m.draw.markSoloRefunded({ actor: asActor(organizer), registrationId: freePlayer.registration.id })).rejects.toThrow("gratis");

      const paid = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: true });
      const waiting = await join(paid.id, "Forward");
      await expect(m.draw.markSoloRefunded({ actor: asActor(organizer), registrationId: waiting.registration.id })).rejects.toThrow("sudah bayar");
      const stranger = asActor(await makeUser("organizer"));
      await expect(m.draw.markSoloRefunded({ actor: stranger, registrationId: waiting.registration.id })).rejects.toThrow("Not authorized");
      await expect(m.draw.markSoloRefunded({ actor: asActor(organizer), registrationId: "missing" })).rejects.toThrow("tidak ditemukan");
    });
  });
});
