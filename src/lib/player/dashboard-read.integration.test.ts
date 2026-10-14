/**
 * What a player sees in their own area, read from a real PostgreSQL database: only their own registrations,
 * the right place in the queue, teammates' WhatsApp numbers only for teammates and only after the teams are
 * locked, and the soonest match of their team.
 *
 * Opt in with SOLO_TEST_DATABASE_URL (a local database with every migration applied). Without it the file is skipped.
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

const run = `soloplayer${Date.now().toString(36)}`;

type Modules = {
  prisma: typeof import("@/lib/platform/db").prisma;
  reg: typeof import("@/lib/solo/registration-repository");
  draw: typeof import("@/lib/solo/draw-repository");
  read: typeof import("./dashboard-read");
};
let m: Modules;

const createdEvents: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function makeUser(role = "player") {
  counter += 1;
  const user = await m.prisma.user.create({ data: { email: `${run}-u${counter}@test.local`, name: `User ${counter}`, role, passwordHash: "x" } });
  createdUsers.push(user.id);
  return user;
}

async function makeEvent(options: Partial<{ cap: number; fee: boolean; status: string; organizerUserId: string | null }> = {}) {
  counter += 1;
  const event = await m.prisma.event.create({
    data: {
      slug: `${run}-event-${counter}`, name: `Player Area ${counter}`, description: "integration test", gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination", status: options.status ?? "Published", participantCap: options.cap ?? 2, registrationWindow: "TBD", startsAt: "TBD",
      venue: "Online", entryMode: "solo", registrationFeeRequired: options.fee ?? false, organizerUserId: options.organizerUserId ?? null,
    },
  });
  createdEvents.push(event.id);
  return event;
}

let playerCounter = 0;
async function join(eventId: string, position: string, whatsapp = "6281234567890") {
  playerCounter += 1;
  const user = await makeUser();
  const result = await m.reg.registerSolo({
    eventId, userId: user.id, ign: `Ign${playerCounter}`, uid: `UID-${run}-${playerCounter}`, primaryPosition: position,
    secondaryPosition: null, willingCaptain: false, whatsapp,
  });
  return { user, registration: result.registration, outcome: result.outcome };
}

async function joinMany(eventId: string, position: string, count: number) {
  const joined = [];
  for (let i = 0; i < count; i += 1) joined.push(await join(eventId, position));
  return joined;
}

const asActor = (user: { id: string; email: string; name: string; role: string }) => ({ id: user.id, email: user.email, name: user.name, role: user.role }) as import("@/lib/platform/types").AppUser;

/** A locked solo event with two teams of five and, optionally, one approved player left out. */
async function lockedEvent(options: { fee?: boolean; leftOut?: boolean } = {}) {
  const organizer = await makeUser("organizer");
  const event = await makeEvent({ cap: 2, organizerUserId: organizer.id, fee: options.fee });
  const players = [...(await joinMany(event.id, "Goalkeeper", 2)), ...(await joinMany(event.id, "Forward", 8))];
  let left: Awaited<ReturnType<typeof join>> | null = null;
  if (options.leftOut) {
    left = await join(event.id, "Forward");
    await m.prisma.soloRegistration.update({ where: { id: left.registration.id }, data: { status: "approved", approvedAt: new Date() } });
  }
  if (options.fee) await m.prisma.soloRegistration.updateMany({ where: { eventId: event.id, status: "pending_payment" }, data: { status: "approved", approvedAt: new Date(), expiresAt: null } });
  await m.prisma.event.update({ where: { id: event.id }, data: { status: "Registration Closed" } });
  const actor = asActor(organizer);
  const draw = await m.draw.createSoloDraw({ actor, eventId: event.id, seed: "player-area" });
  await m.draw.lockSoloDraw({ actor, drawId: draw.id, expectedUpdatedAt: draw.updatedAt });
  return { event, players, left, draw };
}

describe.skipIf(!databaseUrl)("the player area's data (real database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    m = {
      prisma: (await import("@/lib/platform/db")).prisma,
      reg: await import("@/lib/solo/registration-repository"),
      draw: await import("@/lib/solo/draw-repository"),
      read: await import("./dashboard-read"),
    };
  });

  afterAll(async () => {
    if (!m) return;
    await m.prisma.event.deleteMany({ where: { id: { in: createdEvents } } });
    await m.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await m.prisma.$disconnect();
  });

  describe("registrations", () => {
    it("shows a player only their own registrations, newest first, with no contact number", async () => {
      const first = await makeEvent();
      const second = await makeEvent();
      const me = await join(first.id, "Forward");
      await join(first.id, "Forward");
      await m.reg.registerSolo({
        eventId: second.id, userId: me.user.id, ign: "SameGuy", uid: `UID-${run}-second`, primaryPosition: "Defender", secondaryPosition: null, willingCaptain: false, whatsapp: "6281234567890",
      });

      const dashboard = await m.read.getPlayerDashboard(me.user.id);

      expect(dashboard.registrations.map((item) => item.event.id)).toEqual([second.id, first.id]);
      expect(dashboard.registrations.every((item) => item.uid.startsWith("UID-") || item.ign === "SameGuy")).toBe(true);
      expect(JSON.stringify(dashboard)).not.toContain("6281234567890");
      expect(await m.read.getPlayerDashboard((await makeUser()).id)).toEqual({ registrations: [], nextMatch: null });
    });

    it("counts the place in the queue within the player's own group, in the order they arrived", async () => {
      const event = await makeEvent({ cap: 2 });
      await joinMany(event.id, "Goalkeeper", 2);
      await joinMany(event.id, "Forward", 8);
      const queuedField = [await join(event.id, "Forward"), await join(event.id, "Forward"), await join(event.id, "Forward")];
      const queuedKeeper = await join(event.id, "Goalkeeper");

      const positions = await Promise.all(queuedField.map(async (entry) => (await m.read.getPlayerDashboard(entry.user.id)).registrations[0].stage));
      const keeper = (await m.read.getPlayerDashboard(queuedKeeper.user.id)).registrations[0].stage;

      expect(positions).toEqual([{ kind: "queued", position: 1 }, { kind: "queued", position: 2 }, { kind: "queued", position: 3 }]);
      expect(keeper).toEqual({ kind: "queued", position: 1 });
    });

    it("lets a late payment lapse and moves the queue before the player looks", async () => {
      const event = await makeEvent({ cap: 2, fee: true });
      const holders = await joinMany(event.id, "Goalkeeper", 2);
      const waiting = await join(event.id, "Goalkeeper");
      expect(waiting.outcome).toBe("queued");
      await m.prisma.soloRegistration.update({ where: { id: holders[0].registration.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const [lost] = (await m.read.getPlayerDashboard(holders[0].user.id)).registrations;
      const [promoted] = (await m.read.getPlayerDashboard(waiting.user.id)).registrations;

      expect(lost.stage).toMatchObject({ kind: "lost", why: "expired" });
      expect(promoted.stage).toMatchObject({ kind: "pay" });
    });

    it("tells an approved player to wait until the teams are locked", async () => {
      const event = await makeEvent();
      const me = await join(event.id, "Forward");
      const [item] = (await m.read.getPlayerDashboard(me.user.id)).registrations;
      expect(item.stage).toEqual({ kind: "waiting" });
      expect(item.team).toBeNull();
    });

    it("tells a player in a team which team, and a player left out whether a refund is owed", async () => {
      const { players, left } = await lockedEvent({ fee: true, leftOut: true });

      const inTeam = (await m.read.getPlayerDashboard(players[0].user.id)).registrations[0];
      const out = (await m.read.getPlayerDashboard(left!.user.id)).registrations[0];

      expect(inTeam.stage).toEqual({ kind: "in_team" });
      expect(inTeam.team).toMatchObject({ name: expect.stringMatching(/^Tim \d$/) });
      expect(out.stage).toEqual({ kind: "out_of_teams", refund: "owed" });
      expect(out.team).toBeNull();

      await m.prisma.soloRegistration.update({ where: { id: left!.registration.id }, data: { refundedAt: new Date() } });
      expect((await m.read.getPlayerDashboard(left!.user.id)).registrations[0].stage).toEqual({ kind: "out_of_teams", refund: "done" });
    });
  });

  describe("the team", () => {
    it("shows teammates, their numbers and who captains, to a member of the team only", async () => {
      const { event, players } = await lockedEvent();
      const me = players[2];
      const view = await m.read.getPlayerTeamView(me.user.id, event.id);

      expect(view).not.toBeNull();
      expect(view!.members).toHaveLength(5);
      expect(view!.members.filter((member) => member.isMe)).toHaveLength(1);
      expect(view!.members.filter((member) => member.isCaptain)).toHaveLength(1);
      expect(view!.members.every((member) => member.whatsapp === "6281234567890")).toBe(true);
      expect(view!.iAmCaptain).toBe(view!.members.find((member) => member.isMe)!.isCaptain);

      const teammateIds = new Set(view!.members.map((member) => member.uid));
      const otherTeam = players.find((entry) => !teammateIds.has(entry.registration.uid))!;
      const theirs = await m.read.getPlayerTeamView(otherTeam.user.id, event.id);
      expect(theirs!.team.id).not.toBe(view!.team.id);
      expect(theirs!.members.map((member) => member.uid)).not.toContain(me.registration.uid);
    });

    it("gives nothing to somebody who is not on a team, who was left out, or who asks before the lock", async () => {
      const { event, left } = await lockedEvent({ leftOut: true });
      const stranger = await makeUser();
      expect(await m.read.getPlayerTeamView(stranger.id, event.id)).toBeNull();
      expect(await m.read.getPlayerTeamView(left!.user.id, event.id)).toBeNull();

      const early = await makeEvent();
      const member = await join(early.id, "Forward");
      expect(await m.read.getPlayerTeamView(member.user.id, early.id)).toBeNull();
    });

    it("shows nothing for a team of an event whose draw is not the locked one", async () => {
      const { event, players } = await lockedEvent();
      await m.prisma.event.update({ where: { id: event.id }, data: { activeSoloDrawId: null } });
      expect(await m.read.getPlayerTeamView(players[0].user.id, event.id)).toBeNull();
    });

    it("does not hand a team of another event to a player who asks for it by id", async () => {
      const first = await lockedEvent();
      const second = await lockedEvent();
      expect(await m.read.getPlayerTeamView(first.players[0].user.id, second.event.id)).toBeNull();
    });

    it("leaves out a player who was replaced, and shows no number for a player added by hand", async () => {
      const { event, players } = await lockedEvent();
      const me = players[0];
      const view = await m.read.getPlayerTeamView(me.user.id, event.id);
      const mate = view!.members.find((member) => !member.isMe)!;
      await m.prisma.player.update({ where: { id: mate.playerId }, data: { removedAt: new Date() } });
      await m.prisma.player.create({ data: { teamId: view!.team.id, eventId: event.id, displayName: "UID-hand", nickname: "ByHand", position: "Forward" } });

      const after = await m.read.getPlayerTeamView(me.user.id, event.id);

      expect(after!.members.map((member) => member.playerId)).not.toContain(mate.playerId);
      expect(after!.members.find((member) => member.ign === "ByHand")).toMatchObject({ whatsapp: null, isCaptain: false });
    });
  });

  describe("matches", () => {
    it("shows the soonest open match of the player's team, and none that are over", async () => {
      const { event, players } = await lockedEvent();
      const view = (await m.read.getPlayerTeamView(players[0].user.id, event.id))!;
      const other = await m.prisma.team.findFirstOrThrow({ where: { eventId: event.id, id: { not: view.team.id } } });
      const soon = new Date(Date.now() + 3600_000);
      const later = new Date(Date.now() + 7200_000);
      await m.prisma.match.createMany({
        data: [
          { eventId: event.id, roundLabel: "Final", homeTeamId: view.team.id, awayTeamId: other.id, status: "Scheduled", scheduledAt: later },
          { eventId: event.id, roundLabel: "Semifinal", homeTeamId: other.id, awayTeamId: view.team.id, status: "Scheduled", scheduledAt: soon },
          { eventId: event.id, roundLabel: "Opening", homeTeamId: view.team.id, awayTeamId: other.id, status: "Completed", scheduledAt: new Date(Date.now() - 3600_000) },
        ],
      });

      const dashboard = await m.read.getPlayerDashboard(players[0].user.id);

      expect(dashboard.nextMatch).toMatchObject({ roundLabel: "Semifinal", teamName: view.team.name, opponentName: other.name, eventId: event.id });
      expect(dashboard.nextMatch!.scheduledAt?.getTime()).toBe(soon.getTime());
      const teamView = await m.read.getPlayerTeamView(players[0].user.id, event.id);
      expect(teamView!.matches.map((match) => match.roundLabel)).toEqual(["Semifinal", "Final"]);
    });

    it("has no next match for a player without a team", async () => {
      const me = await join((await makeEvent()).id, "Forward");
      expect((await m.read.getPlayerDashboard(me.user.id)).nextMatch).toBeNull();
    });
  });
});
