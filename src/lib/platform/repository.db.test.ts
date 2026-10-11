import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppUser } from "./types";

// Database tests for the Serializable registration transactions (refactor PR 0.4).
//
// The mocked repository tests cannot show what happens when captains race, or that a failed attempt rolls back
// completely, so these run against a real PostgreSQL. They are skipped unless REGISTRATION_TEST_DATABASE_URL is
// set. They refuse any database that is not local, or whose name does not contain "test", because the code under
// test also updates unrelated expired requests in the database it is connected to.
//
// Two layers protect registrations. The transaction (event-row claim + Serializable) keeps the slot count correct.
// Partial unique indexes on TeamRegistrationRequest (created in SQL migrations, not in schema.prisma) stop a second
// active request per captain and a second reserved team name or tag. These tests check the outcome of both together.
//
//   docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=miracle_reg_test -p 127.0.0.1:55432:5432 postgres:18
//   DATABASE_URL=<url> DIRECT_URL=<url> pnpm exec prisma migrate deploy
//   REGISTRATION_TEST_DATABASE_URL=<url> pnpm exec vitest run src/lib/platform/repository.db.test.ts

const databaseUrl = process.env.REGISTRATION_TEST_DATABASE_URL;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Fails closed: only a local database whose name contains "test", with no way to redirect the host. */
function assertDisposableLocalDatabase(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`REGISTRATION_TEST_DATABASE_URL must point to a local database, not "${url.hostname}".`);
  }
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new Error("REGISTRATION_TEST_DATABASE_URL must not override the host with a query parameter.");
  }
  if (!/test/i.test(url.pathname)) {
    throw new Error('REGISTRATION_TEST_DATABASE_URL must name a throwaway database that contains "test".');
  }
}

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Repository = typeof import("./repository");

const suite = databaseUrl ? describe : describe.skip;

suite("registration transactions against a real database", () => {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const eventIds: string[] = [];
  const userIds: string[] = [];
  let db: PrismaClient;
  let repository: Repository;

  beforeAll(async () => {
    assertDisposableLocalDatabase(databaseUrl as string);
    // The repository reads its client from DATABASE_URL when it is first imported.
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    repository = await import("./repository");
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }, 60_000);

  afterAll(async () => {
    try {
      if (db) {
        await db.event.deleteMany({ where: { id: { in: eventIds } } });
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await db?.$disconnect();
      // The repository keeps its own client; close it too so the test process can exit.
      if (repository) await (await import("./db")).prisma.$disconnect();
    }
  }, 60_000);

  async function createCaptains(count: number, label: string) {
    const captains = [];
    for (let index = 0; index < count; index += 1) {
      const user = await db.user.create({
        data: { email: `${label}-${index}-${suffix}@test.local`, name: `Captain ${label} ${index}`, role: "captain", passwordHash: "x" },
      });
      userIds.push(user.id);
      captains.push(user);
    }
    return captains;
  }

  async function createEvent(label: string, participantCap: number, registrationFeeRequired: boolean) {
    const event = await db.event.create({
      data: {
        slug: `${label}-${suffix}`,
        name: `Event ${label}`,
        description: "Database test event",
        gameId: "game-kuroko",
        gameModeId: "mode-kuroko-3v3",
        format: "Single Elimination",
        status: "Published",
        participantCap,
        registrationWindow: "Open",
        startsAt: "2026-12-01",
        venue: "Online",
        registrationFeeRequired,
      },
    });
    eventIds.push(event.id);
    return event;
  }

  const slotFull = "Slot pendaftaran event ini sudah penuh.";

  /**
   * A race loser must fail for a known reason. A serialization failure (P2034) is also accepted: it is what a
   * captain would see if the 3 automatic retries run out under heavy contention, which is a known gap and not
   * something these tests try to prove away. Any other error, such as a raw unique-constraint error, fails the test.
   */
  function expectKnownFailures(results: PromiseSettledResult<unknown>[], messages: string[]) {
    for (const result of results) {
      if (result.status !== "rejected") continue;
      const reason = result.reason as { code?: string; message?: string };
      const known = reason.code === "P2034" || messages.some((message) => reason.message?.includes(message));
      expect(known, `unexpected failure: ${reason.code ?? ""} ${reason.message ?? String(result.reason)}`).toBe(true);
    }
  }

  it("registerTeam never registers more teams than the participant cap when captains race for the last slots", async () => {
    const cap = 2;
    const event = await createEvent("reg-cap", cap, false);
    const captains = await createCaptains(5, "reg-cap");

    const results = await Promise.allSettled(
      captains.map((captain, index) =>
        repository.registerTeam({ eventId: event.id, captainId: captain.id, name: `Racer ${index} ${suffix}`, tag: `R${index}` }),
      ),
    );

    const registered = await db.team.count({ where: { eventId: event.id } });
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    expect(registered).toBeLessThanOrEqual(cap);
    expect(registered).toBe(fulfilled);
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expectKnownFailures(results, [slotFull]);
    // Each committed registration claims the event version once. Rolled-back attempts must leave no increment.
    const { competitionVersion } = await db.event.findUniqueOrThrow({ where: { id: event.id }, select: { competitionVersion: true } });
    expect(competitionVersion).toBe(fulfilled);
  }, 60_000);

  it("createTeamRegistrationRequest keeps one request when several captains take the same team name, without claiming the event version", async () => {
    const event = await createEvent("req-name", 8, true);
    const captains = await createCaptains(5, "req-name");

    // Different tags, same name.
    const results = await Promise.allSettled(
      captains.map((captain, index) =>
        repository.createTeamRegistrationRequest({ eventId: event.id, captainId: captain.id, name: `Same Name ${suffix}`, tag: `N${index}` }),
      ),
    );

    const requests = await db.teamRegistrationRequest.count({ where: { eventId: event.id } });
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    expect(requests).toBe(1);
    expect(fulfilled).toBe(1);
    expectKnownFailures(results, ["Tag atau nama tim sudah digunakan di event ini."]);
    // A pending request does not change the roster, so it only reads the roster lock.
    const { competitionVersion } = await db.event.findUniqueOrThrow({ where: { id: event.id }, select: { competitionVersion: true } });
    expect(competitionVersion).toBe(0);
  }, 60_000);

  it("createTeamRegistrationRequest keeps one active request for a captain who submits several times at once", async () => {
    const event = await createEvent("req-double", 8, true);
    const [captain] = await createCaptains(1, "req-double");

    const results = await Promise.allSettled(
      [0, 1, 2].map((index) =>
        repository.createTeamRegistrationRequest({ eventId: event.id, captainId: captain!.id, name: `Double ${index} ${suffix}`, tag: `D${index}` }),
      ),
    );

    const requests = await db.teamRegistrationRequest.count({ where: { eventId: event.id, captainId: captain!.id } });
    expect(requests).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    // Depending on timing the loser is stopped by the transaction check or by the unique index.
    expectKnownFailures(results, ["Kamu sudah mendaftarkan tim untuk event ini.", "Tag atau nama tim sudah digunakan di event ini."]);
  }, 60_000);

  it("approveTeamRegistrationRequest approves only as many requests as there are free slots", async () => {
    const cap = 1;
    const event = await createEvent("approve-cap", cap, true);
    const captains = await createCaptains(3, "approve-cap");
    const requests = [];
    for (const [index, captain] of captains.entries()) {
      requests.push(
        await db.teamRegistrationRequest.create({
          data: {
            eventId: event.id,
            captainId: captain.id,
            teamName: `Approve ${index} ${suffix}`,
            teamTag: `A${index}`,
            status: "pending_review",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }),
      );
    }
    const admin: AppUser = { id: captains[0]!.id, email: "admin@test.local", name: "Admin", role: "platform_admin" };

    const results = await Promise.allSettled(requests.map((request) => repository.approveTeamRegistrationRequest(admin, request.id)));

    const teams = await db.team.count({ where: { eventId: event.id } });
    const approved = await db.teamRegistrationRequest.count({ where: { eventId: event.id, status: "approved" } });
    const stillPending = await db.teamRegistrationRequest.count({ where: { eventId: event.id, status: "pending_review" } });
    expect(teams).toBeLessThanOrEqual(cap);
    expect(approved).toBe(teams);
    expect(stillPending).toBe(requests.length - approved);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(teams);
    expect(teams).toBeGreaterThanOrEqual(1);
    expectKnownFailures(results, [slotFull]);
  }, 60_000);
});
