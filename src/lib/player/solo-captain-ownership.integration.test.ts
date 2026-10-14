/**
 * The captain of a solo team is a player account. Every write the captain pages offer is scoped to the teams
 * whose captainId is that account, in the database layer, so a player who captains team A cannot touch team B,
 * in the same event or in another one.
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

const run = `soloown${Date.now().toString(36)}`;

type Modules = {
  prisma: typeof import("@/lib/platform/db").prisma;
  repo: typeof import("@/lib/platform/repository");
  rosterChange: typeof import("@/lib/platform/roster-change-requests");
};
let m: Modules;

const createdEvents: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function makeUser(role: string) {
  counter += 1;
  const user = await m.prisma.user.create({ data: { email: `${run}-u${counter}@test.local`, name: `User ${counter}`, role, passwordHash: "x" } });
  createdUsers.push(user.id);
  return user;
}

async function makeEvent(status = "Registration Closed") {
  counter += 1;
  const event = await m.prisma.event.create({
    data: {
      slug: `${run}-event-${counter}`, name: `Ownership ${counter}`, description: "integration test", gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5",
      format: "Single Elimination", status, participantCap: 8, registrationWindow: "TBD", startsAt: "TBD", venue: "Online", entryMode: "solo",
    },
  });
  createdEvents.push(event.id);
  return event;
}

async function makeTeam(eventId: string, captainId: string, name: string, source = "solo-draw") {
  const team = await m.prisma.team.create({ data: { eventId, captainId, name, tag: name.slice(0, 3).toUpperCase(), logoText: name.slice(0, 2), source } });
  const player = await m.prisma.player.create({ data: { teamId: team.id, eventId, displayName: `UID-${name}`, nickname: `Nick-${name}`, position: "Forward", userId: captainId } });
  return { team, player };
}

describe.skipIf(!databaseUrl)("the captain of a solo team, in the database", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    m = {
      prisma: (await import("@/lib/platform/db")).prisma,
      repo: await import("@/lib/platform/repository"),
      rosterChange: await import("@/lib/platform/roster-change-requests"),
    };
  });

  afterAll(async () => {
    if (!m) return;
    await m.prisma.event.deleteMany({ where: { id: { in: createdEvents } } });
    await m.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await m.prisma.$disconnect();
  });

  async function twoTeams(sameEvent = true) {
    const [userA, userB] = [await makeUser("player"), await makeUser("player")];
    const eventA = await makeEvent();
    const eventB = sameEvent ? eventA : await makeEvent();
    return { userA, userB, a: await makeTeam(eventA.id, userA.id, "Alpha"), b: await makeTeam(eventB.id, userB.id, "Bravo"), eventA, eventB };
  }

  it.each([["the same event", true], ["another event", false]])("lets the player manage their own team's display and refuses the other team entirely, in %s", async (_name, sameEvent) => {
    const { userA, a, b } = await twoTeams(sameEvent);

    await expect(m.repo.setTeamCaptainDisplay(a.team.id, userA.id, a.player.id)).resolves.toBeUndefined();

    await expect(m.repo.addPlayer({ teamId: b.team.id, captainId: userA.id, displayName: "UID-x", nickname: "Intruder" })).rejects.toThrow("Tim tidak ditemukan");
    await expect(m.repo.updatePlayer(b.player.id, userA.id, { nickname: "Hijack" })).rejects.toThrow("Not authorized");
    await expect(m.repo.deletePlayer(b.player.id, userA.id)).rejects.toThrow("Not authorized");
    await expect(m.repo.setTeamCaptainDisplay(b.team.id, userA.id, b.player.id)).rejects.toThrow("Not authorized");
    expect(await m.prisma.player.findUniqueOrThrow({ where: { id: b.player.id } })).toMatchObject({ nickname: "Nick-Bravo" });
    expect(await m.prisma.player.count({ where: { teamId: b.team.id } })).toBe(1);
  });

  it("does not let the captain of a drawn team add, rename or remove players, so the organizer's draw stays the roster", async () => {
    const { userA, a } = await twoTeams(true);
    const teammate = await m.prisma.player.create({ data: { teamId: a.team.id, eventId: a.team.eventId!, displayName: "UID-mate", nickname: "Mate", position: "Defender", userId: (await makeUser("player")).id } });
    const refused = "Pemain tim ini dari hasil acak";

    await expect(m.repo.addPlayer({ teamId: a.team.id, captainId: userA.id, displayName: "UID-friend", nickname: "Friend" })).rejects.toThrow(refused);
    await expect(m.repo.updatePlayer(teammate.id, userA.id, { nickname: "Renamed", displayName: "UID-fake" })).rejects.toThrow(refused);
    await expect(m.repo.deletePlayer(teammate.id, userA.id)).rejects.toThrow(refused);
    await expect(m.repo.deletePlayer(a.player.id, userA.id)).rejects.toThrow(refused);

    expect(await m.prisma.player.count({ where: { teamId: a.team.id } })).toBe(2);
    expect(await m.prisma.player.findUniqueOrThrow({ where: { id: teammate.id } })).toMatchObject({ nickname: "Mate", displayName: "UID-mate" });
  });

  it("leaves an ordinary captain free to run the roster of a team they registered themselves", async () => {
    const captain = await makeUser("captain");
    const event = await makeEvent();
    const own = await makeTeam(event.id, captain.id, "Delta", "registration");

    await expect(m.repo.addPlayer({ teamId: own.team.id, captainId: captain.id, displayName: "UID-new", nickname: "NewGuy" })).resolves.toMatchObject({ nickname: "NewGuy" });
    await expect(m.repo.updatePlayer(own.player.id, captain.id, { nickname: "Renamed" })).resolves.toMatchObject({ nickname: "Renamed" });
    await expect(m.repo.deletePlayer(own.player.id, captain.id)).resolves.toBeUndefined();
  });

  it("lets the player send stats for a completed match of their own team only", async () => {
    const { userA, a, b, eventA } = await twoTeams(true);
    const match = await m.prisma.match.create({
      data: { eventId: eventA.id, roundLabel: "Final", homeTeamId: a.team.id, awayTeamId: b.team.id, status: "Completed" },
    });
    const own = { captainId: userA.id, matchId: match.id, teamId: a.team.id, eventId: eventA.id };

    await expect(m.repo.assertCaptainCanSubmitStats(own)).resolves.toBeUndefined();
    await expect(m.repo.assertCaptainCanSubmitStats({ ...own, teamId: b.team.id })).rejects.toThrow("Not authorized");
    await expect(m.repo.assertCaptainCanSubmitStats({ ...own, eventId: (await makeEvent()).id })).rejects.toThrow("Not authorized");
    const rows = await m.repo.getCompletedMatchesForCaptain(userA.id);
    expect(rows.map((row) => row.teamId)).toEqual([a.team.id]);
  });

  it("shows the roster-change overview and files requests only for the player's own team", async () => {
    const { userA, a, b } = await twoTeams(true);

    expect(await m.rosterChange.getRosterChangeOverview(userA.id, b.team.id)).toBeNull();
    await expect(
      m.rosterChange.requestRosterChange({ captainId: userA.id, teamId: b.team.id, change: { kind: "remove", outPlayerId: b.player.id } }),
    ).rejects.toMatchObject({ code: "team_not_found" });
    expect(await m.prisma.rosterChangeRequest.count({ where: { teamId: b.team.id } })).toBe(0);
    expect(a.team.id).not.toBe(b.team.id);
  });

  it("gives a player who captains nothing no team and no stats", async () => {
    const stranger = await makeUser("player");
    await twoTeams(true);

    expect(await m.repo.getCaptainTeams(stranger.id)).toEqual([]);
    expect(await m.repo.getCompletedMatchesForCaptain(stranger.id)).toEqual([]);
    const { ownsATeam } = await import("@/lib/auth/captain-access");
    expect(await ownsATeam(stranger.id)).toBe(false);
  });

  it("knows a player owns a team once a draw makes them its captain", async () => {
    const owner = await makeUser("player");
    const event = await makeEvent();
    const { ownsATeam } = await import("@/lib/auth/captain-access");
    expect(await ownsATeam(owner.id)).toBe(false);

    await makeTeam(event.id, owner.id, "Charlie");

    expect(await ownsATeam(owner.id)).toBe(true);
  });
});
