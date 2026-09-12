import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

type PreflightModule = {
  validateE2eDatabaseConfiguration(env: Record<string, string | undefined>): {
    ok: boolean;
    host: string;
    message?: string;
  };
};

const preflightModulePath = "../../../scripts/e2e-db-preflight.mjs";
const { validateE2eDatabaseConfiguration } = await import(preflightModulePath) as PreflightModule;
const migrationDatabaseUrl = process.env.MATCHDAY_V3_MIGRATION_TEST_DATABASE_URL;
const migrationIt = migrationDatabaseUrl ? it : it.skip;

describe("match-day v3 migration event-cascade integration", () => {
  migrationIt("rejects direct winner-team deletion but permits a complete event cascade", async () => {
    const configuration = validateE2eDatabaseConfiguration({
      DATABASE_URL: migrationDatabaseUrl,
      DIRECT_URL: migrationDatabaseUrl,
      NEON_PROD_HOST: process.env.NEON_PROD_HOST,
    });
    expect(configuration.ok, configuration.message).toBe(true);

    const prisma = new PrismaClient({ datasources: { db: { url: migrationDatabaseUrl } } });
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let eventId: string | undefined;

    try {
      const actor = await prisma.user.create({
        data: {
          email: "match-day-v3-cascade-" + suffix + "@example.test",
          name: "Match Day V3 Migration Test",
          role: "admin",
          passwordHash: "not-a-real-password",
        },
      });
      const event = await prisma.event.create({
        data: {
          slug: "match-day-v3-cascade-" + suffix,
          name: "Match Day V3 Cascade Test",
          description: "Isolated migration integration fixture",
          gameId: "test-game",
          gameModeId: "test-mode",
          format: "single_elimination",
          status: "Draft",
          participantCap: 2,
          registrationWindow: "test",
          startsAt: "test",
          venue: "test",
        },
      });
      eventId = event.id;
      const team = await prisma.team.create({
        data: {
          eventId: event.id,
          name: "Cascade Team " + suffix,
          logoText: "CT",
          tag: "CT" + suffix.slice(0, 4),
        },
      });
      const match = await prisma.match.create({
        data: {
          eventId: event.id,
          roundLabel: "Final",
          homeTeamId: team.id,
          awayTeamId: team.id,
        },
      });
      const revision = await prisma.matchResultRevision.create({
        data: {
          eventId: event.id,
          matchId: match.id,
          version: 1,
          homeScore: 1,
          awayScore: 0,
          winnerTeamId: team.id,
          scoreSnapshot: { homeScore: 1, awayScore: 0 },
          actorUserId: actor.id,
          reason: "migration cascade contract",
          idempotencyKey: "cascade-" + suffix,
        },
      });

      await expect(prisma.$transaction((tx) => tx.team.delete({ where: { id: team.id } }))).rejects.toThrow();
      await prisma.event.delete({ where: { id: event.id } });
      eventId = undefined;
      expect(await prisma.matchResultRevision.findUnique({ where: { id: revision.id } })).toBeNull();
    } finally {
      if (eventId) {
        await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
