/**
 * Runs the solo registration repository against a real PostgreSQL database, because slot counting,
 * the queue and the race for the last slot only mean something with real transactions.
 *
 * Opt in with SOLO_TEST_DATABASE_URL, which must point at a local database that already has every
 * migration applied (CI's migration job has one). Without it the whole file is skipped.
 * Each run creates rows under a unique prefix and deletes them afterwards.
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

const run = `soloit${Date.now().toString(36)}`;

type Modules = {
  prisma: typeof import("@/lib/platform/db").prisma;
  repo: typeof import("./registration-repository");
  platform: typeof import("@/lib/registration/repository");
};
let m: Modules;

const createdEvents: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function makeEvent(overrides: Partial<{
  cap: number; fee: boolean; status: string; entryMode: string; opensAt: Date | null; closesAt: Date | null; organizerUserId: string | null;
}> = {}) {
  counter += 1;
  const event = await m.prisma.event.create({
    data: {
      slug: `${run}-event-${counter}`,
      name: `Solo IT ${counter}`,
      description: "integration test",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination",
      status: overrides.status ?? "Published",
      participantCap: overrides.cap ?? 2,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      entryMode: overrides.entryMode ?? "solo",
      registrationFeeRequired: overrides.fee ?? false,
      registrationOpensAt: overrides.opensAt ?? null,
      registrationClosesAt: overrides.closesAt ?? null,
      organizerUserId: overrides.organizerUserId ?? null,
    },
  });
  createdEvents.push(event.id);
  return event;
}

async function makeUser(role = "player", extra: Record<string, unknown> = {}) {
  counter += 1;
  const user = await m.prisma.user.create({
    data: { email: `${run}-u${counter}@test.local`, name: `User ${counter}`, role, passwordHash: "x", ...extra },
  });
  createdUsers.push(user.id);
  return user;
}

let uidCounter = 0;
async function join(eventId: string, position = "Forward", overrides: Partial<Parameters<Modules["repo"]["registerSolo"]>[0]> = {}) {
  uidCounter += 1;
  const user = await makeUser();
  return m.repo.registerSolo({
    eventId,
    userId: user.id,
    ign: `Ign${uidCounter}`,
    uid: `UID-${run}-${uidCounter}`,
    primaryPosition: position,
    secondaryPosition: null,
    willingCaptain: false,
    whatsapp: "6281234567890",
    ...overrides,
  });
}

/** Fills a group so the next registration has to queue. cap 2 = 2 keepers and 8 field players. */
async function fill(eventId: string, position: "Goalkeeper" | "Forward", count: number) {
  const results = [];
  for (let i = 0; i < count; i += 1) results.push(await join(eventId, position));
  return results;
}

const organizerOf = (id: string) => ({ id, email: "o@test.local", name: "Org", role: "organizer" as const });

describe.skipIf(!databaseUrl)("solo registration repository (real database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    m = {
      prisma: (await import("@/lib/platform/db")).prisma,
      repo: await import("./registration-repository"),
      platform: await import("@/lib/registration/repository"),
    };
  });

  afterAll(async () => {
    if (!m) return;
    await m.prisma.event.deleteMany({ where: { id: { in: createdEvents } } });
    await m.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await m.prisma.$disconnect();
  });

  describe("taking a slot", () => {
    it("approves at once on a free event", async () => {
      const event = await makeEvent();
      const { registration, outcome } = await join(event.id, " goalkeeper ");
      expect(outcome).toBe("approved");
      expect(registration).toMatchObject({ status: "approved", primaryPosition: "Goalkeeper", slotGroup: "required", expiresAt: null });
      expect(registration.approvedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(registration)).not.toContain("6281234567890");
    });

    it("asks a paid event's player to pay within the payment window", async () => {
      const event = await makeEvent({ fee: true });
      const before = Date.now();
      const { registration, outcome } = await join(event.id);
      expect(outcome).toBe("pending_payment");
      const left = registration.expiresAt!.getTime() - before;
      expect(left).toBeGreaterThan(23.9 * 3600_000);
      expect(left).toBeLessThanOrEqual(24 * 3600_000 + 5_000);
      expect(registration.slotHeldAt).toBeInstanceOf(Date);
    });

    it("keeps the position as the game spells it and drops a repeated secondary position", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id, "midfielder", { secondaryPosition: "MIDFIELDER" });
      expect(registration.primaryPosition).toBe("Midfielder");
      expect(registration.secondaryPosition).toBeNull();
      const { registration: backup } = await join(event.id, "Forward", { secondaryPosition: "goalkeeper" });
      expect(backup.secondaryPosition).toBe("Goalkeeper");
      expect(backup.slotGroup).toBe("open");
    });

    it("rejects a position the game does not offer", async () => {
      const event = await makeEvent();
      await expect(join(event.id, "Striker")).rejects.toThrow("Posisi utama tidak tersedia untuk game ini.");
    });
  });

  describe("quota and queue", () => {
    it("queues the keeper after the keeper slots are full, while field slots stay open", async () => {
      const event = await makeEvent({ cap: 2 });
      await fill(event.id, "Goalkeeper", 2);
      const third = await join(event.id, "Goalkeeper");
      expect(third.outcome).toBe("queued");
      expect(third.registration).toMatchObject({ status: "queued", slotHeldAt: null, expiresAt: null });
      expect((await join(event.id, "Forward")).outcome).toBe("approved");
    });

    it("queues the ninth field player on an event of two teams", async () => {
      const event = await makeEvent({ cap: 2 });
      await fill(event.id, "Forward", 8);
      expect((await join(event.id, "Defender")).outcome).toBe("queued");
    });

    it("gives a freed slot to the oldest queued player of the same group, and to nobody else", async () => {
      const event = await makeEvent({ cap: 2 });
      const [first] = await fill(event.id, "Goalkeeper", 2);
      const queuedA = await join(event.id, "Goalkeeper");
      const queuedB = await join(event.id, "Goalkeeper");
      const queuedField = await join(event.id, "Forward");
      expect(queuedField.outcome).toBe("approved"); // field slots were free

      const left = await m.repo.withdrawSolo({ userId: first.registration.userId, registrationId: first.registration.id });
      expect(left.registration.status).toBe("withdrawn");
      expect(left.promoted.map((p) => p.registrationId)).toEqual([queuedA.registration.id]);

      const snapshot = await m.repo.getSoloQuotaSnapshot(event.id);
      expect(snapshot.required).toEqual({ quota: 2, held: 2, queued: 1 });
      const stillQueued = await m.repo.getSoloRegistrationForUser(event.id, queuedB.registration.userId);
      expect(stillQueued?.status).toBe("queued");
    });

    it("promotes into payment on a paid event, with a fresh deadline", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const [first] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      const { promoted } = await m.repo.withdrawSolo({ userId: first.registration.userId, registrationId: first.registration.id });
      expect(promoted).toEqual([expect.objectContaining({ registrationId: queued.registration.id, status: "pending_payment" })]);
      const row = await m.repo.getSoloRegistrationForUser(event.id, queued.registration.userId);
      expect(row?.slotHeldAt).toBeInstanceOf(Date);
      expect(row!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    });

    it("sends a player who withdrew and registers again to the back of the queue", async () => {
      const event = await makeEvent({ cap: 2 });
      const [first] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      await m.repo.withdrawSolo({ userId: first.registration.userId, registrationId: first.registration.id }); // queued takes the slot
      const back = await m.repo.registerSolo({
        eventId: event.id, userId: first.registration.userId, ign: "Back", uid: first.registration.uid,
        primaryPosition: "Goalkeeper", willingCaptain: false, whatsapp: "6281234567890",
      });
      expect(back.outcome).toBe("queued");
      expect(back.registration.id).toBe(first.registration.id); // same row, reused
      expect(back.registration.version).toBeGreaterThan(first.registration.version);
      const row = await m.repo.getSoloRegistrationForUser(event.id, queued.registration.userId);
      expect(row?.status).toBe("approved");
    });

    it("tells each queued player their place, counting only their own group", async () => {
      const event = await makeEvent({ cap: 2 });
      await fill(event.id, "Goalkeeper", 2);
      await fill(event.id, "Forward", 8);
      const keepers = [await join(event.id, "Goalkeeper"), await join(event.id, "Goalkeeper"), await join(event.id, "Goalkeeper")];
      const field = [await join(event.id, "Defender")];

      const places = await Promise.all([...keepers, ...field].map((entry) => m.repo.getSoloQueuePosition(entry.registration)));
      expect(places).toEqual([1, 2, 3, 1]);
    });

    it("moves everyone up when the first in line is promoted", async () => {
      const event = await makeEvent({ cap: 2 });
      const [first] = await fill(event.id, "Goalkeeper", 2);
      const [a, b] = [await join(event.id, "Goalkeeper"), await join(event.id, "Goalkeeper")];
      await m.repo.withdrawSolo({ userId: first.registration.userId, registrationId: first.registration.id });

      const current = await m.repo.getSoloRegistrationForUser(event.id, b.registration.userId);
      expect(await m.repo.getSoloQueuePosition(current!)).toBe(1);
      const promoted = await m.repo.getSoloRegistrationForUser(event.id, a.registration.userId);
      expect(await m.repo.getSoloQueuePosition(promoted!)).toBeNull();
    });

    it("has no place for someone who is not queued", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id);
      expect(await m.repo.getSoloQueuePosition(registration)).toBeNull();
    });

    it("reports counts per group", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      await fill(event.id, "Goalkeeper", 3);
      await fill(event.id, "Forward", 2);
      expect(await m.repo.getSoloQuotaSnapshot(event.id)).toEqual({
        required: { quota: 2, held: 2, queued: 1 },
        open: { quota: 8, held: 2, queued: 0 },
      });
    });
  });

  describe("deadlines", () => {
    it("expires an unpaid slot and passes it on when the deadline has gone", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const [late] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      await m.prisma.soloRegistration.update({ where: { id: late.registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const result = await m.repo.sweepSoloEvent(event.id);
      expect(result.expired).toBe(1);
      expect(result.promoted.map((p) => p.registrationId)).toEqual([queued.registration.id]);
      expect((await m.repo.getSoloRegistrationForUser(event.id, late.registration.userId))?.status).toBe("expired");
      expect((await m.repo.sweepSoloEvent(event.id))).toEqual({ expired: 0, promoted: [] }); // idempotent
    });

    it("does not hand a freed slot to the queue once registration is closed", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const [late] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      await m.prisma.soloRegistration.update({ where: { id: late.registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const result = await m.repo.sweepSoloEvent(event.id);
      expect(result).toEqual({ expired: 1, promoted: [] });
      expect((await m.repo.getSoloRegistrationForUser(event.id, queued.registration.userId))?.status).toBe("queued");
    });

    it("leaves the event row alone when nothing is due, so a page view never takes the lock", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      await join(event.id, "Goalkeeper");
      const before = (await m.prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { updatedAt: true } })).updatedAt;

      expect(await m.repo.sweepSoloEvent(event.id)).toEqual({ expired: 0, promoted: [] });

      expect((await m.prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { updatedAt: true } })).updatedAt).toEqual(before);
    });

    it("still sweeps when somebody is queued for a group that has a free slot", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const [first] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      // The slot frees without the sweep running, as if a withdrawal had been written by another path.
      await m.prisma.soloRegistration.update({ where: { id: first.registration.id }, data: { status: "withdrawn" } });

      const result = await m.repo.sweepSoloEvent(event.id);

      expect(result.promoted.map((p) => p.registrationId)).toEqual([queued.registration.id]);
    });

    it("never expires a registration that is waiting for review", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const { registration } = await join(event.id, "Goalkeeper");
      await m.repo.uploadSoloProof({ userId: registration.userId, registrationId: registration.id, proofImageUrl: "https://blob.test/p.png" });
      await m.prisma.soloRegistration.update({ where: { id: registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await m.repo.sweepSoloEvent(event.id)).expired).toBe(0);
    });

    it("lets a player register again after the deadline ran out", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const { registration } = await join(event.id, "Forward");
      await m.prisma.soloRegistration.update({ where: { id: registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const again = await m.repo.registerSolo({
        eventId: event.id, userId: registration.userId, ign: "Again", uid: registration.uid,
        primaryPosition: "Forward", willingCaptain: true, whatsapp: "6281234567890",
      });
      expect(again.outcome).toBe("pending_payment");
      expect(again.registration.id).toBe(registration.id);
    });
  });

  describe("who may register", () => {
    it("refuses a second registration by the same account", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id);
      await expect(m.repo.registerSolo({
        eventId: event.id, userId: registration.userId, ign: "Other", uid: "OTHER-UID",
        primaryPosition: "Forward", willingCaptain: false, whatsapp: "6281234567890",
      })).rejects.toThrow("Kamu sudah daftar di event ini.");
    });

    it("refuses the same game account under another login, ignoring letter case", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id, "Forward", { uid: `Case-${run}` });
      await expect(join(event.id, "Forward", { uid: ` case-${run} ` })).rejects.toThrow("UID ini sudah terdaftar di event ini.");
      expect(registration.uid).toBe(`Case-${run}`);
    });

    it("allows the same game account in another event", async () => {
      const first = await makeEvent();
      const second = await makeEvent();
      await join(first.id, "Forward", { uid: `Shared-${run}` });
      await expect(join(second.id, "Forward", { uid: `Shared-${run}` })).resolves.toMatchObject({ outcome: "approved" });
    });

    it("refuses accounts that are not players", async () => {
      const event = await makeEvent();
      const captain = await makeUser("captain");
      await expect(join(event.id, "Forward", { userId: captain.id })).rejects.toThrow("Hanya akun pemain yang bisa daftar solo.");
      const gone = await makeUser("player", { deactivatedAt: new Date() });
      await expect(join(event.id, "Forward", { userId: gone.id })).rejects.toThrow("Hanya akun pemain yang bisa daftar solo.");
    });

    it("refuses a registration outside the open window", async () => {
      const draft = await makeEvent({ status: "Draft" });
      await expect(join(draft.id)).rejects.toThrow("sudah tidak membuka pendaftaran");
      const closed = await makeEvent({ closesAt: new Date(Date.now() - 60_000) });
      await expect(join(closed.id)).rejects.toThrow("sudah tidak membuka pendaftaran");
      const notYet = await makeEvent({ opensAt: new Date(Date.now() + 3600_000) });
      await expect(join(notYet.id)).rejects.toThrow("sudah tidak membuka pendaftaran");
    });

    it("refuses a team event and an unknown event", async () => {
      const teamEvent = await makeEvent({ entryMode: "team" });
      await expect(join(teamEvent.id)).rejects.toThrow("Event ini bukan event solo.");
      await expect(join("does-not-exist")).rejects.toThrow("Event tidak ditemukan.");
    });
  });

  describe("many players at the same moment", () => {
    function registerAll(eventId: string, users: Array<{ id: string }>, position: string) {
      return Promise.allSettled(users.map((user, index) =>
        m.repo.registerSolo({
          eventId, userId: user.id, ign: `Race${index}`, uid: `RACE-${run}-${position}-${eventId.slice(-4)}-${index}`,
          primaryPosition: position, willingCaptain: false, whatsapp: "6281234567890",
        })));
    }

    it("gives the last two slots to two of five racing players and queues the rest, with no errors", async () => {
      const event = await makeEvent({ cap: 2 });
      await fill(event.id, "Forward", 6); // 2 field slots left
      const users = await Promise.all(Array.from({ length: 5 }, () => makeUser()));

      const settled = await registerAll(event.id, users, "Defender");

      expect(settled.every((entry) => entry.status === "fulfilled")).toBe(true);
      const outcomes = settled.map((entry) => (entry as PromiseFulfilledResult<{ outcome: string }>).value.outcome);
      expect(outcomes.filter((outcome) => outcome === "approved")).toHaveLength(2);
      expect(outcomes.filter((outcome) => outcome === "queued")).toHaveLength(3);
      expect((await m.repo.getSoloQuotaSnapshot(event.id)).open).toEqual({ quota: 8, held: 8, queued: 3 });
    });

    it("seats exactly the quota when a burst of 30 players arrives for 8 field slots", async () => {
      const event = await makeEvent({ cap: 2 });
      const users = await Promise.all(Array.from({ length: 30 }, () => makeUser()));

      const settled = await registerAll(event.id, users, "Midfielder");

      expect(settled.filter((entry) => entry.status === "rejected").map((entry) => String((entry as PromiseRejectedResult).reason))).toEqual([]);
      expect(await m.repo.getSoloQuotaSnapshot(event.id)).toMatchObject({ open: { quota: 8, held: 8, queued: 22 } });
    }, 30_000);

    it("serves the queue in the order players arrived, even after a burst", async () => {
      const event = await makeEvent({ cap: 2 });
      await fill(event.id, "Goalkeeper", 2);
      const queued = [];
      for (let i = 0; i < 3; i += 1) queued.push(await join(event.id, "Goalkeeper"));
      const first = await m.prisma.soloRegistration.findFirstOrThrow({ where: { eventId: event.id, status: "approved", slotGroup: "required" }, orderBy: { createdAt: "asc" } });
      const owner = await m.prisma.user.findUniqueOrThrow({ where: { id: first.userId } });

      await Promise.all([
        m.repo.withdrawSolo({ userId: owner.id, registrationId: first.id }),
        m.repo.sweepSoloEvent(event.id),
      ]);

      const rows = await Promise.all(queued.map((entry) => m.repo.getSoloRegistrationForUser(event.id, entry.registration.userId)));
      expect(rows.map((row) => row?.status)).toEqual(["approved", "queued", "queued"]);
    });
  });

  describe("payment proof", () => {
    it("moves a payment to review and keeps the slot", async () => {
      const event = await makeEvent({ fee: true });
      const { registration } = await join(event.id);
      const result = await m.repo.uploadSoloProof({ userId: registration.userId, registrationId: registration.id, proofImageUrl: "https://blob.test/proof.png" });
      expect(result.registration).toMatchObject({ status: "pending_review", proofImageUrl: "https://blob.test/proof.png" });
      expect(result.registration.version).toBe(registration.version + 1);
    });

    it("hides another player's registration", async () => {
      const event = await makeEvent({ fee: true });
      const { registration } = await join(event.id);
      const stranger = await makeUser();
      await expect(m.repo.uploadSoloProof({ userId: stranger.id, registrationId: registration.id, proofImageUrl: "https://blob.test/x.png" }))
        .rejects.toThrow("Pendaftaran tidak ditemukan.");
    });

    it("refuses proof after the deadline, but keeps the expiry and hands the slot on", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const [late] = await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      await m.prisma.soloRegistration.update({ where: { id: late.registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const attempt = m.repo.uploadSoloProof({ userId: late.registration.userId, registrationId: late.registration.id, proofImageUrl: "https://blob.test/l.png" });
      await expect(attempt).rejects.toMatchObject({ message: "Batas waktu bayar sudah lewat. Daftar lagi untuk dapat slot.", promoted: [expect.objectContaining({ registrationId: queued.registration.id })] });
      expect((await m.repo.getSoloRegistrationForUser(event.id, late.registration.userId))?.status).toBe("expired");
      expect((await m.repo.getSoloRegistrationForUser(event.id, queued.registration.userId))?.status).toBe("pending_payment");
    });

    it("refuses proof for a registration that does not owe a payment", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      await expect(m.repo.uploadSoloProof({ userId: queued.registration.userId, registrationId: queued.registration.id, proofImageUrl: "https://blob.test/q.png" }))
        .rejects.toThrow("Bukti bayar untuk pendaftaran ini tidak bisa diubah.");
    });
  });

  describe("organizer review", () => {
    async function paid() {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ cap: 2, fee: true, organizerUserId: organizer.id });
      const { registration } = await join(event.id, "Forward");
      const proof = await m.repo.uploadSoloProof({ userId: registration.userId, registrationId: registration.id, proofImageUrl: "https://blob.test/p.png" });
      return { organizer, event, registration: proof.registration };
    }

    it("approves a payment under review", async () => {
      const { organizer, registration } = await paid();
      const approved = await m.repo.approveSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, expectedVersion: registration.version });
      expect(approved).toMatchObject({ status: "approved", version: registration.version + 1 });
      expect(approved.approvedAt).toBeInstanceOf(Date);
      const row = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(row.approvedById).toBe(organizer.id);
    });

    it("refuses an organizer who does not own the event", async () => {
      const { registration } = await paid();
      const other = await makeUser("organizer");
      await expect(m.repo.approveSolo({ actor: organizerOf(other.id), registrationId: registration.id, expectedVersion: registration.version }))
        .rejects.toThrow("Not authorized");
      const row = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(row.status).toBe("pending_review");
    });

    it("answers a stale version with a reload message and changes nothing", async () => {
      const { organizer, registration } = await paid();
      await expect(m.repo.approveSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, expectedVersion: registration.version - 1 }))
        .rejects.toThrow("Data sudah berubah. Muat ulang halaman.");
      const row = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(row.status).toBe("pending_review");
    });

    it("approves only once when two organizers click together", async () => {
      const { organizer, registration } = await paid();
      const settled = await Promise.allSettled([1, 2].map(() =>
        m.repo.approveSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, expectedVersion: registration.version })));
      expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      const row = await m.prisma.soloRegistration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(row.version).toBe(registration.version + 1);
    });

    it("rejects with a reason, clears the proof, keeps the slot and gives a fresh deadline", async () => {
      const { organizer, event, registration } = await paid();
      const rejected = await m.repo.rejectSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, reason: "  Nominal kurang  ", expectedVersion: registration.version });
      expect(rejected).toMatchObject({ status: "rejected", rejectReason: "Nominal kurang", proofImageUrl: null });
      expect(rejected.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
      expect((await m.repo.getSoloQuotaSnapshot(event.id)).open.held).toBe(1);

      const retry = await m.repo.uploadSoloProof({ userId: registration.userId, registrationId: registration.id, proofImageUrl: "https://blob.test/new.png" });
      expect(retry.registration).toMatchObject({ status: "pending_review", rejectReason: null });
    });

    it.each(["", "ab", "x".repeat(241)])("refuses a rejection reason of %j", async (reason) => {
      const { organizer, registration } = await paid();
      await expect(m.repo.rejectSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, reason, expectedVersion: registration.version }))
        .rejects.toThrow("Alasan penolakan 3-240 karakter.");
    });

    it("does not approve a registration that has not been paid", async () => {
      const organizer = await makeUser("organizer");
      const event = await makeEvent({ fee: true, organizerUserId: organizer.id });
      const { registration } = await join(event.id);
      await expect(m.repo.approveSolo({ actor: organizerOf(organizer.id), registrationId: registration.id, expectedVersion: registration.version }))
        .rejects.toThrow("Data sudah berubah. Muat ulang halaman.");
    });
  });

  describe("withdrawing", () => {
    it("flags a refund only when money may have been paid", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const unpaid = await join(event.id, "Forward");
      const noRefund = await m.repo.withdrawSolo({ userId: unpaid.registration.userId, registrationId: unpaid.registration.id });
      expect(noRefund.needsRefund).toBe(false);

      const paying = await join(event.id, "Forward");
      await m.repo.uploadSoloProof({ userId: paying.registration.userId, registrationId: paying.registration.id, proofImageUrl: "https://blob.test/p.png" });
      const refund = await m.repo.withdrawSolo({ userId: paying.registration.userId, registrationId: paying.registration.id });
      expect(refund.needsRefund).toBe(true);
      expect(refund.registration.proofImageUrl).toBe("https://blob.test/p.png"); // kept for the refund
    });

    it("lets a queued player leave without a refund", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      await fill(event.id, "Goalkeeper", 2);
      const queued = await join(event.id, "Goalkeeper");
      const result = await m.repo.withdrawSolo({ userId: queued.registration.userId, registrationId: queued.registration.id });
      expect(result).toMatchObject({ needsRefund: false, promoted: [] });
    });

    it("is closed once registration is closed", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id);
      await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
      await expect(m.repo.withdrawSolo({ userId: registration.userId, registrationId: registration.id }))
        .rejects.toThrow("Pendaftaran sudah ditutup. Hubungi organizer untuk membatalkan.");
    });

    it("cannot be done twice", async () => {
      const event = await makeEvent();
      const { registration } = await join(event.id);
      await m.repo.withdrawSolo({ userId: registration.userId, registrationId: registration.id });
      await expect(m.repo.withdrawSolo({ userId: registration.userId, registrationId: registration.id })).rejects.toThrow("Pendaftaran ini sudah tidak aktif.");
    });
  });

  describe("a solo event does not take teams", () => {
    const message = "Event ini untuk pemain solo. Pendaftaran tim tidak dibuka.";

    it("refuses every way a captain could enter a team", async () => {
      const event = await makeEvent({ fee: false });
      const paidEvent = await makeEvent({ fee: true });
      const captain = await makeUser("captain");
      await expect(m.platform.registerTeam({ eventId: event.id, captainId: captain.id, name: "Tim Solo", tag: "TS" })).rejects.toThrow(message);
      await expect(m.platform.createTeamRegistrationRequest({ eventId: paidEvent.id, captainId: captain.id, name: "Tim Solo", tag: "TS" })).rejects.toThrow(message);
      expect(await m.prisma.team.count({ where: { eventId: { in: [event.id, paidEvent.id] } } })).toBe(0);
      await m.prisma.user.deleteMany({ where: { email: { startsWith: `${run}-c` } } });
    });
  });
});
