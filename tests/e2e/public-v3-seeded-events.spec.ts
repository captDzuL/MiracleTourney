import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const LEGACY_FLASHPEAK_MATCH_IDS = ["match-flash-o-1", "match-flash-o-2", "match-flash-o-3", "match-flash-o-4"];
const lifecycleFixtures = [
  { slug: "flashpeak-revision-published", requiresPhase: false },
  { slug: "flashpeak-revision-closed", requiresPhase: true },
  { slug: "flashpeak-rising-64", requiresPhase: true },
  { slug: "flashpeak-champions-32", requiresPhase: true },
] as const;

test.describe.serial("seeded public V3 lifecycle", () => {
  test.describe.configure({ timeout: 120_000 });

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

  async function installLegacyFlashpeakRows() {
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "flashpeak-rising-64" }, select: { id: true } });
    const teams = await prisma.team.findMany({ where: { eventId: event.id }, orderBy: { id: "asc" }, take: 8, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      await tx.tournamentCompletion.deleteMany({ where: { eventId: event.id } });
      await tx.scheduleRevision.deleteMany({ where: { eventId: event.id } });
      await tx.matchReadiness.deleteMany({ where: { eventId: event.id } });
      await tx.matchGame.deleteMany({ where: { match: { eventId: event.id } } });
      await tx.matchResultRevision.deleteMany({ where: { eventId: event.id } });
      await tx.matchDependency.deleteMany({ where: { eventId: event.id } });
      await tx.competitionActionItem.deleteMany({ where: { eventId: event.id } });
      await tx.competitionIncident.deleteMany({ where: { eventId: event.id } });
      await tx.competitionAuditLog.deleteMany({ where: { eventId: event.id } });
      await tx.match.deleteMany({ where: { eventId: event.id } });
      await tx.competitionGroupMember.deleteMany({ where: { eventId: event.id } });
      await tx.competitionGroup.deleteMany({ where: { eventId: event.id } });
      await tx.competitionPhase.deleteMany({ where: { eventId: event.id } });
      await tx.event.update({ where: { id: event.id }, data: { status: "Ongoing", publishedScheduleVersion: null } });
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
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "flashpeak-rising-64" }, select: { id: true, status: true, publishedScheduleVersion: true } });
    return {
      status: event.status,
      phaseCount: await prisma.competitionPhase.count({ where: { eventId: event.id } }),
      schedulePublished: event.publishedScheduleVersion !== null,
      liveCount: await prisma.match.count({ where: { eventId: event.id, status: "Live" } }),
      matchCount: await prisma.match.count({ where: { eventId: event.id } }),
      legacyCount: await prisma.match.count({ where: { eventId: event.id, id: { in: LEGACY_FLASHPEAK_MATCH_IDS } } }),
    };
  }

  test("upgrades blocking legacy Flashpeak rows and remains idempotent", async () => {
    await installLegacyFlashpeakRows();
    runSeed();
    const first = await ongoingState();
    expect(first).toMatchObject({ status: "Ongoing", phaseCount: 1, schedulePublished: true, liveCount: 1, legacyCount: 0 });

    runSeed();
    const second = await ongoingState();
    expect(second).toEqual(first);
  });

  test("visits registration, drawing, ongoing, and finished authoritative fixtures", async ({ page }) => {
    for (const fixture of lifecycleFixtures) {
      const event = await prisma.event.findUniqueOrThrow({ where: { slug: fixture.slug }, select: { id: true } });
      const phaseCount = await prisma.competitionPhase.count({ where: { eventId: event.id, status: { in: ["active", "completed"] } } });
      expect(phaseCount).toBe(fixture.requiresPhase ? 1 : 0);

      await page.goto(`/en/events/${fixture.slug}`);
      const publicEvent = page.locator("[data-public-v3-event]");
      await expect(publicEvent).toHaveCount(1);
      await expect(publicEvent).toHaveAttribute("data-public-source", "authoritative");
      await expect(page.locator(".public-visual-v2")).toHaveCount(0);
    }
  });
});