import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { validateE2eDatabaseConfiguration } from "../../scripts/e2e-db-configuration.mjs";
import { createCompetitionOperations, type OperationCommand } from "../../src/lib/tournament/operations";
import type { TournamentFormatConfig } from "../../src/lib/tournament/formats/types";
import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();
const config: TournamentFormatConfig = {
  version: 1,
  kind: "single_elimination",
  thirdPlace: "none",
  bestOf: { earlyRounds: 1, semifinals: 1, thirdPlace: 1, final: 1 },
};

test.describe.serial("Adaptive public event lifecycle", () => {
  test.describe.configure({ timeout: 120_000 });

  const namespace = randomUUID().slice(0, 10);
  const eventId = `e2e-public-lifecycle-${namespace}`;
  const slug = eventId;
  const organizerId = `${eventId}-organizer`;
  const teams = [
    { id: `${eventId}-alpha`, name: `Alpha ${namespace}`, tag: "ALP", logoText: "A" },
    { id: `${eventId}-beta`, name: `Beta ${namespace}`, tag: "BET", logoText: "B" },
  ];

  test.beforeAll(async () => {
    const safe = validateE2eDatabaseConfiguration(process.env);
    if (!safe.ok) throw new Error(safe.message);
    if (process.env.E2E_DATABASE_RESET_ALLOWED !== "true") {
      throw new Error("Blocked: lifecycle fixture requires E2E_DATABASE_RESET_ALLOWED=true in .env.test");
    }

    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: organizerId } });
    await prisma.user.create({
      data: {
        id: organizerId,
        email: `${organizerId}@example.test`,
        name: "Lifecycle Organizer",
        role: "organizer",
        passwordHash: "not-used-by-this-public-test",
      },
    });
    await prisma.event.create({
      data: {
        id: eventId,
        slug,
        name: `Public Lifecycle ${namespace}`,
        description: "Satu URL publik mengikuti fase registrasi, drawing, pertandingan, hingga hasil akhir.",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        organizerUserId: organizerId,
        organizerName: "Lifecycle Organizer",
        organizerVerified: true,
        status: "Published",
        format: "Single Elimination",
        formatConfig: config as Prisma.InputJsonValue,
        participantCap: 2,
        timezone: "Asia/Jakarta",
        eventStartsAt: new Date("2026-10-01T02:00:00.000Z"),
        startsAt: "2026-10-01T02:00:00.000Z",
        registrationWindow: "Structured",
        registrationOpensAt: new Date("2026-09-01T00:00:00.000Z"),
        registrationClosesAt: new Date("2026-09-30T00:00:00.000Z"),
        venue: "Lifecycle Arena",
        prizePoolLabel: "Rp1.000.000",
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await prisma.team.createMany({
      data: teams.map((team, index) => ({
        ...team,
        eventId,
        source: "e2e",
        createdAt: new Date(1_700_000_000_000 + index),
      })),
    });
  });

  test.afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: organizerId } });
    await prisma.$disconnect();
  });

  test("keeps one permanent URL across registration, drawing, ongoing, and finished", async ({ page }) => {
    const url = `/id/events/${slug}`;
    const operations = createCompetitionOperations(prisma);
    const actor = { id: organizerId, role: "organizer" };
    let operationSequence = 0;
    const run = async (command: OperationCommand) => {
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { competitionVersion: true },
      });
      return operations.execute({
        eventId,
        actor,
        expectedVersion: event.competitionVersion,
        idempotencyKey: `public-lifecycle-${++operationSequence}`,
        command,
      });
    };
    const updateStatus = async (status: "Registration Closed" | "Ongoing" | "Finished") => {
      await page.goto(`/en/admin?phase=prepare&activeEventId=${eventId}`);
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Save event status" }),
      });
      await form.getByLabel("Event").selectOption(eventId);
      await form.getByLabel("Status").selectOption(status);
      await form.getByRole("button", { name: "Save event status" }).click();
      await expect(page).toHaveURL(/success=event-status-updated/);
    };

    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
    await expect(page.getByRole("heading", { level: 1, name: `Public Lifecycle ${namespace}` })).toBeVisible();
    const template = page.getByRole("region", { name: "Template bracket" });
    await expect(template.getByText("TBD", { exact: true })).toHaveCount(2);
    await expect(template.getByText(teams[0].name, { exact: true })).toHaveCount(0);

    await loginAsAdmin(page, "en");
    await updateStatus("Registration Closed");
    await run({
      kind: "drawing_save",
      config,
      teams: teams.map((team, index) => ({ id: team.id, seed: index + 1 })),
    });
    await run({ kind: "drawing_publish" });

    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
    await expect(page.getByText("Drawing resmi", { exact: true })).toBeVisible();
    await expect(page.getByText(teams[0].name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(teams[1].name, { exact: true }).first()).toBeVisible();

    const scheduleDraft = await run({
      kind: "schedule_save",
      input: {
        timezone: "Asia/Jakarta",
        eventWindow: { start: "2026-10-01T02:00:00.000Z", end: "2026-10-01T05:00:00.000Z" },
        matchDurationMinutes: 30,
        bufferMinutes: 5,
        minimumRestMinutes: 10,
        rooms: ["Lifecycle Arena"],
      },
    });
    await run({ kind: "schedule_publish", revisionId: scheduleDraft.resourceId! });

    await updateStatus("Ongoing");
    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
    await expect(page.getByText("Event berlangsung", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pertandingan berikutnya" })).toBeVisible();

    const match = await prisma.match.findFirstOrThrow({ where: { eventId }, orderBy: { slot: "asc" } });
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      await run({ kind: "readiness_update", matchId: match.id, teamId, status: "ready" });
    }
    await run({ kind: "match_start", matchId: match.id });
    await run({ kind: "result_submit", matchId: match.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
    const completedMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const winnerId = completedMatch.winnerTeamId ?? completedMatch.homeTeamId;
    const runnerUpId = winnerId === completedMatch.homeTeamId ? completedMatch.awayTeamId : completedMatch.homeTeamId;
    const winner = teams.find((team) => team.id === winnerId)!;
    const runnerUp = teams.find((team) => team.id === runnerUpId)!;

    await prisma.$transaction([
      prisma.competitionPhase.updateMany({ where: { eventId }, data: { status: "completed" } }),
      prisma.tournamentCompletion.create({
        data: {
          eventId,
          status: "completed",
          format: "single_elimination",
          sourceSnapshot: { eventId, version: event.competitionVersion } as Prisma.InputJsonValue,
          completedByUserId: organizerId,
          podiumPlacements: {
            create: [
              { rank: 1, teamId: winner.id, teamName: winner.name, source: "official_playoff", sourceMatchId: match.id, sourceSnapshot: { matchId: match.id } },
              { rank: 2, teamId: runnerUp.id, teamName: runnerUp.name, source: "official_playoff", sourceMatchId: match.id, sourceSnapshot: { matchId: match.id } },
            ],
          },
        },
      }),
    ]);
    await updateStatus("Finished");

    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
    await expect(page.getByText("Hasil akhir resmi", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Podium akhir" })).toBeVisible();
    await expect(page.getByText(winner.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("2 - 0", { exact: true })).toBeVisible();
  });
});
