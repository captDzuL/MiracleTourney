import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const LEGACY_FLASHPEAK_MATCH_IDS = ["match-flash-o-1", "match-flash-o-2", "match-flash-o-3", "match-flash-o-4"];
const UNKNOWN_FLASHPEAK_MATCH_ID = "match-flash-unknown-scheduled";
const lifecycleFixtures = [
  { slug: "flashpeak-revision-published", requiresPhase: false },
  { slug: "flashpeak-revision-closed", requiresPhase: true },
  { slug: "flashpeak-rising-64", requiresPhase: true },
  { slug: "flashpeak-champions-32", requiresPhase: true },
] as const;

test.describe.serial("seeded public V3 lifecycle", () => {
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  function runSeed() {
    const isWindows = process.platform === "win32";
    const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
    const args = isWindows ? ["/d", "/s", "/c", "pnpm db:seed"] : ["db:seed"];
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
    });
    const failure = result.error?.message || result.stderr || result.stdout;
    expect(result.status, failure).toBe(0);
  }

  function runSeedExpectFailure() {
    const isWindows = process.platform === "win32";
    const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
    const args = isWindows ? ["/d", "/s", "/c", "pnpm db:seed"] : ["db:seed"];
    return spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
    });
  }

  async function clearEventCompetition(eventId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.tournamentCompletion.deleteMany({ where: { eventId } });
      await tx.scheduleRevision.deleteMany({ where: { eventId } });
      await tx.matchReadiness.deleteMany({ where: { eventId } });
      await tx.matchGame.deleteMany({ where: { match: { eventId } } });
      await tx.matchResultRevision.deleteMany({ where: { eventId } });
      await tx.matchDependency.deleteMany({ where: { eventId } });
      await tx.competitionActionItem.deleteMany({ where: { eventId } });
      await tx.competitionIncident.deleteMany({ where: { eventId } });
      await tx.competitionAuditLog.deleteMany({ where: { eventId } });
      await tx.match.deleteMany({ where: { eventId } });
      await tx.competitionGroupMember.deleteMany({ where: { eventId } });
      await tx.competitionGroup.deleteMany({ where: { eventId } });
      await tx.competitionPhase.deleteMany({ where: { eventId } });
      await tx.event.update({ where: { id: eventId }, data: { status: "Registration Closed", publishedScheduleVersion: null } });
    });
  }

  async function installUnknownPhaseLessMatch() {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "flashpeak-revision-closed" }, select: { id: true } });
    const teams = await prisma.team.findMany({ where: { eventId: event.id }, orderBy: { id: "asc" }, take: 2, select: { id: true } });
    await clearEventCompetition(event.id);
    await prisma.match.create({
      data: {
        id: UNKNOWN_FLASHPEAK_MATCH_ID,
        eventId: event.id,
        roundLabel: "Unknown legacy fixture",
        homeTeamId: teams[0].id,
        awayTeamId: teams[1].id,
        status: "Scheduled",
        round: 1,
        slot: 99,
      },
    });
  }

  async function installLegacyFlashpeakRows() {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "flashpeak-rising-64" }, select: { id: true } });
    const teams = await prisma.team.findMany({ where: { eventId: event.id }, orderBy: { id: "asc" }, take: 8, select: { id: true } });
    await clearEventCompetition(event.id);
    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { status: "Ongoing" } });
      await tx.match.createMany({
        data: [
          { id: "match-flash-o-1", eventId: event.id, roundLabel: "Round 1", homeTeamId: teams[0].id, awayTeamId: teams[1].id, status: "Completed", round: 1, slot: 1 },
          { id: "match-flash-o-2", eventId: event.id, roundLabel: "Round 1", homeTeamId: teams[2].id, awayTeamId: teams[3].id, status: "Live", round: 1, slot: 2 },
          { id: "match-flash-o-3", eventId: event.id, roundLabel: "Round 1", homeTeamId: teams[4].id, awayTeamId: teams[5].id, status: "Scheduled", round: 1, slot: 3 },
          { id: "match-flash-o-4", eventId: event.id, roundLabel: "Round 1", homeTeamId: teams[6].id, awayTeamId: teams[7].id, status: "Scheduled", round: 1, slot: 4 },
        ],
      });
    });
  }

  async function ongoingState() {
    const event = await prisma.event.findUniqueOrThrow({
      where: { slug: "flashpeak-rising-64" },
      select: { id: true, status: true, competitionVersion: true, publishedScheduleVersion: true },
    });
    const phases = await prisma.competitionPhase.findMany({
      where: { eventId: event.id },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
      select: { id: true, status: true },
    });
    const matches = await prisma.match.findMany({
      where: { eventId: event.id },
      orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }],
      select: { id: true, phaseId: true, status: true, resultVersion: true, scheduleVersion: true, scheduleStatus: true },
    });
    const revisions = await prisma.scheduleRevision.findMany({
      where: { eventId: event.id },
      orderBy: [{ version: "asc" }, { id: "asc" }],
      select: { id: true, version: true, status: true, idempotencyKey: true },
    });
    return {
      event,
      phaseIds: phases,
      matchIds: matches,
      revisionIds: revisions,
      legacyCount: await prisma.match.count({ where: { eventId: event.id, id: { in: LEGACY_FLASHPEAK_MATCH_IDS } } }),
    };
  }

  async function finishedState() {
    const event = await prisma.event.findUniqueOrThrow({
      where: { slug: "flashpeak-champions-32" },
      select: { id: true, status: true, competitionVersion: true, publishedScheduleVersion: true },
    });
    const phase = await prisma.competitionPhase.findFirstOrThrow({
      where: { eventId: event.id, sequence: 1 },
      select: { id: true, status: true },
    });
    const matches = await prisma.match.findMany({
      where: { eventId: event.id },
      orderBy: [{ round: "asc" }, { slot: "asc" }, { id: "asc" }],
      select: { id: true, phaseId: true, status: true, resultVersion: true, scheduleVersion: true, scheduleStatus: true },
    });
    const revisions = await prisma.scheduleRevision.findMany({
      where: { eventId: event.id },
      orderBy: [{ version: "asc" }, { id: "asc" }],
      select: { id: true, version: true, status: true, idempotencyKey: true },
    });
    const completion = await prisma.tournamentCompletion.findUnique({
      where: { eventId: event.id },
      select: {
        id: true,
        status: true,
        sourceSnapshot: true,
        podiumPlacements: { orderBy: { rank: "asc" }, select: { rank: true, teamId: true, sourceMatchId: true } },
        awards: { orderBy: { type: "asc" }, select: { type: true, decision: { select: { recipientId: true, teamId: true } } } },
      },
    });
    return {
      event,
      phase,
      matchIds: matches,
      revisionIds: revisions,
      completion: completion
        ? {
            id: completion.id,
            status: completion.status,
            sourceSnapshot: completion.sourceSnapshot,
            podiumPlacements: completion.podiumPlacements,
            awards: completion.awards,
          }
        : null,
    };
  }

  test("refuses an unknown phase-less match without deleting it", async () => {
    await installUnknownPhaseLessMatch();
    const before = await prisma.match.findUniqueOrThrow({
      where: { id: UNKNOWN_FLASHPEAK_MATCH_ID },
      select: { id: true, eventId: true, homeTeamId: true, awayTeamId: true, status: true, round: true, slot: true },
    });
    const result = runSeedExpectFailure();
    expect(result.status, result.stderr || result.stdout).not.toBe(0);
    expect([result.stderr, result.stdout].join("\n")).toContain("Refusing to replace non-fixture matches");
    const after = await prisma.match.findUniqueOrThrow({
      where: { id: UNKNOWN_FLASHPEAK_MATCH_ID },
      select: { id: true, eventId: true, homeTeamId: true, awayTeamId: true, status: true, round: true, slot: true },
    });
    expect(after).toEqual(before);
    await prisma.match.delete({ where: { id: UNKNOWN_FLASHPEAK_MATCH_ID } });
  });

  test("upgrades blocking legacy Flashpeak rows and remains idempotent", async () => {
    await installLegacyFlashpeakRows();
    runSeed();
    const first = await ongoingState();
    expect(first).toMatchObject({
      event: { status: "Ongoing", competitionVersion: expect.any(Number), publishedScheduleVersion: expect.any(Number) },
      phaseIds: [{ id: expect.any(String), status: "active" }],
      legacyCount: 0,
    });
    expect(first.matchIds.length).toBeGreaterThan(0);
    expect(first.revisionIds.length).toBe(1);

    runSeed();

    const second = await ongoingState();
    expect(second).toEqual(first);
    expect(second.event.competitionVersion).toBe(first.event.competitionVersion);
    expect(second.phaseIds.map(({ id }) => id)).toEqual(first.phaseIds.map(({ id }) => id));
    expect(second.matchIds.map(({ id }) => id)).toEqual(first.matchIds.map(({ id }) => id));
    expect(second.revisionIds.map(({ id }) => id)).toEqual(first.revisionIds.map(({ id }) => id));
  });

  test("visits registration, drawing, ongoing, and finished authoritative fixtures", async ({ page }) => {
    for (const fixture of lifecycleFixtures) {
      const event = await prisma.event.findUniqueOrThrow({ where: { slug: fixture.slug }, select: { id: true } });
      const phaseCount = await prisma.competitionPhase.count({ where: { eventId: event.id, status: { in: ["active", "completed"] } } });
      expect(phaseCount).toBe(fixture.requiresPhase ? 1 : 0);

      await page.goto("/en/events/" + fixture.slug);
      const publicEvent = page.locator("[data-public-v3-event]");
      await expect(publicEvent).toHaveCount(1);
      await expect(publicEvent).toHaveAttribute("data-public-source", "authoritative");
      await expect(page.locator(".public-visual-v2")).toHaveCount(0);
    }
  });

  test("finished fixture remains stable across seed reruns", async () => {
    const first = await finishedState();
    expect(first).toMatchObject({
      event: { status: "Finished", competitionVersion: expect.any(Number) },
      phase: { status: expect.stringMatching(/^(active|completed)$/) },
      completion: {
        status: "completed",
        podiumPlacements: [{ rank: 1 }, { rank: 2 }, { rank: 3 }],
        awards: [
          { type: "mvp", decision: { recipientId: expect.any(String) } },
          { type: "top_assist", decision: { recipientId: expect.any(String) } },
          { type: "top_defender", decision: { recipientId: expect.any(String) } },
          { type: "top_scorer", decision: { recipientId: expect.any(String) } },
        ],
      },
    });

    runSeed();
    const second = await finishedState();
    runSeed();
    const third = await finishedState();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(second.event.competitionVersion).toBe(first.event.competitionVersion);
    expect(second.completion?.id).toBe(first.completion?.id);
    expect(second.completion?.sourceSnapshot).toEqual(first.completion?.sourceSnapshot);
  });
});