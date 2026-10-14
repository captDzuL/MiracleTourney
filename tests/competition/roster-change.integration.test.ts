import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { generateCompetitionGraph, type GroupPlayoffsConfig } from "../../src/lib/tournament/competition";

/**
 * Real-Postgres check of the limited roster change flow: request, concurrent
 * requests, approval, a former player coming back, the allowance and the window.
 *
 *   ROSTER_CHANGE_TEST_DATABASE_URL=postgresql://postgres:pw@localhost:55432/mig \
 *     pnpm vitest run tests/competition/roster-change.integration.test.ts
 *
 * Apply every migration to that database first. It must be a local database.
 */
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const databaseUrl = process.env.ROSTER_CHANGE_TEST_DATABASE_URL;
const integrationIt = databaseUrl ? it : it.skip;

const config: GroupPlayoffsConfig = {
  version: 1, kind: "group_playoffs", groupCount: 2, qualifiersPerGroup: 2,
  groupStage: { legs: 1, points: { win: 3, draw: 1, loss: 0 }, tiebreakers: ["score_difference", "head_to_head"] },
  playoffs: { version: 1, kind: "single_elimination", thirdPlace: "none", bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 }, avoidImmediateGroupRematches: true },
};

describe("limited roster changes on a real database", () => {
  integrationIt("runs the whole flow and keeps statistics intact", async () => {
    const url = new URL(databaseUrl as string);
    expect(["localhost", "127.0.0.1", "[::1]"], "Use a local database for this test").toContain(url.hostname);
    expect(url.searchParams.has("host"), "A host= parameter could point the connection elsewhere").toBe(false);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const { requestRosterChange, getRosterChangeOverview, RosterChangeError } = await import("../../src/lib/platform/roster-change-requests");
    const { decideRosterChange } = await import("../../src/lib/platform/roster-change-decisions");
    const { addPlayer } = await import("../../src/lib/teams/repository");

    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const userIds: string[] = [];
    let eventId: string | undefined;

    const codeOf = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return "no-error";
      } catch (error) {
        return error instanceof RosterChangeError ? error.code : `other:${error instanceof Error ? error.message : String(error)}`;
      }
    };

    try {
      const makeUser = async (label: string, role: string) => {
        const user = await prisma.user.create({
          data: { email: `${label}-${suffix}@example.test`, name: label, role, passwordHash: "not-a-real-password" },
        });
        userIds.push(user.id);
        return user;
      };
      const organizer = await makeUser("organizer", "organizer");
      const captains = await Promise.all([1, 2, 3].map((n) => makeUser(`captain${n}`, "captain")));

      const event = await prisma.event.create({
        data: {
          slug: `roster-change-${suffix}`, name: "Roster Change Integration", description: "Isolated fixture",
          gameId: "game-flashpeak", gameModeId: "mode-flashpeak-5v5", format: "League", formatConfig: config as never,
          status: "Registration Closed", participantCap: 8, registrationWindow: "test", startsAt: "test", venue: "test",
          organizerUserId: organizer.id, rosterChangeLimit: 2,
        },
      });
      eventId = event.id;

      const teamIds: string[] = [];
      for (let t = 1; t <= 8; t += 1) {
        const team = await prisma.team.create({
          data: {
            eventId: event.id, name: `Team ${t} ${suffix}`, logoText: `T${t}`, tag: `T${t}${suffix.slice(0, 2)}`.toUpperCase(),
            captainId: captains[t - 1]?.id ?? null, captainUid: `UID-${t}-1`, captainIgn: `Nick-${t}-1`, captainIsPlayer: true,
          },
        });
        teamIds.push(team.id);
        await prisma.player.createMany({
          data: [1, 2, 3, 4, 5].map((p) => ({ teamId: team.id, eventId: event.id, displayName: `UID-${t}-${p}`, nickname: `Nick-${t}-${p}`, position: "Forward" })),
        });
      }
      const graph = generateCompetitionGraph({ eventId: event.id, config, teams: teamIds.map((id, index) => ({ id, seed: index + 1 })) });
      await prisma.competitionPhase.create({ data: { eventId: event.id, label: "Groups", sequence: 1, status: "active", configuration: { graph } as never } });
      await prisma.competitionPhase.create({ data: { eventId: event.id, label: "Playoffs", sequence: 2, status: "active" } });

      // A completed match whose statistics belong to a player who is about to leave.
      const leaving = await prisma.player.findFirstOrThrow({ where: { teamId: teamIds[0], displayName: "UID-1-2" } });
      const oldMatch = await prisma.match.create({
        data: {
          eventId: event.id, roundLabel: "Group A", homeTeamId: teamIds[0], awayTeamId: teamIds[1], status: "Completed",
          actualStartedAt: new Date("2026-10-05T10:00:00Z"), actualEndedAt: new Date("2026-10-05T11:00:00Z"),
        },
      });
      await prisma.playerStat.create({
        data: { matchId: oldMatch.id, playerId: leaving.id, playerName: leaving.nickname, teamId: teamIds[0], position: "Forward", gameSlug: "flashpeak", stats: { goal: 3 } },
      });

      const version = (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).competitionVersion;
      const ownerActor = { id: organizer.id, role: "organizer" as const };
      const newcomer = { displayName: "UID-new", nickname: "NewGuy", position: "Defender" };

      // 1. A captain files a swap; the roster is untouched until approval.
      const first = await requestRosterChange({ captainId: captains[0].id, teamId: teamIds[0], change: { kind: "swap", outPlayerId: leaving.id, incoming: newcomer } });
      expect(await prisma.player.count({ where: { teamId: teamIds[0], removedAt: null } })).toBe(5);
      expect(await getRosterChangeOverview(captains[0].id, teamIds[0])).toMatchObject({ window: "limited", limit: 2, used: 0, remaining: 1 });

      // 2. Two requests at the same moment from one team: only one can win.
      const racing = await Promise.all([
        codeOf(requestRosterChange({ captainId: captains[1].id, teamId: teamIds[1], change: { kind: "add", incoming: { displayName: "UID-race-a", nickname: "RaceA", position: "" } } })),
        codeOf(requestRosterChange({ captainId: captains[1].id, teamId: teamIds[1], change: { kind: "add", incoming: { displayName: "UID-race-b", nickname: "RaceB", position: "" } } })),
      ]);
      expect(racing.filter((code) => code === "no-error")).toHaveLength(1);
      expect(await prisma.rosterChangeRequest.count({ where: { teamId: teamIds[1], status: "pending" } })).toBe(1);

      // 3. A stranger cannot decide; the owner can.
      const stranger = await makeUser("stranger", "organizer");
      await expect(decideRosterChange({ actor: { id: stranger.id, role: "organizer" }, requestId: first.requestId, decision: "approve" })).rejects.toThrow("Not authorized");
      await decideRosterChange({ actor: ownerActor, requestId: first.requestId, decision: "approve", note: "Silakan" });

      const left = await prisma.player.findUniqueOrThrow({ where: { id: leaving.id } });
      expect(left.removedAt).not.toBeNull();
      const joined = await prisma.player.findFirstOrThrow({ where: { teamId: teamIds[0], displayName: "UID-new" } });
      expect(joined).toMatchObject({ eventId: event.id, removedAt: null, nickname: "NewGuy" });
      expect(await prisma.playerStat.count({ where: { playerId: leaving.id } })).toBe(1);
      expect(await prisma.rosterChangeRequest.findUniqueOrThrow({ where: { id: first.requestId } })).toMatchObject({ status: "approved", inPlayerId: joined.id, decidedById: organizer.id });
      expect(await prisma.competitionAuditLog.count({ where: { eventId: event.id, action: "roster_change_approve", idempotencyKey: first.requestId } })).toBe(1);
      expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).competitionVersion).toBe(version);

      // 4. Direct edits stay locked; deciding the same request again is refused.
      await expect(addPlayer({ teamId: teamIds[0], eventId: event.id, captainId: captains[0].id, displayName: "UID-x", nickname: "Sneaky" })).rejects.toThrow("terkunci");
      expect(await codeOf(decideRosterChange({ actor: ownerActor, requestId: first.requestId, decision: "approve" }))).toBe("request_not_pending");

      // 5. The former player comes back on the same row: stats continue, the absence is recorded.
      const back = await requestRosterChange({ captainId: captains[0].id, teamId: teamIds[0], change: { kind: "swap", outPlayerId: joined.id, incoming: { displayName: "uid-1-2", nickname: leaving.nickname, position: "Forward" } } });
      await decideRosterChange({ actor: ownerActor, requestId: back.requestId, decision: "approve" });
      const returned = await prisma.player.findUniqueOrThrow({ where: { id: leaving.id } });
      expect(returned.removedAt).toBeNull();
      expect(returned.rosterGaps).toHaveLength(1);
      expect(await prisma.player.count({ where: { teamId: teamIds[0], displayName: { equals: "UID-1-2", mode: "insensitive" } } })).toBe(1);
      expect((await prisma.player.findUniqueOrThrow({ where: { id: joined.id } })).removedAt).not.toBeNull();

      // 6. Both changes are used up.
      expect(await codeOf(requestRosterChange({ captainId: captains[0].id, teamId: teamIds[0], change: { kind: "swap", outPlayerId: returned.id, incoming: { displayName: "UID-late", nickname: "Late", position: "" } } }))).toBe("no_allowance");

      // 7. The window closes when the first playoff match starts.
      const playoffMatch = graph.matches.find((match) => match.groupId === null)!;
      await prisma.match.create({
        data: { id: playoffMatch.id, eventId: event.id, roundLabel: "Semifinal", homeTeamId: teamIds[2], awayTeamId: teamIds[3], status: "Live" },
      });
      expect(await codeOf(requestRosterChange({ captainId: captains[2].id, teamId: teamIds[2], change: { kind: "add", incoming: { displayName: "UID-w", nickname: "Window", position: "" } } }))).toBe("locked");
    } finally {
      if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  }, 60_000);
});
