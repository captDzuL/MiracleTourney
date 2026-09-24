import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

export type OrganizerScaleFixture = Readonly<{
  eventId: string;
  organizerId: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  matchIds: readonly string[];
  certificateIds: readonly string[];
  cleanup: () => Promise<void>;
}>;

export { countQueries } from "./query-instrumentation";

type FixtureCall = Readonly<{ model: string; method: string; args: Record<string, unknown> }>;

function makeFixturePrismaDouble() {
  const calls: FixtureCall[] = [];
  const delegates = new Proxy({}, {
    get(_target, model: string) {
      if (model === "$transaction") return async (work: (tx: unknown) => Promise<unknown>) => work(delegates);
      return new Proxy({}, {
        get(_delegate, method: string) {
          return async (args: Record<string, unknown> = {}) => {
            calls.push({ model, method, args });
            if (method === "create") {
              const data = args.data as Record<string, unknown>;
              return { ...data, id: data.id ?? `${model}-created` };
            }
            if (method === "createMany") {
              const data = args.data as unknown[];
              return { count: data.length };
            }
            return null;
          };
        },
      });
    },
  });
  return { db: delegates, calls };
}

export const ORGANIZER_SCALE_MANIFEST = Object.freeze({
  teams: 64,
  players: 320,
  matches: 63,
  playerStats: 320,
  auditRows: 100,
  completions: 1,
  certificates: 7,
});

const SCALE_CERTIFICATE_TYPES = ["champion", "runner_up", "third_place", "mvp", "top_scorer", "top_defender", "top_assist"] as const;

type OrganizerScalePlan = Readonly<{
  namespace: string;
  eventId: string;
  organizerId: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  matchIds: readonly string[];
  certificateIds: readonly string[];
}>;

function buildOrganizerScalePlan(namespace: string, teamCount = ORGANIZER_SCALE_MANIFEST.teams, playersPerTeam = 5): OrganizerScalePlan {
  if (teamCount !== ORGANIZER_SCALE_MANIFEST.teams || playersPerTeam !== 5) {
    throw new Error("Organizer scale fixture requires exactly 64 teams with 5 players each");
  }
  const eventId = `${namespace}-event`;
  const organizerId = `${namespace}-organizer`;
  const teamIds = Array.from({ length: teamCount }, (_, index) => `${namespace}-team-${String(index + 1).padStart(2, "0")}`);
  const playerIds = teamIds.flatMap((teamId) => Array.from({ length: playersPerTeam }, (_, index) => `${teamId}-player-${index + 1}`));
  const matchIds = Array.from({ length: teamCount - 1 }, (_, index) => `${namespace}-match-${String(index + 1).padStart(2, "0")}`);
  const certificateIds = SCALE_CERTIFICATE_TYPES.map((type) => `${namespace}-certificate-${type}`);
  return { namespace, eventId, organizerId, teamIds, playerIds, matchIds, certificateIds };
}

export async function seedOrganizerScaleFixture(client: PrismaClient, options: { namespace?: string } = {}): Promise<OrganizerScaleFixture> {
  const namespace = options.namespace ?? `organizer-scale-${randomUUID()}`;
  const plan = buildOrganizerScalePlan(namespace);
  const now = new Date("2026-09-21T00:00:00.000Z");
  const formatConfig = {
    version: 1,
    kind: "single_elimination",
    bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
    thirdPlace: "none",
  };

  await client.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: plan.organizerId,
        email: `${plan.organizerId}@example.test`,
        name: "Organizer Scale Fixture",
        role: "organizer",
        passwordHash: "fixture-only-not-for-login",
      },
    });
    await tx.event.create({
      data: {
        id: plan.eventId,
        slug: `${plan.namespace}-slug`,
        name: "Organizer Scale Fixture",
        description: "Credential-independent organizer reader scale fixture",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        format: "Single Elimination",
        formatConfig,
        status: "Finished",
        participantCap: plan.teamIds.length,
        registrationWindow: "Fixture",
        startsAt: "2026-09-21",
        eventStartsAt: now,
        timezone: "Asia/Jakarta",
        venue: "Fixture Arena",
        organizerUserId: plan.organizerId,
        organizerName: "Organizer Scale Fixture",
        organizerVerified: true,
        publishedAt: now,
        competitionVersion: 1,
      },
    });
    await tx.team.createMany({
      data: plan.teamIds.map((id, index) => ({
        id,
        eventId: plan.eventId,
        name: `Scale Team ${index + 1}`,
        logoText: `S${index + 1}`,
        tag: `S${index + 1}`,
        source: "performance-fixture",
        createdAt: now,
      })),
    });
    await tx.player.createMany({
      data: plan.playerIds.map((id, index) => {
        const teamId = plan.teamIds[Math.floor(index / 5)];
        return {
          id,
          eventId: plan.eventId,
          teamId,
          displayName: `Scale Player ${index + 1}`,
          nickname: `scale-player-${index + 1}`,
          position: "Forward",
          createdAt: now,
        };
      }),
    });
    await tx.match.createMany({
      data: plan.matchIds.map((id, index) => {
        const round = Math.floor(Math.log2(index + 2));
        const slot = index + 1 - (2 ** round - 2);
        return {
          id,
          eventId: plan.eventId,
          roundLabel: round === 6 ? "Final" : `Round ${round}`,
          homeTeamId: plan.teamIds[(index * 2) % plan.teamIds.length],
          awayTeamId: plan.teamIds[(index * 2 + 1) % plan.teamIds.length],
          round,
          slot,
          status: "Completed",
          scheduleStatus: "completed" as const,
          resultVersion: 1,
          homeScore: 1,
          awayScore: 0,
          winnerTeamId: plan.teamIds[(index * 2) % plan.teamIds.length],
          createdAt: now,
        };
      }),
    });
    await tx.playerStat.createMany({
      data: plan.playerIds.map((playerId, index) => ({
        id: `${plan.namespace}-stat-${index + 1}`,
        matchId: plan.matchIds[Math.floor(index / 10)],
        playerId,
        playerName: `Scale Player ${index + 1}`,
        teamId: plan.teamIds[Math.floor(index / 5)],
        position: "Forward",
        gameSlug: "flashpeak",
        stats: { goal: 1, assist: 1, defense: 1, passing: 1 },
        source: "performance-fixture",
        lastUpdatedBy: plan.organizerId,
      })),
    });
    await tx.competitionAuditLog.createMany({
      data: Array.from({ length: ORGANIZER_SCALE_MANIFEST.auditRows }, (_, index) => ({
        id: `${plan.namespace}-competition-audit-${index + 1}`,
        eventId: plan.eventId,
        actorUserId: plan.organizerId,
        action: "fixture_read",
        reason: "Organizer reader scale fixture",
        payload: { index },
        idempotencyKey: `${plan.namespace}-competition-audit-${index + 1}`,
        createdAt: now,
      })),
    });
    const completion = await tx.tournamentCompletion.create({
      data: {
        id: `${plan.namespace}-completion`,
        eventId: plan.eventId,
        status: "completed",
        format: "Single Elimination",
        sourceSnapshot: { fixture: plan.namespace, matches: plan.matchIds.length },
        completedByUserId: plan.organizerId,
        completedAt: now,
        certificateRevision: 1,
      },
    });
    await tx.completionAuditEntry.createMany({
      data: Array.from({ length: ORGANIZER_SCALE_MANIFEST.auditRows }, (_, index) => ({
        id: `${plan.namespace}-completion-audit-${index + 1}`,
        completionId: completion.id,
        action: "fixture_read",
        actorUserId: plan.organizerId,
        details: { index },
        idempotencyKey: `${plan.namespace}-completion-audit-${index + 1}`,
        createdAt: now,
      })),
    });
    await tx.certificate.createMany({
      data: SCALE_CERTIFICATE_TYPES.map((type, index) => ({
        id: plan.certificateIds[index],
        eventId: plan.eventId,
        teamId: plan.teamIds[0],
        type,
        recipientKind: type === "champion" || type === "runner_up" || type === "third_place" ? "team" : "player",
        recipientId: type === "champion" || type === "runner_up" || type === "third_place" ? plan.teamIds[0] : plan.playerIds[index],
        recipientName: `Scale Recipient ${index + 1}`,
        completionId: completion.id,
        completionVersion: 1,
        status: "ready",
        imageUrl: "",
        verificationCode: `${plan.namespace}-verification-${type}`,
        generatedAt: now,
      })),
    });
  });

  let cleaned = false;
  return {
    eventId: plan.eventId,
    organizerId: plan.organizerId,
    teamIds: plan.teamIds,
    playerIds: plan.playerIds,
    matchIds: plan.matchIds,
    certificateIds: plan.certificateIds,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await client.$transaction(async (tx) => {
        await tx.event.delete({ where: { id: plan.eventId } });
        await tx.user.delete({ where: { id: plan.organizerId } });
      });
    },
  };
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function extractObserverInit(browserScript: string): string {
  const match = browserScript.match(/const PERFORMANCE_OBSERVER_INIT = `([\s\S]*?)`;/);
  if (!match) throw new Error("Dashboard performance observer init was not found");
  return match[1];
}

async function runLoadScript(scriptName: string, mode: "healthy" | "failing" | "missing"): Promise<number> {
  const environment = { ...process.env };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("fixture");
  });
  let args: string[];
  if (mode === "missing") {
    delete environment.BASE_URL;
    args = [fileURLToPath(new URL(`../../${scriptName}`, import.meta.url))];
  } else {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not expose a port");
    environment.BASE_URL = `http://127.0.0.1:${address.port}`;
    environment.LOAD_FIXTURE_MODE = mode;
    args = [
      "--experimental-loader",
      pathToFileURL(fileURLToPath(new URL("./autocannon-fixture-loader.mjs", import.meta.url))).href,
      fileURLToPath(new URL(`../../${scriptName}`, import.meta.url)),
    ];
  }
  const child = spawn(process.execPath, args, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const [exitCode] = await once(child, "close") as [number | null, string | null];
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  return exitCode ?? -1;
}

describe("organizer reader release-scale contracts", () => {
  it("creates the exact 64-team fixture cardinalities without database credentials", async () => {
    const fixture = buildOrganizerScalePlan("manifest");

    expect(fixture.eventId).toBe("manifest-event");
    expect(fixture.teamIds).toHaveLength(64);
    expect(fixture.playerIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.players);
    expect(fixture.matchIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.matches);
    expect(fixture.certificateIds).toHaveLength(ORGANIZER_SCALE_MANIFEST.certificates);
    expect({
      teams: fixture.teamIds.length,
      players: fixture.playerIds.length,
      matches: fixture.matchIds.length,
      playerStats: ORGANIZER_SCALE_MANIFEST.playerStats,
      auditRows: ORGANIZER_SCALE_MANIFEST.auditRows,
      completions: ORGANIZER_SCALE_MANIFEST.completions,
      certificates: fixture.certificateIds.length,
    }).toEqual(ORGANIZER_SCALE_MANIFEST);
  });

  it("executes an isolated Prisma fixture seed and exposes scoped cleanup", async () => {
    const { db, calls } = makeFixturePrismaDouble();
    const seed = seedOrganizerScaleFixture as unknown as (client: unknown) => Promise<OrganizerScaleFixture & { cleanup: () => Promise<void> }>;
    const fixture = await seed(db);

    expect(calls.filter(({ model, method }) => model === "team" && method === "createMany")[0]?.args.data).toHaveLength(64);
    expect(calls.filter(({ model, method }) => model === "player" && method === "createMany")[0]?.args.data).toHaveLength(320);
    expect(calls.filter(({ model, method }) => model === "match" && method === "createMany")[0]?.args.data).toHaveLength(63);
    expect(calls.filter(({ model, method }) => model === "playerStat" && method === "createMany")[0]?.args.data).toHaveLength(320);
    expect(calls.filter(({ model, method }) => model === "competitionAuditLog" && method === "createMany")[0]?.args.data).toHaveLength(100);
    expect(calls.filter(({ model, method }) => model === "tournamentCompletion" && method === "create")[0]).toBeDefined();
    expect(calls.filter(({ model, method }) => model === "certificate" && method === "createMany")[0]?.args.data).toHaveLength(7);
    expect(fixture.cleanup).toEqual(expect.any(Function));

    await fixture.cleanup();
    expect(calls.some(({ model, method }) => model === "event" && method === "delete")).toBe(true);
    expect(calls.some(({ model, method }) => model === "user" && method === "delete")).toBe(true);
  });

  it("declares blocked external performance inputs instead of silently skipping", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    const loadScript = source("scripts/load-test.mjs");
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    expect(browserScript).toContain("DASHBOARD_PERF_BASE_URL");
    expect(browserScript).toContain("process.exitCode = 2");
    expect(loadScript).toContain("BASE_URL");
    expect(loadScript).toContain("process.exitCode = 2");
    expect(quickLoadScript).toContain("process.exitCode = 2");
  });

  it("requires supplied-target load failures to return exit 1", () => {
    for (const scriptName of ["scripts/load-test.mjs", "scripts/load-test-quick.mjs"]) {
      expect(source(scriptName), scriptName).toMatch(/process\.exitCode\s*=\s*1/);
    }
  });

  it.each(["scripts/load-test.mjs", "scripts/load-test-quick.mjs"])("runs %s with executable 0/1/2 contracts", async (scriptName) => {
    await expect(runLoadScript(scriptName, "healthy")).resolves.toBe(0);
    await expect(runLoadScript(scriptName, "failing")).resolves.toBe(1);
    await expect(runLoadScript(scriptName, "missing")).resolves.toBe(2);
  });

  it("requires buffered browser observers before navigation and a deterministic INP interaction", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    expect(browserScript).toContain("addInitScript");
    expect(browserScript).toMatch(/addInitScript[\s\S]*?goto/);
    expect(browserScript).toContain("buffered: true");
    expect(browserScript).toContain("durationThreshold");
    expect(browserScript).toContain("recordRepresentativeInteraction");
    expect(browserScript).toMatch(/INP[\s\S]*unavailable/);
  });

  it("uses one buffered first-input fallback for a representative lab INP click", () => {
    const browserScript = source("scripts/run-dashboard-performance.mjs");
    const observerInit = extractObserverInit(browserScript);
    type ObserverEntry = Readonly<{ duration?: number }>;
    type ObserverList = Readonly<{ getEntries: () => readonly ObserverEntry[] }>;
    type ObserverRecord = {
      callback: (list: ObserverList) => void;
      options: Record<string, unknown>;
    };
    const observers: ObserverRecord[] = [];
    class FakePerformanceObserver {
      constructor(private readonly callback: ObserverRecord["callback"]) {}

      observe(options: Record<string, unknown>) {
        observers.push({ callback: this.callback, options });
      }
    }
    const pageWindow: { __miracleDashboardPerformance?: Record<string, unknown> } = {};
    runInNewContext(observerInit, { PerformanceObserver: FakePerformanceObserver, window: pageWindow });

    expect(observers.find(({ options }) => options.type === "event")?.options).toMatchObject({ buffered: true, durationThreshold: 16 });
    const firstInput = observers.find(({ options }) => options.type === "first-input");
    expect(firstInput?.options).toEqual({ type: "first-input", buffered: true });
    firstInput?.callback({ getEntries: () => [{ duration: 37.5 }] });
    expect(pageWindow.__miracleDashboardPerformance?.firstInput).toBe(37.5);

    expect(browserScript).toMatch(/const inp[\s\S]*observed\?\.inp[\s\S]*observed\?\.firstInput/);
    expect(browserScript).toMatch(/metricFailures[\s\S]*INP[\s\S]*unavailable/);
    const interaction = browserScript.match(/async function recordRepresentativeInteraction\(page\) \{[\s\S]*?\n\}/)?.[0];
    expect(interaction?.match(/\.click\(/g)).toHaveLength(1);
  });

  it("uses exact locale-prefixed local quick-load routes and preserves the load budget", () => {
    const quickLoadScript = source("scripts/load-test-quick.mjs");
    const localRoutes = quickLoadScript.match(/\n  : \[([\s\S]*?)\n    \]\s*;/)?.[1];
    expect(localRoutes).toBeDefined();
    expect(localRoutes).toMatch(/label: "Home page", path: "\/id"/);
    expect(localRoutes).toMatch(/label: "Events list", path: "\/id\/events"/);
    expect(localRoutes).toMatch(/label: "Bracket \(kuroko-summer-cup\)", path: "\/id\/events\/kuroko-summer-cup\/bracket"/);
    expect(localRoutes).not.toMatch(/path: "\/(?:events|$)/);
    expect(quickLoadScript).toMatch(/connections: 50/);
    expect(quickLoadScript).toMatch(/duration: 5/);
    expect(quickLoadScript).toContain("p97.5");
    expect(quickLoadScript).toContain("non2xx === 0");
  });

  it("keeps the Task 9 report whitespace-clean and records its exact diff-check range", () => {
    const report = source(".superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/task-9-report.md");
    expect(report).not.toMatch(/[ \t]+$/m);
    expect(report).toContain("git diff --check 11f1fcc..HEAD");
  });
});
