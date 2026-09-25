import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { validateE2eDatabaseConfiguration } from "../../scripts/e2e-db-configuration.mjs";
import { createCompetitionOperations, type OperationCommand } from "../../src/lib/tournament/operations";
import type { CompetitionGraph } from "../../src/lib/tournament/competition";
import type { TournamentFormatConfig } from "../../src/lib/tournament/formats/types";
import { loginAsAdmin } from "./helpers/auth";
import { runAndSettleServerActionRedirect } from "./helpers/server-action";

const prisma = new PrismaClient();
const config: TournamentFormatConfig = {
  version: 1,
  kind: "single_elimination",
  thirdPlace: "required",
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
    { id: `${eventId}-gamma`, name: `Gamma ${namespace}`, tag: "GAM", logoText: "G" },
    { id: `${eventId}-delta`, name: `Delta ${namespace}`, tag: "DEL", logoText: "D" },
  ];
  const inFlightOperations = new Set<Promise<unknown>>();
  const operations = createCompetitionOperations(prisma);
  const actor = { id: organizerId, role: "organizer" };
  let operationSequence = 0;
  let operationVersion = 0;
  let winner = teams[0]!;
  let runnerUp = teams[0]!;
  let third = teams[0]!;
  let completionId = "";
  let completionVersion = 0;

  const run = async (command: OperationCommand) => {
    const operation = operations.execute({
      eventId,
      actor,
      expectedVersion: operationVersion,
      idempotencyKey: `public-lifecycle-${++operationSequence}`,
      command,
    });
    inFlightOperations.add(operation);
    try {
      const receipt = await operation;
      operationVersion = receipt.version;
      return receipt;
    } finally {
      inFlightOperations.delete(operation);
    }
  };

  const updateStatus = async (page: Page, status: "Registration Closed" | "Ongoing" | "Finished") => {
    await page.goto(`/en/admin?phase=prepare&activeEventId=${eventId}`);
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save event status" }),
    });
    await form.getByLabel("Event").selectOption(eventId);
    await form.getByLabel("Status").selectOption(status);
    await runAndSettleServerActionRedirect(page, {
      request: (request) => {
        const requestUrl = new URL(request.url());
        return requestUrl.pathname === "/en/admin"
          && requestUrl.searchParams.get("phase") === "prepare"
          && requestUrl.searchParams.get("activeEventId") === eventId
          && requestUrl.search === `?phase=prepare&activeEventId=${eventId}`;
      },
      expectedActionRedirect: `/en/admin?success=event-status-updated&event=${eventId};push`,
      destination: (url) => url.pathname === "/en/admin"
        && url.searchParams.get("success") === "event-status-updated"
        && url.searchParams.get("event") === eventId
        && url.search === `?success=event-status-updated&event=${eventId}`,
      trigger: () => form.getByRole("button", { name: "Save event status" }).click(),
    });
    await expect(page).toHaveURL(/success=event-status-updated/);
  };

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
        participantCap: 4,
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
    operationVersion = (await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { competitionVersion: true },
    })).competitionVersion;
  });

  test.afterAll(async () => {
    while (inFlightOperations.size > 0) {
      await Promise.allSettled([...inFlightOperations]);
    }
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: organizerId } });
    await prisma.$disconnect();
  });

  test("keeps one permanent URL through registration and drawing", async ({ page }) => {
    test.setTimeout(120_000);
    const url = `/id/events/${slug}`;

    await test.step("registration and drawing", async () => {
      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
      await expect(page.getByRole("heading", { level: 1, name: `Public Lifecycle ${namespace}` })).toBeVisible();
      const template = page.getByRole("region", { name: "Template bracket" });
      await expect(template.getByText("TBD", { exact: true })).toHaveCount(4);
      await expect(template.getByText(teams[0].name, { exact: true })).toHaveCount(0);

      await loginAsAdmin(page, "en");
      await updateStatus(page, "Registration Closed");
      await run({
        kind: "drawing_save",
        config,
        teams: teams.map((team, index) => ({ id: team.id, seed: index + 1 })),
      });

      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
      const privateDrawing = page.getByRole("region", { name: "Template bracket" });
      await expect(privateDrawing.getByText("TBD", { exact: true })).toHaveCount(4);
      await expect(privateDrawing.getByText(teams[0].name, { exact: true })).toHaveCount(0);

      await run({ kind: "drawing_publish" });

      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
      await expect(page.getByText("Drawing resmi", { exact: true })).toBeVisible();
      await expect(page.getByText(teams[0].name, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(teams[1].name, { exact: true }).first()).toBeVisible();
    });
  });

  test("keeps the same permanent URL through ongoing and result", async ({ page }) => {
    test.setTimeout(120_000);
    const url = `/id/events/${slug}`;
    await loginAsAdmin(page, "en");
    await test.step("ongoing and result", async () => {
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

      await updateStatus(page, "Ongoing");
      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
      await expect(page.getByText("Event berlangsung", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pertandingan berikutnya" })).toBeVisible();

      for (let wave = 0; wave < 4; wave += 1) {
        const playable = await prisma.match.findMany({
          where: { eventId, resultVersion: 0, homeTeamId: { not: "" }, awayTeamId: { not: "" } },
          orderBy: [{ round: "asc" }, { slot: "asc" }],
        });
        if (!playable.length) break;
        for (const match of playable) {
          for (const teamId of [match.homeTeamId, match.awayTeamId]) {
            await run({ kind: "readiness_update", matchId: match.id, teamId, status: "ready" });
          }
          await run({ kind: "match_start", matchId: match.id });
          await run({ kind: "result_submit", matchId: match.id, games: [{ gameNumber: 1, homeScore: 2, awayScore: 0 }] });
        }
      }
      expect(await prisma.match.count({ where: { eventId, resultVersion: 0 } })).toBe(0);
      const phase = await prisma.competitionPhase.findFirstOrThrow({ where: { eventId, sequence: 1 } });
      const graph = (phase.configuration as unknown as { graph: CompetitionGraph }).graph;
      const firstPlace = graph.placements.find((placement) => placement.rank === 1)!;
      const thirdPlace = graph.placements.find((placement) => placement.rank === 3)!;
      if (firstPlace.source.kind !== "match" || thirdPlace.source.kind !== "match") throw new Error("Expected match-derived podium");
      const finalMatch = await prisma.match.findUniqueOrThrow({ where: { id: firstPlace.source.matchId } });
      const thirdPlaceMatch = await prisma.match.findUniqueOrThrow({ where: { id: thirdPlace.source.matchId } });
      const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      const winnerId = finalMatch.winnerTeamId ?? finalMatch.homeTeamId;
      const runnerUpId = winnerId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId;
      const thirdId = thirdPlaceMatch.winnerTeamId ?? thirdPlaceMatch.homeTeamId;
      winner = teams.find((team) => team.id === winnerId)!;
      runnerUp = teams.find((team) => team.id === runnerUpId)!;
      third = teams.find((team) => team.id === thirdId)!;
      completionVersion = event.competitionVersion;

      const completion = await prisma.$transaction(async (tx) => {
        await tx.competitionPhase.updateMany({ where: { eventId }, data: { status: "completed" } });
        return tx.tournamentCompletion.create({
          data: {
            eventId,
            status: "completed",
            format: "single_elimination",
            sourceSnapshot: { eventId, version: event.competitionVersion } as Prisma.InputJsonValue,
            completedByUserId: organizerId,
            podiumPlacements: {
              create: [
                { rank: 1, teamId: winner.id, teamName: winner.name, source: "official_playoff", sourceMatchId: finalMatch.id, sourceSnapshot: { matchId: finalMatch.id } },
                { rank: 2, teamId: runnerUp.id, teamName: runnerUp.name, source: "official_playoff", sourceMatchId: finalMatch.id, sourceSnapshot: { matchId: finalMatch.id } },
                { rank: 3, teamId: third.id, teamName: third.name, source: "official_playoff", sourceMatchId: thirdPlaceMatch.id, sourceSnapshot: { matchId: thirdPlaceMatch.id } },
              ],
            },
            awards: {
              create: (["mvp", "top_scorer", "top_defender", "top_assist"] as const).map((type, index) => ({
                type,
                status: "approved",
                candidateSnapshot: {},
                decision: { create: {
                  recipientId: `${eventId}-award-player-${index + 1}`,
                  recipientName: `Award Player ${index + 1}`,
                  teamId: winner.id,
                  teamName: winner.name,
                  reason: "Organizer lifecycle decision",
                  decidedByUserId: organizerId,
                } },
              })),
            },
          },
        });
      });
      completionId = completion.id;
    });
  });

  test("keeps the same permanent URL through finished and certificates", async ({ page }) => {
    test.setTimeout(120_000);
    const url = `/id/events/${slug}`;
    await loginAsAdmin(page, "en");
    await test.step("finished and certificates", async () => {
      await updateStatus(page, "Finished");

      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(`/id/events/${slug}$`));
      await expect(page.getByText("Hasil akhir resmi", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Podium akhir" })).toBeVisible();
      await expect(page.getByText(winner.name, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("2 - 0", { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/Certificate sedang disiapkan organizer/)).toBeVisible();

      const certificateTypes = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"] as const;
      const certificateIds = certificateTypes.map((type) => `${eventId}-certificate-${type}`);
      const podiumTeams = { champion: winner, runner_up: runnerUp, third_place: third };
      await prisma.certificate.createMany({
        data: certificateTypes.map((type, index) => {
          const team = type in podiumTeams ? podiumTeams[type as keyof typeof podiumTeams] : winner;
          return {
            id: certificateIds[index],
            eventId,
            teamId: team.id,
            type,
            recipientKind: type in podiumTeams ? "team" : "player",
            recipientId: type in podiumTeams ? team.id : `${eventId}-award-player-${index - 2}`,
            recipientName: type in podiumTeams ? team.name : `Award Player ${index - 2}`,
            version: 1,
            templateVersion: "miracle-v3",
            assetManifest: {},
            imageUrl: `/certificates/${type}.png`,
            status: "published",
            verificationCode: `${namespace}-${type}`,
            publishedUrl: `/certificates/${type}.png`,
            generatedAt: new Date(),
            publishedAt: new Date(),
            completionId,
            completionVersion,
          };
        }),
      });
      await prisma.certificatePublication.create({
        data: {
          eventId,
          completionId,
          version: 1,
          completionVersion,
          certificateIds,
          idempotencyKey: `${eventId}-certificate-publication`,
          fingerprint: `${eventId}-certificate-fingerprint`,
          actorUserId: organizerId,
        },
      });

      await page.goto(url);
      await expect(page.getByText("Tujuh certificate resmi telah diterbitkan.")).toBeVisible();
      await expect(page.getByRole("link", { name: /Lihat certificate/ })).toHaveCount(7);
    });
  });
});
